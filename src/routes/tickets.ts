import { Router } from 'express';
import { logger, route } from '../logger';
import { ticketRepo, vendorRepo } from '../database/repositories';
import { requireAuth, requireManager, canAccessAllTickets, canAccessFlat } from '../auth/authMiddleware';

/**
 * The ticket lifecycle. Residents are scoped to their own flat throughout;
 * managers see the whole society.
 */
const router = Router();

router.get('/tickets', requireAuth, route(async (req, res) => {
  const { query, category, urgency, status } = req.query;
  const user = req.user!;

  // Managers see the whole society; residents are scoped to their own flat in
  // the query itself, so no other flat's tickets are ever loaded.
  const flatScope = canAccessAllTickets(user) ? undefined : user.flatNumber;

  const tickets = await ticketRepo.search(
    (query as string) || '',
    (category as string) || '',
    (urgency as string) || '',
    (status as string) || '',
    flatScope
  );

  logger.info('Tickets listed', { count: tickets.length, role: user.role, flatScope, query, category, urgency, status });
  res.json({ count: tickets.length, tickets });
}));

router.get('/tickets/:id', requireAuth, route(async (req, res) => {
  const ticket = await ticketRepo.findById(req.params.id);
  if (!ticket) {
    logger.warn('Ticket not found', { ticketId: req.params.id });
    return res.status(404).json({ error: 'Ticket not found' });
  }
  if (!canAccessFlat(req.user!, ticket.flatNumber)) {
    logger.warn('Ticket access denied', { ticketId: req.params.id, userId: req.user!.id, role: req.user!.role });
    return res.status(403).json({ error: 'You do not have access to this ticket' });
  }
  logger.info('Ticket retrieved', { ticketId: req.params.id });
  res.json(ticket);
}));

router.post('/tickets', requireAuth, route(async (req, res) => {
  const { flatNumber, residentName, residentPhone, issueCategory, description, urgency, images } = req.body;
  if (!description || !issueCategory) {
    logger.warn('Ticket creation failed - missing fields', { description: !!description, issueCategory: !!issueCategory });
    return res.status(400).json({ error: 'Missing required ticket fields' });
  }

  // Identity comes from the token, not the body: a resident may only file
  // against their own flat. Managers may file on someone's behalf, so the
  // body's flat and name are honoured only for them.
  const user = req.user!;
  const isManager = canAccessAllTickets(user);

  let ticket = await ticketRepo.create({
    flatNumber: isManager ? (flatNumber || user.flatNumber) : user.flatNumber,
    residentName: isManager ? (residentName || user.name) : user.name,
    residentPhone: residentPhone || '+91 98000 00000',
    issueCategory,
    description,
    urgency: urgency || 'Medium',
    images: images || [],
    residentId: isManager ? undefined : user.id,
  });

  const bestVendor = await vendorRepo.findBestForCategory(ticket.issueCategory);
  if (bestVendor) {
    await ticketRepo.assignVendor(ticket.id, bestVendor.id, bestVendor.avgResolutionTime);
    const updated = await ticketRepo.findById(ticket.id);
    if (updated) ticket = updated;
  }

  logger.info('Ticket created', { ticketId: ticket.id, category: ticket.issueCategory, urgency: ticket.urgency });
  res.status(201).json(ticket);
}));

router.patch('/tickets/:id', requireManager, route(async (req, res) => {
  // Whitelisted. req.body used to be spread straight into the Prisma update,
  // which let a caller write any column on the row, including its id and
  // timestamps.
  const updates: Record<string, unknown> = {};
  for (const field of ['status', 'urgency', 'description', 'issueCategory', 'estimatedEta'] as const) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  const updated = await ticketRepo.update(req.params.id, updates);
  if (!updated) {
    logger.warn('Ticket update failed - not found', { ticketId: req.params.id });
    return res.status(404).json({ error: 'Ticket not found' });
  }
  logger.info('Ticket updated', { ticketId: req.params.id });
  res.json(updated);
}));

router.post('/tickets/:id/assign', requireManager, route(async (req, res) => {
  const { vendorId, estimatedEta } = req.body;
  if (!vendorId) {
    logger.warn('Vendor assignment failed - missing vendorId', { ticketId: req.params.id });
    return res.status(400).json({ error: 'vendorId is required' });
  }
  const ticket = await ticketRepo.assignVendor(req.params.id, vendorId, estimatedEta || '30 mins');
  if (!ticket) {
    logger.warn('Vendor assignment failed - not found', { ticketId: req.params.id, vendorId });
    return res.status(404).json({ error: 'Ticket or Vendor not found' });
  }
  logger.info('Vendor assigned', { ticketId: req.params.id, vendorId, estimatedEta });
  res.json(ticket);
}));

// Residents may escalate their own stuck ticket; managers may escalate any.
router.post('/tickets/:id/escalate', requireAuth, route(async (req, res) => {
  const existing = await ticketRepo.findById(req.params.id);
  if (!existing) {
    logger.warn('Escalation failed - ticket not found', { ticketId: req.params.id });
    return res.status(404).json({ error: 'Ticket not found' });
  }
  if (!canAccessFlat(req.user!, existing.flatNumber)) {
    logger.warn('Escalation denied', { ticketId: req.params.id, userId: req.user!.id });
    return res.status(403).json({ error: 'You do not have access to this ticket' });
  }

  const { reason } = req.body;
  const ticket = await ticketRepo.escalateTicket(req.params.id, reason || 'Manual Manager Escalation');
  if (!ticket) {
    logger.warn('Escalation failed - ticket not found', { ticketId: req.params.id });
    return res.status(404).json({ error: 'Ticket not found' });
  }
  logger.info('Ticket escalated', { ticketId: req.params.id, reason });
  res.json(ticket);
}));

// Residents may close their own ticket once it is done; managers may close any.
router.post('/tickets/:id/close', requireAuth, route(async (req, res) => {
  const existing = await ticketRepo.findById(req.params.id);
  if (!existing) {
    logger.warn('Close ticket failed - not found', { ticketId: req.params.id });
    return res.status(404).json({ error: 'Ticket not found' });
  }
  if (!canAccessFlat(req.user!, existing.flatNumber)) {
    logger.warn('Close denied', { ticketId: req.params.id, userId: req.user!.id });
    return res.status(403).json({ error: 'You do not have access to this ticket' });
  }

  const ticket = await ticketRepo.update(req.params.id, { status: 'Closed' });
  if (!ticket) {
    logger.warn('Close ticket failed - not found', { ticketId: req.params.id });
    return res.status(404).json({ error: 'Ticket not found' });
  }
  logger.info('Ticket closed', { ticketId: req.params.id });
  res.json(ticket);
}));

export default router;
