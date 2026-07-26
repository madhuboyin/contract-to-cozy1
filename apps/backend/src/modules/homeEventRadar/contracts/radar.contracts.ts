import { z } from 'zod';

export const radarSourceFamilySchema = z.enum([
  'weather',
  'air_quality',
  'disaster',
  'utility',
  'tax',
  'insurance',
  'other',
]);

export const radarEventTypeSchema = z.enum([
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
]);

export const radarSourceTypeSchema = z.enum([
  'weather_provider',
  'insurance_market_feed',
  'utility_feed',
  'tax_assessor_feed',
  'internal_derived',
  'manual_import',
]);

export const radarLifecycleStatusSchema = z.enum([
  'active',
  'updated',
  'resolved',
  'expired',
  'retracted',
]);

export const radarSeveritySchema = z.enum(['info', 'low', 'moderate', 'high', 'severe', 'extreme']);
export const radarImpactSchema = z.enum(['none', 'low', 'moderate', 'high', 'critical']);
export const radarConfidenceSchema = z.enum(['low', 'medium', 'high', 'verified']);

const pointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const polygonRingSchema = z.array(
  z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
).min(4).superRefine((ring, ctx) => {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    ctx.addIssue({
      code: 'custom',
      message: 'GeoJSON polygon rings must be closed',
    });
  }
});

export const polygonGeoJsonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(polygonRingSchema).min(1),
});

export const multiPolygonGeoJsonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(polygonRingSchema).min(1)).min(1),
});

export const normalizedGeographySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('property'),
    propertyId: z.string().min(1),
  }),
  z.object({
    type: z.literal('point'),
    point: pointSchema,
  }),
  z.object({
    type: z.literal('radius'),
    center: pointSchema,
    radiusMeters: z.number().positive().max(1_000_000),
  }),
  z.object({
    type: z.literal('postal_code'),
    countryCode: z.string().length(2).transform((value) => value.toUpperCase()),
    postalCode: z.string().min(2).max(16),
  }),
  z.object({
    type: z.literal('administrative_area'),
    countryCode: z.string().length(2).transform((value) => value.toUpperCase()),
    level: z.enum(['city', 'county', 'state', 'province', 'country']),
    name: z.string().min(1).max(160),
    code: z.string().min(1).max(40).optional(),
  }),
  z.object({
    type: z.literal('polygon'),
    geoJson: z.union([polygonGeoJsonSchema, multiPolygonGeoJsonSchema]),
  }),
]);

export const canonicalRadarObservationSchema = z.object({
  schemaVersion: z.literal(1),
  sourceDefinitionId: z.string().min(1),
  providerEventId: z.string().min(1).max(512),
  providerRevision: z.string().min(1).max(256).optional(),
  sourceFamily: radarSourceFamilySchema,
  eventType: z.string().min(1).max(128),
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(4_000),
  severity: radarSeveritySchema,
  lifecycleStatus: radarLifecycleStatusSchema,
  effectiveAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  observedAt: z.iso.datetime({ offset: true }),
  geography: normalizedGeographySchema,
  canonicalUrl: z.url().optional(),
  deduplicationKeys: z.array(z.string().min(1).max(512)).max(20).default([]),
  rawPayload: z.unknown(),
}).superRefine((value, ctx) => {
  if (value.expiresAt && Date.parse(value.expiresAt) < Date.parse(value.effectiveAt)) {
    ctx.addIssue({
      code: 'custom',
      path: ['expiresAt'],
      message: 'expiresAt cannot precede effectiveAt',
    });
  }
});

export const radarSourceDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(160),
  family: radarSourceFamilySchema,
  provider: z.string().min(1).max(160),
  eventTypes: z.array(z.string().min(1).max(128)).min(1),
  enabled: z.boolean(),
  environments: z.array(z.enum(['development', 'test', 'staging', 'production'])).min(1),
  schedule: z.object({
    cadenceSeconds: z.number().int().positive(),
    freshnessSeconds: z.number().int().positive(),
  }),
  coverageDescription: z.string().min(1).max(1_000),
});

const radarSourceCoverageRegistrationSchema = z.object({
  coverageType: z.enum(['global', 'country', 'state', 'county', 'postal_code', 'polygon', 'radius']),
  countryCode: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
  stateCode: z.string().min(2).max(3).transform((value) => value.toUpperCase()).optional(),
  countyFips: z.string().regex(/^\d{5}$/).optional(),
  postalCode: z.string().min(2).max(16).optional(),
  centerLatitude: z.number().min(-90).max(90).optional(),
  centerLongitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().positive().max(1_000_000).optional(),
  geometryGeoJson: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(polygonRingSchema).min(1),
  }).optional(),
  priority: z.number().int().default(0),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
}).superRefine((value, ctx) => {
  const required: Partial<Record<typeof value.coverageType, Array<keyof typeof value>>> = {
    country: ['countryCode'],
    state: ['countryCode', 'stateCode'],
    county: ['countryCode', 'countyFips'],
    postal_code: ['countryCode', 'postalCode'],
    polygon: ['geometryGeoJson'],
    radius: ['centerLatitude', 'centerLongitude', 'radiusMeters'],
  };
  for (const field of required[value.coverageType] ?? []) {
    if (value[field] === undefined) {
      ctx.addIssue({ code: 'custom', path: [field], message: `${String(field)} is required` });
    }
  }
  if (value.validFrom && value.validUntil && value.validUntil < value.validFrom) {
    ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'validUntil cannot precede validFrom' });
  }
});

export const radarSourceRegistrationSchema = z.object({
  key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  family: radarSourceFamilySchema,
  sourceType: radarSourceTypeSchema,
  name: z.string().min(1).max(160),
  provider: z.string().min(1).max(160),
  adapterVersion: z.string().min(1).max(80),
  contractVersion: z.number().int().positive().default(1),
  isEnabled: z.boolean().default(false),
  environments: z.array(z.enum(['development', 'test', 'staging', 'production'])).min(1),
  scheduleCron: z.string().min(1).max(120).optional(),
  freshnessSeconds: z.number().int().positive(),
  supportedEventTypes: z.array(radarEventTypeSchema).min(1),
  coverageDescription: z.string().min(1).max(1_000),
  configJson: z.record(z.string(), z.unknown()).default({}),
  coverage: z.array(radarSourceCoverageRegistrationSchema).default([]),
});

export const radarSourceRunCompletionSchema = z.object({
  status: z.enum(['success', 'successful_empty', 'partial', 'failed', 'skipped']),
  finishedAt: z.coerce.date().default(() => new Date()),
  dataFreshThrough: z.coerce.date().optional(),
  observationsReceived: z.number().int().nonnegative().default(0),
  observationsRejected: z.number().int().nonnegative().default(0),
  eventsCreated: z.number().int().nonnegative().default(0),
  eventsUpdated: z.number().int().nonnegative().default(0),
  eventsResolved: z.number().int().nonnegative().default(0),
  propertiesEvaluated: z.number().int().nonnegative().default(0),
  matchesCreated: z.number().int().nonnegative().default(0),
  rateLimitJson: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().min(1).max(120).optional(),
  errorMessage: z.string().min(1).max(2_000).optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'successful_empty') {
    if (
      value.observationsReceived !== 0 ||
      value.observationsRejected !== 0 ||
      value.eventsCreated !== 0 ||
      value.eventsUpdated !== 0 ||
      value.eventsResolved !== 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'successful_empty requires zero observations and event changes',
      });
    }
  }
  if (value.status === 'failed' && !value.errorMessage) {
    ctx.addIssue({ code: 'custom', path: ['errorMessage'], message: 'failed runs require an errorMessage' });
  }
  if (value.status === 'success') {
    if (value.observationsReceived === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'success requires observations; use successful_empty for a verified empty run',
      });
    }
    if (value.observationsRejected > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'runs with rejected observations must be partial or failed',
      });
    }
  }
  if (value.status === 'partial' && value.observationsRejected === 0 && !value.errorMessage) {
    ctx.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'partial runs require rejected observations or an errorMessage',
    });
  }
});

export const radarSourceHealthSchema = z.object({
  sourceDefinitionId: z.string().min(1),
  status: z.enum(['healthy', 'degraded', 'failed', 'stale', 'disabled', 'unknown']),
  lastAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  lastSuccessAt: z.iso.datetime({ offset: true }).nullable(),
  dataFreshThrough: z.iso.datetime({ offset: true }).nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  message: z.string().max(1_000).nullable(),
});

export const radarCoverageSchema = z.object({
  propertyId: z.string().min(1),
  overallStatus: z.enum(['verified_quiet', 'covered', 'partial', 'unavailable', 'stale', 'unknown']),
  evaluatedAt: z.iso.datetime({ offset: true }),
  families: z.array(z.object({
    family: radarSourceFamilySchema,
    status: z.enum(['covered', 'not_covered', 'disabled', 'failed', 'stale', 'unknown']),
    sourceDefinitionIds: z.array(z.string().min(1)),
    detail: z.string().min(1).max(1_000),
  })),
});

export const radarMatchExplanationSchema = z.object({
  matcherVersion: z.string().min(1),
  matchedAt: z.iso.datetime({ offset: true }),
  matchType: z.enum(['property', 'point', 'radius', 'postal_code', 'administrative_area', 'polygon']),
  confidence: radarConfidenceSchema,
  distanceMeters: z.number().nonnegative().nullable().optional(),
  reasons: z.array(z.string().min(1).max(500)).min(1),
  propertyFactsUsed: z.array(z.string().min(1).max(128)).default([]),
});

export const radarRecommendedActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(160),
  description: z.string().min(1).max(1_000),
  urgency: z.enum(['now', 'today', 'soon', 'monitor']),
  href: z.string().min(1).optional(),
  incidentProjectionId: z.string().min(1).nullable().optional(),
});

export const radarFeedItemSchema = z.object({
  id: z.string().min(1),
  propertyMatchId: z.string().min(1),
  eventType: z.string().min(1),
  sourceFamily: radarSourceFamilySchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: radarSeveritySchema,
  impact: radarImpactSchema,
  lifecycleStatus: radarLifecycleStatusSchema,
  effectiveAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  sourceName: z.string().min(1),
  userState: z.enum(['new', 'seen', 'saved', 'dismissed']),
});

export const radarOverviewResponseSchema = z.object({
  propertyId: z.string().min(1),
  generatedAt: z.iso.datetime({ offset: true }),
  coverage: radarCoverageSchema,
  counts: z.object({
    active: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
    saved: z.number().int().nonnegative(),
    dismissed: z.number().int().nonnegative(),
  }),
});

export const radarFeedResponseSchema = z.object({
  propertyId: z.string().min(1),
  generatedAt: z.iso.datetime({ offset: true }),
  coverage: radarCoverageSchema,
  items: z.array(radarFeedItemSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const radarDetailResponseSchema = radarFeedItemSchema.extend({
  geography: normalizedGeographySchema,
  matchExplanation: radarMatchExplanationSchema,
  recommendedActions: z.array(radarRecommendedActionSchema),
  canonicalUrl: z.url().nullable(),
  observedAt: z.iso.datetime({ offset: true }),
});

export type RadarSourceFamily = z.infer<typeof radarSourceFamilySchema>;
export type NormalizedGeography = z.infer<typeof normalizedGeographySchema>;
export type CanonicalRadarObservation = z.infer<typeof canonicalRadarObservationSchema>;
export type RadarSourceDefinition = z.infer<typeof radarSourceDefinitionSchema>;
export type RadarSourceRegistration = z.infer<typeof radarSourceRegistrationSchema>;
export type RadarSourceRegistrationInput = z.input<typeof radarSourceRegistrationSchema>;
export type RadarSourceRunCompletion = z.infer<typeof radarSourceRunCompletionSchema>;
export type RadarSourceRunCompletionInput = z.input<typeof radarSourceRunCompletionSchema>;
export type RadarSourceHealth = z.infer<typeof radarSourceHealthSchema>;
export type RadarCoverage = z.infer<typeof radarCoverageSchema>;
export type RadarMatchExplanation = z.infer<typeof radarMatchExplanationSchema>;
export type RadarRecommendedAction = z.infer<typeof radarRecommendedActionSchema>;
export type RadarOverviewResponse = z.infer<typeof radarOverviewResponseSchema>;
export type RadarFeedResponse = z.infer<typeof radarFeedResponseSchema>;
export type RadarDetailResponse = z.infer<typeof radarDetailResponseSchema>;
