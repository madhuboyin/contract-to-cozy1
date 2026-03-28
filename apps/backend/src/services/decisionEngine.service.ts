import { SharedSignalKey } from './signal.service';

export type DecisionTargetTool =
  | 'coverage-intelligence'
  | 'risk-premium-optimizer'
  | 'do-nothing'
  | 'sell-hold-rent'
  | 'break-even'
  | 'capital-timeline'
  | 'home-event-radar'
  | 'home-risk-replay'
  | 'home-timeline'
  | 'status-board';

export type DecisionReasonCode =
  | 'ACTION_CENTER'
  | 'COVERAGE_PRESSURE'
  | 'RISK_SPIKE'
  | 'COST_PRESSURE'
  | 'SCENARIO_CONTINUITY'
  | 'DEFAULT';

export type DecisionCandidateSource =
  | 'ACTION_CENTER'
  | 'COVERAGE_ANALYSIS'
  | 'RISK_PREMIUM_OPTIMIZER'
  | 'DO_NOTHING_SIMULATOR'
  | 'SCENARIO_CONTINUITY'
  | 'STATUS_FALLBACK';

export type DecisionIntent =
  | 'REDUCE_EXPOSURE'
  | 'REVIEW_COVERAGE'
  | 'INCREASE_DEDUCTIBLE'
  | 'DEFER_MONITOR'
  | 'EXECUTE_MAINTENANCE'
  | 'SELL'
  | 'HOLD'
  | 'NEUTRAL';

export type DecisionSuppressionReason =
  | 'LOW_CONFIDENCE'
  | 'COMPLETED_RECENTLY'
  | 'DISMISSED_OR_SNOOZED'
  | 'STALE_INPUT'
  | 'DUPLICATE_RECOMMENDATION'
  | 'CONFLICTING_RECOMMENDATION'
  | 'FINAL_RANK_CUTOFF';

export type DecisionPriorityBucket = 'HIGH' | 'MEDIUM' | 'LOW';

export type DecisionCandidate = {
  id: string;
  source: DecisionCandidateSource;
  title: string;
  detail: string;
  targetTool: DecisionTargetTool;
  targetPath: string;
  sourceActionKey?: string | null;
  signalKey?: SharedSignalKey | null;
  dedupeKey: string;
  conflictScope?: string | null;
  intent: DecisionIntent;

  urgency: number; // 0..100
  financialImpact: number; // 0..100
  riskReduction: number; // 0..100
  userEffort: number; // 0..100, higher means harder
  confidence: number; // 0..1
  freshness: number; // 0..1
  reversibility: number; // 0..100

  whyNow?: string[];
  signalDrivers?: string[];
  postureInputs?: string[];
  assumptionInputs?: string[];
  category?: string;

  suppressionHints?: {
    completedRecently?: boolean;
    dismissedOrSnoozed?: boolean;
    staleInput?: boolean;
    criticalSafety?: boolean;
  };
};

export type DecisionScoreBreakdown = {
  urgency: number;
  financialImpact: number;
  riskReduction: number;
  effortPenalty: number;
  confidenceBoost: number;
  freshnessBoost: number;
  reversibilityBoost: number;
  finalScore: number;
};

export type DecisionTrace = {
  whyNow: string[];
  contributedSignals: string[];
  postureInputs: string[];
  assumptionInputs: string[];
  conflictsResolved: string[];
  suppressionsConsidered: string[];
};

export type DecisionRecommendation = {
  id: string;
  title: string;
  detail: string;
  source: DecisionCandidateSource;
  targetTool: DecisionTargetTool;
  targetPath: string;
  sourceActionKey?: string | null;
  signalKey?: SharedSignalKey | null;
  reasonCode: DecisionReasonCode;
  score: number;
  priorityBucket: DecisionPriorityBucket;
  confidence: number;
  freshness: number;
  scoreBreakdown: DecisionScoreBreakdown;
  trace: DecisionTrace;
};

export type SuppressedDecisionCandidate = {
  candidateId: string;
  title: string;
  source: DecisionCandidateSource;
  reason: DecisionSuppressionReason;
  detail: string;
};

export type DecisionDiagnostics = {
  decisionModelVersion: string;
  generatedAt: string;
  evaluatedCount: number;
  surfacedCount: number;
  suppressedCount: number;
  duplicateMergeCount: number;
  conflictResolutionCount: number;
  staleInputDecisions: number;
  lowConfidenceRecommendationCount: number;
  topDecisionCategories: Record<string, number>;
  suppressedByReason: Record<string, number>;
  priorityBuckets: {
    high: number;
    medium: number;
    low: number;
  };
};

export type DecisionEngineResult = {
  recommendations: DecisionRecommendation[];
  suppressed: SuppressedDecisionCandidate[];
  diagnostics: DecisionDiagnostics;
};

const DECISION_ENGINE_VERSION = '7d.1';

const CONFLICT_PAIRS = new Set([
  'INCREASE_DEDUCTIBLE|REDUCE_EXPOSURE',
  'REDUCE_EXPOSURE|INCREASE_DEDUCTIBLE',
  'DEFER_MONITOR|EXECUTE_MAINTENANCE',
  'EXECUTE_MAINTENANCE|DEFER_MONITOR',
  'SELL|HOLD',
  'HOLD|SELL',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return clamp(Math.round(value), 0, 100);
}

function toUnit(value: number): number {
  if (Number.isNaN(value)) return 0;
  return clamp(Number(value.toFixed(4)), 0, 1);
}

function mapPriorityBucket(score: number): DecisionPriorityBucket {
  if (score >= 72) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}

function reasonCodeForCandidate(candidate: DecisionCandidate): DecisionReasonCode {
  if (candidate.source === 'ACTION_CENTER') return 'ACTION_CENTER';
  if (candidate.source === 'SCENARIO_CONTINUITY') return 'SCENARIO_CONTINUITY';
  if (candidate.signalKey === 'COVERAGE_GAP' || candidate.source === 'COVERAGE_ANALYSIS') {
    return 'COVERAGE_PRESSURE';
  }
  if (candidate.signalKey === 'RISK_SPIKE') return 'RISK_SPIKE';
  if (
    candidate.signalKey === 'COST_ANOMALY' ||
    candidate.signalKey === 'COST_PRESSURE_PATTERN' ||
    candidate.source === 'DO_NOTHING_SIMULATOR'
  ) {
    return 'COST_PRESSURE';
  }
  return 'DEFAULT';
}

function confidenceLow(candidate: DecisionCandidate): boolean {
  return candidate.confidence < 0.45 && candidate.urgency < 70 && candidate.riskReduction < 70;
}

function suppressForQuality(candidate: DecisionCandidate): DecisionSuppressionReason | null {
  const criticalSafety = Boolean(candidate.suppressionHints?.criticalSafety);
  if (!criticalSafety && Boolean(candidate.suppressionHints?.completedRecently)) {
    return 'COMPLETED_RECENTLY';
  }
  if (!criticalSafety && Boolean(candidate.suppressionHints?.dismissedOrSnoozed) && candidate.urgency < 86) {
    return 'DISMISSED_OR_SNOOZED';
  }
  if (!criticalSafety && (Boolean(candidate.suppressionHints?.staleInput) || candidate.freshness < 0.2)) {
    return 'STALE_INPUT';
  }
  if (!criticalSafety && confidenceLow(candidate)) {
    return 'LOW_CONFIDENCE';
  }
  return null;
}

function hasIntentConflict(a: DecisionCandidate, b: DecisionCandidate): boolean {
  const key = `${a.intent}|${b.intent}`;
  return CONFLICT_PAIRS.has(key);
}

function buildTrace(params: {
  candidate: DecisionCandidate;
  conflictsResolved: string[];
  suppressionsConsidered: string[];
}): DecisionTrace {
  const { candidate } = params;
  return {
    whyNow: [
      ...(candidate.whyNow ?? []),
      `Urgency ${toPercent(candidate.urgency)} / impact ${toPercent(
        (candidate.financialImpact + candidate.riskReduction) / 2
      )} drove rank.`,
    ],
    contributedSignals: candidate.signalDrivers ?? [],
    postureInputs: candidate.postureInputs ?? [],
    assumptionInputs: candidate.assumptionInputs ?? [],
    conflictsResolved: params.conflictsResolved,
    suppressionsConsidered: params.suppressionsConsidered,
  };
}

export function computeDecisionScore(candidate: DecisionCandidate): DecisionScoreBreakdown {
  const urgency = clamp(candidate.urgency, 0, 100) * 0.29;
  const financialImpact = clamp(candidate.financialImpact, 0, 100) * 0.19;
  const riskReduction = clamp(candidate.riskReduction, 0, 100) * 0.19;
  const effortPenalty = clamp(candidate.userEffort, 0, 100) * 0.12;
  const confidenceBoost = clamp(candidate.confidence, 0, 1) * 100 * 0.11;
  const freshnessBoost = clamp(candidate.freshness, 0, 1) * 100 * 0.07;
  const reversibilityBoost = clamp(candidate.reversibility, 0, 100) * 0.07;

  const finalScore = toPercent(
    urgency +
      financialImpact +
      riskReduction +
      confidenceBoost +
      freshnessBoost +
      reversibilityBoost -
      effortPenalty
  );

  return {
    urgency: toPercent(urgency),
    financialImpact: toPercent(financialImpact),
    riskReduction: toPercent(riskReduction),
    effortPenalty: toPercent(effortPenalty),
    confidenceBoost: toPercent(confidenceBoost),
    freshnessBoost: toPercent(freshnessBoost),
    reversibilityBoost: toPercent(reversibilityBoost),
    finalScore,
  };
}

export function runDecisionEngine(input: {
  candidates: DecisionCandidate[];
  recommendationLimit?: number;
}): DecisionEngineResult {
  const recommendationLimit = Math.max(1, input.recommendationLimit ?? 5);
  const evaluatedCount = input.candidates.length;

  const scored = input.candidates
    .map((candidate) => ({
      candidate,
      score: computeDecisionScore(candidate),
    }))
    .sort((a, b) => b.score.finalScore - a.score.finalScore);

  const suppressed: SuppressedDecisionCandidate[] = [];
  const suppressedByReason: Record<string, number> = {};
  let duplicateMergeCount = 0;
  let conflictResolutionCount = 0;

  const incrementSuppressionReason = (reason: DecisionSuppressionReason) => {
    suppressedByReason[reason] = (suppressedByReason[reason] ?? 0) + 1;
  };

  const dedupedByKey = new Map<string, { candidate: DecisionCandidate; score: DecisionScoreBreakdown }>();
  for (const entry of scored) {
    const qualitySuppression = suppressForQuality(entry.candidate);
    if (qualitySuppression) {
      suppressed.push({
        candidateId: entry.candidate.id,
        title: entry.candidate.title,
        source: entry.candidate.source,
        reason: qualitySuppression,
        detail: `Suppressed due to ${qualitySuppression.toLowerCase().replace(/_/g, ' ')}.`,
      });
      incrementSuppressionReason(qualitySuppression);
      continue;
    }

    const existing = dedupedByKey.get(entry.candidate.dedupeKey);
    if (!existing) {
      dedupedByKey.set(entry.candidate.dedupeKey, entry);
      continue;
    }

    duplicateMergeCount += 1;
    const winner = existing.score.finalScore >= entry.score.finalScore ? existing : entry;
    const loser = winner === existing ? entry : existing;

    dedupedByKey.set(entry.candidate.dedupeKey, winner);
    suppressed.push({
      candidateId: loser.candidate.id,
      title: loser.candidate.title,
      source: loser.candidate.source,
      reason: 'DUPLICATE_RECOMMENDATION',
      detail: 'Merged under a higher-ranked equivalent recommendation.',
    });
    incrementSuppressionReason('DUPLICATE_RECOMMENDATION');
  }

  const conflictByScope = new Map<
    string,
    Array<{ candidate: DecisionCandidate; score: DecisionScoreBreakdown; conflicts: string[] }>
  >();

  for (const entry of dedupedByKey.values()) {
    const scope = entry.candidate.conflictScope ?? `scope:${entry.candidate.targetTool}`;
    const scopedEntries = conflictByScope.get(scope) ?? [];
    let conflictHandled = false;

    for (let index = 0; index < scopedEntries.length; index += 1) {
      const existing = scopedEntries[index];
      if (!hasIntentConflict(existing.candidate, entry.candidate)) {
        continue;
      }

      conflictResolutionCount += 1;
      conflictHandled = true;
      const winner = existing.score.finalScore >= entry.score.finalScore ? existing : {
        candidate: entry.candidate,
        score: entry.score,
        conflicts: [`Resolved conflict with "${existing.candidate.title}".`],
      };
      const loser = winner === existing ? entry : existing;

      winner.conflicts.push(
        winner === existing
          ? `Resolved conflict with "${entry.candidate.title}".`
          : `Resolved conflict with "${existing.candidate.title}".`
      );
      scopedEntries[index] = winner;

      suppressed.push({
        candidateId: loser.candidate.id,
        title: loser.candidate.title,
        source: loser.candidate.source,
        reason: 'CONFLICTING_RECOMMENDATION',
        detail: `Suppressed because "${winner.candidate.title}" is the stronger conflicting next move.`,
      });
      incrementSuppressionReason('CONFLICTING_RECOMMENDATION');
      break;
    }

    if (!conflictHandled) {
      scopedEntries.push({
        candidate: entry.candidate,
        score: entry.score,
        conflicts: [],
      });
    }

    conflictByScope.set(scope, scopedEntries);
  }

  const flattened = Array.from(conflictByScope.values()).flat();
  flattened.sort((a, b) => b.score.finalScore - a.score.finalScore);

  const surfaced = flattened.slice(0, recommendationLimit);
  const cutOff = flattened.slice(recommendationLimit);
  for (const item of cutOff) {
    suppressed.push({
      candidateId: item.candidate.id,
      title: item.candidate.title,
      source: item.candidate.source,
      reason: 'FINAL_RANK_CUTOFF',
      detail: 'Suppressed to prevent recommendation overload.',
    });
    incrementSuppressionReason('FINAL_RANK_CUTOFF');
  }

  const recommendations = surfaced.map((item) => {
    const suppressionsConsidered = [
      ...(item.candidate.suppressionHints?.completedRecently ? ['completed_recently'] : []),
      ...(item.candidate.suppressionHints?.dismissedOrSnoozed ? ['dismissed_or_snoozed'] : []),
      ...(item.candidate.suppressionHints?.staleInput ? ['stale_input'] : []),
      ...(item.candidate.confidence < 0.45 ? ['low_confidence_guard_checked'] : []),
    ];

    return {
      id: item.candidate.id,
      title: item.candidate.title,
      detail: item.candidate.detail,
      source: item.candidate.source,
      targetTool: item.candidate.targetTool,
      targetPath: item.candidate.targetPath,
      sourceActionKey: item.candidate.sourceActionKey ?? null,
      signalKey: item.candidate.signalKey ?? null,
      reasonCode: reasonCodeForCandidate(item.candidate),
      score: item.score.finalScore,
      priorityBucket: mapPriorityBucket(item.score.finalScore),
      confidence: toUnit(item.candidate.confidence),
      freshness: toUnit(item.candidate.freshness),
      scoreBreakdown: item.score,
      trace: buildTrace({
        candidate: item.candidate,
        conflictsResolved: item.conflicts,
        suppressionsConsidered,
      }),
    };
  });

  const topDecisionCategories: Record<string, number> = {};
  for (const recommendation of recommendations) {
    const category = recommendation.targetTool;
    topDecisionCategories[category] = (topDecisionCategories[category] ?? 0) + 1;
  }

  const diagnostics: DecisionDiagnostics = {
    decisionModelVersion: DECISION_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    evaluatedCount,
    surfacedCount: recommendations.length,
    suppressedCount: suppressed.length,
    duplicateMergeCount,
    conflictResolutionCount,
    staleInputDecisions: recommendations.filter((entry) => entry.freshness < 0.4).length,
    lowConfidenceRecommendationCount: recommendations.filter((entry) => entry.confidence < 0.55).length,
    topDecisionCategories,
    suppressedByReason,
    priorityBuckets: {
      high: recommendations.filter((entry) => entry.priorityBucket === 'HIGH').length,
      medium: recommendations.filter((entry) => entry.priorityBucket === 'MEDIUM').length,
      low: recommendations.filter((entry) => entry.priorityBucket === 'LOW').length,
    },
  };

  return {
    recommendations,
    suppressed,
    diagnostics,
  };
}
