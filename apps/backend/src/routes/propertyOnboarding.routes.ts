import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { CustomRequest } from '../types';
import {
  completeStep,
  computeSetupStatus,
  finishOnboarding,
  setCurrentStep,
  skipOnboarding,
} from '../services/propertyOnboarding.service';
import { logger } from '../lib/logger';
import {
  EntryContextCaptureSchema,
  FirstActionResolutionSchema,
  captureEntryContext,
  getActivationFirstValue,
  getEntryContext,
  recordFirstActionResolution,
} from '../services/entryContext.service';

const router = Router();

const setStepBodySchema = z.object({
  currentStep: z.number().int().min(1).max(5),
});

const completeStepBodySchema = z.object({
  step: z.number().int().min(1).max(5),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/onboarding/entry-context',
  propertyAuthMiddleware,
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const context = await getEntryContext(req.params.propertyId, userId);
      return res.json({ success: true, data: context });
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching onboarding entry context');
      return res.status(500).json({ success: false, message: error?.message || 'Failed to fetch entry context.' });
    }
  }
);

router.post(
  '/properties/:propertyId/onboarding/first-action-resolution',
  propertyAuthMiddleware,
  validateBody(FirstActionResolutionSchema),
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const resolution = await recordFirstActionResolution(req.params.propertyId, userId, req.body);
      return res.json({ success: true, data: resolution, message: 'First action resolution recorded.' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error recording onboarding first action resolution');
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to record first action resolution.',
      });
    }
  }
);

router.put(
  '/properties/:propertyId/onboarding/entry-context',
  propertyAuthMiddleware,
  validateBody(EntryContextCaptureSchema),
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const context = await captureEntryContext(req.params.propertyId, userId, req.body);
      return res.json({ success: true, data: context, message: 'Activation context captured.' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error capturing onboarding entry context');
      return res.status(500).json({ success: false, message: error?.message || 'Failed to capture entry context.' });
    }
  }
);

router.get(
  '/properties/:propertyId/onboarding/first-value',
  propertyAuthMiddleware,
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const firstValue = await getActivationFirstValue(req.params.propertyId, userId);
      return res.json({ success: true, data: firstValue });
    } catch (error: any) {
      logger.error({ err: error }, 'Error generating onboarding first value');
      const missingContext = String(error?.message ?? '').includes('has not been captured');
      return res.status(missingContext ? 409 : 500).json({
        success: false,
        message: error?.message || 'Failed to generate first value.',
      });
    }
  }
);

router.get(
  '/properties/:propertyId/onboarding/status',
  propertyAuthMiddleware,
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      const propertyId = req.params.propertyId;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      const status = await computeSetupStatus(propertyId, userId);
      return res.json({ success: true, data: status });
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching onboarding status');
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to fetch onboarding status.',
      });
    }
  }
);

router.post(
  '/properties/:propertyId/onboarding/set-step',
  propertyAuthMiddleware,
  validateBody(setStepBodySchema),
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      const propertyId = req.params.propertyId;
      const { currentStep } = req.body as z.infer<typeof setStepBodySchema>;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      const status = await setCurrentStep(propertyId, userId, currentStep);
      return res.json({ success: true, data: status, message: 'Onboarding step updated.' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating onboarding step');
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to update onboarding step.',
      });
    }
  }
);

router.post(
  '/properties/:propertyId/onboarding/complete-step',
  propertyAuthMiddleware,
  validateBody(completeStepBodySchema),
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      const propertyId = req.params.propertyId;
      const { step } = req.body as z.infer<typeof completeStepBodySchema>;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      const status = await completeStep(propertyId, userId, step);
      return res.json({ success: true, data: status, message: 'Step marked complete.' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error completing onboarding step');
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to complete onboarding step.',
      });
    }
  }
);

router.post(
  '/properties/:propertyId/onboarding/skip',
  propertyAuthMiddleware,
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      const propertyId = req.params.propertyId;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      const status = await skipOnboarding(propertyId, userId);
      return res.json({ success: true, data: status, message: 'Onboarding skipped.' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error skipping onboarding');
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to skip onboarding.',
      });
    }
  }
);

router.post(
  '/properties/:propertyId/onboarding/finish',
  propertyAuthMiddleware,
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      const propertyId = req.params.propertyId;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      const status = await finishOnboarding(propertyId, userId);
      return res.json({ success: true, data: status, message: 'Onboarding completed.' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error finishing onboarding');
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to finish onboarding.',
      });
    }
  }
);

export default router;
