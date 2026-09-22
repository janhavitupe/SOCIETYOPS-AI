import { Router } from 'express';
import { logger, route } from '../logger';
import { societyProfileRepo, residentProfileRepo } from '../database/repositories';
import { requireAuth, requireManager, requireAdmin } from '../auth/authMiddleware';

/**
 * Society configuration and resident administration.
 */
const router = Router();

router.get('/society-profile', requireAuth, route(async (req, res) => {
  const profile = await societyProfileRepo.find();
  logger.info('Society profile retrieved');
  res.json(profile);
}));

router.post('/society-profile', requireManager, route(async (req, res) => {
  const profile = await societyProfileRepo.update(req.body);
  logger.info('Society profile updated');
  res.json(profile);
}));

router.get('/resident-profiles', requireManager, route(async (req, res) => {
  const residents = await residentProfileRepo.findAll();

  // accessToken is a standing credential for the account; it must never leave
  // the server in a list response.
  const safe = residents.map(({ accessToken, ...rest }) => rest);

  logger.info('Resident profiles listed', { count: safe.length });
  res.json({ count: safe.length, residents: safe });
}));

// Issues a new standing access token, so this is admin-only.
router.post('/resident-profiles/:id/token', requireAdmin, route(async (req, res) => {
  const updated = await residentProfileRepo.issueAccessToken(req.params.id);
  if (!updated) {
    logger.warn('Token issuance failed - resident not found', { residentId: req.params.id });
    return res.status(404).json({ error: 'Resident profile not found' });
  }
  logger.info('Access token issued', { residentId: req.params.id });
  res.json(updated);
}));

export default router;
