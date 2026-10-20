/**
 * Roles as the frontend routes them. 'worker' and 'platform_admin' have
 * screens reserved for them but no accounts until Phases 1 and 2.
 */
export type Role = 'resident' | 'maintenance' | 'admin' | 'worker' | 'platform_admin';

export const MANAGER_ROLES: Role[] = ['maintenance', 'admin'];

export const isManagerRole = (role?: string): boolean => MANAGER_ROLES.includes(role as Role);

/** Where a user lands after signing in, and where a wrong-role URL sends them. */
export function homeFor(role?: string): string {
  if (isManagerRole(role)) return '/manager';
  if (role === 'worker') return '/worker';
  if (role === 'platform_admin') return '/platform';
  return '/resident';
}

/** Only same-site paths are honoured as a post-login destination. */
export function safeRedirect(target: unknown): string | null {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : null;
}
