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

/**
 * Uploads a photo straight to storage and returns its key, which is what chat
 * messages and tickets carry. Photos used to be sent inline as base64.
 */
export async function uploadPhoto(file: File): Promise<string> {
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
