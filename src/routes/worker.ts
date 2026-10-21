import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { requireWorker } from '../auth/authMiddleware';
import { checkAttachments } from '../services/storage';
import { act, getJob, listJobs, setDuty, WorkerJobError } from '../services/workerJobs';
import { validateBody, validateParams } from './validate';
import { idParams, workerActionBody, workerDutyBody, type IdParams } from './schemas';

/**
 * A vendor's own screen: their jobs and the steps they report. Only the
 * vendor's own jobs are reachable; any other ticket id is not found.
 */
const router = Router();

const handle = (res: Response, err: unknown) => {
  if (err instanceof WorkerJobError) return res.status(err.status).json({ error: err.message });
  throw err;
};

router.get('/worker/jobs', requireWorker, async (req, res) => {
  try {
    res.json(await listJobs(req.user!.vendorId!));
  } catch (err) {
    return handle(res, err);
  }
});

router.get(
  '/worker/jobs/:id',
  requireWorker,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      res.json(await getJob(req.user!.vendorId!, req.params.id));
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.post(
  '/worker/jobs/:id/status',
  requireWorker,
  validateParams(idParams),
  validateBody(workerActionBody),
  async (req: Request<IdParams>, res: Response) => {
    const vendorId = req.user!.vendorId!;
    const attachmentProblem = await checkAttachments(req.user!.id, req.body.images);
    if (attachmentProblem) return res.status(400).json({ error: attachmentProblem });
    try {
      const job = await act(vendorId, req.params.id, req.body);
      logger.info('Worker step', { ticketId: req.params.id, vendorId, action: req.body.action });
      res.json({ job });
    } catch (err) {
      return handle(res, err);
    }
  },
);

router.put('/worker/duty', requireWorker, validateBody(workerDutyBody), async (req, res) => {
  const result = await setDuty(req.user!.vendorId!, req.body.onDuty);
  logger.info('Worker duty changed', { vendorId: req.user!.vendorId, onDuty: result.onDuty });
  res.json(result);
});

export default router;
