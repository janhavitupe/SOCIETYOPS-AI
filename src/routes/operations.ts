import { Router } from 'express';
import { logger, route } from '../logger';
import { ticketRepo, notificationRepo, agentLogRepo } from '../database/repositories';
import { requireManager } from '../auth/authMiddleware';
import { buildDailyReport } from '../services/analytics';

/**
 * Manager-only operational views: dispatch log, agent activity and the daily report.
 */
const router = Router();

router.get('/notifications', requireManager, route(async (req, res) => {
  const notifications = await notificationRepo.findAll();
  logger.info('Notifications listed', { count: notifications.length });
  res.json({ count: notifications.length, notifications });
}));

router.get('/logs', requireManager, route(async (req, res) => {
  const logs = await agentLogRepo.findAll();
  logger.info('Agent logs listed', { count: logs.length });
  res.json({ count: logs.length, logs });
}));

router.get('/analytics', requireManager, route(async (req, res) => {
  const report = buildDailyReport(await ticketRepo.findAll());
  logger.info('Analytics report generated');
  res.json(report);
}));

export default router;
