import type { ToolLaunchContextValue } from './ToolLaunchContextBoundary';

export type SellerPrepSourceLineage = {
  sourceActionId?: string;
  sourceJourneyId?: string;
  sourceProjectId?: string;
};

export function sellerPrepSourceLineage(
  launch: ToolLaunchContextValue,
): SellerPrepSourceLineage {
  if (!launch) return {};
  const entityType = launch.resolved.prefill.entityType?.trim().toUpperCase();
  const entityId = launch.resolved.prefill.entityId;
  return {
    ...(launch.context.sourceActionId
      ? { sourceActionId: launch.context.sourceActionId }
      : {}),
    ...(launch.resolved.prefill.journeyId
      ? { sourceJourneyId: launch.resolved.prefill.journeyId }
      : {}),
    ...(entityType === 'PROJECT' && entityId
      ? { sourceProjectId: entityId }
      : {}),
  };
}

