import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { requireAuth } from '../auth/authMiddleware';
import { JoinError } from '../services/joining';
import { myHousehold, ownerApprove, ownerReject, removeFamilyMember } from '../services/household';
import { validateParams } from './validate';
import { idParams, type IdParams } from './schemas';

/**
 * A flat owner's own household: who lives there, and family asking to join.
 * Everything is limited to flats the caller owns; other ids are not found.
 */
const router = Router();

const handle = (res: Response, err: unknown) => {
  if (err instanceof JoinError) return res.status(err.status).json({ error: err.message });
  throw err;
};

router.get('/my-flat', requireAuth, async (req, res) => {
  res.json(await myHousehold(req.user!));
});

router.post(
  '/my-flat/requests/:id/approve',
  requireAuth,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const occupant = await ownerApprove(req.user!, req.params.id);
      logger.info('Family request approved by owner', { occupantId: occupant.id, by: req.user!.id });
      res.json(occupant);
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.post(
  '/my-flat/requests/:id/reject',
  requireAuth,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const occupant = await ownerReject(req.user!, req.params.id);
      logger.info('Family request rejected by owner', { occupantId: occupant.id, by: req.user!.id });
      res.json(occupant);
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.post(
  '/my-flat/members/:id/remove',
  requireAuth,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const ended = await removeFamilyMember(req.user!, req.params.id);
      logger.info('Family member removed by owner', { occupantId: ended.id, by: req.user!.id });
      res.json(ended);
    } catch (err) {
      return handle(res, err);
    }
  },
);

export default router;
