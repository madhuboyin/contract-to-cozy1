import { logger } from '../../lib/logger';
type EnrichedGuidanceAction = {
  journey: any;
  signal: any | null;
  next: any | null;
  priorityScore: number;
  priorityBucket: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  financialImpactScore: number;
  fundingGapFlag: boolean;
  costOfDelay: number;
  coverageImpact: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN';
  explanation: {
    what: string;
    why: string;
    risk: string;
    nextStep: string;
  };
  validationShouldSuppress?: boolean;
};

export type GuidanceSuppressionResult = {
  filteredActions: EnrichedGuidanceAction[];
  suppressedSignals: Array<{
    signalId: string | null;
    journeyId: string;
    reason: string;
  }>;
};

function signalDedupKey(action: EnrichedGuidanceAction) {
  const merged = String(action.journey?.mergedSignalGroupKey ?? '').trim();
  if (merged) return `merged:${merged}`;

  const signalFamily = String(action.signal?.signalIntentFamily ?? '').trim() || 'unknown';
  const issueDomain = String(action.journey?.issueDomain ?? action.signal?.issueDomain ?? 'OTHER');
  const inventoryItemId = String(action.journey?.inventoryItemId ?? action.signal?.inventoryItemId ?? '');
  const homeAssetId = String(action.journey?.homeAssetId ?? action.signal?.homeAssetId ?? '');

  return `journey:${issueDomain}:${signalFamily}:${inventoryItemId}:${homeAssetId}`;
}

function conflictScopeKey(action: EnrichedGuidanceAction) {
  const inventoryItemId = String(action.journey?.inventoryItemId ?? action.signal?.inventoryItemId ?? '');
  const homeAssetId = String(action.journey?.homeAssetId ?? action.signal?.homeAssetId ?? '');
  const issueDomain = String(action.journey?.issueDomain ?? action.signal?.issueDomain ?? 'OTHER');
  return `${issueDomain}:${inventoryItemId}:${homeAssetId}`;
}

function classifyActionIntent(action: EnrichedGuidanceAction) {
  const nextStep = String(action.next?.nextStep?.stepKey ?? '').toLowerCase();
  const label = String(action.explanation?.nextStep ?? action.next?.nextStep?.label ?? '').toLowerCase();

  const replaceLike =
    nextStep.includes('replace') ||
    label.includes('replace');
  const deferLike =
    nextStep.includes('do_nothing') ||
    nextStep.includes('track') ||
    nextStep.includes('monitor') ||
    label.includes('delay') ||
    label.includes('monitor');
  const executeLike =
    nextStep.includes('book') ||
    nextStep.includes('route_specialist') ||
    label.includes('book service');

  if (replaceLike) return 'REPLACE';
  if (deferLike) return 'DEFER';
  if (executeLike) return 'EXECUTE';
  return 'NEUTRAL';
}

function isWeakSignal(action: EnrichedGuidanceAction) {
  const severity = String(action.signal?.severity ?? 'UNKNOWN');
  const isLowSeverity = severity === 'INFO' || severity === 'LOW' || severity === 'UNKNOWN';
  const isLowConfidence = action.confidenceScore < 0.45;
  const isLowFinancialImpact = action.financialImpactScore < 20;
  const isSafety = action.journey?.issueDomain === 'SAFETY' || action.journey?.issueDomain === 'WEATHER';
  return isLowSeverity && isLowConfidence && isLowFinancialImpact && !isSafety;
}

function isTrackingOnly(action: EnrichedGuidanceAction) {
  return (
    action.journey?.executionReadiness === 'TRACKING_ONLY' ||
    action.next?.executionReadiness === 'TRACKING_ONLY'
  );
}

function isRedundantAction(action: EnrichedGuidanceAction) {
  const nextStep = action.next?.nextStep;
  if (!nextStep) return false;

  const stepKey = String(nextStep.stepKey ?? '');
  const byStep = (action.journey?.derivedSnapshotJson?.byStep ?? {}) as Record<string, unknown>;
  const previousOutput = byStep[stepKey];

  if (!previousOutput || nextStep.status === 'COMPLETED') return false;

  const highValueDecisionSteps = new Set([
    'repair_replace_decision',
    'check_coverage',
    'validate_price',
    'estimate_out_of_pocket_cost',
    'compare_action_options',
  ]);

  return highValueDecisionSteps.has(stepKey);
}

export class GuidanceSuppressionService {
  suppress(actions: EnrichedGuidanceAction[], options?: { userSelectedScopeId?: string }): GuidanceSuppressionResult {
    const dedupedByKey = new Map<string, EnrichedGuidanceAction>();
    const suppressedSignals: GuidanceSuppressionResult['suppressedSignals'] = [];

    // IMP-GE-1: When the user has selected a specific scope, pin that journey through
    // all suppression passes. This ensures user-chosen scopes are never silently removed
    // by portfolio-level ranking or weak-signal filtering.
    const pinnedJourneyIds = new Set<string>();
    if (options?.userSelectedScopeId) {
      for (const action of actions) {
        const journeyScopeId = action.journey?.scopeId ?? action.journey?.inventoryItemId ?? action.journey?.homeAssetId ?? null;
        if (journeyScopeId === options.userSelectedScopeId || action.journey?.id === options.userSelectedScopeId) {
          pinnedJourneyIds.add(action.journey.id);
        }
      }
    }

    for (const action of actions) {
      const dedupKey = signalDedupKey(action);
      const existing = dedupedByKey.get(dedupKey);

      if (!existing) {
        dedupedByKey.set(dedupKey, action);
        continue;
      }

      if (action.priorityScore > existing.priorityScore) {
        suppressedSignals.push({
          signalId: existing.signal?.id ?? null,
          journeyId: existing.journey.id,
          reason: 'DUPLICATE_SIGNAL_MERGED',
        });
        dedupedByKey.set(dedupKey, action);
      } else {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'DUPLICATE_SIGNAL_MERGED',
        });
      }
    }

    const filteredActions: EnrichedGuidanceAction[] = [];
    for (const action of dedupedByKey.values()) {
      if (isTrackingOnly(action)) {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'TRACKING_ONLY',
        });
        continue;
      }

      if (isWeakSignal(action) && !pinnedJourneyIds.has(action.journey.id)) {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'WEAK_SIGNAL',
        });
        continue;
      }

      if (action.validationShouldSuppress && !pinnedJourneyIds.has(action.journey.id)) {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'VALIDATION_SUPPRESSED',
        });
        continue;
      }

      if (isRedundantAction(action)) {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'REDUNDANT_STEP_ALREADY_RESOLVED',
        });
        continue;
      }

      filteredActions.push(action);
    }

    const finalByJourney = new Map<string, EnrichedGuidanceAction>();
    for (const action of filteredActions) {
      if (!finalByJourney.has(action.journey.id)) {
        finalByJourney.set(action.journey.id, action);
        continue;
      }

      const existing = finalByJourney.get(action.journey.id);
      if (!existing) continue;

      if (action.priorityScore > existing.priorityScore) {
        suppressedSignals.push({
          signalId: existing.signal?.id ?? null,
          journeyId: existing.journey.id,
          reason: 'DUPLICATE_JOURNEY_ACTION',
        });
        finalByJourney.set(action.journey.id, action);
      } else {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'DUPLICATE_JOURNEY_ACTION',
        });
      }
    }

    const conflictByScope = new Map<string, EnrichedGuidanceAction>();
    for (const action of finalByJourney.values()) {
      const scopeKey = conflictScopeKey(action);
      const existing = conflictByScope.get(scopeKey);
      if (!existing) {
        conflictByScope.set(scopeKey, action);
        continue;
      }

      const intentA = classifyActionIntent(existing);
      const intentB = classifyActionIntent(action);
      const conflict =
        (intentA === 'REPLACE' && intentB === 'DEFER') ||
        (intentA === 'DEFER' && intentB === 'REPLACE');

      if (!conflict) {
        // Pinned journeys always win a non-conflicting comparison
        if (pinnedJourneyIds.has(action.journey.id)) {
          conflictByScope.set(scopeKey, action);
        } else if (!pinnedJourneyIds.has(existing.journey.id) && action.priorityScore > existing.priorityScore) {
          conflictByScope.set(scopeKey, action);
        }
        continue;
      }

      // Pinned journey wins conflict resolution unconditionally
      if (pinnedJourneyIds.has(action.journey.id)) {
        suppressedSignals.push({
          signalId: existing.signal?.id ?? null,
          journeyId: existing.journey.id,
          reason: 'CONFLICTING_ACTION_SUPPRESSED',
        });
        conflictByScope.set(scopeKey, action);
      } else if (pinnedJourneyIds.has(existing.journey.id)) {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'CONFLICTING_ACTION_SUPPRESSED',
        });
      } else if (action.priorityScore > existing.priorityScore) {
        suppressedSignals.push({
          signalId: existing.signal?.id ?? null,
          journeyId: existing.journey.id,
          reason: 'CONFLICTING_ACTION_SUPPRESSED',
        });
        conflictByScope.set(scopeKey, action);
      } else {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'CONFLICTING_ACTION_SUPPRESSED',
        });
      }
    }

    const dedupedActions = Array.from(conflictByScope.values());

    const uniqueActionKeys = new Set<string>();
    const finalActions: EnrichedGuidanceAction[] = [];
    for (const action of dedupedActions) {
      const key = [
        action.journey.id,
        action.next?.nextStep?.stepKey ?? '',
        action.next?.recommendedToolKey ?? '',
      ].join(':');
      if (uniqueActionKeys.has(key)) {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'FINAL_RESPONSE_DUPLICATE',
        });
        continue;
      }
      uniqueActionKeys.add(key);
      finalActions.push(action);
    }

    finalActions.sort((a, b) => b.priorityScore - a.priorityScore);

    if (suppressedSignals.length > 0) {
      const summary: Record<string, number> = {};
      for (const item of suppressedSignals) {
        summary[item.reason] = (summary[item.reason] ?? 0) + 1;
      }
      logger.info({ summary }, '[GUIDANCE] suppression applied');
    }

    return {
      filteredActions: finalActions,
      suppressedSignals,
    };
  }
}

export const guidanceSuppressionService = new GuidanceSuppressionService();
