import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { requireAdmin, requireManager } from '../auth/authMiddleware';
import { finishOnboarding, onboardingState, rememberStep, setSkipped } from '../services/onboarding';
import { validateBody, validateParams } from './validate';
import { onboardingSkipBody, onboardingStepParams, type OnboardingStepParams } from './schemas';

/**
 * The setup wizard for a new society. Managers can see how far setup has got;
 * the society admin moves through it, skips steps and finishes it.
 */
const router = Router();

router.get('/onboarding', requireManager, async (req, res) => {
  res.json(await onboardingState());
});

router.post(
  '/onboarding/steps/:step/visit',
  requireAdmin,
  validateParams(onboardingStepParams),
  async (req: Request<OnboardingStepParams>, res: Response) => {
    await rememberStep(req.params.step);
    res.json(await onboardingState());
  },
);

router.post(
  '/onboarding/steps/:step/skip',
  requireAdmin,
  validateParams(onboardingStepParams),
  validateBody(onboardingSkipBody),
  async (req: Request<OnboardingStepParams>, res: Response) => {
    await setSkipped(req.params.step, req.body.skipped);
    res.json(await onboardingState());
  },
);

router.post('/onboarding/finish', requireAdmin, async (req, res) => {
  await finishOnboarding();
  logger.info('Onboarding finished', { societyId: req.user!.societyId, by: req.user!.id });
  res.json(await onboardingState());
});

export default router;
