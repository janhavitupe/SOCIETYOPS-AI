const TOKEN_KEY = 'societyops_token';
const USER_KEY = 'societyops_user';

/**
 * localStorage throws in private windows and when site data is blocked, so
 * every access is guarded. A failed read is treated as "not logged in".
 */
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return readStorage(TOKEN_KEY);
}

export function getStoredUser(): any | null {
  const raw = readStorage(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: unknown): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Nothing to do: the session simply will not survive a reload.
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Ignore: there was nothing readable to clear.
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * fetch() wrapper for the SocietyOps API.
 *
 * Every protected endpoint expects a bearer token, so attaching it in one place
 * keeps call sites from silently forgetting it. A 401 means the stored token is
 * missing, expired or rejected, so it is discarded here and the caller is left
 * to render a signed-out state.
 */
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });

  if (response.status === 401) {
    clearStoredAuth();
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data?.error || `Request failed (${response.status})`);
  }

  return data as T;
}
