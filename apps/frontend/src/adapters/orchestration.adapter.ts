// apps/frontend/src/adapters/orchestration.adapter.ts

import {
  OrchestratedActionDTO,
  OrchestrationSummaryDTO,
  SuppressionReason,
  ServiceCategory,
} from '../types';


/**
 * UI-friendly action shape
 * (non-breaking: still matches backend semantics)
 */
export type OrchestratedActionUI = OrchestratedActionDTO & {
  isSuppressed: boolean;
  suppressionReasonText?: string;
};

/**
 * Normalize a single action
 */
function adaptAction(action: OrchestratedActionDTO): OrchestratedActionUI {
  const suppressed = Boolean(action.suppression?.suppressed);

  const suppressionReasonText = suppressed
    ? action.suppression?.reasons
        ?.map(r => r.message)
        .join(' • ')
    : undefined;

  return {
    ...action,
    isSuppressed: suppressed,
    suppressionReasonText,
  };
}

function computeConfidence(action: OrchestratedActionDTO) {
  let score = 50;
  const reasons: string[] = [];

  if (action.riskLevel === 'HIGH' || action.riskLevel === 'CRITICAL') {
    score += 25;
    reasons.push('High risk severity');
  }

  if (action.exposure && action.exposure > 5000) {
    score += 15;
    reasons.push('High financial exposure');
  }

  if (!action.suppression?.suppressed) {
    score += 10;
    reasons.push('No blocking conditions detected');
  }

  return {
    score: Math.min(100, score),
    level: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
    explanation: reasons,
  };
}

/**
 * Main adapter
 * 🔑 FIXED: Now includes snoozedActions in return type
 */
export function adaptOrchestrationSummary(
  dto: OrchestrationSummaryDTO
): {
  propertyId: string;
  pendingActionCount: number;

  actions: OrchestratedActionUI[];
  suppressedActions: OrchestratedActionUI[];
  snoozedActions: OrchestratedActionUI[];

  counts: OrchestrationSummaryDTO['counts'];
  derivedFrom: OrchestrationSummaryDTO['derivedFrom'];
} {
  return {
    propertyId: dto.propertyId,
    pendingActionCount: dto.pendingActionCount,

    actions: dto.actions.map(adaptAction),
    suppressedActions: dto.suppressedActions.map(adaptAction),
    snoozedActions: (dto.snoozedActions || []).map(adaptAction),

    counts: dto.counts,
    derivedFrom: dto.derivedFrom,
  };
}