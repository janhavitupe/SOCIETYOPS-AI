import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { ticketRepo, vendorRepo } from '../database/repositories';
import { requireAuth, requireManager } from '../auth/authMiddleware';
import { canActOnTicket, canSeeTicket, isManager, isStaff } from '../auth/actor';
import { resolveTicketLocation } from '../services/ticketLocation';
import { closeRefusal, escalateRefusal } from '../services/ticketRules';
import { checkAttachments } from '../services/storage';
import { validateBody, validateParams, validateQuery } from './validate';
import {
  idParams,
  type IdParams,
  listTicketsQuery,
  createTicketBody,
  updateTicketBody,
  assignVendorBody,
  escalateBody,
  closeBody,
} from './schemas';

/**
 * The ticket lifecycle, within the request's society (the tenant scope adds
 * that). Residents see their own flats' tickets and their own reports; staff
 * see the whole society.

 */
const router = Router();

router.get('/tickets', requireAuth, validateQuery(listTicketsQuery), async (req, res) => {
  const { query, category, urgency, status } = req.query as Record<string, string | undefined>;
  const user = req.user!;

  // Residents are scoped in the query itself, so no other flat's tickets are
  // ever loaded.
  const residentScope = isStaff(user) ? undefined : { flatIds: user.flats.map((f) => f.id), residentId: user.id };

  const tickets = await ticketRepo.search(query || '', category || '', urgency || '', status || '', residentScope);

  logger.info('Tickets listed', {
    count: tickets.length,
    role: user.role,
    scoped: !!residentScope,
    query,
    category,
    urgency,
    status,
  });
  res.json({ count: tickets.length, tickets });
});

router.get('/tickets/:id', requireAuth, validateParams(idParams), async (req: Request<IdParams>, res: Response) => {
  const ticket = await ticketRepo.findById(req.params.id);
  if (!ticket) {
    logger.warn('Ticket not found', { ticketId: req.params.id });
    return res.status(404).json({ error: 'Ticket not found' });
  }
  if (!canSeeTicket(req.user!, ticket)) {
    logger.warn('Ticket access denied', { ticketId: req.params.id, userId: req.user!.id, role: req.user!.role });
    return res.status(403).json({ error: 'You do not have access to this ticket' });
  }
  logger.info('Ticket retrieved', { ticketId: req.params.id });
  res.json(ticket);
});

router.post('/tickets', requireAuth, validateBody(createTicketBody), async (req, res) => {
  const { flatId, flatNumber, residentName, residentPhone, issueCategory, description, urgency, images } = req.body;

  // Identity comes from the session, not the body: a resident may only file
  // for a flat they occupy. Managers may file on someone's behalf, so the
  // body's flat and name are honoured only for them.
  const user = req.user!;
  const manager = isManager(user);

  const location = await resolveTicketLocation(user, { flatId, flatNumber });
  if ('error' in location) return res.status(400).json({ error: location.error });

  const attachmentProblem = await checkAttachments(user.id, images);
  if (attachmentProblem) return res.status(400).json({ error: attachmentProblem });

  let ticket = await ticketRepo.create({
    flatId: location.flatId,
    flatNumber: location.flatNumber,
    residentName: manager ? residentName || user.name : user.name,
    residentPhone: manager ? residentPhone : (user.phone ?? undefined),
    issueCategory,
    description,
    urgency,
    images,
    residentId: manager ? undefined : user.id,
  });

  const bestVendor = await vendorRepo.findBestForCategory(ticket.issueCategory);
  if (bestVendor) {
    await ticketRepo.assignVendor(ticket.id, bestVendor.id, bestVendor.avgResolutionTime);
    const updated = await ticketRepo.findById(ticket.id);
    if (updated) ticket = updated;
  }

  logger.info('Ticket created', { ticketId: ticket.id, category: ticket.issueCategory, urgency: ticket.urgency });
  res.status(201).json(ticket);
});

router.patch(
  '/tickets/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateTicketBody),
  async (req: Request<IdParams>, res: Response) => {
    // The schema strips everything but the whitelisted fields; req.body used to
    // be spread straight into the Prisma update.
    const updated = await ticketRepo.update(req.params.id, req.body);
    if (!updated) {
      logger.warn('Ticket update failed - not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    logger.info('Ticket updated', { ticketId: req.params.id });
    res.json(updated);
  },
);

router.post(
  '/tickets/:id/assign',
  requireManager,
  validateParams(idParams),
  validateBody(assignVendorBody),
  async (req: Request<IdParams>, res: Response) => {
    const { vendorId, estimatedEta } = req.body;
    const ticket = await ticketRepo.assignVendor(req.params.id, vendorId, estimatedEta || '30 mins');
    if (!ticket) {
      logger.warn('Vendor assignment failed - not found', { ticketId: req.params.id, vendorId });
      return res.status(404).json({ error: 'Ticket or Vendor not found' });
    }
    logger.info('Vendor assigned', { ticketId: req.params.id, vendorId, estimatedEta });
    res.json(ticket);
  },
);

// Residents may escalate their own stuck ticket; managers may escalate any.
router.post(
  '/tickets/:id/escalate',
  requireAuth,
  validateParams(idParams),
  validateBody(escalateBody),
  async (req: Request<IdParams>, res: Response) => {
    const user = req.user!;
    const existing = await ticketRepo.findById(req.params.id);
    if (!existing) {
      logger.warn('Escalation failed - ticket not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (!canActOnTicket(user, existing)) {
      logger.warn('Escalation denied', { ticketId: req.params.id, userId: user.id });
      return res.status(403).json({ error: 'You do not have access to this ticket' });
    }

    const refusal = escalateRefusal(existing, isManager(user));
    if (refusal) {
      logger.warn('Escalation refused', { ticketId: req.params.id, status: existing.status, role: user.role });
      return res.status(409).json({ error: refusal });
    }

    const { reason } = req.body;
    const ticket = await ticketRepo.escalateTicket(req.params.id, reason || 'Manual Manager Escalation');
    logger.info('Ticket escalated', { ticketId: req.params.id, reason });
    res.json(ticket);
  },
);

// Residents may close their own ticket once work has been done; managers may close any.
router.post(
  '/tickets/:id/close',
  requireAuth,
  validateParams(idParams),
  validateBody(closeBody),
  async (req: Request<IdParams>, res: Response) => {
    const user = req.user!;
    const existing = await ticketRepo.findById(req.params.id);
    if (!existing) {
      logger.warn('Close ticket failed - not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (!canActOnTicket(user, existing)) {
      logger.warn('Close denied', { ticketId: req.params.id, userId: user.id });
      return res.status(403).json({ error: 'You do not have access to this ticket' });
    }

    const refusal = closeRefusal(existing, isManager(user));
    if (refusal) {
      logger.warn('Close refused', { ticketId: req.params.id, status: existing.status, role: user.role });
      return res.status(409).json({ error: refusal });
    }

    const { feedback, rating } = req.body;
    const ticket = await ticketRepo.update(req.params.id, {
      status: 'Closed',
      ...(feedback ? { residentFeedback: feedback } : {}),
      ...(rating ? { residentRating: rating } : {}),
    });
    logger.info('Ticket closed', { ticketId: req.params.id });
    res.json(ticket);
  },
);

export default router;
