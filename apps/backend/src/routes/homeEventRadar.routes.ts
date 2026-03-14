// apps/backend/src/routes/homeEventRadar.routes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  upsertRadarEvent,
  triggerEventMatching,
  getRadarEvent,
  listRadarFeed,
  getRadarMatchDetail,
  updateRadarMatchState,
  trackHomeEventRadarEvent,
} from '../controllers/homeEventRadar.controller';

import {
  upsertRadarEventBodySchema,
  triggerMatchBodySchema,
  listRadarFeedQuerySchema,
  updateRadarStateBodySchema,
  trackHomeEventRadarEventBodySchema,
} from '../validators/homeEventRadar.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ---------------------------------------------------------------------------
// Internal / operations routes
// These require authentication but not property-level ownership —
// they are intended for internal ingestion and backend-triggered matching.
// ---------------------------------------------------------------------------

/**
 * POST /radar/events
 * Create or upsert a canonical RadarEvent, then trigger property matching.
 */
router.post(
  '/radar/events',
  validateBody(upsertRadarEventBodySchema),
  upsertRadarEvent,
);

/**
 * POST /radar/events/:eventId/match
 * (Re-)trigger property matching for an existing canonical event.
 */
router.post(
  '/radar/events/:eventId/match',
  validateBody(triggerMatchBodySchema),
  triggerEventMatching,
);

/**
 * GET /radar/events/:eventId
 * Fetch a canonical radar event record.
 */
router.get(
  '/radar/events/:eventId',
  getRadarEvent,
);

// ---------------------------------------------------------------------------
// Property-scoped routes
// These require the authenticated user to own the property.
// ---------------------------------------------------------------------------

/**
 * GET /properties/:propertyId/radar/feed
 * Compact event feed for a property, ordered by newest first.
 */
router.get(
  '/properties/:propertyId/radar/feed',
  propertyAuthMiddleware,
  validate(listRadarFeedQuerySchema.transform((q) => ({ query: q }))),
  listRadarFeed,
);

/**
 * GET /properties/:propertyId/radar/matches/:matchId
 * Full event detail for a property-event match.
 * Auto-marks the match as 'seen' on first view.
 */
router.get(
  '/properties/:propertyId/radar/matches/:matchId',
  propertyAuthMiddleware,
  getRadarMatchDetail,
);

/**
 * PATCH /properties/:propertyId/radar/matches/:matchId/state
 * Update user interaction state (seen | saved | dismissed | acted_on).
 */
router.patch(
  '/properties/:propertyId/radar/matches/:matchId/state',
  propertyAuthMiddleware,
  validateBody(updateRadarStateBodySchema),
  updateRadarMatchState,
);

/**
 * POST /properties/:propertyId/radar/analytics-events
 * Record a frontend analytics/usage event for Home Event Radar.
 */
router.post(
  '/properties/:propertyId/radar/analytics-events',
  propertyAuthMiddleware,
  validateBody(trackHomeEventRadarEventBodySchema),
  trackHomeEventRadarEvent,
);

export default router;
