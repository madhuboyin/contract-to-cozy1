import { z } from 'zod';
import type { PropertyContextSnapshot } from '../../modules/propertyContext';
import { getFactDefinition } from '../../modules/propertyContext/catalog/factCatalog';
import {
  HOMEOWNER_JOBS,
  HOME_ACTION_PRIORITIES,
  HOME_ACTION_SOURCE_KINDS,
  HOME_ACTION_STATES,
  type HomeAction,
} from '../homeAction.contract';
import { RecommendationSafetyTierSchema } from '../recommendationGovernance.contract';
import {
  CAPABILITY_COMPLETION_KINDS,
} from './capability.contract';
import {
  RECOMMENDATION_RESPONSE_STATUSES,
} from '../recommendationResponse.contract';

export const CAPABILITY_SUGGESTION_SURFACES = [
  'HOME',
  'PROPERTY',
  'WORKFLOW',
  'RELATED',
  'COMPLETION',
] as const;

export const CAPABILITY_CONTEXT_SOURCE_KINDS = [
  'HOME_ACTION',
  'JOURNEY',
  'PROJECT',
  'PROPERTY_CONTEXT',
  'PERSONALIZATION',
  'COMPLETION',
] as const;

const BoundedIdentifier = z.string().trim().min(1).max(160);
const OptionalIdentifier = BoundedIdentifier.nullable();

const CapabilityActionSourceMetadataSchema = z.object({
  actionId: BoundedIdentifier,
  freshness: z.enum(['CURRENT', 'STALE', 'UNKNOWN']).default('CURRENT'),
  signalIntentFamilies: z.array(BoundedIdentifier).max(20).default([]),
  sourceEntityType: OptionalIdentifier.default(null),
  ctaCapabilityIds: z.array(BoundedIdentifier).max(20).default([]),
  recommendationDefinitionCodes: z.array(BoundedIdentifier).max(20).default([]),
  missingFactKeys: z.array(BoundedIdentifier).max(50).default([]),
});

const NormalizedHomeActionSchema = z.object({
  id: BoundedIdentifier,
  lineageId: BoundedIdentifier,
  rank: z.number().int().positive(),
  source: z.object({
    kind: z.enum(HOME_ACTION_SOURCE_KINDS),
    entityId: BoundedIdentifier,
    entityType: OptionalIdentifier,
    version: z.string().trim().min(1).max(80).nullable(),
  }),
  job: z.enum(HOMEOWNER_JOBS),
  state: z.enum(HOME_ACTION_STATES),
  priority: z.enum(HOME_ACTION_PRIORITIES),
  safetyTier: RecommendationSafetyTierSchema,
  confidence: z.object({
    score: z.number().min(0).max(1).nullable(),
    label: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  }),
  recommendationStatus: z.enum(RECOMMENDATION_RESPONSE_STATUSES),
  materialActionAllowed: z.boolean(),
  signalIntentFamilies: z.array(BoundedIdentifier),
  ctaCapabilityIds: z.array(BoundedIdentifier),
  recommendationDefinitionCodes: z.array(BoundedIdentifier),
  missingFactKeys: z.array(BoundedIdentifier),
  relatedJourneyId: OptionalIdentifier,
  lastEvaluatedAt: z.string().datetime(),
  freshness: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
});

const NormalizedPropertyFactSchema = z.object({
  key: BoundedIdentifier,
  scope: z.string().trim().min(1).max(80),
  state: z.enum(['KNOWN', 'UNKNOWN', 'CONFLICTED', 'STALE']),
  source: z.enum([
    'USER_REPORTED',
    'DOCUMENT',
    'INSPECTION',
    'PUBLIC_RECORD',
    'INTEGRATION',
    'SYSTEM_DERIVED',
  ]).nullable(),
  verified: z.boolean(),
  confidence: z.number().min(0).max(1).nullable(),
  observedAt: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
});

const JourneySourceSchema = z.object({
  id: BoundedIdentifier,
  kind: BoundedIdentifier,
  status: BoundedIdentifier,
  stage: OptionalIdentifier.default(null),
  sourceActionId: OptionalIdentifier.default(null),
  sourceEntityType: OptionalIdentifier.default(null),
  sourceEntityId: OptionalIdentifier.default(null),
  signalIntentFamily: OptionalIdentifier.default(null),
  observedAt: z.string().datetime().nullable().default(null),
});

const ProjectSourceSchema = z.object({
  id: BoundedIdentifier,
  kind: BoundedIdentifier,
  status: BoundedIdentifier,
  milestoneKind: OptionalIdentifier.default(null),
  signalIntentFamilies: z.array(BoundedIdentifier).max(20).default([]),
  sourceActionId: OptionalIdentifier.default(null),
  sourceEntityType: OptionalIdentifier.default(null),
  sourceEntityId: OptionalIdentifier.default(null),
  observedAt: z.string().datetime().nullable().default(null),
});

const PersonalizationSourceSchema = z.object({
  id: BoundedIdentifier,
  definitionCode: BoundedIdentifier,
  status: BoundedIdentifier,
  recommendationVersion: BoundedIdentifier,
  contextVersion: OptionalIdentifier.default(null),
  lastEvaluatedAt: z.string().datetime(),
});

const CompletionSourceSchema = z.object({
  id: BoundedIdentifier,
  capabilityId: BoundedIdentifier,
  capabilityVersion: z.number().int().positive(),
  completionKind: z.enum(CAPABILITY_COMPLETION_KINDS).nullable().default(null),
  completionSignal: BoundedIdentifier,
  sourceActionId: OptionalIdentifier.default(null),
  outputEntityType: BoundedIdentifier,
  outputEntityId: OptionalIdentifier.default(null),
  verifiedAt: z.string().datetime(),
});

const LifecycleSummarySchema = z.object({
  capabilityId: BoundedIdentifier,
  impressionCount30Days: z.number().int().nonnegative(),
  lastImpressionAt: z.string().datetime().nullable(),
  lastDismissedAt: z.string().datetime().nullable(),
  lastCompletedAt: z.string().datetime().nullable(),
});

const ExplicitSourceContextSchema = z.object({
  kind: z.enum(CAPABILITY_CONTEXT_SOURCE_KINDS),
  id: BoundedIdentifier,
  actionId: OptionalIdentifier.default(null),
  entityType: OptionalIdentifier.default(null),
  entityId: OptionalIdentifier.default(null),
  eventType: OptionalIdentifier.default(null),
});

export const CapabilityRecommendationContextSchema = z.object({
  contractVersion: z.literal('capability-recommendation-context-v1'),
  propertyId: BoundedIdentifier,
  contextVersion: BoundedIdentifier,
  generatedAt: z.string().datetime(),
  surface: z.enum(CAPABILITY_SUGGESTION_SURFACES),
  limit: z.number().int().min(1).max(10),
  propertyContext: z.object({
    scopes: z.array(z.string().trim().min(1).max(80)),
    facts: z.array(NormalizedPropertyFactSchema),
    knownFactCount: z.number().int().nonnegative(),
    unknownFactCount: z.number().int().nonnegative(),
    conflictedFactCount: z.number().int().nonnegative(),
    staleFactCount: z.number().int().nonnegative(),
    warningCodes: z.array(z.enum(['CONFLICT', 'STALE_SOURCE', 'PARTIAL_SCOPE'])),
    readinessMetrics: z.object({
      trackedSystemCount: z.number().int().nonnegative().nullable(),
      coverageGapCount: z.number().int().nonnegative().nullable(),
      jurisdictionStatus: z.enum(['KNOWN', 'UNKNOWN', 'UNSUPPORTED']),
    }),
  }),
  actions: z.array(NormalizedHomeActionSchema).max(200),
  journeys: z.array(JourneySourceSchema).max(100),
  projects: z.array(ProjectSourceSchema).max(100),
  personalizationRecommendations: z.array(PersonalizationSourceSchema).max(100),
  completions: z.array(CompletionSourceSchema).max(200),
  availability: z.object({
    status: z.enum(['EVALUATED', 'POLICY_UNAVAILABLE']),
    policyVersion: OptionalIdentifier,
    availableCapabilityIds: z.array(BoundedIdentifier),
  }),
  governance: z.object({
    canUseCapabilities: z.boolean(),
    allowedSafetyTiers: z.array(RecommendationSafetyTierSchema),
    enforceApprovals: z.boolean(),
    approvedCapabilityIds: z.array(BoundedIdentifier),
    evidenceAccess: z.enum(['ALLOWED', 'REDACTED', 'DENIED']),
    contextFreshness: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
  }),
  lifecycle: z.array(LifecycleSummarySchema).max(200),
  sourceContext: ExplicitSourceContextSchema.nullable(),
});

export type CapabilitySuggestionSurface =
  typeof CAPABILITY_SUGGESTION_SURFACES[number];
export type CapabilityRecommendationContext =
  z.infer<typeof CapabilityRecommendationContextSchema>;
export type CapabilityActionSourceMetadata =
  z.input<typeof CapabilityActionSourceMetadataSchema>;
export type CapabilityJourneySource = z.input<typeof JourneySourceSchema>;
export type CapabilityProjectSource = z.input<typeof ProjectSourceSchema>;
export type CapabilityPersonalizationSource = z.input<typeof PersonalizationSourceSchema>;
export type CapabilityCompletionSource = z.input<typeof CompletionSourceSchema>;
export type CapabilityLifecycleSummary = z.input<typeof LifecycleSummarySchema>;
export type CapabilityExplicitSourceContext = z.input<typeof ExplicitSourceContextSchema>;

export type CapabilityRecommendationHomeAction = HomeAction & {
  ranking?: { rank: number };
};

export interface BuildCapabilityRecommendationContextInput {
  propertyId: string;
  propertyContext: PropertyContextSnapshot;
  actions: readonly CapabilityRecommendationHomeAction[];
  actionSourceMetadata?: readonly CapabilityActionSourceMetadata[];
  journeys?: readonly CapabilityJourneySource[];
  projects?: readonly CapabilityProjectSource[];
  personalizationRecommendations?: readonly CapabilityPersonalizationSource[];
  completions?: readonly CapabilityCompletionSource[];
  availableCapabilityIds?: readonly string[];
  availabilityPolicyVersion?: string | null;
  availabilityStatus?: 'EVALUATED' | 'POLICY_UNAVAILABLE';
  governance?: {
    canUseCapabilities?: boolean;
    allowedSafetyTiers?: readonly z.infer<typeof RecommendationSafetyTierSchema>[];
    enforceApprovals?: boolean;
    approvedCapabilityIds?: readonly string[];
    evidenceAccess?: 'ALLOWED' | 'REDACTED' | 'DENIED';
    contextFreshness?: 'CURRENT' | 'STALE' | 'UNKNOWN';
  };
  lifecycle?: readonly CapabilityLifecycleSummary[];
  sourceContext?: CapabilityExplicitSourceContext | null;
  surface: CapabilitySuggestionSurface;
  limit?: number;
  generatedAt?: string;
  readinessMetrics?: {
    trackedSystemCount?: number | null;
    coverageGapCount?: number | null;
    jurisdictionStatus?: 'KNOWN' | 'UNKNOWN' | 'UNSUPPORTED';
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function byId<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Builds the bounded, privacy-safe source contract consumed by the shared
 * capability evaluator. Raw fact values, action prose/evidence, household
 * profile facts, and project/journey display copy never cross this boundary.
 */
export function buildCapabilityRecommendationContext(
  input: BuildCapabilityRecommendationContextInput,
): CapabilityRecommendationContext {
  if (input.propertyContext.propertyId !== input.propertyId) {
    throw new Error('Capability recommendation context property does not match the authorized snapshot.');
  }
  const foreignAction = input.actions.find((action) => action.propertyId !== input.propertyId);
  if (foreignAction) {
    throw new Error(`Home Action ${foreignAction.id} belongs to a different property.`);
  }

  const metadataByActionId = new Map(
    (input.actionSourceMetadata ?? []).map((metadata) => {
      const parsed = CapabilityActionSourceMetadataSchema.parse(metadata);
      return [parsed.actionId, parsed] as const;
    }),
  );

  const facts = Object.values(input.propertyContext.facts)
    .map((fact) => {
      const definition = getFactDefinition(fact.key);
      return {
        key: fact.key,
        scope: definition.scope,
        state: fact.state,
        source: fact.source,
        verified: fact.verified,
        confidence: fact.confidence,
        observedAt: fact.observedAt,
        validUntil: fact.validUntil,
      };
    })
    .filter((fact) => fact.scope !== 'OPTIONAL_HOUSEHOLD')
    .sort((left, right) => left.key.localeCompare(right.key));

  const factCount = (state: typeof facts[number]['state']) =>
    facts.filter((fact) => fact.state === state).length;

  const actions = input.actions
    .map((action, index) => {
      const metadata = metadataByActionId.get(action.id);
      return {
        id: action.id,
        lineageId: action.lineageId,
        rank: action.ranking?.rank ?? index + 1,
        source: {
          kind: action.source.kind,
          entityId: action.source.entityId,
          entityType: metadata?.sourceEntityType ?? null,
          version: action.source.version,
        },
        job: action.job,
        state: action.state,
        priority: action.priority,
        safetyTier: action.governance.safetyTier,
        confidence: {
          score: action.confidence.score,
          label: action.confidence.label,
        },
        recommendationStatus: action.recommendationResponse.status,
        materialActionAllowed: action.recommendationResponse.materialActionAllowed,
        signalIntentFamilies: uniqueSorted(metadata?.signalIntentFamilies ?? []),
        ctaCapabilityIds: uniqueSorted(metadata?.ctaCapabilityIds ?? []),
        recommendationDefinitionCodes: uniqueSorted(
          metadata?.recommendationDefinitionCodes ?? [],
        ),
        missingFactKeys: uniqueSorted(metadata?.missingFactKeys ?? []),
        relatedJourneyId: action.relatedJourneyId,
        lastEvaluatedAt: action.lastEvaluatedAt,
        freshness: metadata?.freshness ?? 'CURRENT',
      };
    })
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id));

  const limit = Math.min(10, Math.max(1, input.limit ?? 3));
  return CapabilityRecommendationContextSchema.parse({
    contractVersion: 'capability-recommendation-context-v1',
    propertyId: input.propertyId,
    contextVersion: input.propertyContext.contextVersion,
    generatedAt: input.generatedAt ?? input.propertyContext.generatedAt,
    surface: input.surface,
    limit,
    propertyContext: {
      scopes: uniqueSorted(
        input.propertyContext.scopes.filter((scope) => scope !== 'OPTIONAL_HOUSEHOLD'),
      ),
      facts,
      knownFactCount: factCount('KNOWN'),
      unknownFactCount: factCount('UNKNOWN'),
      conflictedFactCount: factCount('CONFLICTED'),
      staleFactCount: factCount('STALE'),
      warningCodes: uniqueSorted(
        input.propertyContext.warnings.map((warning) => warning.code),
      ),
      readinessMetrics: {
        trackedSystemCount: input.readinessMetrics?.trackedSystemCount ?? null,
        coverageGapCount: input.readinessMetrics?.coverageGapCount ?? null,
        jurisdictionStatus:
          input.readinessMetrics?.jurisdictionStatus ?? 'UNKNOWN',
      },
    },
    actions,
    journeys: byId(input.journeys ?? []),
    projects: byId(input.projects ?? []),
    personalizationRecommendations: byId(input.personalizationRecommendations ?? []),
    completions: byId(input.completions ?? []),
    availability: {
      status: input.availabilityStatus
        ?? (input.availableCapabilityIds ? 'EVALUATED' : 'POLICY_UNAVAILABLE'),
      policyVersion: input.availabilityPolicyVersion ?? null,
      availableCapabilityIds: uniqueSorted(input.availableCapabilityIds ?? []),
    },
    governance: {
      canUseCapabilities: input.governance?.canUseCapabilities ?? false,
      allowedSafetyTiers: uniqueSorted(
        input.governance?.allowedSafetyTiers ?? [],
      ),
      enforceApprovals: input.governance?.enforceApprovals ?? false,
      approvedCapabilityIds: uniqueSorted(
        input.governance?.approvedCapabilityIds ?? [],
      ),
      evidenceAccess: input.governance?.evidenceAccess ?? 'DENIED',
      contextFreshness: input.governance?.contextFreshness ?? 'CURRENT',
    },
    lifecycle: [...(input.lifecycle ?? [])]
      .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId)),
    sourceContext: input.sourceContext ?? null,
  });
}
