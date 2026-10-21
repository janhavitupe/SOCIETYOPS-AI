export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * fetch() wrapper for the SocietyOps API.
 *
 * The session is an httpOnly cookie the browser sends by itself, so nothing
 * here touches a token. (A JWT used to be kept in localStorage, where any
 * script on the page could read it.)
 */
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Better Auth reports errors as { message }, the app's own routes as { error }.
    throw new ApiError(response.status, data?.error || data?.message || `Request failed (${response.status})`);
  }

  return data as T;
}
