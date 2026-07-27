// apps/backend/src/validators/homeEventRadar.validators.ts
import { z } from 'zod';
import {
  RADAR_FILTER_ATTENTION,
  RADAR_FILTER_CONFIDENCE,
  RADAR_FILTER_IMPACTS,
  RADAR_FILTER_LIFECYCLES,
  RADAR_FILTER_SEVERITIES,
  RADAR_FILTER_SOURCE_FAMILIES,
  RADAR_FILTER_USER_STATES,
} from '../modules/homeEventRadar/domain/radarFeedFilters';
import {
  RADAR_FEEDBACK_COMMENT_MAX_LENGTH,
  RADAR_FEEDBACK_TYPES,
  RADAR_MUTABLE_USER_STATES,
  RADAR_USER_STATES,
} from '../modules/homeEventRadar/domain/radarInteraction';
import {
  RADAR_ACTION_CODES,
} from '../modules/homeEventRadar/domain/radarActionRegistry';
import {
  isIanaTimezone,
  orderedRadarPreferenceValues,
  RADAR_NOTIFICATION_CATEGORIES,
  RADAR_NOTIFICATION_CHANNELS,
  RADAR_NOTIFICATION_DELIVERY_MODES,
  RADAR_NOTIFICATION_IMPACTS,
  RADAR_NOTIFICATION_SEVERITIES,
} from '../modules/homeEventRadar/domain/radarNotificationPreferences';

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
  'air_quality_provider',
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

export const PROPERTY_RADAR_USER_STATES = RADAR_USER_STATES;

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
 * Query for canonical homeowner event views. Lists accept either repeated
 * query parameters or comma-separated values.
 */
function radarFilterValues(value: unknown): unknown {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  return raw.flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const listRadarEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(40),
  cursor: z.string()
    .trim()
    .min(1)
    .max(2_048)
    .regex(/^[A-Za-z0-9_-]+$/, 'cursor must use base64url encoding')
    .optional(),
  lifecycle: z.preprocess(
    radarFilterValues,
    z.array(z.enum(RADAR_FILTER_LIFECYCLES)).min(1).max(3).optional(),
  ),
  sourceFamily: z.preprocess(
    radarFilterValues,
    z.array(z.enum(RADAR_FILTER_SOURCE_FAMILIES)).min(1).max(7).optional(),
  ),
  severity: z.preprocess(
    radarFilterValues,
    z.array(z.enum(RADAR_FILTER_SEVERITIES)).min(1).max(5).optional(),
  ),
  impact: z.preprocess(
    radarFilterValues,
    z.array(z.enum(RADAR_FILTER_IMPACTS)).min(1).max(4).optional(),
  ),
  confidence: z.preprocess(
    radarFilterValues,
    z.array(z.enum(RADAR_FILTER_CONFIDENCE)).min(1).max(4).optional(),
  ),
  state: z.preprocess(
    radarFilterValues,
    z.array(z.enum(RADAR_FILTER_USER_STATES)).min(1).max(5).optional(),
  ),
  attention: z.preprocess(
    radarFilterValues,
    z.array(z.enum(RADAR_FILTER_ATTENTION)).min(1).max(2).optional(),
  ),
});

export const listRadarEventsRequestSchema = z.object({
  body: z.unknown().optional(),
  query: listRadarEventsQuerySchema,
  params: z.object({ propertyId: z.string().min(1) }).passthrough(),
});

export const listRadarStateViewRequestSchema = z.object({
  body: z.unknown().optional(),
  query: listRadarEventsQuerySchema.omit({ state: true }),
  params: z.object({
    propertyId: z.string().min(1),
    state: z.enum(PROPERTY_RADAR_USER_STATES),
  }).passthrough(),
});

/**
 * Body for PATCH /properties/:propertyId/radar/events/:matchId/state
 */
export const updateRadarStateBodySchema = z.object({
  state: z.enum(RADAR_MUTABLE_USER_STATES),
  guidanceJourneyId: z.string().uuid().optional().nullable(),
  guidanceStepKey: z.string().trim().min(1).max(120).optional().nullable(),
  guidanceSignalIntentFamily: z.string().trim().min(1).max(120).optional().nullable(),
}).strict();

const radarFeedbackCommentSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
  },
  z.string()
    .max(RADAR_FEEDBACK_COMMENT_MAX_LENGTH)
    .regex(
      /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/,
      'comment contains unsupported control characters',
    )
    .nullable(),
);

/**
 * Body for POST /properties/:propertyId/radar/events/:matchId/feedback
 */
export const submitRadarFeedbackBodySchema = z.object({
  feedbackType: z.enum(RADAR_FEEDBACK_TYPES),
  comment: radarFeedbackCommentSchema.optional().default(null),
}).strict();

export const radarTaskIntegrationBodySchema = z.object({
  operation: z.enum([
    'create_task',
    'create_reminder',
    'link_existing_task',
  ]),
  maintenanceTaskId: z.string().trim().min(1).max(128).optional().nullable(),
  dueAt: z.iso.datetime({ offset: true }).optional().nullable(),
  assigneeUserId: z.string().trim().min(1).max(128).optional().nullable(),
}).strict().superRefine((value, context) => {
  if (value.operation === 'link_existing_task' && !value.maintenanceTaskId) {
    context.addIssue({
      code: 'custom',
      path: ['maintenanceTaskId'],
      message: 'maintenanceTaskId is required when linking an existing task',
    });
  }
  if (value.operation !== 'link_existing_task' && value.maintenanceTaskId) {
    context.addIssue({
      code: 'custom',
      path: ['maintenanceTaskId'],
      message: 'maintenanceTaskId is only accepted when linking an existing task',
    });
  }
  if (value.operation === 'link_existing_task' && value.dueAt) {
    context.addIssue({
      code: 'custom',
      path: ['dueAt'],
      message: 'dueAt is managed by the existing task when linking',
    });
  }
});

export const radarTaskActionParamsSchema = z.object({
  propertyId: z.string().min(1),
  matchId: z.string().min(1),
  actionCode: z.enum(RADAR_ACTION_CODES),
});

export const radarTaskActionRequestSchema = z.object({
  body: z.unknown().optional(),
  query: z.unknown().optional(),
  params: radarTaskActionParamsSchema,
});

const radarQuietHoursSchema = z.object({
  start: z.string().regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d$/,
    'start must use 24-hour HH:mm format',
  ),
  end: z.string().regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d$/,
    'end must use 24-hour HH:mm format',
  ),
}).strict().superRefine((value, context) => {
  if (value.start === value.end) {
    context.addIssue({
      code: 'custom',
      path: ['end'],
      message: 'quiet hours must have different start and end times',
    });
  }
});

export const updateRadarNotificationPreferencesBodySchema = z.object({
  isEnabled: z.boolean(),
  enabledCategories: z.array(z.enum(RADAR_NOTIFICATION_CATEGORIES))
    .min(1)
    .max(RADAR_NOTIFICATION_CATEGORIES.length)
    .transform((values) => orderedRadarPreferenceValues(
      values,
      RADAR_NOTIFICATION_CATEGORIES,
    )),
  channels: z.array(z.enum(RADAR_NOTIFICATION_CHANNELS))
    .min(1)
    .max(RADAR_NOTIFICATION_CHANNELS.length)
    .transform((values) => orderedRadarPreferenceValues(
      values,
      RADAR_NOTIFICATION_CHANNELS,
    )),
  minimumSeverity: z.enum(RADAR_NOTIFICATION_SEVERITIES),
  minimumImpact: z.enum(RADAR_NOTIFICATION_IMPACTS),
  deliveryMode: z.enum(RADAR_NOTIFICATION_DELIVERY_MODES),
  criticalSafetyOverrideEnabled: z.boolean(),
  quietHours: radarQuietHoursSchema.nullable(),
  timezone: z.string()
    .trim()
    .min(1)
    .max(100)
    .refine(isIanaTimezone, 'timezone must be a valid IANA timezone'),
}).strict();

/**
 * Body for POST /properties/:propertyId/radar/events  (analytics tracking)
 */
export const trackHomeEventRadarEventBodySchema = z.object({
  event: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TrackHomeEventRadarEventBody = z.infer<typeof trackHomeEventRadarEventBodySchema>;
export type UpdateRadarNotificationPreferencesBody = z.infer<
  typeof updateRadarNotificationPreferencesBodySchema
>;
