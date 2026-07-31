import { z } from 'zod';

export const intelligenceSourceFamilySchema = z.enum([
  'HAZARD',
  'PLANNING',
  'INFRASTRUCTURE',
  'LAND_USE',
  'FLOOD_MAP',
  'SCHOOL',
  'ENVIRONMENTAL',
  'OTHER',
]);

export const intelligenceCoverageGeographyTypeSchema = z.enum([
  'POINT_RADIUS',
  'POLYGON',
  'ZIP',
  'COUNTY',
  'STATE',
  'NATIONAL',
]);

export const intelligenceObservationLifecycleSchema = z.enum([
  'PROPOSED',
  'APPROVED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'STALE',
  'UNKNOWN',
]);

export const intelligenceSourceInputSchema = z.object({
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/),
  family: intelligenceSourceFamilySchema,
  provider: z.string().trim().min(2).max(200),
  termsVersion: z.string().trim().min(1).max(120).nullable().optional(),
  supportedObservationTypes: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  refreshPolicy: z.object({
    cadenceMinutes: z.number().int().positive().max(525_600),
    maxStalenessMinutes: z.number().int().positive().max(1_051_200),
    operationalResponseMinutes: z.number().int().positive().max(43_200).default(240),
  }),
  enabledEnvironments: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

export const intelligenceSourceReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'PAUSE', 'REJECT']),
  termsVersion: z.string().trim().min(1).max(120).optional(),
  enabledEnvironments: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  reason: z.string().trim().min(3).max(1000),
});

export const intelligenceCoverageInputSchema = z.object({
  geographyType: intelligenceCoverageGeographyTypeSchema,
  geographyKey: z.string().trim().min(1).max(240),
  geometryJson: z.record(z.string(), z.unknown()).nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validThrough: z.coerce.date().nullable().optional(),
  coverageLimitations: z.string().trim().min(1).max(2000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.validFrom && value.validThrough && value.validFrom > value.validThrough) {
    ctx.addIssue({
      code: 'custom',
      path: ['validThrough'],
      message: 'validThrough must be on or after validFrom.',
    });
  }
  if (
    ['POINT_RADIUS', 'POLYGON'].includes(value.geographyType)
    && !value.geometryJson
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['geometryJson'],
      message: `${value.geographyType} coverage requires geometryJson.`,
    });
  }
});

export const intelligenceCoverageReviewSchema = z.object({
  geographyType: intelligenceCoverageGeographyTypeSchema,
  geographyKey: z.string().trim().min(1).max(240),
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().min(3).max(1000),
});

export const intelligenceFamilyGovernanceSchema = z.object({
  environment: z.string().trim().min(1).max(80),
  stage: z.enum(['DRAFT', 'PILOT', 'LIMITED', 'GENERAL', 'PAUSED']),
  safetyApproved: z.boolean(),
  privacyApproved: z.boolean(),
  hazardLanguageApproved: z.boolean(),
  reviewNote: z.string().trim().min(3).max(2000),
  thresholds: z.object({
    minimumCurrentCoveragePercent: z.number().min(0).max(100).default(95),
    minimumBriefingResponses: z.number().int().min(0).max(100_000).default(5),
    minimumUsefulnessRate: z.number().min(0).max(1).default(0.6),
    minimumActionFollowThroughRate: z.number().min(0).max(1).default(0.25),
    maximumFalsePositiveRate: z.number().min(0).max(1).default(0.15),
  }),
});

export const intelligenceSourceControlSchema = z.object({
  action: z.enum(['KILL_SWITCH', 'RESUME', 'ROLLBACK']),
  reason: z.string().trim().min(3).max(2000),
  targetRunId: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'ROLLBACK' && !value.targetRunId) {
    ctx.addIssue({
      code: 'custom',
      path: ['targetRunId'],
      message: 'ROLLBACK requires targetRunId.',
    });
  }
});

export const normalizedIntelligenceObservationSchema = z.object({
  externalId: z.string().trim().min(1).max(300),
  observationType: z.string().trim().min(1).max(120),
  lifecycleStatus: intelligenceObservationLifecycleSchema,
  observedAt: z.coerce.date().nullable().optional(),
  effectiveFrom: z.coerce.date().nullable().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  geographyType: intelligenceCoverageGeographyTypeSchema,
  geographyKey: z.string().trim().min(1).max(240),
  geometryJson: z.record(z.string(), z.unknown()).nullable().optional(),
  matchRadiusMiles: z.number().positive().max(100).nullable().optional(),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  sourcePublishedAt: z.coerce.date().nullable().optional(),
  lastVerifiedAt: z.coerce.date(),
  factualPayload: z.record(z.string(), z.unknown()),
}).superRefine((value, ctx) => {
  const hasLat = value.latitude != null;
  const hasLon = value.longitude != null;
  if (hasLat !== hasLon) {
    ctx.addIssue({
      code: 'custom',
      path: ['latitude'],
      message: 'Latitude and longitude must be provided together.',
    });
  }
  if (value.geographyType === 'POINT_RADIUS') {
    if (!hasLat || !hasLon || value.matchRadiusMiles == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['matchRadiusMiles'],
        message: 'POINT_RADIUS observations require coordinates and matchRadiusMiles.',
      });
    }
  }
});

export const intelligenceIngestBatchSchema = z.object({
  environment: z.string().trim().min(1).max(80),
  correlationId: z.string().trim().min(1).max(200).optional(),
  checkedThrough: z.coerce.date(),
  observations: z.array(normalizedIntelligenceObservationSchema).max(5000),
});

export const aroundYourHomeInteractionSchema = z.object({
  action: z.enum(['FOLLOW', 'DISMISS', 'NOT_RELEVANT', 'MARK_SEEN']),
  reason: z.string().trim().min(2).max(500).optional(),
});

export type IntelligenceSourceInput = z.infer<typeof intelligenceSourceInputSchema>;
export type IntelligenceCoverageInput = z.infer<typeof intelligenceCoverageInputSchema>;
export type NormalizedIntelligenceObservation =
  z.infer<typeof normalizedIntelligenceObservationSchema>;

export interface IntelligenceProviderAdapter {
  readonly sourceKey: string;
  readonly adapterVersion: string;
  fetch(input: {
    checkedAfter: Date | null;
    environment: string;
  }): Promise<{
    checkedThrough: Date;
    observations: NormalizedIntelligenceObservation[];
  }>;
}
