import { prisma } from '../../../lib/prisma';
import { hasForecastableInventory } from '../../maintenancePrediction.service';
import { hasRecordedOutcomeForThread } from '../../decisionPlatform/outcomeObservationService';

/**
 * Canonical record availability used to suppress operation continuations that would only open an empty result.
 * These checks intentionally match the destination reads' open-record semantics.
 */
export interface OperationSpecificContinuationState {
  hasPendingMaintenance: boolean;
  hasOpenInspectionFindings: boolean;
  hasUnresolvedRecallMatches: boolean;
  /** Undefined = not loaded (unknown, treated as allowed). False = the forecast would open an empty NOT_APPLICABLE result. */
  hasForecastableSystem?: boolean;
  /** Undefined = not loaded (unknown, allowed). False = the HVAC decision has no recorded outcome, so a review chip would open an empty view. */
  hasRecordedHvacOutcome?: boolean;
}

/** Which parts to load: the record counts back HOME_ACTIONS gating, the forecast check backs every MAINTENANCE_FORECAST recipe. */
export interface OperationSpecificContinuationStateNeeds { records?: boolean; forecast?: boolean; hvacOutcomeThreadId?: string | null }

export async function loadOperationSpecificContinuationState(
  propertyId: string,
  needs: OperationSpecificContinuationStateNeeds = { records: true },
): Promise<OperationSpecificContinuationState> {
  const hasForecastableSystem = needs.forecast ? await hasForecastableInventory(propertyId) : undefined;
  const hasRecordedHvacOutcome = needs.hvacOutcomeThreadId ? await hasRecordedOutcomeForThread(needs.hvacOutcomeThreadId, propertyId) : undefined;
  // Record counts not requested are reported as present, so they never gate a recipe the caller did not ask to gate.
  if (!needs.records) return { hasPendingMaintenance: true, hasOpenInspectionFindings: true, hasUnresolvedRecallMatches: true, hasForecastableSystem, hasRecordedHvacOutcome };
  const [pendingMaintenanceCount, openInspectionFindingCount, unresolvedRecallMatchCount] = await Promise.all([
    prisma.propertyMaintenanceTask.count({
      where: { propertyId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),
    prisma.inspectionFinding.count({
      where: { propertyId, status: 'OPEN', report: { status: 'CONFIRMED' } },
    }),
    prisma.recallMatch.count({
      where: { propertyId, status: { in: ['OPEN', 'NEEDS_CONFIRMATION'] } },
    }),
  ]);

  return {
    hasPendingMaintenance: pendingMaintenanceCount > 0,
    hasOpenInspectionFindings: openInspectionFindingCount > 0,
    hasUnresolvedRecallMatches: unresolvedRecallMatchCount > 0,
    hasForecastableSystem,
    hasRecordedHvacOutcome,
  };
}
