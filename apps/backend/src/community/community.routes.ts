// apps/backend/src/community/community.routes.ts

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';
import { authenticate } from '../middleware/auth.middleware';

export function communityRoutes(prisma: PrismaClient) {
  const router = Router();
  const service = new CommunityService(prisma);
  const controller = new CommunityController(service);

  // City-based endpoints
  router.get('/api/v1/community/events', authenticate, controller.getEventsByCity);
  router.get('/api/v1/community/open-data', authenticate, controller.getCityOpenData);

  // Property-based endpoints (backwards compatible)
  router.get('/api/v1/properties/:propertyId/community/events', authenticate, controller.getEventsByProperty);
  
  // On-the-fly endpoints (no DB writes)
  router.get('/api/community/trash', authenticate, controller.getTrash);
  router.get('/api/community/trash-schedule', authenticate, controller.getTrashSchedule); // ✅ NEW
  router.get('/api/community/alerts', authenticate, controller.getAlerts);

  // Legacy endpoints
  router.get('/api/v1/community/trash', authenticate, controller.getTrashInfo);
  router.get('/api/v1/community/alerts', authenticate, controller.getCityAlerts);

  return router;
}