// apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.routes.ts

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../types/auth.types';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { ingestEventBodySchema } from './neighborhoodIntelligence.validators';
import {
  getNeighborhoodRadarSummary,
  getNeighborhoodRadarEvents,
  getNeighborhoodRadarEventDetail,
  getNeighborhoodRadarTrends,
  getNeighborhoodSignals,
  ingestNeighborhoodEvent,
  recomputeEventMatches,
  recomputePropertyRadar,
} from './neighborhoodIntelligence.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ============================================================================
// NEIGHBORHOOD CHANGE RADAR — Property Read APIs
// ============================================================================

/**
 * GET /api/properties/:propertyId/neighborhood-radar/summary
 *
 * Returns an interpreted summary card for the Neighborhood Change Radar.
 * Includes: meaningful change count, overall sentiment, top themes, top event preview.
 */
router.get(
  '/properties/:propertyId/neighborhood-radar/summary',
  propertyAuthMiddleware,
  getNeighborhoodRadarSummary,
);

/**
 * GET /api/properties/:propertyId/neighborhood-radar/events
 *
 * Returns paginated list of nearby neighborhood events for the property.
 *
 * Query params (all optional):
 *   sortBy       impact (default) | date
 *   filterType   NeighborhoodEventType value
 *   filterEffect POSITIVE | NEGATIVE | MIXED
 *   limit        default 20
 *   offset       default 0
 */
router.get(
  '/properties/:propertyId/neighborhood-radar/events',
  propertyAuthMiddleware,
  getNeighborhoodRadarEvents,
);

/**
 * GET /api/properties/:propertyId/neighborhood-radar/events/:eventId
 *
 * Returns full detail for a single neighborhood event, including all impacts
 * and demographic signals for this property.
 */
router.get(
  '/properties/:propertyId/neighborhood-radar/events/:eventId',
  propertyAuthMiddleware,
  getNeighborhoodRadarEventDetail,
);

/**
 * GET /api/properties/:propertyId/neighborhood-radar/trends
 *
 * Returns neighborhood trend summary: pressure signals, counts by type/direction,
 * top 3 notable developments.
 */
router.get(
  '/properties/:propertyId/neighborhood-radar/trends',
  propertyAuthMiddleware,
  getNeighborhoodRadarTrends,
);

/**
 * GET /api/properties/:propertyId/neighborhood-radar/signals
 *
 * Returns compact signal codes for active high-impact neighborhood events.
 * Used by cross-tool signal exposure (sell-hold-rent, true-cost, etc.).
 */
router.get(
  '/properties/:propertyId/neighborhood-radar/signals',
  propertyAuthMiddleware,
  getNeighborhoodSignals,
);

// ============================================================================
// RECOMPUTE — Property-level radar refresh
// ============================================================================

/**
 * POST /api/properties/:propertyId/neighborhood-radar/recompute
 *
 * Re-runs property-neighborhood matching and impact generation for this property.
 * Restricted to HOMEOWNER (property owner verified by propertyAuthMiddleware).
 */
router.post(
  '/properties/:propertyId/neighborhood-radar/recompute',
  propertyAuthMiddleware,
  recomputePropertyRadar,
);

// ============================================================================
// INTERNAL / ADMIN — Ingestion & recompute
// ============================================================================

/**
 * POST /api/neighborhood-intelligence/ingest
 *
 * Ingests a normalized neighborhood event and triggers property matching + impact generation.
 * Restricted to ADMIN role.
 *
 * Body: NormalizedNeighborhoodEventInput
 */
router.post(
  '/neighborhood-intelligence/ingest',
  requireRole(UserRole.ADMIN),
  validateBody(ingestEventBodySchema),
  ingestNeighborhoodEvent,
);

/**
 * POST /api/neighborhood-intelligence/events/:eventId/recompute
 *
 * Re-runs property matching and impact generation for a specific event.
 * Restricted to ADMIN role.
 */
router.post(
  '/neighborhood-intelligence/events/:eventId/recompute',
  requireRole(UserRole.ADMIN),
  recomputeEventMatches,
);

export default router;
