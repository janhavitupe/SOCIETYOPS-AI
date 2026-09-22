import { Router } from 'express';
import { logger, route } from '../logger';
import { prisma } from '../database/prisma';

/**
 * Liveness and database reachability. The only unauthenticated route here.
 */
const router = Router();

router.get('/health', async (req, res) => {
  let database = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    database = 'unreachable';
    logger.error('Health check: database unreachable', { error: (err as Error).message });
  }

  const healthy = database === 'ok';
  logger.info('Health check requested', { ip: req.ip, database });
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'SocietyOps AI Maintenance Coordination System',
    version: '1.0.0',
    database,
    timestamp: new Date().toISOString(),
  });
});

export default router;
