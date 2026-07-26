// apps/backend/src/routes/homeEventRadar.routes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  propertyAuthMiddleware,
  requireHouseholdRole,
} from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  getRadarOverview,
  getRadarCoverage,
  getRadarCounts,
  getRadarNotificationPreferences,
  updateRadarNotificationPreferences,
  listRadarEvents,
  getRadarEventDetail,
  getRadarStateView,
  listRadarFeed,
  getRadarMatchDetail,
  updateRadarMatchState,
  submitRadarMatchFeedback,
  createOrLinkRadarTask,
  listRadarTaskCandidates,
  trackHomeEventRadarEvent,
} from '../controllers/homeEventRadar.controller';

import {
  listRadarEventsRequestSchema,
  listRadarStateViewRequestSchema,
  listRadarFeedQuerySchema,
  updateRadarStateBodySchema,
  submitRadarFeedbackBodySchema,
  radarTaskActionRequestSchema,
  radarTaskIntegrationBodySchema,
  updateRadarNotificationPreferencesBodySchema,
  trackHomeEventRadarEventBodySchema,
} from '../validators/homeEventRadar.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ---------------------------------------------------------------------------
// Property-scoped routes
// These require the authenticated user to own the property.
// ---------------------------------------------------------------------------

router.get(
  '/properties/:propertyId/radar/overview',
  propertyAuthMiddleware,
  getRadarOverview,
);

router.get(
  '/properties/:propertyId/radar/coverage',
  propertyAuthMiddleware,
  getRadarCoverage,
);

router.get(
  '/properties/:propertyId/radar/counts',
  propertyAuthMiddleware,
  getRadarCounts,
);

router.get(
  '/properties/:propertyId/radar/preferences',
  propertyAuthMiddleware,
  getRadarNotificationPreferences,
);

router.put(
  '/properties/:propertyId/radar/preferences',
  propertyAuthMiddleware,
  validateBody(updateRadarNotificationPreferencesBodySchema),
  updateRadarNotificationPreferences,
);

router.get(
  '/properties/:propertyId/radar/events',
  propertyAuthMiddleware,
  validate(listRadarEventsRequestSchema),
  listRadarEvents,
);

router.get(
  '/properties/:propertyId/radar/events/:matchId',
  propertyAuthMiddleware,
  getRadarEventDetail,
);

router.get(
  '/properties/:propertyId/radar/states/:state(new|seen|saved|dismissed|acted_on)',
  propertyAuthMiddleware,
  validate(listRadarStateViewRequestSchema),
  getRadarStateView,
);

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
 * PATCH /properties/:propertyId/radar/events/:matchId/state
 * Update user interaction state (seen | saved | dismissed | acted_on).
 */
router.patch(
  '/properties/:propertyId/radar/events/:matchId/state',
  propertyAuthMiddleware,
  validateBody(updateRadarStateBodySchema),
  updateRadarMatchState,
);

/**
 * POST /properties/:propertyId/radar/events/:matchId/feedback
 * Create or replace structured homeowner feedback for this match.
 */
router.post(
  '/properties/:propertyId/radar/events/:matchId/feedback',
  propertyAuthMiddleware,
  validateBody(submitRadarFeedbackBodySchema),
  submitRadarMatchFeedback,
);

router.get(
  '/properties/:propertyId/radar/events/:matchId/actions/:actionCode/task-candidates',
  propertyAuthMiddleware,
  validate(radarTaskActionRequestSchema),
  listRadarTaskCandidates,
);

router.post(
  '/properties/:propertyId/radar/events/:matchId/actions/:actionCode/task',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(radarTaskActionRequestSchema),
  validateBody(radarTaskIntegrationBodySchema),
  createOrLinkRadarTask,
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
