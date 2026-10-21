import { Router } from 'express';
import { logger } from '../logger';
import { societyProfileRepo, memberRepo } from '../database/repositories';
import { requireAuth, requireManager } from '../auth/authMiddleware';
import { validateBody } from './validate';
import { societyProfileBody } from './schemas';

/**
 * Society configuration and the member directory.
 */
const router = Router();

router.get('/society-profile', requireAuth, async (req, res) => {
  const profile = await societyProfileRepo.find();
  logger.info('Society profile retrieved');
  res.json(profile);
});

// The schema whitelists the editable fields. The raw body used to be saved
// as-is, so a caller could overwrite any column, including the row id.
router.post('/society-profile', requireManager, validateBody(societyProfileBody), async (req, res) => {
  const profile = await societyProfileRepo.update({ ...req.body, lastUpdatedBy: req.user!.name });
  logger.info('Society profile updated', { by: req.user!.id });
  res.json(profile);
});

// Members of the current society with their roles and flats. Kept at this
// path because the manager dashboard reads it; it used to list
// ResidentProfile rows, which were replaced by users and memberships.
router.get('/resident-profiles', requireManager, async (req, res) => {
  const residents = await memberRepo.directory();
  logger.info('Member directory listed', { count: residents.length });
  res.json({ count: residents.length, residents });
});

export default router;
