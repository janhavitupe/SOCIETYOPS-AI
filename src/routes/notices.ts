import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { requireAuth, requireManager } from '../auth/authMiddleware';
import {
  allNotices,
  createNotice,
  markRead,
  NoticeError,
  noticesFor,
  readReport,
  remindUnread,
  removeNotice,
  updateNotice,
  vote,
} from '../services/notices';
import { validateBody, validateParams } from './validate';
import { createNoticeBody, idParams, updateNoticeBody, voteBody, type IdParams } from './schemas';

/**
 * Notices from the society office. Residents read the ones meant for them;
 * managers post, schedule and chase them.
 */
const router = Router();

const handle = (res: Response, err: unknown) => {
  if (err instanceof NoticeError) return res.status(err.status).json({ error: err.message });
  throw err;
};

router.get('/notices', requireAuth, async (req, res) => {
  res.json(await noticesFor(req.user!));
});

router.get('/notices/manage', requireManager, async (req, res) => {
  res.json({ notices: await allNotices() });
});

router.post('/notices', requireManager, validateBody(createNoticeBody), async (req, res) => {
  try {
    const notice = await createNotice(req.body, req.user!.id);
    logger.info('Notice posted', { noticeId: notice.id, audience: notice.audience, by: req.user!.id });
    res.status(201).json(notice);
  } catch (err) {
    return handle(res, err);
  }
});

router.patch(
  '/notices/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateNoticeBody),
  async (req: Request<IdParams>, res: Response) => {
    try {
      res.json(await updateNotice(req.params.id, req.body));
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.delete(
  '/notices/:id',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      await removeNotice(req.params.id);
      logger.info('Notice removed', { noticeId: req.params.id, by: req.user!.id });
      res.status(204).end();
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.post(
  '/notices/:id/read',
  requireAuth,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      await markRead(req.user!, req.params.id);
      res.status(204).end();
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.post(
  '/notices/:id/vote',
  requireAuth,
  validateParams(idParams),
  validateBody(voteBody),
  async (req: Request<IdParams>, res: Response) => {
    try {
      res.json({ results: await vote(req.user!, req.params.id, req.body.option) });
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.get(
  '/notices/:id/reads',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      res.json(await readReport(req.params.id));
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.post(
  '/notices/:id/remind',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const sent = await remindUnread(req.params.id);
      logger.info('Notice reminder sent', { noticeId: req.params.id, sent, by: req.user!.id });
      res.json({ sent });
    } catch (err) {
      return handle(res, err);
    }
  },
);

export default router;
