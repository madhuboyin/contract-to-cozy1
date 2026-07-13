// apps/backend/src/modules/personalization/domain/scoring.ts
//
// A deliberately scoped-down slice of 04-target-architecture.md's 11-component
// weighted score formula (0.18 base + 0.12 property + 0.12 household + 0.10
// goal + 0.06 preference + 0.08 seasonal + 0.12 risk + 0.08 financial + 0.10
// urgency + 0.08 confidence + 0.04 engagement, minus penalties). Only 3 of
// those 11 components have a real data source today for the HVAC filter
// proof: baseRelevance (fixed), urgency (from days-since-serviced), and
// confidence (from trait confidence, currently always 1.0). Household/goal/
// preference/seasonal/risk-reduction/financial/engagement all need data this
// codebase deliberately hasn't started collecting yet (sensitive household
// composition, goals, preferences) — not attempted here.
//
// Weights are read from RecommendationRule.scoreConfig (schema field already
// existed, unused, before this) so the score is genuinely rule-version-scoped
// per PER-SCORE-001 ("score shall persist model version... same
// context/version reproduces score"), not a hardcoded constant.
export type PriorityBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface HvacFilterScoreWeights {
  baseRelevance: number;
  urgency: number;
  confidence: number;
}

export interface HvacFilterScoreConfig {
  modelVersion: string;
  baseRelevance: number;
  weights: HvacFilterScoreWeights;
}

export const DEFAULT_HVAC_FILTER_SCORE_CONFIG: HvacFilterScoreConfig = {
  modelVersion: 'hvac-filter-proof-score-v1',
  baseRelevance: 60,
  weights: { baseRelevance: 0.4, urgency: 0.4, confidence: 0.2 },
};

/**
 * Defensive validation of the opaque `RecommendationRule.scoreConfig` JSON
 * column, same "validate JSON at the boundary, fall back safely" posture as
 * ruleAst.ts's validateRuleAst — malformed/missing config never throws, it
 * just falls back to the coded default.
 */
export function parseHvacFilterScoreConfig(raw: unknown): HvacFilterScoreConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_HVAC_FILTER_SCORE_CONFIG;
  }
  const v = raw as Record<string, unknown>;
  const weights = v.weights as Record<string, unknown> | undefined;

  const modelVersion = typeof v.modelVersion === 'string' ? v.modelVersion : undefined;
  const baseRelevance = typeof v.baseRelevance === 'number' ? v.baseRelevance : undefined;
  const wBaseRelevance = weights && typeof weights.baseRelevance === 'number' ? weights.baseRelevance : undefined;
  const wUrgency = weights && typeof weights.urgency === 'number' ? weights.urgency : undefined;
  const wConfidence = weights && typeof weights.confidence === 'number' ? weights.confidence : undefined;

  if (
    modelVersion === undefined ||
    baseRelevance === undefined ||
    wBaseRelevance === undefined ||
    wUrgency === undefined ||
    wConfidence === undefined
  ) {
    return DEFAULT_HVAC_FILTER_SCORE_CONFIG;
  }

  return {
    modelVersion,
    baseRelevance,
    weights: { baseRelevance: wBaseRelevance, urgency: wUrgency, confidence: wConfidence },
  };
}

export function priorityBandFromScore(score: number): PriorityBand {
  if (score >= 70) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}

/**
 * Urgency component: 0 at the eligibility threshold (90 days), clamped to
 * 100 at 2x threshold or beyond. Below-threshold callers shouldn't reach
 * this (only eligible/TRUE evaluations are scored), but it's clamped to 0
 * defensively rather than going negative.
 */
function urgencyFromDaysSinceServiced(daysSinceServiced: number, thresholdDays: number): number {
  const raw = ((daysSinceServiced - thresholdDays) / thresholdDays) * 100;
  return Math.max(0, Math.min(100, raw));
}

export interface ComputeHvacFilterProofScoreInput {
  daysSinceServiced: number;
  thresholdDays: number;
  confidence: number;
  scoreConfigRaw: unknown;
}

export interface ComputeHvacFilterProofScoreResult {
  score: number;
  priorityBand: PriorityBand;
  confidence: number;
  scoreBreakdown: {
    modelVersion: string;
    weights: HvacFilterScoreWeights;
    components: {
      baseRelevance: { raw: number; weighted: number };
      urgency: { raw: number; weighted: number; daysSinceServiced: number };
      confidence: { raw: number; weighted: number };
    };
  };
}

export function computeHvacFilterProofScore(
  input: ComputeHvacFilterProofScoreInput,
): ComputeHvacFilterProofScoreResult {
  const config = parseHvacFilterScoreConfig(input.scoreConfigRaw);
  const urgencyRaw = urgencyFromDaysSinceServiced(input.daysSinceServiced, input.thresholdDays);
  const confidenceRaw = input.confidence * 100;

  const baseRelevanceWeighted = config.baseRelevance * config.weights.baseRelevance;
  const urgencyWeighted = urgencyRaw * config.weights.urgency;
  const confidenceWeighted = confidenceRaw * config.weights.confidence;

  const score = Math.max(0, Math.min(100, baseRelevanceWeighted + urgencyWeighted + confidenceWeighted));

  return {
    score,
    priorityBand: priorityBandFromScore(score),
    confidence: input.confidence,
    scoreBreakdown: {
      modelVersion: config.modelVersion,
      weights: config.weights,
      components: {
        baseRelevance: { raw: config.baseRelevance, weighted: baseRelevanceWeighted },
        urgency: { raw: urgencyRaw, weighted: urgencyWeighted, daysSinceServiced: input.daysSinceServiced },
        confidence: { raw: confidenceRaw, weighted: confidenceWeighted },
      },
    },
  };
}
