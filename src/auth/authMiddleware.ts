import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './authUtils';

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 * Attaches user info to req.user if valid
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    // No token provided - not an error, middleware continues
    // Individual endpoints can decide if auth is required
    return next();
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user info to request object
  req.user = user;
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
 * Middleware to check if user is manager/facility staff
 */
export function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'facility_manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Manager access required' });
  }
  next();
}

/**
 * Middleware to check if user has access to a specific ticket
 * Residents can only access tickets from their own flat
 * Managers can access any ticket
 */
export function requireTicketAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const ticketId = req.params.id;
  if (!ticketId) {
    return res.status(400).json({ error: 'Ticket ID required' });
  }

  // For managers, allow access to any ticket
  if (req.user.role === 'facility_manager' || req.user.role === 'admin') {
    return next();
  }

  // For residents, check if ticket belongs to their flat
  // We'll need to check this in the endpoint handler after fetching the ticket
  // This middleware just ensures authentication; the actual flat check happens in endpoint
  next();
}