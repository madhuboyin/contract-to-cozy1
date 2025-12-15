// apps/backend/src/community/community.routes.ts

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';

// If you have auth middleware, apply it here (recommended)
import { authenticate } from '../middleware/auth.middleware';

export function communityRoutes(prisma: PrismaClient) {
  const router = Router();
  const service = new CommunityService(prisma);
  const controller = new CommunityController(service);

  // City-based (new)
  router.get('/api/v1/community/events', authenticate, controller.getEventsByCity);
  router.get('/api/v1/community/open-data', authenticate, controller.getCityOpenData);

  // Backwards-compatible property-based (so your existing frontend API call can still work)
  router.get('/api/v1/properties/:propertyId/community/events', authenticate, controller.getEventsByProperty);
    // ✅ NEW on-the-fly endpoints (no DB writes)
  router.get('/api/community/trash', authenticate, controller.getTrash);
  router.get('/api/community/alerts', authenticate, controller.getAlerts);

  router.get('/api/v1/community/trash', authenticate, controller.getTrashInfo);
  router.get('/api/v1/community/alerts', authenticate, controller.getCityAlerts);

  return router;
}
