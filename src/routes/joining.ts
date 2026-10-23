import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { unscopedPrisma } from '../database/prisma';
import { withSociety } from '../requestContext';
import { tellOwnersOfFamilyRequest } from '../services/household';
import { requireManager, requireSignedIn } from '../auth/authMiddleware';
import {
  acceptInvite,
  approveJoinRequest,
  createInvite,
  describeInvite,
  inviteRefusal,
  JoinError,
  listInvites,
  listJoinRequests,
  rejectJoinRequest,
  requestToJoin,
  revokeInvite,
  societyForJoinCode,
} from '../services/joining';
import { validateBody, validateParams } from './validate';
import {
  createInviteBody,
  idParams,
  inviteTokenParams,
  joinCodeParams,
  joinRequestBody,
  type IdParams,
  type InviteTokenParams,
  type JoinCodeParams,
} from './schemas';

/**
 * Joining a society: residents asking with the join code, managers deciding,
 * and personal invites sent to a phone number.
 */
const router = Router();

const handle = (res: Response, err: unknown) => {
  if (err instanceof JoinError) return res.status(err.status).json({ error: err.message });
  throw err;
};

/** Points the session at a society the person just joined. */
async function enter(sessionId: string, societyId: string) {
  await unscopedPrisma.session.update({ where: { id: sessionId }, data: { activeSocietyId: societyId } });
}

// --- With the join code ---

// Public: the join page has to show the society before anyone signs in.
router.get('/join/:code', validateParams(joinCodeParams), async (req: Request<JoinCodeParams>, res: Response) => {
  const found = await societyForJoinCode(req.params.code);
  if (!found) return res.status(404).json({ error: 'That join link is not valid' });
  res.json(found);
});

router.post(
  '/join/:code',
  requireSignedIn,
  validateParams(joinCodeParams),
  validateBody(joinRequestBody),
  async (req: Request<JoinCodeParams>, res: Response) => {
    const identity = req.identity!;
    if (!identity.name && !req.body.name) return res.status(400).json({ error: 'Tell us your name' });
    try {
      if (req.body.name && !identity.name) {
        await unscopedPrisma.user.update({ where: { id: identity.userId }, data: { name: req.body.name } });
      }

      const result = await requestToJoin(req.params.code, identity, req.body);
      if (result.approved) await enter(identity.sessionId, result.society.id);

      // Family can be let in by the flat's owner, not only the society office.
      if (!result.approved && result.occupant.type === 'family') {
        const name = identity.name || req.body.name || 'Someone';
        await withSociety(result.society.id, () => tellOwnersOfFamilyRequest(result.flat.id, result.flat.number, name));
      }

      logger.info('Join request', { societyId: result.society.id, flatId: result.flat.id, approved: result.approved });
      res.status(201).json({
        status: result.approved ? 'approved' : 'pending',
        society: { id: result.society.id, name: result.society.name },
        flatNumber: result.flat.number,
      });
    } catch (err) {
      return handle(res, err);
    }
  },
);

// --- Managers deciding ---

router.get('/join-requests', requireManager, async (req, res) => {
  const requests = await listJoinRequests();
  res.json({ count: requests.length, requests });
});

router.post(
  '/join-requests/:id/approve',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const occupant = await approveJoinRequest(req.params.id, req.user!.id);
      logger.info('Join request approved', { occupantId: occupant.id, by: req.user!.id });
      res.json(occupant);
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.post(
  '/join-requests/:id/reject',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const occupant = await rejectJoinRequest(req.params.id, req.user!.id);
      logger.info('Join request rejected', { occupantId: occupant.id, by: req.user!.id });
      res.json(occupant);
    } catch (err) {
      return handle(res, err);
    }
  },
);

// --- Invites ---

router.get('/invites', requireManager, async (req, res) => {
  const invites = await listInvites();
  res.json({ invites });
});

router.post('/invites', requireManager, validateBody(createInviteBody), async (req, res) => {
  const refusal = inviteRefusal(req.user!.roles, req.body.role);
  if (refusal) return res.status(403).json({ error: refusal });
  try {
    const invite = await createInvite(req.body, req.user!.id);
    logger.info('Invite created', { inviteId: invite.id, role: invite.role, by: req.user!.id });
    res.status(201).json(invite);
  } catch (err) {
    return handle(res, err);
  }
});

router.delete(
  '/invites/:id',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      await revokeInvite(req.params.id);
      logger.info('Invite revoked', { inviteId: req.params.id, by: req.user!.id });
      res.status(204).end();
    } catch (err) {
      return handle(res, err);
    }
  },
);

// Public: the invite page shows who invited whom before the person signs in.
router.get(
  '/invite-links/:token',
  validateParams(inviteTokenParams),
  async (req: Request<InviteTokenParams>, res: Response) => {
    const invite = await describeInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: 'This invite link is not valid any more' });
    res.json(invite);
  },
);

router.post(
  '/invite-links/:token/accept',
  requireSignedIn,
  validateParams(inviteTokenParams),
  async (req: Request<InviteTokenParams>, res: Response) => {
    const identity = req.identity!;
    try {
      const result = await acceptInvite(req.params.token, identity);
      await enter(identity.sessionId, result.societyId);
      logger.info('Invite accepted', { societyId: result.societyId, role: result.role, userId: identity.userId });
      res.json(result);
    } catch (err) {
      return handle(res, err);
    }
  },
);

export default router;
