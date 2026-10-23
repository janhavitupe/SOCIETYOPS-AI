import { api, ApiError } from './api';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

interface UploadGrant {
  key: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

/** Why this file cannot be attached, or null when it can. Mirrors the server's checks. */
export function photoProblem(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Photos must be JPEG, PNG or WebP';
  if (file.size > MAX_BYTES) return 'Photos must be 5 MB or smaller';
  return null;
}

/** The longest side a photo is sent at; plenty to see a leak or a meter. */
const MAX_SIDE = 1600;
/** Files smaller than this go up as they are. */
const SHRINK_ABOVE = 600 * 1024;

/**
 * Shrinks a phone photo before it is sent: a 4 MB camera picture becomes a
 * few hundred KB JPEG, which matters on a technician's mobile data. Falls back
 * to the original if the browser cannot decode it.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Uploads a photo straight to storage and returns its key, which is what chat
 * messages and tickets carry. Photos used to be sent inline as base64.
 */
export async function uploadPhoto(original: File): Promise<string> {
  // Checked before shrinking too, so a PDF is refused rather than "shrunk".
  const typeProblem = ALLOWED_TYPES.includes(original.type) ? null : photoProblem(original);
  if (typeProblem) throw new ApiError(400, typeProblem);
  const file = await shrinkPhoto(original);
  const problem = photoProblem(file);
  if (problem) throw new ApiError(400, problem);

  const grant = await api<UploadGrant>('/api/uploads', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });

  // No Authorization header: the signed URL is the credential, and object
  // storage would reject an unexpected one.
  const response = await fetch(grant.upload.url, {
    method: grant.upload.method,
    headers: grant.upload.headers,
    body: file,
  });
  if (!response.ok) throw new ApiError(response.status, 'The photo could not be uploaded');

  return grant.key;
}
