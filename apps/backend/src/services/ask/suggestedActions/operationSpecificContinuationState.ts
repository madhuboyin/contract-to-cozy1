import { prisma } from '../../../lib/prisma';

/**
 * Canonical record availability used to suppress operation continuations that would only open an empty result.
 * These checks intentionally match the destination reads' open-record semantics.
 */
export interface OperationSpecificContinuationState {
  hasPendingMaintenance: boolean;
  hasOpenInspectionFindings: boolean;
  hasUnresolvedRecallMatches: boolean;
}

export async function loadOperationSpecificContinuationState(
  propertyId: string,
): Promise<OperationSpecificContinuationState> {
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
  };
}
