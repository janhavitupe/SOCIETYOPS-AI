import { Router } from 'express';
import { logger, route } from '../logger';
import { requireAuth } from '../auth/authMiddleware';
import { processResidentMessage } from '../agents/orchestrator';

/**
 * The resident assistant. Identity comes from the token, never the body.
 */
const router = Router();

router.post('/chat', requireAuth, route(async (req, res) => {
  try {
    const { text, images } = req.body;
    if (!text) {
      logger.warn('Chat request failed - missing text');
      return res.status(400).json({ error: 'Text prompt is required' });
    }

    // Identity comes from the token. The body used to supply flatNumber and
    // residentName, which let any caller raise a ticket as any resident.
    const user = req.user!;
    const result = await processResidentMessage(user, text, images);
    logger.info('Chat message processed', {
      flatNumber: user.flatNumber,
      textLength: text.length,
      source: result.source,
      fallbackReason: result.fallbackReason,
    });
    res.json(result);
  } catch (err: any) {
    logger.error('Error processing chat message', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message || 'Internal AI orchestration error' });
  }
}));

export default router;
