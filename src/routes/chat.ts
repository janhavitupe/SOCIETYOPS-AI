import { Router } from 'express';
import { logger } from '../logger';
import { requireAuth } from '../auth/authMiddleware';
import { processResidentMessage } from '../agents/orchestrator';
import { checkAttachments } from '../services/storage';
import { validateBody } from './validate';
import { chatBody } from './schemas';

/**
 * The resident assistant. Identity comes from the token, never the body.
 */
const router = Router();

// Failures go to the terminal error handler, which logs them and returns a
// generic 500. This route used to send err.message to the client.
router.post('/chat', requireAuth, validateBody(chatBody), async (req, res) => {
  const { text, images } = req.body;

  // Identity comes from the token. The body used to supply flatNumber and
  // residentName, which let any caller raise a ticket as any resident.
  const user = req.user!;

  const attachmentProblem = await checkAttachments(user.id, images);
  if (attachmentProblem) return res.status(400).json({ error: attachmentProblem });

  const result = await processResidentMessage(user, text, images);
  logger.info('Chat message processed', {
    flatNumber: user.flatNumber,
    textLength: text.length,
    source: result.source,
    fallbackReason: result.fallbackReason,
  });
  res.json(result);
});

export default router;
