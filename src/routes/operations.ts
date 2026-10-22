import { Router } from 'express';
import { logger } from '../logger';
import { ticketRepo, notificationRepo, agentLogRepo } from '../database/repositories';
import { requireAuth, requireManager } from '../auth/authMiddleware';
import { prisma } from '../database/prisma';
import type { Actor } from '../auth/actor';
import { buildDailyReport } from '../services/analytics';

/**
 * Manager-only operational views: dispatch log, agent activity and the daily report.
 */
const router = Router();

router.get('/notifications', requireManager, async (req, res) => {
  const notifications = await notificationRepo.findAll();
  logger.info('Notifications listed', { count: notifications.length });
  res.json({ count: notifications.length, notifications });
});

// --- The signed-in person's own notifications ---

/**
 * Messages sent to this person: by who they were for, or, for messages from
 * before that was recorded, by their phone number.
 */
const mine = (user: Actor) => ({
  deletedAt: null,
  OR: [{ recipientUserId: user.id }, ...(user.phone ? [{ recipientUserId: null, phone: user.phone }] : [])],
});

router.get('/me/notifications', requireAuth, async (req, res) => {
  const where = mine(req.user!);
  const [notifications, unread] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 50,
      select: { id: true, ticketId: true, message: true, timestamp: true, readAt: true },
    }),
    prisma.notificationLog.count({ where: { ...where, readAt: null } }),
  ]);
  res.json({ unread, notifications });
});

router.post('/me/notifications/read', requireAuth, async (req, res) => {
  const result = await prisma.notificationLog.updateMany({
    where: { ...mine(req.user!), readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ marked: result.count });
});

router.get('/logs', requireManager, async (req, res) => {
  const logs = await agentLogRepo.findAll();
  logger.info('Agent logs listed', { count: logs.length });
  res.json({ count: logs.length, logs });
});

router.get('/analytics', requireManager, async (req, res) => {
  const report = buildDailyReport(await ticketRepo.findAll());
  logger.info('Analytics report generated');
  res.json(report);
});

export default router;
