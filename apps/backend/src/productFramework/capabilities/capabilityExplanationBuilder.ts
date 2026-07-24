import { z } from 'zod';
import {
  CAPABILITY_CONTEXT_SOURCE_KINDS,
  CapabilityRecommendationContextSchema,
  type CapabilityRecommendationContext,
} from './capabilityRecommendationContext';
import {
  CAPABILITY_SCORE_BANDS,
  CapabilityRankingResultSchema,
  type CapabilityRankingResult,
  type RankedCapabilityCandidate,
} from './capabilityRanking';
import {
  CAPABILITY_ICON_NAMES,
  CAPABILITY_OUTCOME_CATEGORIES,
} from './capability.contract';
import type { ToolCapabilityDefinition } from './capability.contract';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

export const CAPABILITY_RECOMMENDATION_VERSION =
  'capability-recommendation-v1';

const BoundedText = z.string().trim().min(1).max(600);
const OptionalIdentifier = z.string().trim().min(1).max(160).nullable();

const SafeLaunchHrefSchema = z.string().trim().min(1).max(1000).superRefine(
  (href, ctx) => {
    if (!href.startsWith('/') || href.startsWith('//')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Capability launch URLs must be same-origin paths.',
      });
    }
    if (href.includes('[') || href.includes(']')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Capability launch URLs cannot contain unresolved route parameters.',
      });
    }
  },
);

const CapabilitySuggestionSourceSchema = z.object({
  kind: z.enum(CAPABILITY_CONTEXT_SOURCE_KINDS),
  id: z.string().trim().min(1).max(160),
  actionId: OptionalIdentifier,
  entityType: OptionalIdentifier,
  entityId: OptionalIdentifier,
  sourceVersion: OptionalIdentifier,
  observedAt: z.string().datetime().nullable(),
});

const CapabilitySuggestionReadinessSchema = z.object({
  state: z.enum(['READY', 'NEEDS_CONTEXT']),
  reasonCodes: z.array(z.string().trim().min(1).max(160)).max(30),
  missingFactKeys: z.array(z.string().trim().min(1).max(160)).max(50),
  explanations: z.array(BoundedText).max(30),
});

const CapabilitySuggestionEvidenceSchema = z.object({
  mode: z.enum(['STRUCTURED_ONLY', 'OMIT']),
  summary: BoundedText.nullable(),
  sourceObservedAt: z.string().datetime().nullable(),
  actionConfidence: z.object({
    score: z.number().min(0).max(1).nullable(),
    label: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  }).nullable(),
  contextWarningCodes: z.array(
    z.enum(['CONFLICT', 'STALE_SOURCE', 'PARTIAL_SCOPE']),
  ),
});

export const CapabilitySuggestionSchema = z.object({
  suggestionId: z.string().trim().min(1).max(700),
  capabilityId: z.string().trim().min(1).max(160),
  manifestVersion: z.number().int().positive(),
  recommendationVersion: z.literal(CAPABILITY_RECOMMENDATION_VERSION),
  contextVersion: z.string().trim().min(1).max(160),
  rank: z.number().int().positive(),
  scoreBand: z.enum(CAPABILITY_SCORE_BANDS),
  label: z.string().trim().min(1).max(120),
  shortDescription: z.string().trim().min(1).max(300),
  iconName: z.enum(CAPABILITY_ICON_NAMES),
  outcomeCategory: z.enum(CAPABILITY_OUTCOME_CATEGORIES),
  reasonCode: z.string().trim().min(1).max(160),
  whyNow: BoundedText,
  expectedOutcome: z.string().trim().min(1).max(1000),
  readiness: CapabilitySuggestionReadinessSchema,
  evidence: CapabilitySuggestionEvidenceSchema,
  source: CapabilitySuggestionSourceSchema,
  launch: z.object({
    label: z.string().trim().min(1).max(160),
    href: SafeLaunchHrefSchema,
  }),
});

export const CapabilitySuggestionResponseSchema = z.object({
  contractVersion: z.literal('capability-suggestions-v1'),
  registryVersion: z.string().trim().min(1).max(160),
  recommendationVersion: z.literal(CAPABILITY_RECOMMENDATION_VERSION),
  contextVersion: z.string().trim().min(1).max(160),
  generatedAt: z.string().datetime(),
  surface: CapabilityRecommendationContextSchema.shape.surface,
  suggestions: z.array(CapabilitySuggestionSchema).max(10),
});

export type CapabilitySuggestion = z.infer<typeof CapabilitySuggestionSchema>;
export type CapabilitySuggestionResponse =
  z.infer<typeof CapabilitySuggestionResponseSchema>;

const SOURCE_LABELS: Record<
  typeof CAPABILITY_CONTEXT_SOURCE_KINDS[number],
  string
> = {
  HOME_ACTION: 'Home Action',
  JOURNEY: 'journey',
  PROJECT: 'project',
  PROPERTY_CONTEXT: 'Home Record',
  PERSONALIZATION: 'reviewed recommendation',
  COMPLETION: 'completed workflow',
};

const EVIDENCE_SUMMARIES: Record<
  typeof CAPABILITY_CONTEXT_SOURCE_KINDS[number],
  string
> = {
  HOME_ACTION: 'Based on a current Home Action and authorized Home Record context.',
  JOURNEY: 'Based on the current stage of an authorized homeowner journey.',
  PROJECT: 'Based on the current state of an authorized project.',
  PROPERTY_CONTEXT: 'Based on authorized Home Record context.',
  PERSONALIZATION: 'Based on a current reviewed personalization signal.',
  COMPLETION: 'Based on a verified output from a completed workflow.',
};

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function reviewedTemplate(input: {
  capability: ToolCapabilityDefinition;
  candidate: RankedCapabilityCandidate;
}): { reasonCode: string; whyNow: string } {
  const reasonCode = input.candidate.reasonTemplateKey;
  if (!reasonCode) {
    throw new Error(
      `Selected capability has no reviewed explanation reason: ${input.capability.id}.`,
    );
  }
  const template = input.capability.recommendation.reasonTemplates[reasonCode];
  if (!template) {
    throw new Error(
      `Selected capability explanation template is unavailable: ${input.capability.id}:${reasonCode}.`,
    );
  }
  const parameters: Record<string, string> = {
    capabilityLabel: input.capability.presentation.label,
    sourceKind: SOURCE_LABELS[input.candidate.source.kind],
    readinessState: input.candidate.readiness.state === 'READY'
      ? 'ready'
      : 'needs context',
  };
  const whyNow = template.replace(
    /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g,
    (_match, key: string) => parameters[key] ?? `{{${key}}}`,
  );
  if (/\{\{[^}]+\}\}/.test(whyNow)) {
    throw new Error(
      `Selected capability explanation has an unsupported parameter: ${input.capability.id}.`,
    );
  }
  return { reasonCode, whyNow };
}

function routeParameters(
  candidate: RankedCapabilityCandidate,
  context: CapabilityRecommendationContext,
): Record<string, string | null> {
  const entityId = candidate.source.entityId;
  const entityType = candidate.source.entityType;
  const sourceContext = context.sourceContext;
  const contextualEntityId = sourceContext?.entityId ?? entityId;
  const contextualEntityType = sourceContext?.entityType ?? entityType;
  const forType = (type: string) =>
    contextualEntityType === type ? contextualEntityId : null;
  return {
    id: context.propertyId,
    itemId: forType('INVENTORY_ITEM'),
    inventoryItemId: forType('INVENTORY_ITEM'),
    projectId: forType('PROJECT'),
    documentId: forType('DOCUMENT'),
    issueId: forType('ISSUE'),
    journeyId: forType('JOURNEY'),
    roomId: forType('ROOM'),
    serviceId: forType('SERVICE'),
  };
}

function safeLaunchHref(input: {
  capability: ToolCapabilityDefinition;
  candidate: RankedCapabilityCandidate;
  context: CapabilityRecommendationContext;
}): string {
  const parameters = routeParameters(input.candidate, input.context);
  const href = input.capability.destination.routeTemplate.replace(
    /\[([a-zA-Z][a-zA-Z0-9]*)\]/g,
    (placeholder, key: string) => {
      const value = parameters[key];
      return value ? encodeURIComponent(value) : placeholder;
    },
  );
  return SafeLaunchHrefSchema.parse(href);
}

function readiness(candidate: RankedCapabilityCandidate) {
  return CapabilitySuggestionReadinessSchema.parse({
    state: candidate.readiness.state,
    reasonCodes: candidate.readiness.reasonCodes,
    missingFactKeys: candidate.readiness.missingFactKeys,
    explanations: unique(
      candidate.readiness.checks
        .filter((check) => check.result !== 'TRUE')
        .map((check) => check.explanation),
    ),
  });
}

function evidence(input: {
  candidate: RankedCapabilityCandidate;
  context: CapabilityRecommendationContext;
}) {
  if (input.candidate.policy.evidenceMode === 'OMIT') {
    return CapabilitySuggestionEvidenceSchema.parse({
      mode: 'OMIT',
      summary: null,
      sourceObservedAt: null,
      actionConfidence: null,
      contextWarningCodes: [],
    });
  }
  const action = input.candidate.source.actionId
    ? input.context.actions.find(
        (item) => item.id === input.candidate.source.actionId,
      ) ?? null
    : null;
  return CapabilitySuggestionEvidenceSchema.parse({
    mode: 'STRUCTURED_ONLY',
    summary: EVIDENCE_SUMMARIES[input.candidate.source.kind],
    sourceObservedAt: input.candidate.source.observedAt,
    actionConfidence: action?.confidence ?? null,
    contextWarningCodes: input.context.propertyContext.warningCodes,
  });
}

/**
 * Builds the narrow homeowner-facing response from selected ranked candidates.
 * It uses only reviewed copy and bounded structured parameters; raw ranking,
 * policy, suppression, and readiness-check internals stay server-side.
 */
export function buildCapabilitySuggestionResponse(input: {
  registry: ToolCapabilityRegistry;
  context: CapabilityRecommendationContext;
  rankingResult: CapabilityRankingResult;
}): CapabilitySuggestionResponse {
  const context = CapabilityRecommendationContextSchema.parse(input.context);
  const rankingResult = CapabilityRankingResultSchema.parse(input.rankingResult);
  if (rankingResult.registryVersion !== input.registry.version) {
    throw new Error('Capability ranking registry version does not match the explanation registry.');
  }
  if (rankingResult.contextVersion !== context.contextVersion) {
    throw new Error('Capability ranking context version is stale.');
  }
  if (rankingResult.surface !== context.surface) {
    throw new Error('Capability ranking surface does not match the explanation surface.');
  }

  const suggestions = rankingResult.candidates
    .filter((candidate) => candidate.ranking.selected)
    .sort((left, right) =>
      left.ranking.selectedRank! - right.ranking.selectedRank!)
    .map((candidate): CapabilitySuggestion => {
      const capability = input.registry.getById(candidate.capabilityId);
      if (!capability || capability.version !== candidate.manifestVersion) {
        throw new Error(`Capability explanation manifest is stale: ${candidate.capabilityId}.`);
      }
      if (!candidate.ranking.selectedRank) {
        throw new Error(`Selected capability has no presentation rank: ${candidate.capabilityId}.`);
      }
      const explanation = reviewedTemplate({ capability, candidate });
      return CapabilitySuggestionSchema.parse({
        suggestionId: [
          candidate.capabilityId,
          candidate.source.kind,
          candidate.source.id,
          context.contextVersion,
        ].join(':'),
        capabilityId: candidate.capabilityId,
        manifestVersion: candidate.manifestVersion,
        recommendationVersion: CAPABILITY_RECOMMENDATION_VERSION,
        contextVersion: context.contextVersion,
        rank: candidate.ranking.selectedRank,
        scoreBand: candidate.ranking.scoreBand,
        label: capability.presentation.label,
        shortDescription: capability.presentation.shortDescription,
        iconName: capability.presentation.iconName,
        outcomeCategory: capability.presentation.outcomeCategory,
        reasonCode: explanation.reasonCode,
        whyNow: explanation.whyNow,
        expectedOutcome: capability.recommendation.expectedOutcome,
        readiness: readiness(candidate),
        evidence: evidence({ candidate, context }),
        source: candidate.source,
        launch: {
          label: `Open ${capability.presentation.label}`,
          href: safeLaunchHref({ capability, candidate, context }),
        },
      });
    });

  return CapabilitySuggestionResponseSchema.parse({
    contractVersion: 'capability-suggestions-v1',
    registryVersion: input.registry.version,
    recommendationVersion: CAPABILITY_RECOMMENDATION_VERSION,
    contextVersion: context.contextVersion,
    generatedAt: context.generatedAt,
    surface: context.surface,
    suggestions,
  });
}
