import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth';
import { identityFrom, isManager, isSocietyAdmin, isStaff, isWorker, resolveActor } from './actor';
import { setRequestSociety } from '../requestContext';

/**
 * Populates req.identity for any signed-in request, and req.user (the actor)
 * when the person belongs to a society, scoping every database query that
 * follows to that society.
 *
 * A missing session is not rejected here: this runs in front of public and
 * protected routes alike, and the guards below decide what needs what. A
 * bearer token that is present but invalid is rejected, so a client cannot
 * quietly downgrade itself to anonymous by sending a bad one.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

  if (!session) {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    return next();
  }

  req.identity = identityFrom(session);
  const activeSocietyId = (session.session as { activeSocietyId?: string | null }).activeSocietyId;
  const actor = await resolveActor(req.identity, activeSocietyId);
  if (actor) {
    req.user = actor;
    setRequestSociety(actor.societyId);
  }
  next();
}

/** Signed in, society or not: account setup and creating a society. */
export function requireSignedIn(req: Request, res: Response, next: NextFunction) {
  if (!req.identity) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/** Signed in and working inside a society. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.identity) return res.status(401).json({ error: 'Authentication required' });
  if (!req.user) return res.status(403).json({ error: 'You are not a member of any society yet' });
  next();
}

const guard =
  (allowed: (actor: NonNullable<Request['user']>) => boolean, message: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.identity) return res.status(401).json({ error: 'Authentication required' });
    if (!req.user || !allowed(req.user)) return res.status(403).json({ error: message });
    next();
  };

/** Society admins, managers and committee members: whole-society reads. */
export const requireStaff = guard(isStaff, 'Society staff access required');

/** Society admins and managers: running tickets, vendors and residents. */
export const requireManager = guard(isManager, 'Manager access required');

/** Society admins only: settings, roles and billing. */
export const requireAdmin = guard(isSocietyAdmin, 'Society admin access required');

/** Vendors' own people: their jobs and nothing else. */
export const requireWorker = guard(isWorker, 'Vendor access required');
