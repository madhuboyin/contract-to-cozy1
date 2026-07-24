import { z } from 'zod';
import {
  CAPABILITY_CONTEXT_TYPES,
  CAPABILITY_OUTCOME_CATEGORIES,
} from './capability.contract';
import {
  CAPABILITY_CONTEXT_SOURCE_KINDS,
  CapabilityRecommendationContextSchema,
  type CapabilityRecommendationContext,
} from './capabilityRecommendationContext';
import type { ToolCapabilityDefinition } from './capability.contract';
import type { ToolCapabilityRegistry } from './capabilityRegistry';
import { RecommendationSafetyTierSchema } from '../recommendationGovernance.contract';

export const CAPABILITY_CANDIDATE_MATCH_KINDS = [
  'EXPLICIT_ACTION_CTA',
  'RECOMMENDATION_DEFINITION',
  'SIGNAL_INTENT_FAMILY',
  'ACTION_SOURCE_KIND_JOB',
  'SOURCE_ENTITY_TYPE',
  'JOURNEY_KIND',
  'PROJECT_KIND',
  'COMPLETION_OUTPUT_RELATIONSHIP',
] as const;

const MATCH_PRECEDENCE: Record<
  typeof CAPABILITY_CANDIDATE_MATCH_KINDS[number],
  number
> = {
  EXPLICIT_ACTION_CTA: 1,
  RECOMMENDATION_DEFINITION: 2,
  SIGNAL_INTENT_FAMILY: 3,
  ACTION_SOURCE_KIND_JOB: 4,
  SOURCE_ENTITY_TYPE: 5,
  JOURNEY_KIND: 6,
  PROJECT_KIND: 6,
  COMPLETION_OUTPUT_RELATIONSHIP: 7,
};

const BoundedIdentifier = z.string().trim().min(1).max(160);

const CapabilityCandidateMatchSchema = z.object({
  kind: z.enum(CAPABILITY_CANDIDATE_MATCH_KINDS),
  precedence: z.number().int().min(1).max(7),
  value: BoundedIdentifier,
});

const CapabilityCandidateSourceSchema = z.object({
  kind: z.enum(CAPABILITY_CONTEXT_SOURCE_KINDS),
  id: BoundedIdentifier,
  actionId: BoundedIdentifier.nullable(),
  entityType: BoundedIdentifier.nullable(),
  entityId: BoundedIdentifier.nullable(),
  sourceVersion: BoundedIdentifier.nullable(),
  observedAt: z.string().datetime().nullable(),
});

export const CapabilityCandidateSchema = z.object({
  capabilityId: BoundedIdentifier,
  manifestVersion: z.number().int().positive(),
  outcomeCategory: z.enum(CAPABILITY_OUTCOME_CATEGORIES),
  safetyTier: RecommendationSafetyTierSchema,
  baseScore: z.number().min(0).max(100),
  source: CapabilityCandidateSourceSchema,
  primaryMatch: CapabilityCandidateMatchSchema,
  matches: z.array(CapabilityCandidateMatchSchema).min(1),
  reasonTemplateKey: BoundedIdentifier.nullable(),
  contextVersion: BoundedIdentifier,
});

export const CapabilityCandidateMatchResultSchema = z.object({
  registryVersion: BoundedIdentifier,
  contextVersion: BoundedIdentifier,
  candidates: z.array(CapabilityCandidateSchema),
});

export type CapabilityCandidate = z.infer<typeof CapabilityCandidateSchema>;
export type CapabilityCandidateMatch =
  z.infer<typeof CapabilityCandidateMatchSchema>;
export type CapabilityCandidateMatchResult =
  z.infer<typeof CapabilityCandidateMatchResultSchema>;

type CandidateSource = z.infer<typeof CapabilityCandidateSourceSchema>;

type CandidateAccumulator = {
  capability: ToolCapabilityDefinition;
  source: CandidateSource;
  matches: Map<string, CapabilityCandidateMatch>;
};

function intersections(left: readonly string[], right: readonly string[]): string[] {
  const rightValues = new Set(right);
  return [...new Set(left.filter((value) => rightValues.has(value)))]
    .sort((a, b) => a.localeCompare(b));
}

function acceptedEntityType(
  capability: ToolCapabilityDefinition,
  entityType: string | null,
): string[] {
  if (!entityType) return [];
  return capability.destination.acceptedContext.includes(
    entityType as typeof CAPABILITY_CONTEXT_TYPES[number],
  ) ? [entityType] : [];
}

function contextualCapabilities(
  registry: ToolCapabilityRegistry,
): ToolCapabilityDefinition[] {
  return registry.capabilities.filter(
    (capability) => capability.recommendation.mode !== 'CATALOG_ONLY',
  );
}

function matchKey(match: CapabilityCandidateMatch): string {
  return `${match.kind}:${match.value}`;
}

function candidateKey(capabilityId: string, source: CandidateSource): string {
  return `${capabilityId}:${source.kind}:${source.id}`;
}

function reasonTemplateKey(
  capability: ToolCapabilityDefinition,
  matches: readonly CapabilityCandidateMatch[],
): string | null {
  const templates = capability.recommendation.reasonTemplates;
  const direct = matches.find((match) => templates[match.value]);
  return direct?.value ?? Object.keys(templates).sort()[0] ?? null;
}

function addMatches(
  candidates: Map<string, CandidateAccumulator>,
  capability: ToolCapabilityDefinition,
  source: CandidateSource,
  rawMatches: Array<{
    kind: typeof CAPABILITY_CANDIDATE_MATCH_KINDS[number];
    values: readonly string[];
  }>,
): void {
  const matches = rawMatches.flatMap(({ kind, values }) =>
    values.map((value): CapabilityCandidateMatch => ({
      kind,
      precedence: MATCH_PRECEDENCE[kind],
      value,
    })));
  if (matches.length === 0) return;

  const key = candidateKey(capability.id, source);
  const existing = candidates.get(key) ?? {
    capability,
    source,
    matches: new Map<string, CapabilityCandidateMatch>(),
  };
  for (const match of matches) existing.matches.set(matchKey(match), match);
  candidates.set(key, existing);
}

function sortedMatches(
  matches: Iterable<CapabilityCandidateMatch>,
): CapabilityCandidateMatch[] {
  return [...matches].sort((left, right) =>
    left.precedence - right.precedence
    || left.kind.localeCompare(right.kind)
    || left.value.localeCompare(right.value));
}

function activeProject(status: string): boolean {
  return ['PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED', 'ACTIVE']
    .includes(status);
}

/**
 * Generates internal candidates from reviewed, structured relationships only.
 * Readiness, availability, governance, suppression, and ranking are subsequent
 * evaluator stages and intentionally do not affect this match result.
 */
export function matchCapabilityCandidates(input: {
  registry: ToolCapabilityRegistry;
  context: CapabilityRecommendationContext;
}): CapabilityCandidateMatchResult {
  const context = CapabilityRecommendationContextSchema.parse(input.context);
  const capabilities = contextualCapabilities(input.registry);
  const candidates = new Map<string, CandidateAccumulator>();

  for (const action of context.actions) {
    const source: CandidateSource = {
      kind: 'HOME_ACTION',
      id: action.id,
      actionId: action.id,
      entityType: action.source.entityType,
      entityId: action.source.entityId,
      sourceVersion: action.source.version,
      observedAt: action.lastEvaluatedAt,
    };
    for (const capability of capabilities) {
      const sourceAndJob = (
        capability.recommendation.sourceKinds.includes(action.source.kind)
        && capability.recommendation.jobs.includes(action.job)
      ) ? [`${action.source.kind}:${action.job}`] : [];
      addMatches(candidates, capability, source, [
        {
          kind: 'EXPLICIT_ACTION_CTA',
          values: action.ctaCapabilityIds.includes(capability.id)
            ? [capability.id]
            : [],
        },
        {
          kind: 'RECOMMENDATION_DEFINITION',
          values: intersections(
            action.recommendationDefinitionCodes,
            capability.recommendation.recommendationDefinitionCodes,
          ),
        },
        {
          kind: 'SIGNAL_INTENT_FAMILY',
          values: intersections(
            action.signalIntentFamilies,
            capability.recommendation.triggerFamilies,
          ),
        },
        { kind: 'ACTION_SOURCE_KIND_JOB', values: sourceAndJob },
        {
          kind: 'SOURCE_ENTITY_TYPE',
          values: acceptedEntityType(capability, action.source.entityType),
        },
      ]);
    }
  }

  for (const recommendation of context.personalizationRecommendations) {
    if (recommendation.status !== 'ACTIVE') continue;
    const source: CandidateSource = {
      kind: 'PERSONALIZATION',
      id: recommendation.id,
      actionId: null,
      entityType: null,
      entityId: recommendation.id,
      sourceVersion: recommendation.recommendationVersion,
      observedAt: recommendation.lastEvaluatedAt,
    };
    for (const capability of capabilities) {
      addMatches(candidates, capability, source, [{
        kind: 'RECOMMENDATION_DEFINITION',
        values: capability.recommendation.recommendationDefinitionCodes
          .includes(recommendation.definitionCode)
          ? [recommendation.definitionCode]
          : [],
      }]);
    }
  }

  for (const journey of context.journeys) {
    if (journey.status !== 'ACTIVE') continue;
    const source: CandidateSource = {
      kind: 'JOURNEY',
      id: journey.id,
      actionId: journey.sourceActionId,
      entityType: journey.sourceEntityType,
      entityId: journey.sourceEntityId,
      sourceVersion: journey.stage,
      observedAt: journey.observedAt,
    };
    for (const capability of capabilities) {
      addMatches(candidates, capability, source, [
        {
          kind: 'SIGNAL_INTENT_FAMILY',
          values: journey.signalIntentFamily
            ? intersections(
                [journey.signalIntentFamily],
                capability.recommendation.triggerFamilies,
              )
            : [],
        },
        {
          kind: 'SOURCE_ENTITY_TYPE',
          values: acceptedEntityType(capability, journey.sourceEntityType),
        },
        {
          kind: 'JOURNEY_KIND',
          values: capability.recommendation.triggerFamilies.includes(journey.kind)
            ? [journey.kind]
            : [],
        },
      ]);
    }
  }

  for (const project of context.projects) {
    if (!activeProject(project.status)) continue;
    const source: CandidateSource = {
      kind: 'PROJECT',
      id: project.id,
      actionId: project.sourceActionId,
      entityType: project.sourceEntityType ?? 'PROJECT',
      entityId: project.sourceEntityId ?? project.id,
      sourceVersion: project.milestoneKind,
      observedAt: project.observedAt,
    };
    const projectMatchCodes = [
      project.kind,
      ...(project.milestoneKind ? [project.milestoneKind] : []),
      ...project.signalIntentFamilies,
    ];
    for (const capability of capabilities) {
      addMatches(candidates, capability, source, [
        {
          kind: 'SIGNAL_INTENT_FAMILY',
          values: intersections(
            project.signalIntentFamilies,
            capability.recommendation.triggerFamilies,
          ),
        },
        {
          kind: 'SOURCE_ENTITY_TYPE',
          values: acceptedEntityType(capability, project.sourceEntityType ?? 'PROJECT'),
        },
        {
          kind: 'PROJECT_KIND',
          values: intersections(
            projectMatchCodes,
            capability.recommendation.triggerFamilies,
          ),
        },
      ]);
    }
  }

  for (const completion of context.completions) {
    const completedCapability = input.registry.getById(completion.capabilityId);
    if (!completedCapability) continue;
    const source: CandidateSource = {
      kind: 'COMPLETION',
      id: completion.id,
      actionId: null,
      entityType: completion.outputEntityType,
      entityId: completion.outputEntityId,
      sourceVersion: String(completion.capabilityVersion),
      observedAt: completion.verifiedAt,
    };
    for (const capability of capabilities) {
      if (capability.id === completedCapability.id) continue;
      const explicitRelationship =
        completedCapability.recommendation.explicitRelatedCapabilityIds
          .includes(capability.id)
          ? [`${completedCapability.id}:${capability.id}`]
          : [];
      const outputCompatibility = acceptedEntityType(
        capability,
        completion.outputEntityType,
      ).map((entityType) => `${completedCapability.id}:${entityType}`);
      addMatches(candidates, capability, source, [{
        kind: 'COMPLETION_OUTPUT_RELATIONSHIP',
        values: [...explicitRelationship, ...outputCompatibility],
      }]);
    }
  }

  const result = [...candidates.values()]
    .map((candidate): CapabilityCandidate => {
      const matches = sortedMatches(candidate.matches.values());
      return {
        capabilityId: candidate.capability.id,
        manifestVersion: candidate.capability.version,
        outcomeCategory: candidate.capability.presentation.outcomeCategory,
        safetyTier: candidate.capability.governance.safetyTier,
        baseScore: candidate.capability.recommendation.baseScore,
        source: candidate.source,
        primaryMatch: matches[0],
        matches,
        reasonTemplateKey: reasonTemplateKey(candidate.capability, matches),
        contextVersion: context.contextVersion,
      };
    })
    .sort((left, right) =>
      left.capabilityId.localeCompare(right.capabilityId)
      || left.primaryMatch.precedence - right.primaryMatch.precedence
      || left.source.kind.localeCompare(right.source.kind)
      || left.source.id.localeCompare(right.source.id));

  return CapabilityCandidateMatchResultSchema.parse({
    registryVersion: input.registry.version,
    contextVersion: context.contextVersion,
    candidates: result,
  });
}
