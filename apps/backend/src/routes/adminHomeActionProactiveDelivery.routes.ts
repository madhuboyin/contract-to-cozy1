// apps/backend/src/routes/adminHomeActionProactiveDelivery.routes.ts
//
// Ask Intelligence FRD §18.3, Phase 9C. Admin-only controls for home-action
// proactive delivery (kill switch + decision monitoring log).

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import {
  getHomeActionProactiveDeliveryStatusHandler,
  pauseHomeActionProactiveDeliveryHandler,
  resumeHomeActionProactiveDeliveryHandler,
  listHomeActionProactiveDeliveryDecisionsHandler,
} from '../controllers/adminHomeActionProactiveDelivery.controller';

const router = Router();

router.use('/admin/home-action-proactive-delivery', authenticate, requireMfa, requireRole(UserRole.ADMIN));

router.get('/admin/home-action-proactive-delivery/status', requireCapability('ANALYTICS_VIEW'), getHomeActionProactiveDeliveryStatusHandler);
router.get('/admin/home-action-proactive-delivery/decisions', requireCapability('ANALYTICS_VIEW'), listHomeActionProactiveDeliveryDecisionsHandler);
router.post('/admin/home-action-proactive-delivery/kill-switch/pause', requireCapability('SYSTEM_SETTINGS_MANAGE'), pauseHomeActionProactiveDeliveryHandler);
router.post('/admin/home-action-proactive-delivery/kill-switch/resume', requireCapability('SYSTEM_SETTINGS_MANAGE'), resumeHomeActionProactiveDeliveryHandler);

export default router;
