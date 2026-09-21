import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload, UserRole } from './authUtils';

/** Roles allowed to see and act on the whole society's tickets. */
const MANAGER_ROLES: UserRole[] = ['maintenance', 'admin'];

/**
 * Populates req.user when a valid bearer token is present.
 *
 * A missing token is deliberately not rejected here: this runs in front of both
 * public and protected routes, and requireAuth (or a role guard) decides what
 * actually needs a user. A token that is present but invalid is always rejected,
 * so a client cannot quietly downgrade itself to anonymous by sending a bad one.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return next();
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user as JwtPayload;
  next();
}

/**
 * Middleware to require authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Middleware to check if user is resident
 */
export function requireResident(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'resident') {
    return res.status(403).json({ error: 'Resident access required' });
  }
  next();
}

/**
 * Middleware to check if user is maintenance staff or an admin.
 *
 * The role strings here must match what the seed and the registration route
 * store on ResidentProfile.role.
 */
export function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!MANAGER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Manager access required' });
  }
  next();
}

/**
 * Middleware to check if user is an admin
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Whether this user may read tickets belonging to flats other than their own.
 * Route handlers use this to scope queries; residents see only their own flat.
 */
export function canAccessAllTickets(user: JwtPayload): boolean {
  return MANAGER_ROLES.includes(user.role);
}

/**
 * Whether this user may act on a ticket belonging to the given flat.
 */
export function canAccessFlat(user: JwtPayload, flatNumber: string): boolean {
  if (canAccessAllTickets(user)) return true;
  return user.flatNumber?.trim().toLowerCase() === flatNumber?.trim().toLowerCase();
}
