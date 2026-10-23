import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { prisma } from '../database/prisma';
import { requireManager, requireStaff } from '../auth/authMiddleware';
import { requireSocietyId } from '../requestContext';
import { MaintenanceError, raiseVisit, upcoming } from '../services/maintenance';
import { validateBody, validateParams, validateQuery } from './validate';
import {
  createScheduleBody,
  idParams,
  licenceBody,
  updateLicenceBody,
  updateScheduleBody,
  upcomingQuery,
  type IdParams,
} from './schemas';

/**
 * Preventive maintenance: recurring schedules that raise tickets, licences
 * that expire, and the calendar of what is coming. Managers set them up;
 * committee members can read them.
 */
const router = Router();

const handle = (res: Response, err: unknown) => {
  if (err instanceof MaintenanceError) return res.status(err.status).json({ error: err.message });
  throw err;
};

/** Ids in a body must be this society's. */
async function referenceProblem(body: {
  assetId?: string | null;
  commonAreaId?: string | null;
  vendorId?: string | null;
}) {
  if (body.assetId && !(await prisma.asset.findFirst({ where: { id: body.assetId, deletedAt: null } })))
    return 'That asset does not exist in this society';
  if (body.commonAreaId && !(await prisma.commonArea.findFirst({ where: { id: body.commonAreaId, deletedAt: null } })))
    return 'That common area does not exist in this society';
  if (body.vendorId && !(await prisma.vendor.findFirst({ where: { id: body.vendorId, deletedAt: null } })))
    return 'That vendor does not exist in this society';
  return null;
}

const SCHEDULE_INCLUDE = {
  asset: { select: { id: true, name: true } },
  commonArea: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
} as const;

// --- Schedules ---

router.get('/maintenance/schedules', requireStaff, async (req, res) => {
  const schedules = await prisma.maintenanceSchedule.findMany({
    where: { deletedAt: null },
    include: SCHEDULE_INCLUDE,
    orderBy: { nextDueOn: 'asc' },
  });
  res.json({ schedules });
});

router.post('/maintenance/schedules', requireManager, validateBody(createScheduleBody), async (req, res) => {
  const problem = await referenceProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const schedule = await prisma.maintenanceSchedule.create({
    data: { ...req.body, societyId: requireSocietyId() },
    include: SCHEDULE_INCLUDE,
  });
  logger.info('Maintenance schedule added', { scheduleId: schedule.id, by: req.user!.id });
  res.status(201).json(schedule);
});

router.patch(
  '/maintenance/schedules/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateScheduleBody),
  async (req: Request<IdParams>, res: Response) => {
    const existing = await prisma.maintenanceSchedule.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    const problem = await referenceProblem(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const schedule = await prisma.maintenanceSchedule.update({
      where: { id: existing.id },
      data: req.body,
      include: SCHEDULE_INCLUDE,
    });
    res.json(schedule);
  },
);

router.delete(
  '/maintenance/schedules/:id',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    const result = await prisma.maintenanceSchedule.updateMany({
      where: { id: req.params.id, deletedAt: null },
      data: { deletedAt: new Date(), active: false },
    });
    if (!result.count) return res.status(404).json({ error: 'Schedule not found' });
    res.status(204).end();
  },
);

/** Raises the next visit now, without waiting for its lead time. */
router.post(
  '/maintenance/schedules/:id/raise',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const ticket = await raiseVisit(req.params.id);
      logger.info('Planned visit raised by hand', { scheduleId: req.params.id, ticketId: ticket.id, by: req.user!.id });
      res.status(201).json(ticket);
    } catch (err) {
      return handle(res, err);
    }
  },
);

// --- Licences ---

router.get('/maintenance/licences', requireStaff, async (req, res) => {
  const licences = await prisma.licence.findMany({
    where: { deletedAt: null },
    include: { asset: { select: { id: true, name: true } } },
    orderBy: { expiresOn: 'asc' },
  });
  res.json({ licences });
});

router.post('/maintenance/licences', requireManager, validateBody(licenceBody), async (req, res) => {
  const problem = await referenceProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const licence = await prisma.licence.create({ data: { ...req.body, societyId: requireSocietyId() } });
  res.status(201).json(licence);
});

router.patch(
  '/maintenance/licences/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateLicenceBody),
  async (req: Request<IdParams>, res: Response) => {
    const existing = await prisma.licence.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Licence not found' });
    const problem = await referenceProblem(req.body);
    if (problem) return res.status(400).json({ error: problem });
    // A renewed licence gets its reminders again before the new date.
    const renewed = req.body.expiresOn && req.body.expiresOn.getTime() !== existing.expiresOn.getTime();
    const licence = await prisma.licence.update({
      where: { id: existing.id },
      data: { ...req.body, ...(renewed ? { reminded: [] } : {}) },
    });
    res.json(licence);
  },
);

router.delete(
  '/maintenance/licences/:id',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    const result = await prisma.licence.updateMany({
      where: { id: req.params.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) return res.status(404).json({ error: 'Licence not found' });
    res.status(204).end();
  },
);

// --- Calendar ---

router.get('/maintenance/upcoming', requireStaff, validateQuery(upcomingQuery), async (req, res) => {
  const { days } = req.query as unknown as { days?: number };
  res.json({ items: await upcoming(days ?? 90) });
});

export default router;
