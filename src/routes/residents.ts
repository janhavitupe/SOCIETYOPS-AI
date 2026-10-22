import { Router } from 'express';
import { logger } from '../logger';
import { requireManager } from '../auth/authMiddleware';
import { inviteResidents, listResidents, type ResidentFilter } from '../services/residents';
import { validateBody, validateQuery } from './validate';
import { inviteResidentsBody, listResidentsQuery } from './schemas';

/**
 * The resident directory for managers: who lives where, who is on the app,
 * and texting the rest a way in. Inside the request's society only.
 */
const router = Router();

router.get('/residents', requireManager, validateQuery(listResidentsQuery), async (req, res) => {
  res.json(await listResidents(req.query as ResidentFilter));
});

router.post('/residents/invite', requireManager, validateBody(inviteResidentsBody), async (req, res) => {
  const result = await inviteResidents(req.body.userIds);
  logger.info('Residents invited to the app', {
    sent: result.sent.length,
    skipped: result.skipped.length,
    by: req.user!.id,
  });
  res.json(result);
});

export default router;
