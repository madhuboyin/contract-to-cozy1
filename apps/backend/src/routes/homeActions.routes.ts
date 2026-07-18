import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { logger } from '../lib/logger';
import { CustomRequest } from '../types';
import {
  HomeActionCommandSchema,
  executeHomeActionCommand,
  getHomeActionFeed,
} from '../services/homeActions.service';

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

export default router;
