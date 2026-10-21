import { Router } from 'express';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { Prisma } from '@prisma/client';
import { logger } from '../logger';
import { auth, isPlaceholderEmail } from '../auth/auth';
import { requireSignedIn } from '../auth/authMiddleware';
import { unscopedPrisma } from '../database/prisma';
import { validateBody } from './validate';
import { activeSocietyBody, updateAccountBody } from './schemas';

/**
 * The signed-in person's own account: who they are, which societies they
 * belong to, and switching between them. Works before they belong to any
 * society, which is how a new sign-up finishes setting up.
 */
const router = Router();

router.get('/me', requireSignedIn, async (req, res) => {
  const identity = req.identity!;

  const [memberships, credential] = await Promise.all([
    unscopedPrisma.membership.findMany({
      where: { userId: identity.userId, status: 'active' },
      include: { society: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    unscopedPrisma.account.findFirst({
      where: { userId: identity.userId, providerId: 'credential', password: { not: null } },
      select: { id: true },
    }),
  ]);

  // One entry per society, with every role the person holds there.
  const societies = new Map<string, { id: string; name: string; status: string; roles: string[] }>();
  for (const m of memberships) {
    const entry = societies.get(m.societyId) ?? { ...m.society, roles: [] };
    entry.roles.push(m.role);
    societies.set(m.societyId, entry);
  }

  const actor = req.user;
  res.json({
    user: {
      id: identity.userId,
      name: identity.name,
      phone: identity.phone,
      email: isPlaceholderEmail(identity.email) ? null : identity.email,
      platformRole: identity.platformRole,
      hasPassword: !!credential,
      // Fields the existing screens read, from the active society.
      role: actor?.role ?? null,
      roles: actor?.roles ?? [],
      flatNumber: actor?.flatNumber ?? '',
      flats: actor?.flats ?? [],
    },
    activeSocietyId: actor?.societyId ?? null,
    societies: [...societies.values()],
  });
});

// Finishing sign-up after the phone is verified: a name, optionally an email,
// and a password for signing in without a code. A password that is already
// set is changed through Better Auth's own change-password endpoint instead.
router.patch('/me', requireSignedIn, validateBody(updateAccountBody), async (req, res) => {
  const { name, email, password } = req.body;
  const userId = req.identity!.userId;

  try {
    await unscopedPrisma.user.update({
      where: { id: userId },
      data: {
        ...(name ? { name } : {}),
        ...(email ? { email, emailVerified: false } : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'That email address is already in use' });
    }
    throw err;
  }

  if (password) {
    try {
      await auth.api.setPassword({ body: { newPassword: password }, headers: fromNodeHeaders(req.headers) });
    } catch (err) {
      if (err instanceof APIError) {
        return res.status(409).json({ error: 'A password is already set; change it from your account settings' });
      }
      throw err;
    }
  }

  logger.info('Account updated', { userId, name: !!name, email: !!email, password: !!password });
  res.json({ ok: true });
});

// The society switcher. The session remembers the choice.
router.post('/me/active-society', requireSignedIn, validateBody(activeSocietyBody), async (req, res) => {
  const { societyId } = req.body;
  const membership = await unscopedPrisma.membership.findFirst({
    where: { userId: req.identity!.userId, societyId, status: 'active' },
  });
  if (!membership) return res.status(403).json({ error: 'You are not a member of that society' });

  await unscopedPrisma.session.update({ where: { id: req.identity!.sessionId }, data: { activeSocietyId: societyId } });
  logger.info('Active society switched', { userId: req.identity!.userId, societyId });
  res.json({ activeSocietyId: societyId });
});

export default router;
