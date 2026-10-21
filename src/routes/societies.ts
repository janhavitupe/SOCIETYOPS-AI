import { Router } from 'express';
import { logger } from '../logger';
import { unscopedPrisma } from '../database/prisma';
import { requireAdmin, requireAuth, requireSignedIn } from '../auth/authMiddleware';
import { isManager } from '../auth/actor';
import { createSociety, SocietyLimitError } from '../services/societies';
import { checkAttachments, resolveImageUrls } from '../services/storage';
import { validateBody } from './validate';
import { createSocietyBody, updateSocietyBody } from './schemas';

/**
 * Creating a society, and its own details. Society is the tenant itself, not
 * a tenant-scoped row, so these address it by the request's society id.
 */
const router = Router();

/** The society as its members see it; the join code only for those who hand it out. */
async function present(
  society: Awaited<ReturnType<typeof unscopedPrisma.society.findUniqueOrThrow>>,
  showJoinCode: boolean,
) {
  const { joinCode, logoKey, ...rest } = society;
  const [logoUrl] = logoKey ? await resolveImageUrls([logoKey]) : [null];
  return { ...rest, logoKey, logoUrl, ...(showJoinCode ? { joinCode } : {}) };
}

router.post('/societies', requireSignedIn, validateBody(createSocietyBody), async (req, res) => {
  const identity = req.identity!;
  if (!identity.name) {
    return res.status(400).json({ error: 'Add your name to your account before setting up a society' });
  }

  try {
    const society = await createSociety(
      { userId: identity.userId, name: identity.name, isPlatformAdmin: identity.platformRole === 'platform_admin' },
      req.body,
    );

    // Work in the new society straight away.
    await unscopedPrisma.session.update({ where: { id: identity.sessionId }, data: { activeSocietyId: society.id } });

    logger.info('Society created', { societyId: society.id, by: identity.userId });
    res.status(201).json(await present(society, true));
  } catch (err) {
    if (err instanceof SocietyLimitError) return res.status(409).json({ error: err.message });
    throw err;
  }
});

router.get('/society', requireAuth, async (req, res) => {
  const society = await unscopedPrisma.society.findUniqueOrThrow({ where: { id: req.user!.societyId } });
  res.json(await present(society, isManager(req.user!)));
});

router.patch('/society', requireAdmin, validateBody(updateSocietyBody), async (req, res) => {
  const societyId = req.user!.societyId;
  const { logoKey, ...fields } = req.body;

  if (logoKey) {
    const problem = await checkAttachments(req.user!.id, [logoKey]);
    if (problem) return res.status(400).json({ error: problem });
  }

  const society = await unscopedPrisma.$transaction(async (tx) => {
    const updated = await tx.society.update({
      where: { id: societyId },
      data: { ...fields, ...(logoKey !== undefined ? { logoKey } : {}) },
    });
    // The profile carries a copy of the name for the screens that read it.
    if (fields.name) {
      await tx.societyProfile.updateMany({ where: { societyId }, data: { societyName: fields.name } });
    }
    return updated;
  });

  logger.info('Society details updated', { societyId, by: req.user!.id, fields: Object.keys(req.body) });
  res.json(await present(society, true));
});

export default router;
