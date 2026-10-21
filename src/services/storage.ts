import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SERVER_SECRET } from '../auth/secret';
import { logger } from '../logger';

/**
 * Object storage for photos.
 *
 * Photos used to travel as base64 strings inside the JSON body and were saved
 * in the ticket row, which bloated the database and needed a 10 MB body limit.
 * Now the browser uploads straight to storage with a short-lived signed URL,
 * and the ticket stores only the object key. Keys are turned back into signed
 * download URLs when a ticket is sent to a client, so the bucket stays private.
 *
 * Two drivers share one interface:
 *  - s3: any S3-compatible service (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO).
 *  - local: files on disk, served by this app through HMAC-signed URLs. For
 *    development and tests; container disks are not durable.
 */

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export interface SignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface StoredObject {
  size: number;
  contentType: string;
}

export interface StorageDriver {
  readonly name: 's3' | 'local';
  presignUpload(key: string, contentType: string, size: number): Promise<SignedUpload>;
  presignDownload(key: string): Promise<string>;
  head(key: string): Promise<StoredObject | null>;
  /** The object as the model should receive it: a URL it can fetch, or inline data. */
  forModel(key: string): Promise<string>;
}

export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  private client: S3Client;

  constructor(private bucket: string) {
    this.client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      // MinIO and some S3-compatible hosts need path-style addressing.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async presignUpload(key: string, contentType: string, size: number): Promise<SignedUpload> {
    // Content type and length are part of the signature, so the browser cannot
    // upload something larger, or of another type, than it asked to.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
    return { url, method: 'PUT', headers: { 'Content-Type': contentType } };
  }

  presignDownload(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: out.ContentLength ?? 0, contentType: out.ContentType ?? '' };
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return null;
      throw err;
    }
  }

  forModel(key: string): Promise<string> {
    return this.presignDownload(key);
  }
}

/** Signs local-driver URLs. Separate from the JWT key by derivation, not by configuration. */
function localSignature(op: 'get' | 'put', key: string, expires: number, extra = ''): string {
  const secret = process.env.STORAGE_SIGNING_SECRET || `${SERVER_SECRET}:storage`;
  return crypto.createHmac('sha256', secret).update(`${op}\n${key}\n${expires}\n${extra}`).digest('base64url');
}

export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;

  constructor(readonly root: string) {}

  /** Resolves a key to a path inside root, refusing anything that escapes it. */
  pathFor(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async presignUpload(key: string, contentType: string, size: number): Promise<SignedUpload> {
    const expires = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS;
    const sig = localSignature('put', key, expires, `${contentType}\n${size}`);
    const qs = new URLSearchParams({ expires: String(expires), type: contentType, size: String(size), sig });
    return { url: `/api/files/${key}?${qs}`, method: 'PUT', headers: { 'Content-Type': contentType } };
  }

  async presignDownload(key: string): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS;
    const qs = new URLSearchParams({ expires: String(expires), sig: localSignature('get', key, expires) });
    return `/api/files/${key}?${qs}`;
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const stat = await fs.stat(this.pathFor(key));
      const ext = path.extname(key).slice(1);
      const contentType = Object.keys(ALLOWED_IMAGE_TYPES).find((t) => ALLOWED_IMAGE_TYPES[t] === ext) || '';
      return { size: stat.size, contentType };
    } catch {
      return null;
    }
  }

  /** The model cannot reach this machine, so it gets the bytes inline. */
  async forModel(key: string): Promise<string> {
    const object = await this.head(key);
    const data = await fs.readFile(this.pathFor(key));
    return `data:${object?.contentType || 'application/octet-stream'};base64,${data.toString('base64')}`;
  }

  verify(op: 'get' | 'put', key: string, query: Record<string, unknown>): boolean {
    const expires = Number(query.expires);
    if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
    const extra = op === 'put' ? `${query.type}\n${query.size}` : '';
    const expected = Buffer.from(localSignature(op, key, expires, extra));
    const given = Buffer.from(String(query.sig || ''));
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }
}

let driver: StorageDriver | null = null;

/**
 * The origin browsers fetch photos from and upload them to, for the CSP.
 * Null for the local driver, which is same-origin. S3_PUBLIC_ORIGIN overrides
 * the derived value, for example behind a CDN.
 */
export function storageOrigin(): string | null {
  if (process.env.S3_PUBLIC_ORIGIN) return process.env.S3_PUBLIC_ORIGIN;
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  if (!process.env.S3_ENDPOINT) {
    return `https://${bucket}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com`;
  }
  const endpoint = new URL(process.env.S3_ENDPOINT);
  return process.env.S3_FORCE_PATH_STYLE === 'true'
    ? endpoint.origin
    : `${endpoint.protocol}//${bucket}.${endpoint.host}`;
}

/**
 * S3 when S3_BUCKET is set (or STORAGE_DRIVER=s3), local disk otherwise.
 */
export function getStorage(): StorageDriver {
  if (!driver) {
    const choice = process.env.STORAGE_DRIVER || (process.env.S3_BUCKET ? 's3' : 'local');
    if (choice === 's3') {
      if (!process.env.S3_BUCKET) throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET');
      driver = new S3StorageDriver(process.env.S3_BUCKET);
    } else {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Photos are stored on local disk. Set S3_BUCKET for durable storage in production.');
      }
      driver = new LocalStorageDriver(path.resolve(process.env.UPLOAD_DIR || 'uploads'));
    }
  }
  return driver;
}

/** Test seam. */
export function setStorage(next: StorageDriver | null): void {
  driver = next;
}

/** Keys are namespaced by uploader, so ownership can be checked from the key alone. */
export function newUploadKey(userId: string, contentType: string): string {
  const safeUser = userId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `uploads/${safeUser}/${crypto.randomUUID()}.${ALLOWED_IMAGE_TYPES[contentType]}`;
}

export function isOwnUploadKey(userId: string, key: string): boolean {
  const safeUser = userId.replace(/[^A-Za-z0-9_-]/g, '_');
  return new RegExp(`^uploads/${safeUser}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(key);
}

/** Stored before object storage existed: a full URL or an inline data URL. */
function isLegacyImageRef(ref: string): boolean {
  return /^(https?:|data:)/.test(ref);
}

/**
 * Checks that every key belongs to this user and was actually uploaded.
 * Returns the reason for the first bad key, or null when all are fine.
 */
export async function checkAttachments(userId: string, keys: string[]): Promise<string | null> {
  for (const key of keys) {
    if (!isOwnUploadKey(userId, key)) return 'Attachments must be photos you uploaded';
    const object = await getStorage().head(key);
    if (!object) return 'An attachment has not finished uploading';
    if (object.size > MAX_UPLOAD_BYTES) return 'An attachment is too large';
  }
  return null;
}

/** Turns stored image refs into URLs a browser can load. */
export async function resolveImageUrls(refs: string[] = []): Promise<string[]> {
  return Promise.all(refs.map((ref) => (isLegacyImageRef(ref) ? ref : getStorage().presignDownload(ref))));
}

/** Turns stored image refs into what the model receives. Unreadable ones are dropped. */
export async function resolveImagesForModel(refs: string[] = []): Promise<string[]> {
  const out: string[] = [];
  for (const ref of refs) {
    if (isLegacyImageRef(ref)) {
      out.push(ref);
      continue;
    }
    try {
      out.push(await getStorage().forModel(ref));
    } catch (err) {
      logger.warn('Attachment could not be prepared for the model', { key: ref, error: (err as Error).message });
    }
  }
  return out;
}
