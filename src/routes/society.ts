import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { societyProfileRepo, residentProfileRepo } from '../database/repositories';
import { requireAuth, requireManager, requireAdmin } from '../auth/authMiddleware';
import { validateBody, validateParams } from './validate';
import { idParams, societyProfileBody, type IdParams } from './schemas';

/**
 * Society configuration and resident administration.
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

router.get('/resident-profiles', requireManager, async (req, res) => {
  const residents = await residentProfileRepo.findAll();

  // accessToken is a standing credential for the account; it must never leave
  // the server in a list response.
  const safe = residents.map(({ accessToken, ...rest }) => rest);

  logger.info('Resident profiles listed', { count: safe.length });
  res.json({ count: safe.length, residents: safe });
});

// Issues a new standing access token, so this is admin-only.
router.post(
  '/resident-profiles/:id/token',
  requireAdmin,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    const updated = await residentProfileRepo.issueAccessToken(req.params.id);
    if (!updated) {
      logger.warn('Token issuance failed - resident not found', { residentId: req.params.id });
      return res.status(404).json({ error: 'Resident profile not found' });
    }
    logger.info('Access token issued', { residentId: req.params.id });
    res.json(updated);
  },
);

export default router;
