import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { prisma } from '../database/prisma';
import { requireAuth, requireManager } from '../auth/authMiddleware';
import { isManager } from '../auth/actor';
import { requireSocietyId } from '../requestContext';
import { validateBody, validateParams } from './validate';
import {
  createAssetBody,
  createCommonAreaBody,
  idParams,
  updateAssetBody,
  updateCommonAreaBody,
  type IdParams,
} from './schemas';

/**
 * Common areas (lobby, terrace, clubhouse) and the assets in them (each lift,
 * pump, DG set), so a report of "lift B2 stuck" points at that lift. Everyone
 * in the society can list them to report a problem; managers keep them up to
 * date, and only managers see makes, serial numbers and contracts.
 */
const router = Router();

const naturally = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { numeric: true });

/** Checks that ids in a body belong to this society; returns the first problem. */
async function referenceProblem(body: {
  towerId?: string | null;
  commonAreaId?: string | null;
  amcVendorId?: string | null;
}) {
  if (body.towerId && !(await prisma.tower.findFirst({ where: { id: body.towerId, deletedAt: null } })))
    return 'That tower does not exist in this society';
  if (body.commonAreaId && !(await prisma.commonArea.findFirst({ where: { id: body.commonAreaId, deletedAt: null } })))
    return 'That common area does not exist in this society';
  if (body.amcVendorId && !(await prisma.vendor.findFirst({ where: { id: body.amcVendorId, deletedAt: null } })))
    return 'That vendor does not exist in this society';
  return null;
}

/** Names are how people (and the agent) say which place they mean, so they must not repeat. */
async function nameTaken(model: 'commonArea' | 'asset', name: string, exceptId?: string) {
  const where = { name: { equals: name, mode: 'insensitive' as const }, deletedAt: null, id: { not: exceptId } };
  const found =
    model === 'commonArea' ? await prisma.commonArea.findFirst({ where }) : await prisma.asset.findFirst({ where });
  return !!found;
}

// --- Common areas ---

router.get('/common-areas', requireAuth, async (req, res) => {
  const manager = isManager(req.user!);
  const areas = await prisma.commonArea.findMany({
    where: { deletedAt: null },
    include: {
      tower: { select: { id: true, name: true } },
      assets: {
        where: { deletedAt: null },
        include: { amcVendor: { select: { id: true, name: true } } },
      },
    },
  });
  // Assets not in any area are listed on their own.
  const looseAssets = await prisma.asset.findMany({
    where: { deletedAt: null, commonAreaId: null },
    include: { amcVendor: { select: { id: true, name: true } } },
  });

  const shape = (a: any) =>
    manager ? a : { id: a.id, name: a.name, kind: a.kind, commonAreaId: a.commonAreaId, towerId: a.towerId };

  res.json({
    commonAreas: areas.sort(naturally).map((area) => ({ ...area, assets: area.assets.sort(naturally).map(shape) })),
    looseAssets: looseAssets.sort(naturally).map(shape),
  });
});

router.post('/common-areas', requireManager, validateBody(createCommonAreaBody), async (req, res) => {
  const problem = await referenceProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  if (await nameTaken('commonArea', req.body.name))
    return res.status(409).json({ error: `There is already a common area called ${req.body.name}` });

  const area = await prisma.commonArea.create({ data: { ...req.body, societyId: requireSocietyId() } });
  logger.info('Common area added', { commonAreaId: area.id, by: req.user!.id });
  res.status(201).json({ ...area, assets: [] });
});

router.patch(
  '/common-areas/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateCommonAreaBody),
  async (req: Request<IdParams>, res: Response) => {
    const existing = await prisma.commonArea.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Common area not found' });
    const problem = await referenceProblem(req.body);
    if (problem) return res.status(400).json({ error: problem });
    if (req.body.name && (await nameTaken('commonArea', req.body.name, existing.id)))
      return res.status(409).json({ error: `There is already a common area called ${req.body.name}` });

    res.json(await prisma.commonArea.update({ where: { id: existing.id }, data: req.body }));
  },
);

// Soft delete: old tickets keep pointing at the place they were about.
router.delete(
  '/common-areas/:id',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    const area = await prisma.commonArea.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!area) return res.status(404).json({ error: 'Common area not found' });
    const assets = await prisma.asset.count({ where: { commonAreaId: area.id, deletedAt: null } });
    if (assets)
      return res.status(409).json({ error: `${area.name} still has ${assets} assets; move or remove them first` });

    await prisma.commonArea.update({ where: { id: area.id }, data: { deletedAt: new Date() } });
    logger.info('Common area removed', { commonAreaId: area.id, by: req.user!.id });
    res.status(204).end();
  },
);

// --- Assets ---

router.post('/assets', requireManager, validateBody(createAssetBody), async (req, res) => {
  const problem = await referenceProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  if (await nameTaken('asset', req.body.name))
    return res.status(409).json({ error: `There is already an asset called ${req.body.name}` });

  const asset = await prisma.asset.create({
    data: { ...req.body, societyId: requireSocietyId() },
    include: { amcVendor: { select: { id: true, name: true } } },
  });
  logger.info('Asset added', { assetId: asset.id, kind: asset.kind, by: req.user!.id });
  res.status(201).json(asset);
});

router.patch(
  '/assets/:id',
  requireManager,
  validateParams(idParams),
  validateBody(updateAssetBody),
  async (req: Request<IdParams>, res: Response) => {
    const existing = await prisma.asset.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });
    const problem = await referenceProblem(req.body);
    if (problem) return res.status(400).json({ error: problem });
    if (req.body.name && (await nameTaken('asset', req.body.name, existing.id)))
      return res.status(409).json({ error: `There is already an asset called ${req.body.name}` });

    const asset = await prisma.asset.update({
      where: { id: existing.id },
      data: req.body,
      include: { amcVendor: { select: { id: true, name: true } } },
    });
    res.json(asset);
  },
);

router.delete(
  '/assets/:id',
  requireManager,
  validateParams(idParams),
  async (req: Request<IdParams>, res: Response) => {
    const asset = await prisma.asset.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    await prisma.asset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } });
    logger.info('Asset removed', { assetId: asset.id, by: req.user!.id });
    res.status(204).end();
  },
);

export default router;
