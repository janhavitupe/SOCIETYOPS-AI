import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { prisma } from '../database/prisma';
import { vendorRepo } from '../database/repositories';
import { isOnDuty } from '../database/repositories/VendorRepository';
import { requireAuth, requireManager } from '../auth/authMiddleware';
import { requireSocietyId } from '../requestContext';
import { rebalanceCategory } from '../services/rebalance';
import { validateBody, validateParams } from './validate';
import { createVendorBody, idParams, updateVendorBody, type IdParams } from './schemas';

/**
 * The society's vendor directory. Every query here is scoped to the request's
 * society, so a vendor id from another society is simply not found.
 */
const router = Router();

router.get('/vendors', requireAuth, async (req, res) => {
  const vendors = await vendorRepo.findAll();
  logger.info('Vendors listed', { count: vendors.length });
  res.json({ count: vendors.length, vendors });
});

router.post('/vendors', requireManager, validateBody(createVendorBody), async (req, res) => {
  const profile = await prisma.societyProfile.findFirst({ select: { societyName: true } });
  const vendor = await prisma.vendor.create({
    data: {
      ...req.body,
      id: `VND-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      societyId: requireSocietyId(),
      societyName: profile?.societyName ?? '',
      completedJobs: 0,
      activeJobsCount: 0,
    },
  });
  logger.info('Vendor added', { vendorId: vendor.id, category: vendor.category, by: req.user!.id });

  // A new vendor takes over jobs queued behind busy ones straight away.
  const reassigned = isOnDuty(vendor) ? await rebalanceCategory(vendor.category) : [];
  if (reassigned.length)
    logger.info('Queued jobs reassigned', { vendorId: vendor.id, tickets: reassigned.map((r) => r.ticketId) });

  res.status(201).json({ ...(await vendorRepo.findById(vendor.id)), reassigned });
});

router.patch(
  '/vendors/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateVendorBody),
  async (req: Request<IdParams>, res: Response) => {
    const existing = await vendorRepo.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });

    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: req.body });
    logger.info('Vendor updated', { vendorId: vendor.id, fields: Object.keys(req.body), by: req.user!.id });

    // Coming on duty, or moving to another trade, frees capacity there.
    const freed = isOnDuty(vendor) && (!isOnDuty(existing) || existing.category !== vendor.category);
    const reassigned = freed ? await rebalanceCategory(vendor.category) : [];
    if (reassigned.length)
      logger.info('Queued jobs reassigned', { vendorId: vendor.id, tickets: reassigned.map((r) => r.ticketId) });

    res.json({ ...(await vendorRepo.findById(vendor.id)), reassigned });
  },
);

// Soft delete: tickets the vendor worked keep their record of who did the job.
router.delete(
  '/vendors/:id',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    const existing = await vendorRepo.findById(req.params.id);
    if (!existing || !(await vendorRepo.softDelete(req.params.id))) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    logger.info('Vendor removed', { vendorId: req.params.id, by: req.user!.id });

    // Their open jobs go to the rest of the trade rather than waiting forever.
    const reassigned = await rebalanceCategory(existing.category);
    res.json({ removed: req.params.id, reassigned });
  },
);

export default router;
