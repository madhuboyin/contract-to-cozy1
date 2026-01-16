// apps/backend/src/routes/homeEvents.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  listHomeEvents,
  getHomeEvent,
  createHomeEvent,
  updateHomeEvent,
  deleteHomeEvent,
  attachHomeEventDocument,
  detachHomeEventDocument,
} from '../controllers/homeEvents.controller';

import {
  createHomeEventBodySchema,
  updateHomeEventBodySchema,
  attachHomeEventDocumentBodySchema,
  listHomeEventsQuerySchema,
} from '../validators/homeEvents.validators';

const router = Router();

// common middleware
router.use(apiRateLimiter);
router.use(authenticate);

// list/get/create/update/delete
router.get(
  '/properties/:propertyId/home-events',
  propertyAuthMiddleware,
  validate(listHomeEventsQuerySchema.transform((query) => ({ query }))), // optional, safe
  listHomeEvents
);

router.get('/properties/:propertyId/home-events/:eventId', propertyAuthMiddleware, getHomeEvent);

router.post(
  '/properties/:propertyId/home-events',
  propertyAuthMiddleware,
  validateBody(createHomeEventBodySchema),
  createHomeEvent
);

router.patch(
  '/properties/:propertyId/home-events/:eventId',
  propertyAuthMiddleware,
  validateBody(updateHomeEventBodySchema),
  updateHomeEvent
);

router.delete('/properties/:propertyId/home-events/:eventId', propertyAuthMiddleware, deleteHomeEvent);

// documents attach/detach
router.post(
  '/properties/:propertyId/home-events/:eventId/documents',
  propertyAuthMiddleware,
  validateBody(attachHomeEventDocumentBodySchema),
  attachHomeEventDocument
);

router.delete(
  '/properties/:propertyId/home-events/:eventId/documents/:documentId',
  propertyAuthMiddleware,
  detachHomeEventDocument
);

export default router;
