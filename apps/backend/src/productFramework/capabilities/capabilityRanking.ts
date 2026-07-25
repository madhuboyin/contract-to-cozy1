import { z } from 'zod';
import {
  CapabilityRecommendationContextSchema,
  type CapabilityRecommendationContext,
} from './capabilityRecommendationContext';
import {
  CapabilitySuppressionResultSchema,
  SuppressedCapabilityCandidateSchema,
  scopedImpressionCount,
  type CapabilitySuppressionResult,
  type SuppressedCapabilityCandidate,
} from './capabilitySuppressionPolicy';
import type { ToolCapabilityDefinition } from './capability.contract';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

export const CAPABILITY_RANKING_COMPONENT_WEIGHTS = {
  relevance: 30,
  consequenceTiming: 20,
  contextFit: 15,
  expectedValue: 15,
  readiness: 10,
  novelty: 10,
} as const;

export const CAPABILITY_SCORE_BANDS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const CAPABILITY_SELECTION_DECISIONS = [
  'SELECTED',
  'BELOW_QUALITY_THRESHOLD',
  'CAPABILITY_ALREADY_SELECTED',
  'SOURCE_DIVERSITY_DEFERRED',
  'OUTCOME_DIVERSITY_DEFERRED',
  'SURFACE_LIMIT_REACHED',
] as const;

export const CAPABILITY_MINIMUM_USEFUL_SCORE = 55;

const ScoreComponentSchema = (maximum: number) =>
  z.number().min(0).max(maximum);

const CapabilityScoreComponentsSchema = z.object({
  relevance: ScoreComponentSchema(CAPABILITY_RANKING_COMPONENT_WEIGHTS.relevance),
  consequenceTiming: ScoreComponentSchema(
    CAPABILITY_RANKING_COMPONENT_WEIGHTS.consequenceTiming,
  ),
  contextFit: ScoreComponentSchema(CAPABILITY_RANKING_COMPONENT_WEIGHTS.contextFit),
  expectedValue: ScoreComponentSchema(
    CAPABILITY_RANKING_COMPONENT_WEIGHTS.expectedValue,
  ),
  readiness: ScoreComponentSchema(CAPABILITY_RANKING_COMPONENT_WEIGHTS.readiness),
  novelty: ScoreComponentSchema(CAPABILITY_RANKING_COMPONENT_WEIGHTS.novelty),
});

const CapabilityRankingSchema = z.object({
  diagnosticRank: z.number().int().positive(),
  selectedRank: z.number().int().positive().nullable(),
  totalScore: z.number().min(0).max(100),
  scoreBand: z.enum(CAPABILITY_SCORE_BANDS),
  components: CapabilityScoreComponentsSchema,
  selected: z.boolean(),
  selectionDecision: z.enum(CAPABILITY_SELECTION_DECISIONS),
});

export const RankedCapabilityCandidateSchema =
  SuppressedCapabilityCandidateSchema.extend({
    ranking: CapabilityRankingSchema,
  });

export const CapabilityRankingResultSchema = z.object({
  registryVersion: z.string().trim().min(1).max(160),
  contextVersion: z.string().trim().min(1).max(160),
  surface: CapabilityRecommendationContextSchema.shape.surface,
  maximumSelected: z.number().int().min(1).max(10),
  candidates: z.array(RankedCapabilityCandidateSchema),
  diagnostics: z.object({
    inputCount: z.number().int().nonnegative(),
    suppressedCount: z.number().int().nonnegative(),
    scoredCount: z.number().int().nonnegative(),
    selectedCount: z.number().int().nonnegative(),
    belowQualityThresholdCount: z.number().int().nonnegative(),
    diversityDeferredCount: z.number().int().nonnegative(),
  }),
});

export type CapabilityScoreBand = typeof CAPABILITY_SCORE_BANDS[number];
export type CapabilitySelectionDecision =
  typeof CAPABILITY_SELECTION_DECISIONS[number];
export type RankedCapabilityCandidate =
  z.infer<typeof RankedCapabilityCandidateSchema>;
export type CapabilityRankingResult =
  z.infer<typeof CapabilityRankingResultSchema>;

type ScoreComponents = z.infer<typeof CapabilityScoreComponentsSchema>;
type ScoredCandidate = SuppressedCapabilityCandidate & {
  score: {
    total: number;
    band: CapabilityScoreBand;
    components: ScoreComponents;
  };
};

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function sourceAction(
  candidate: SuppressedCapabilityCandidate,
  context: CapabilityRecommendationContext,
) {
  if (!candidate.source.actionId) return null;
  return context.actions.find(
    (action) => action.id === candidate.source.actionId,
  ) ?? null;
}

function relevanceScore(candidate: SuppressedCapabilityCandidate): number {
  const precedenceScores: Record<number, number> = {
    1: 30,
    2: 26,
    3: 22,
    4: 18,
    5: 14,
    6: 10,
    7: 6,
  };
  const primary = precedenceScores[candidate.primaryMatch.precedence] ?? 0;
  const corroboration = Math.min(4, Math.max(0, candidate.matches.length - 1));
  return Math.min(
    CAPABILITY_RANKING_COMPONENT_WEIGHTS.relevance,
    primary + corroboration,
  );
}

function consequenceTimingScore(
  candidate: SuppressedCapabilityCandidate,
  context: CapabilityRecommendationContext,
): number {
  const action = sourceAction(candidate, context);
  if (action) {
    return {
      NOW: 20,
      SOON: 16,
      PLAN: 11,
      CONSIDER: 6,
    }[action.priority];
  }
  return {
    PROJECT: 16,
    JOURNEY: 14,
    COMPLETION: 12,
    PROPERTY_CONTEXT: 12,
    PERSONALIZATION: 10,
    HOME_ACTION: 8,
  }[candidate.source.kind];
}

function contextFitScore(candidate: SuppressedCapabilityCandidate): number {
  if (candidate.readiness.checks.length === 0) {
    return CAPABILITY_RANKING_COMPONENT_WEIGHTS.contextFit;
  }
  const earned = candidate.readiness.checks.reduce((score, check) => (
    score + (check.result === 'TRUE' ? 1 : check.result === 'UNKNOWN' ? 0.35 : 0)
  ), 0);
  return roundScore(
    CAPABILITY_RANKING_COMPONENT_WEIGHTS.contextFit
      * earned
      / candidate.readiness.checks.length,
  );
}

function noveltyScore(input: {
  capability: ToolCapabilityDefinition;
  candidate: SuppressedCapabilityCandidate;
  context: CapabilityRecommendationContext;
}): number {
  const lifecycle = input.context.lifecycle.find(
    (item) => item.capabilityId === input.candidate.capabilityId,
  );
  if (!lifecycle) return CAPABILITY_RANKING_COMPONENT_WEIGHTS.novelty;
  const maximum = input.capability.recommendation.maxImpressionsPer30Days;
  const impressionCount = scopedImpressionCount({
    capabilityId: input.candidate.capabilityId,
    sourceActionId: input.candidate.source.actionId,
    context: input.context,
  });
  const impressionNovelty = maximum > 0
    ? 1 - Math.min(1, impressionCount / maximum)
    : 0;
  const completionFactor = lifecycle.lastCompletedAt ? 0.5 : 1;
  return roundScore(
    CAPABILITY_RANKING_COMPONENT_WEIGHTS.novelty
      * impressionNovelty
      * completionFactor,
  );
}

function scoreCandidate(input: {
  capability: ToolCapabilityDefinition;
  candidate: SuppressedCapabilityCandidate;
  context: CapabilityRecommendationContext;
}): ScoredCandidate {
  const components: ScoreComponents = {
    relevance: relevanceScore(input.candidate),
    consequenceTiming: consequenceTimingScore(input.candidate, input.context),
    contextFit: contextFitScore(input.candidate),
    expectedValue: roundScore(
      input.candidate.baseScore
        / 100
        * CAPABILITY_RANKING_COMPONENT_WEIGHTS.expectedValue,
    ),
    readiness: input.candidate.readiness.state === 'READY'
      ? CAPABILITY_RANKING_COMPONENT_WEIGHTS.readiness
      : input.candidate.readiness.state === 'NEEDS_CONTEXT'
        ? 4
        : 0,
    novelty: noveltyScore(input),
  };
  const total = roundScore(
    Object.values(components).reduce((sum, value) => sum + value, 0),
  );
  return {
    ...input.candidate,
    score: {
      total,
      band: total >= 75 ? 'HIGH' : total >= CAPABILITY_MINIMUM_USEFUL_SCORE
        ? 'MEDIUM'
        : 'LOW',
      components,
    },
  };
}

function candidateOrder(left: ScoredCandidate, right: ScoredCandidate): number {
  const readinessRank = (state: string) => (
    state === 'READY' ? 0 : state === 'NEEDS_CONTEXT' ? 1 : 2
  );
  return right.score.total - left.score.total
    || readinessRank(left.readiness.state) - readinessRank(right.readiness.state)
    || left.primaryMatch.precedence - right.primaryMatch.precedence
    || left.capabilityId.localeCompare(right.capabilityId)
    || left.source.kind.localeCompare(right.source.kind)
    || left.source.id.localeCompare(right.source.id);
}

function sourceDiversityKey(candidate: ScoredCandidate): string {
  return candidate.source.actionId
    ? `HOME_ACTION:${candidate.source.actionId}`
    : `${candidate.source.kind}:${candidate.source.id}`;
}

function selectionLimit(context: CapabilityRecommendationContext): number {
  return context.surface === 'HOME'
    ? Math.min(3, context.limit)
    : context.limit;
}

/**
 * Scores only unsuppressed candidates, then selects a bounded, diverse set.
 * Raw component scores remain an internal diagnostic contract; CAP-406 builds
 * the narrower homeowner-facing explanation and score-band DTO.
 */
export function rankCapabilityCandidates(input: {
  registry: ToolCapabilityRegistry;
  context: CapabilityRecommendationContext;
  suppressionResult: CapabilitySuppressionResult;
}): CapabilityRankingResult {
  const context = CapabilityRecommendationContextSchema.parse(input.context);
  const suppressionResult = CapabilitySuppressionResultSchema.parse(
    input.suppressionResult,
  );
  if (suppressionResult.registryVersion !== input.registry.version) {
    throw new Error('Capability suppression registry version does not match the ranking registry.');
  }
  if (suppressionResult.contextVersion !== context.contextVersion) {
    throw new Error('Capability suppression context version is stale.');
  }

  const scored = suppressionResult.candidates
    .filter((candidate) => !candidate.suppression.suppressed)
    .map((candidate) => {
      const capability = input.registry.getById(candidate.capabilityId);
      if (!capability || capability.version !== candidate.manifestVersion) {
        throw new Error(`Capability ranking manifest is stale: ${candidate.capabilityId}.`);
      }
      return scoreCandidate({ capability, candidate, context });
    })
    .sort(candidateOrder);

  const maximumSelected = selectionLimit(context);
  const decisions = new Map<ScoredCandidate, CapabilitySelectionDecision>();
  const selected: ScoredCandidate[] = [];
  const selectedCapabilityIds = new Set<string>();
  const selectedSources = new Set<string>();
  const outcomeCounts = new Map<string, number>();

  for (const candidate of scored) {
    if (candidate.score.total < CAPABILITY_MINIMUM_USEFUL_SCORE) {
      decisions.set(candidate, 'BELOW_QUALITY_THRESHOLD');
      continue;
    }
    if (selected.length >= maximumSelected) {
      decisions.set(candidate, 'SURFACE_LIMIT_REACHED');
      continue;
    }
    if (selectedCapabilityIds.has(candidate.capabilityId)) {
      decisions.set(candidate, 'CAPABILITY_ALREADY_SELECTED');
      continue;
    }
    const sourceKey = sourceDiversityKey(candidate);
    if (selectedSources.has(sourceKey)) {
      decisions.set(candidate, 'SOURCE_DIVERSITY_DEFERRED');
      continue;
    }
    if ((outcomeCounts.get(candidate.outcomeCategory) ?? 0) >= 2) {
      decisions.set(candidate, 'OUTCOME_DIVERSITY_DEFERRED');
      continue;
    }
    selected.push(candidate);
    selectedCapabilityIds.add(candidate.capabilityId);
    selectedSources.add(sourceKey);
    outcomeCounts.set(
      candidate.outcomeCategory,
      (outcomeCounts.get(candidate.outcomeCategory) ?? 0) + 1,
    );
    decisions.set(candidate, 'SELECTED');
  }

  // Reuse an outcome only when no diverse, useful alternative can fill the
  // surface. Repeated source actions and capabilities remain deferred.
  for (const candidate of scored) {
    if (selected.length >= maximumSelected) break;
    if (decisions.get(candidate) !== 'OUTCOME_DIVERSITY_DEFERRED') continue;
    const sourceKey = sourceDiversityKey(candidate);
    if (
      selectedCapabilityIds.has(candidate.capabilityId)
      || selectedSources.has(sourceKey)
    ) continue;
    selected.push(candidate);
    selectedCapabilityIds.add(candidate.capabilityId);
    selectedSources.add(sourceKey);
    decisions.set(candidate, 'SELECTED');
  }

  const selectedRanks = new Map(
    selected.map((candidate, index) => [candidate, index + 1] as const),
  );
  const candidates = scored.map((candidate, index) => {
    const { score, ...candidateContract } = candidate;
    return {
      ...candidateContract,
      ranking: {
        diagnosticRank: index + 1,
        selectedRank: selectedRanks.get(candidate) ?? null,
        totalScore: score.total,
        scoreBand: score.band,
        components: score.components,
        selected: decisions.get(candidate) === 'SELECTED',
        selectionDecision: decisions.get(candidate)!,
      },
    };
  });
  const diversityDecisions: CapabilitySelectionDecision[] = [
    'CAPABILITY_ALREADY_SELECTED',
    'SOURCE_DIVERSITY_DEFERRED',
    'OUTCOME_DIVERSITY_DEFERRED',
  ];

  return CapabilityRankingResultSchema.parse({
    registryVersion: input.registry.version,
    contextVersion: context.contextVersion,
    surface: context.surface,
    maximumSelected,
    candidates,
    diagnostics: {
      inputCount: suppressionResult.candidates.length,
      suppressedCount: suppressionResult.diagnostics.suppressedCount,
      scoredCount: candidates.length,
      selectedCount: selected.length,
      belowQualityThresholdCount: candidates.filter(
        (candidate) =>
          candidate.ranking.selectionDecision === 'BELOW_QUALITY_THRESHOLD',
      ).length,
      diversityDeferredCount: candidates.filter(
        (candidate) =>
          diversityDecisions.includes(candidate.ranking.selectionDecision),
      ).length,
    },
  });
}
