import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { CustomRequest } from '../types';
import {
  createHomeBriefingShareSchema,
  homeBriefingItemOutcomeSchema,
  updateHomeBriefingPreferenceSchema,
} from './homeBriefing.contracts';
import {
  createSelectedHomeBriefingShare,
  generateHomeBriefing,
  getHomeBriefingView,
  getSelectedHomeBriefingShare,
  markHomeBriefingOpened,
  recordHomeBriefingItemOutcome,
  revokeHomeBriefingShare,
  updateHomeBriefingPreference,
} from './homeBriefing.service';

const router = Router();
const uuid = z.string().uuid();
const shareToken = z.string().min(32).max(200);

router.use(apiRateLimiter);

router.get(
  '/home-briefing/share/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json({
        success: true,
        data: await getSelectedHomeBriefingShare(shareToken.parse(req.params.token)),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/home-briefing',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await getHomeBriefingView(req.params.propertyId, userId),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/home-briefing/generate',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.status(201).json({
        success: true,
        data: await generateHomeBriefing({
          propertyId: req.params.propertyId,
          userId,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/properties/:propertyId/home-briefing/preferences',
  authenticate,
  propertyAuthMiddleware,
  validateBody(updateHomeBriefingPreferenceSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await updateHomeBriefingPreference({
          propertyId: req.params.propertyId,
          userId,
          ...req.body,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/home-briefing/deliveries/:deliveryId/open',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await markHomeBriefingOpened({
          propertyId: req.params.propertyId,
          userId,
          deliveryId: uuid.parse(req.params.deliveryId),
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/home-briefing/items/:itemId/outcome',
  authenticate,
  propertyAuthMiddleware,
  validateBody(homeBriefingItemOutcomeSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await recordHomeBriefingItemOutcome({
          propertyId: req.params.propertyId,
          userId,
          itemId: uuid.parse(req.params.itemId),
          ...req.body,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/home-briefing/deliveries/:deliveryId/share',
  authenticate,
  propertyAuthMiddleware,
  validateBody(createHomeBriefingShareSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.status(201).json({
        success: true,
        data: await createSelectedHomeBriefingShare({
          propertyId: req.params.propertyId,
          userId,
          deliveryId: uuid.parse(req.params.deliveryId),
          ...req.body,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/home-briefing/shares/:shareId/revoke',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await revokeHomeBriefingShare({
          propertyId: req.params.propertyId,
          userId,
          shareId: uuid.parse(req.params.shareId),
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
