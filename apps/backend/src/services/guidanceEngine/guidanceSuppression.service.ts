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
  suppress(actions: EnrichedGuidanceAction[]): GuidanceSuppressionResult {
    const dedupedByKey = new Map<string, EnrichedGuidanceAction>();
    const suppressedSignals: GuidanceSuppressionResult['suppressedSignals'] = [];

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

      if (isWeakSignal(action)) {
        suppressedSignals.push({
          signalId: action.signal?.id ?? null,
          journeyId: action.journey.id,
          reason: 'WEAK_SIGNAL',
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

    filteredActions.sort((a, b) => b.priorityScore - a.priorityScore);

    return {
      filteredActions,
      suppressedSignals,
    };
  }
}

export const guidanceSuppressionService = new GuidanceSuppressionService();
