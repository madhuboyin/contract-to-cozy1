// apps/backend/src/validators/homeEventRadar.validators.ts
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum value arrays (mirrors Prisma schema; avoids dependency on
// prisma generate being run before compilation)
// ---------------------------------------------------------------------------

export const RADAR_EVENT_TYPES = [
  'weather',
  'insurance_market',
  'utility_outage',
  'utility_rate_change',
  'tax_reassessment',
  'tax_rate_change',
  'air_quality',
  'wildfire_smoke',
  'flood_risk',
  'heat_wave',
  'freeze',
  'hail',
  'heavy_rain',
  'wind',
  'power_surge_risk',
  'nearby_construction',
  'other',
] as const;

export const RADAR_EVENT_SOURCE_TYPES = [
  'weather_provider',
  'insurance_market_feed',
  'utility_feed',
  'tax_assessor_feed',
  'internal_derived',
  'manual_import',
] as const;

export const RADAR_EVENT_SEVERITIES = [
  'info',
  'low',
  'medium',
  'high',
  'critical',
] as const;

export const RADAR_EVENT_LOCATION_TYPES = [
  'property',
  'zip',
  'city',
  'county',
  'state',
  'polygon',
] as const;

export const RADAR_EVENT_STATUSES = [
  'active',
  'resolved',
  'archived',
] as const;

export const PROPERTY_RADAR_USER_STATES = [
  'new',
  'seen',
  'saved',
  'dismissed',
  'acted_on',
] as const;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Body for POST /radar/events  (upsert canonical RadarEvent)
 */
export const upsertRadarEventBodySchema = z.object({
  eventType: z.enum(RADAR_EVENT_TYPES),
  eventSubType: z.string().trim().min(1).max(80).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).optional().nullable(),
  sourceType: z.enum(RADAR_EVENT_SOURCE_TYPES),
  sourceRef: z.string().trim().max(500).optional().nullable(),
  severity: z.enum(RADAR_EVENT_SEVERITIES),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional().nullable(),
  locationType: z.enum(RADAR_EVENT_LOCATION_TYPES),
  locationKey: z.string().trim().min(1).max(200),
  geoJson: z.unknown().optional().nullable(),
  payloadJson: z.unknown().optional().nullable(),
  dedupeKey: z.string().trim().min(1).max(500),
  status: z.enum(RADAR_EVENT_STATUSES).optional(),
});

/**
 * Body for POST /radar/events/:eventId/match
 * Optionally restrict matching to a subset of propertyIds.
 */
export const triggerMatchBodySchema = z.object({
  propertyIds: z.array(z.string().uuid()).max(500).optional().nullable(),
});

/**
 * Query for GET /properties/:propertyId/radar/feed
 */
export const listRadarFeedQuerySchema = z.object({
  severity: z.enum(RADAR_EVENT_SEVERITIES).optional(),
  includeResolved: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(100).optional().default(40),
  cursor: z.string().optional(),
});

/**
 * Body for PATCH /properties/:propertyId/radar/matches/:matchId/state
 */
export const updateRadarStateBodySchema = z.object({
  state: z.enum(PROPERTY_RADAR_USER_STATES),
  stateMetaJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

/**
 * Body for POST /properties/:propertyId/radar/events  (analytics tracking)
 */
export const trackHomeEventRadarEventBodySchema = z.object({
  event: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TrackHomeEventRadarEventBody = z.infer<typeof trackHomeEventRadarEventBodySchema>;
