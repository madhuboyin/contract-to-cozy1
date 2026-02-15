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
      console.error('Error fetching onboarding status:', error);
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
      console.error('Error updating onboarding step:', error);
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
      console.error('Error completing onboarding step:', error);
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
      console.error('Error skipping onboarding:', error);
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
      console.error('Error finishing onboarding:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to finish onboarding.',
      });
    }
  }
);

export default router;
