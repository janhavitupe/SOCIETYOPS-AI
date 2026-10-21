import type { AuthContextType } from '@/context/AuthContext';

/**
 * Society roles as the frontend routes them; they match src/auth/actor.ts.
 * 'worker' is a vendor's own login, made when a manager adds the vendor.
 */
export type Role = 'society_admin' | 'manager' | 'committee' | 'resident' | 'worker';

export const MANAGER_ROLES: Role[] = ['society_admin', 'manager'];

export const isManagerRole = (role?: string | null): boolean => MANAGER_ROLES.includes(role as Role);

type Session = Pick<AuthContextType, 'user' | 'hasSociety'>;

/** Where someone lands after signing in, and where a wrong-role URL sends them. */
export function homeFor(auth: Session): string {
  if (auth.user?.platformRole === 'platform_admin' && !auth.hasSociety) return '/platform';
  if (!auth.user?.name || !auth.hasSociety) return '/welcome';
  const role = auth.user.role;
  if (isManagerRole(role)) return '/manager';
  if (role === 'worker') return '/worker';
  return '/resident';
}

/** Only same-site paths are honoured as a post-login destination. */
export function safeRedirect(target: unknown): string | null {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : null;
}
