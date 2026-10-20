import { Router } from 'express';
import { logger } from '../logger';
import { vendorRepo } from '../database/repositories';
import { requireAuth } from '../auth/authMiddleware';

/**
 * The society vendor directory.
 */
const router = Router();

router.get('/vendors', requireAuth, async (req, res) => {
  const vendors = await vendorRepo.findAll();
  logger.info('Vendors listed', { count: vendors.length });
  res.json({ count: vendors.length, vendors });
});

// Dispatch logs carry other residents' names, phone numbers and messages.

export default router;
