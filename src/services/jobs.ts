import { PgBoss } from 'pg-boss';
import { logger } from '../logger';
import { runFollowupCycle } from './followup';

/**
 * Background jobs, on pg-boss so they live in the existing PostgreSQL.
 *
 * The follow-up cycle used to run on a setInterval inside the web process: it
 * was lost on every restart, and two app servers would each run it and
 * double-dispatch. pg-boss stores the schedule in the database, fires each cron
 * tick once across all servers, and the singleton queue policy stops a slow
 * cycle overlapping the next one.
 */

export const QUEUES = {
  followupCycle: 'followup-cycle',
} as const;

/** Default minutes between follow-up cycles. FOLLOWUP_INTERVAL_MINUTES=0 turns it off. */
const DEFAULT_FOLLOWUP_MINUTES = 5;

let boss: PgBoss | null = null;

/** Cron for "every N minutes", for N from 1 to 59. Null disables the schedule. */
export function followupCron(raw: string | undefined = process.env.FOLLOWUP_INTERVAL_MINUTES): string | null {
  const minutes = raw === undefined || raw.trim() === '' ? DEFAULT_FOLLOWUP_MINUTES : Number(raw);
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  if (minutes >= 60) return '0 * * * *';
  return minutes === 1 ? '* * * * *' : `*/${minutes} * * * *`;
}

export async function startJobs(): Promise<void> {
  boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (err) => logger.error('Job queue error', { error: err.message, stack: err.stack }));
  await boss.start();

  await boss.createQueue(QUEUES.followupCycle, { policy: 'singleton', retryLimit: 0, expireInSeconds: 600 });

  await boss.work(QUEUES.followupCycle, async () => {
    const result = await runFollowupCycle();
    logger.info('Follow-up agent cycle executed', {
      checkedCount: result.checkedCount,
      escalatedTickets: result.escalatedTickets.length,
      remindersSent: result.remindersSent,
      dispatched: result.dispatched,
      trigger: 'schedule',
    });
  });

  const cron = followupCron();
  if (cron) {
    await boss.schedule(QUEUES.followupCycle, cron);
    logger.info('Follow-up cycle scheduled', { cron });
  } else {
    // The schedule is stored in the database, so turning it off has to remove it.
    await boss.unschedule(QUEUES.followupCycle);
    logger.info('Follow-up cycle schedule disabled');
  }
}

export async function stopJobs(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 8000 });
  boss = null;
}
