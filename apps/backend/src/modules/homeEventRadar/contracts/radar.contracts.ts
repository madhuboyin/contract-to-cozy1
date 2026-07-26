import { z } from 'zod';
import {
  RADAR_NOTIFICATION_CATEGORIES,
  RADAR_NOTIFICATION_CHANNELS,
  RADAR_NOTIFICATION_DELIVERY_MODES,
  RADAR_NOTIFICATION_IMPACTS,
  RADAR_NOTIFICATION_SEVERITIES,
} from '../domain/radarNotificationPreferences';

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
export const radarPriorityBandSchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const radarMatchLifecycleStatusSchema = z.enum([
  'now',
  'upcoming',
  'recently_ended',
  'no_longer_applicable',
]);
export const radarSourceFreshnessStatusSchema = z.enum(['fresh', 'stale', 'unknown']);
export const radarFeedbackTypeSchema = z.enum([
  'helpful',
  'wrong_location',
  'not_relevant',
  'duplicate',
  'stale',
  'other',
]);

export const radarPriorityDiagnosticsSchema = z.object({
  version: z.string().min(1),
  score: z.number().min(0).max(100),
  band: radarPriorityBandSchema,
  components: z.array(z.object({
    name: z.enum([
      'severity',
      'impact',
      'confidence',
      'timing',
      'materialUpdate',
      'activeIncident',
      'userState',
    ]),
    weight: z.number().min(0).max(1),
    score: z.number().min(0).max(1),
    weightedScore: z.number().min(0).max(1),
    reasonCode: z.string().min(1).max(128),
  })).length(7),
  evaluatedAt: z.iso.datetime({ offset: true }),
  orderingOnly: z.literal(true),
});

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
  coverageType: z.enum(['global', 'country', 'state', 'city', 'county', 'postal_code', 'polygon', 'radius']),
  countryCode: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
  stateCode: z.string().min(2).max(3).transform((value) => value.toUpperCase()).optional(),
  cityName: z.string().min(1).max(160).optional(),
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
    city: ['countryCode', 'stateCode', 'cityName'],
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
  confidenceVersion: z.string().min(1).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  confidenceComponents: z.array(z.object({
    name: z.enum(['source', 'geography', 'freshness', 'propertyCompleteness', 'domainEvidence']),
    weight: z.number().min(0).max(1),
    score: z.number().min(0).max(1),
    weightedScore: z.number().min(0).max(1),
    reasonCodes: z.array(z.string().min(1).max(128)),
  })).optional(),
  missingFactReasons: z.array(z.object({
    component: z.enum(['source', 'geography', 'freshness', 'propertyCompleteness', 'domainEvidence']),
    code: z.string().min(1).max(128),
    detail: z.string().min(1).max(500),
  })).optional(),
  homeownerExplanation: z.string().min(1).max(1_500).optional(),
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

export const radarProjectedActionSchema = z.object({
  code: z.string().min(1).max(128),
  label: z.string().min(1).max(500),
  priority: z.enum(['high', 'medium', 'low']),
  responsibilityScope: z.string().min(1).max(128).optional(),
  responsibleParty: z.string().min(1).max(128).optional(),
  applicability: z.enum(['owner_action', 'coordinate', 'verify_responsibility']).optional(),
});

export const radarMatchedSystemSchema = z.object({
  type: z.string().min(1).max(128),
  relevance: z.enum(['high', 'medium', 'low']),
});

export const radarFeedItemSchema = z.object({
  id: z.string().min(1),
  propertyMatchId: z.string().min(1),
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  sourceFamily: radarSourceFamilySchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: radarSeveritySchema,
  impact: radarImpactSchema,
  confidence: radarConfidenceSchema.optional(),
  priorityBand: radarPriorityBandSchema,
  priorityScore: z.number().min(0).max(100),
  matchLifecycleStatus: radarMatchLifecycleStatusSchema,
  sourceFreshnessStatus: radarSourceFreshnessStatusSchema,
  sourceFreshnessReason: z.string().nullable(),
  isSourceStale: z.boolean(),
  isMaterialUpdate: z.boolean(),
  lifecycleStatus: radarLifecycleStatusSchema,
  effectiveAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  sourceName: z.string().min(1),
  provider: z.string().nullable(),
  userState: z.enum(['new', 'seen', 'saved', 'dismissed', 'acted_on']),
});

export const radarMonitoringStateSchema = z.enum([
  'ACTIVE',
  'PARTIAL',
  'DEGRADED',
  'UNCOVERED',
  'SETUP_NEEDED',
]);

export const radarFeedStateSchema = z.enum([
  'HAS_EVENTS',
  'CONFIRMED_CLEAR',
  'PARTIAL_COVERAGE',
  'DEGRADED',
  'UNCOVERED',
]);

export const radarFeedCursorSchema = z.string()
  .min(1)
  .max(2_048)
  .regex(/^[A-Za-z0-9_-]+$/);

export const radarAppliedFiltersSchema = z.object({
  lifecycle: z.array(radarMatchLifecycleStatusSchema.exclude(['no_longer_applicable'])),
  sourceFamily: z.array(radarSourceFamilySchema),
  severity: z.array(z.enum(['info', 'low', 'moderate', 'high', 'severe'])),
  impact: z.array(radarImpactSchema.exclude(['critical'])),
  confidence: z.array(radarConfidenceSchema),
  state: z.array(z.enum(['new', 'seen', 'saved', 'dismissed', 'acted_on'])),
  attention: z.array(z.enum(['new', 'updated'])),
});

export const radarCategoryCoverageSchema = z.object({
  family: radarSourceFamilySchema,
  status: z.enum(['covered', 'not_covered', 'disabled', 'failed', 'stale', 'unknown']),
  sourceDefinitionIds: z.array(z.string().min(1)),
  sourceNames: z.array(z.string().min(1)),
  detail: z.string().min(1).max(1_000),
  evaluatedAt: z.iso.datetime({ offset: true }).nullable(),
  dataFreshThrough: z.iso.datetime({ offset: true }).nullable(),
});

export const radarCountsSchema = z.object({
  active: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  upcoming: z.number().int().nonnegative(),
  recentlyEnded: z.number().int().nonnegative(),
  saved: z.number().int().nonnegative(),
  dismissed: z.number().int().nonnegative(),
});

export const radarPropertyContextEnvelopeSchema = z.object({
  propertyId: z.string().min(1),
  contextVersion: z.union([z.string(), z.number()]),
  decision: z.unknown(),
});

export const radarOverviewResponseSchema = z.object({
  propertyId: z.string().min(1),
  generatedAt: z.iso.datetime({ offset: true }),
  monitoringState: radarMonitoringStateSchema,
  lastSuccessfulCheckAt: z.iso.datetime({ offset: true }).nullable(),
  coverage: z.array(radarCategoryCoverageSchema),
  counts: radarCountsSchema,
  propertyContext: radarPropertyContextEnvelopeSchema,
});

export const radarFeedResponseSchema = z.object({
  propertyId: z.string().min(1),
  items: z.array(radarFeedItemSchema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: radarFeedCursorSchema.nullable(),
  }),
  totalCount: z.number().int().nonnegative(),
  appliedFilters: radarAppliedFiltersSchema,
  feedState: radarFeedStateSchema,
  asOf: z.iso.datetime({ offset: true }),
});

export const radarInteractionStateResponseSchema = z.object({
  id: z.string().min(1),
  propertyRadarMatchId: z.string().min(1),
  state: z.enum(['new', 'seen', 'saved', 'dismissed', 'acted_on']),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const radarFeedbackResponseSchema = z.object({
  feedbackType: radarFeedbackTypeSchema,
  comment: z.string().max(500).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const radarNotificationPreferenceResponseSchema = z.object({
  propertyId: z.string().min(1),
  userId: z.string().min(1),
  isEnabled: z.boolean(),
  enabledCategories: z.array(z.enum(RADAR_NOTIFICATION_CATEGORIES)).min(1),
  channels: z.array(z.enum(RADAR_NOTIFICATION_CHANNELS)).min(1),
  minimumSeverity: z.enum(RADAR_NOTIFICATION_SEVERITIES),
  minimumImpact: z.enum(RADAR_NOTIFICATION_IMPACTS),
  deliveryMode: z.enum(RADAR_NOTIFICATION_DELIVERY_MODES),
  criticalSafetyOverrideEnabled: z.boolean(),
  quietHours: z.object({
    start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  }).nullable(),
  timezone: z.string().min(1).max(100),
  persisted: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const radarDetailResponseSchema = radarFeedItemSchema.extend({
  geography: normalizedGeographySchema.nullable(),
  matchExplanation: radarMatchExplanationSchema.nullable(),
  impactSummary: z.string().nullable(),
  impactFactors: z.record(z.string(), z.unknown()).nullable(),
  matchedSystems: z.array(radarMatchedSystemSchema),
  recommendedActions: z.array(radarProjectedActionSchema.extend({
    registryVersion: z.literal('radar-actions-v1'),
    completionEvidence: z.enum([
      'match_acknowledgement',
      'user_attestation',
      'downstream_capability',
      'official_source_view',
    ]),
    safetyClassification: z.enum([
      'general',
      'property_protection',
      'health_safety',
      'electrical_safety',
      'financial_review',
      'official_instruction',
    ]),
    targetCapability: z.string().min(1).max(120).nullable(),
    supportedTaskOperations: z.array(z.enum([
      'create_task',
      'create_reminder',
      'link_existing_task',
    ])).min(1).max(3),
    taskLink: z.object({
      id: z.string().min(1),
      actionCode: z.string().min(1).max(128),
      operation: z.enum([
        'create_task',
        'create_reminder',
        'link_existing_task',
      ]),
      dueAt: z.iso.datetime({ offset: true }).nullable(),
      dueDateSource: z.enum([
        'user_provided',
        'event_effective',
        'event_expiration',
        'active_window',
      ]).nullable(),
      task: z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        status: z.string().min(1),
        nextDueDate: z.iso.datetime({ offset: true }).nullable(),
        assignedToUserId: z.string().nullable(),
        href: z.string().min(1),
      }),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
    }).nullable(),
    destination: z.object({
      kind: z.enum(['informational', 'internal', 'external']),
      purpose: z.enum([
        'coverage_review',
        'service_pricing',
        'maintenance',
        'document_vault',
        'provider_search',
        'official_instructions',
        'other_tool',
      ]).nullable(),
      label: z.string().min(1).max(120).nullable(),
      href: z.string().min(1).nullable(),
    }),
  })),
  canonicalUrl: z.url().nullable(),
  observedAt: z.iso.datetime({ offset: true }),
  revision: z.object({
    observedAt: z.iso.datetime({ offset: true }),
    receivedAt: z.iso.datetime({ offset: true }),
    materialUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  sourceEvidence: z.object({
    providerEventId: z.string().nullable(),
    providerRevision: z.string().nullable(),
    revisionIdentity: z.string().nullable(),
  }),
  missingFacts: z.array(z.object({
    factKey: z.string().min(1).max(160),
    reasonCode: z.string().min(1).max(160),
    detail: z.string().min(1).max(500),
    correctionPath: z.string().min(1),
  })),
  propertyGeographyVersion: z.number().int().nonnegative().nullable(),
  matcherVersion: z.string().nullable(),
  relatedIncident: z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
    href: z.string().min(1),
  }).nullable(),
  relatedGuidance: z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    currentStepKey: z.string().nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
    href: z.string().min(1),
  }).nullable(),
  userFeedback: radarFeedbackResponseSchema.nullable(),
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
export type RadarPriorityDiagnostics = z.infer<typeof radarPriorityDiagnosticsSchema>;
export type RadarRecommendedAction = z.infer<typeof radarRecommendedActionSchema>;
export type RadarMonitoringState = z.infer<typeof radarMonitoringStateSchema>;
export type RadarFeedState = z.infer<typeof radarFeedStateSchema>;
export type RadarCounts = z.infer<typeof radarCountsSchema>;
export type RadarOverviewResponse = z.infer<typeof radarOverviewResponseSchema>;
export type RadarFeedResponse = z.infer<typeof radarFeedResponseSchema>;
export type RadarDetailResponse = z.infer<typeof radarDetailResponseSchema>;
export type RadarFeedbackType = z.infer<typeof radarFeedbackTypeSchema>;
export type RadarInteractionStateResponse = z.infer<typeof radarInteractionStateResponseSchema>;
export type RadarFeedbackResponse = z.infer<typeof radarFeedbackResponseSchema>;
export type RadarNotificationPreferenceResponse = z.infer<
  typeof radarNotificationPreferenceResponseSchema
>;
