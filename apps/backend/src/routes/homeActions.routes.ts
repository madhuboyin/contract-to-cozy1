import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { logger } from '../lib/logger';
import { CustomRequest } from '../types';
import {
  HomeActionCommandSchema,
  HomeActionInteractionSchema,
  executeHomeActionCommand,
  getHomeActionFeed,
  getUnifiedHome,
  recordHomeActionOpened,
} from '../services/homeActions.service';
import { acknowledgeRecommendationChange } from '../services/decisionPlatform/decisionThreadService';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/home-actions',
  propertyAuthMiddleware,
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const data = await getHomeActionFeed(req.params.propertyId, userId);
      return res.json({ success: true, data });
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to load canonical home actions');
      return res.status(500).json({ success: false, message: error?.message || 'Failed to load home actions.' });
    }
  },
);

router.get(
  '/properties/:propertyId/home',
  propertyAuthMiddleware,
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const data = await getUnifiedHome(req.params.propertyId, userId);
      return res.json({ success: true, data });
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to load unified Home');
      return res.status(500).json({ success: false, message: error?.message || 'Failed to load Home.' });
    }
  },
);

router.post(
  '/properties/:propertyId/home-actions/decision-threads/:threadId/recommendation-changes/:snapshotId/acknowledge',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res) => {
    try {
      if (!req.user?.userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const data = await acknowledgeRecommendationChange(
        req.params.propertyId,
        req.params.threadId,
        req.params.snapshotId,
      );
      return res.json({ success: true, data });
    } catch (error: any) {
      const message = error?.message || 'Failed to acknowledge recommendation change.';
      return res.status(/changed again|no longer active/i.test(message) ? 409 : 400)
        .json({ success: false, message });
    }
  },
);

router.post(
  '/properties/:propertyId/home-actions/:actionId/commands',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(HomeActionCommandSchema),
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const data = await executeHomeActionCommand(
        req.params.propertyId,
        req.params.actionId,
        userId,
        req.body,
      );
      return res.json({ success: true, data });
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to execute canonical home-action command');
      const message = error?.message || 'Failed to update home action.';
      const status = /not found|no longer actionable/i.test(message) ? 404 : 400;
      return res.status(status).json({ success: false, message });
    }
  },
);

router.post(
  '/properties/:propertyId/home-actions/:actionId/interactions',
  propertyAuthMiddleware,
  validateBody(HomeActionInteractionSchema),
  async (req: CustomRequest, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const data = await recordHomeActionOpened(req.params.propertyId, req.params.actionId, userId);
      return res.json({ success: true, data });
    } catch (error: any) {
      const message = error?.message || 'Failed to record action interaction.';
      return res.status(/not found|no longer actionable/i.test(message) ? 404 : 400)
        .json({ success: false, message });
    }
  },
);

export default router;
