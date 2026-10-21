import { Router } from 'express';
import { logger } from '../logger';
import { requireManager } from '../auth/authMiddleware';
import { runFollowupCycle } from '../services/followup';

/**
 * Manual trigger for the autonomous follow-up agent. The same cycle also runs
 * on a schedule from the job queue (services/jobs).
 */
const router = Router();

router.post('/followup/run', requireManager, async (req, res) => {
  const result = await runFollowupCycle();

  logger.info('Follow-up agent cycle executed', {
    checkedCount: result.checkedCount,
    escalatedTickets: result.escalatedTickets.length,
    remindersSent: result.remindersSent,
    dispatched: result.dispatched,
    trigger: 'manual',
  });

  res.json({
    success: true,
    message: 'Autonomous Follow-up Agent cycle executed',
    ...result,
  });
});

export default router;
