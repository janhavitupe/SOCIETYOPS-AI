import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../logger';
import { prisma } from '../database/prisma';
import { requireManager } from '../auth/authMiddleware';
import { requireSocietyId } from '../requestContext';
import { generateFlats } from '../services/buildings';
import { addOccupant, moveOut, OccupantError } from '../services/occupants';
import { validateBody, validateParams, validateQuery } from './validate';
import {
  addOccupantBody,
  createFlatBody,
  createTowerBody,
  generateFlatsBody,
  idParams,
  listFlatsQuery,
  moveOutBody,
  updateFlatBody,
  updateTowerBody,
  type IdParams,
} from './schemas';

/**
 * The society's buildings: towers (or wings, blocks, lanes), their flats, and
 * who lives in each flat. Managers only. Every query is scoped to the
 * request's society, so ids from another society are simply not found.
 */
const router = Router();

const isUniqueClash = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** "A-2" before "A-10", as people read flat numbers. */
const naturally = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

// --- Towers ---

router.get('/towers', requireManager, async (req, res) => {
  const towers = await prisma.tower.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { flats: { where: { deletedAt: null } } } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({
    towers: towers.map(({ _count, ...t }) => ({ ...t, flatCount: _count.flats })),
  });
});

router.post('/towers', requireManager, validateBody(createTowerBody), async (req, res) => {
  try {
    const sortOrder = await prisma.tower.count({ where: { deletedAt: null } });
    const tower = await prisma.tower.create({ data: { ...req.body, societyId: requireSocietyId(), sortOrder } });
    logger.info('Tower added', { towerId: tower.id, by: req.user!.id });
    res.status(201).json({ ...tower, flatCount: 0 });
  } catch (err) {
    if (isUniqueClash(err))
      return res.status(409).json({ error: `There is already a ${req.body.kind} named ${req.body.name}` });
    throw err;
  }
});

router.patch(
  '/towers/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateTowerBody),
  async (req: Request<IdParams>, res: Response) => {
    const existing = await prisma.tower.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Tower not found' });
    try {
      const tower = await prisma.tower.update({ where: { id: existing.id }, data: req.body });
      res.json(tower);
    } catch (err) {
      if (isUniqueClash(err)) return res.status(409).json({ error: `There is already one named ${req.body.name}` });
      throw err;
    }
  },
);

// Only an empty tower can go: deleting one with flats would orphan residents.
router.delete(
  '/towers/:id',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    const tower = await prisma.tower.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!tower) return res.status(404).json({ error: 'Tower not found' });

    const flats = await prisma.flat.count({ where: { towerId: tower.id, deletedAt: null } });
    if (flats) return res.status(409).json({ error: `${tower.name} still has ${flats} flats; remove them first` });

    await prisma.tower.delete({ where: { id: tower.id } });
    logger.info('Tower removed', { towerId: tower.id, by: req.user!.id });
    res.status(204).end();
  },
);

router.post(
  '/towers/:id/flats/generate',
  requireManager,
  validateParams(idParams),
  validateBody(generateFlatsBody),
  async (req: Request<IdParams>, res: Response) => {
    const tower = await prisma.tower.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!tower) return res.status(404).json({ error: 'Tower not found' });

    const { prefix, separator, fromFloor, toFloor, perFloor, type, parkingSlots, dryRun } = req.body;
    const result = await generateFlats(
      tower.id,
      { prefix: prefix ?? tower.name, separator, fromFloor, toFloor, perFloor },
      { type, parkingSlots },
      dryRun,
    );

    // Keep the tower's floor count in step with what was generated.
    if (!dryRun && (tower.floors ?? 0) < toFloor) {
      await prisma.tower.update({ where: { id: tower.id }, data: { floors: toFloor } });
    }

    logger.info('Flats generated', {
      towerId: tower.id,
      created: result.created.length,
      skipped: result.skipped.length,
      dryRun,
    });
    res.status(dryRun ? 200 : 201).json({ ...result, dryRun });
  },
);

// --- Flats ---

const ACTIVE_OCCUPANTS = {
  where: { status: { in: ['active', 'pending'] } },
  include: { user: { select: { id: true, name: true, phoneNumber: true } } },
  orderBy: { createdAt: 'asc' as const },
};

router.get('/flats', requireManager, validateQuery(listFlatsQuery), async (req, res) => {
  const { towerId, query } = req.query as { towerId?: string; query?: string };
  const flats = await prisma.flat.findMany({
    where: {
      deletedAt: null,
      ...(towerId ? { towerId } : {}),
      ...(query ? { number: { contains: query, mode: 'insensitive' as const } } : {}),
    },
    include: { tower: { select: { id: true, name: true } }, occupants: ACTIVE_OCCUPANTS },
    take: 5000,
  });
  flats.sort((a, b) => naturally(a.number, b.number));
  res.json({ count: flats.length, flats });
});

/** A tower id from the body must be one of this society's towers. */
async function towerProblem(towerId: string | null | undefined): Promise<string | null> {
  if (!towerId) return null;
  const tower = await prisma.tower.findFirst({ where: { id: towerId, deletedAt: null } });
  return tower ? null : 'That tower does not exist in this society';
}

router.post('/flats', requireManager, validateBody(createFlatBody), async (req, res) => {
  const problem = await towerProblem(req.body.towerId);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const flat = await prisma.flat.create({ data: { ...req.body, societyId: requireSocietyId() } });
    logger.info('Flat added', { flatId: flat.id, by: req.user!.id });
    res.status(201).json(flat);
  } catch (err) {
    if (isUniqueClash(err)) return res.status(409).json({ error: `Flat ${req.body.number} already exists` });
    throw err;
  }
});

router.patch(
  '/flats/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateFlatBody),
  async (req: Request<IdParams>, res: Response) => {
    const existing = await prisma.flat.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Flat not found' });
    const problem = await towerProblem(req.body.towerId);
    if (problem) return res.status(400).json({ error: problem });
    try {
      const flat = await prisma.flat.update({ where: { id: existing.id }, data: req.body });
      res.json(flat);
    } catch (err) {
      if (isUniqueClash(err)) return res.status(409).json({ error: `Flat ${req.body.number} already exists` });
      throw err;
    }
  },
);

// A flat that anyone has lived in, or that has tickets, keeps its history.
router.delete('/flats/:id', requireManager, validateParams(idParams), async (req: Request<IdParams>, res: Response) => {
  const flat = await prisma.flat.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!flat) return res.status(404).json({ error: 'Flat not found' });

  const [occupants, tickets] = await Promise.all([
    prisma.flatOccupant.count({ where: { flatId: flat.id } }),
    prisma.ticket.count({ where: { flatId: flat.id } }),
  ]);
  if (occupants || tickets) {
    return res
      .status(409)
      .json({ error: `${flat.number} has residents or tickets on record, so it cannot be deleted` });
  }

  await prisma.flat.delete({ where: { id: flat.id } });
  logger.info('Flat removed', { flatId: flat.id, by: req.user!.id });
  res.status(204).end();
});

// --- Occupants ---

router.get(
  '/flats/:id/occupants',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    const flat = await prisma.flat.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!flat) return res.status(404).json({ error: 'Flat not found' });

    // Everyone who has ever lived here, current first.
    const occupants = await prisma.flatOccupant.findMany({
      where: { flatId: flat.id },
      include: { user: { select: { id: true, name: true, phoneNumber: true } } },
      orderBy: [{ status: 'asc' }, { moveInDate: 'desc' }],
    });
    res.json({ flat, occupants });
  },
);

router.post(
  '/flats/:id/occupants',
  requireManager,
  validateParams(idParams),
  validateBody(addOccupantBody),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const { occupant, user, isNewAccount } = await addOccupant(req.params.id, req.body, req.user!.id);
      logger.info('Occupant added', { flatId: req.params.id, occupantId: occupant.id, isNewAccount, by: req.user!.id });
      res.status(201).json({
        ...occupant,
        user: { id: user.id, name: user.name, phoneNumber: user.phoneNumber },
        isNewAccount,
      });
    } catch (err) {
      if (err instanceof OccupantError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  },
);

router.post(
  '/occupants/:id/move-out',
  requireManager,
  validateParams(idParams),
  validateBody(moveOutBody),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const occupant = await moveOut(req.params.id, req.body.moveOutDate);
      logger.info('Occupant moved out', { occupantId: occupant.id, by: req.user!.id });
      res.json(occupant);
    } catch (err) {
      if (err instanceof OccupantError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  },
);

export default router;
