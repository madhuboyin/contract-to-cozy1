import type { GuidanceJourneyDetailResponse } from '@/lib/api/guidanceApi';
import type { RankedHomeActionDTO, UnifiedHomeDTO } from '@/types';
import type { ToolLaunchContext } from './toolDiscoveryRegistry';

export type ToolContextVersionStatus = 'NOT_PROVIDED' | 'CURRENT' | 'UPDATED' | 'UNAVAILABLE';

export type ToolDestinationPrefill = {
  entityType: string | null;
  entityId: string | null;
  itemId: string | null;
  journeyId: string | null;
  serviceKey: string | null;
  issueType: string | null;
  scopeCategory: string | null;
  scopeId: string | null;
};

export type ResolvedToolDestinationContext = {
  sourceAction: RankedHomeActionDTO | null;
  sourceActionFound: boolean;
  journey: GuidanceJourneyDetailResponse['journey'] | null;
  nextJourneyLabel: string | null;
  contextVersionStatus: ToolContextVersionStatus;
  currentContextVersion: string | null;
  recommendationLabel: string | null;
  sourceTitle: string;
  sourceSummary: string | null;
  prefill: ToolDestinationPrefill;
  actionPlanHref: string | null;
  journeyHref: string | null;
};

function matchesSourceAction(action: RankedHomeActionDTO, sourceActionId: string): boolean {
  return action.id === sourceActionId ||
    action.lineageId === sourceActionId ||
    action.deduplication.mergedActionIds.includes(sourceActionId);
}

function findSourceAction(home: UnifiedHomeDTO | null, sourceActionId?: string | null) {
  if (!home || !sourceActionId) return null;
  return [...home.attention.actions, ...home.decisions]
    .find((action) => matchesSourceAction(action, sourceActionId)) ?? null;
}

function humanizeReason(value?: string | null): string | null {
  if (!value) return null;
  const reason = value.split(':').at(-1) ?? value;
  const humanized = reason
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return humanized ? `${humanized[0].toUpperCase()}${humanized.slice(1)}` : null;
}

function contextVersionStatus(
  requestedVersion: string | null | undefined,
  currentVersion: string | null,
): ToolContextVersionStatus {
  if (!requestedVersion) return 'NOT_PROVIDED';
  if (!currentVersion) return 'UNAVAILABLE';
  return requestedVersion === currentVersion ? 'CURRENT' : 'UPDATED';
}

function isInventoryEntity(entityType?: string | null): boolean {
  const normalized = entityType?.trim().toUpperCase();
  return normalized === 'INVENTORY_ITEM' || normalized === 'APPLIANCE' || normalized === 'ITEM';
}

export function resolveToolDestinationContext(args: {
  propertyId: string;
  context: ToolLaunchContext;
  home?: UnifiedHomeDTO | null;
  journeyDetail?: GuidanceJourneyDetailResponse | null;
}): ResolvedToolDestinationContext {
  const { propertyId, context } = args;
  const sourceAction = findSourceAction(args.home ?? null, context.sourceActionId);
  const journey = args.journeyDetail?.journey ?? null;
  const currentContextVersion = args.home?.propertyContext.contextVersion ?? null;
  const recommendationLabel = humanizeReason(context.recommendationReason);
  const journeyInventoryItemId = journey?.inventoryItemId ?? null;
  const journeyScopeId = journey?.scopeId ?? null;
  const entityId = context.sourceEntityId ?? sourceAction?.source.entityId ?? journeyScopeId ?? journeyInventoryItemId;
  const entityType = context.sourceEntityType ?? journey?.scopeCategory ??
    (journeyInventoryItemId ? 'INVENTORY_ITEM' : null);
  const itemId = context.itemId ??
    (isInventoryEntity(context.sourceEntityType) ? entityId : null) ??
    journeyInventoryItemId ??
    (journey?.scopeCategory === 'ITEM' ? journeyScopeId : null);
  const sourceTitle = sourceAction?.recommendedAction ??
    journey?.explanation?.what ??
    (recommendationLabel ? `Recommended because: ${recommendationLabel}` : 'Continued from your Home plan');
  const sourceSummary = sourceAction?.whyItMatters ??
    journey?.explanation?.why ??
    journey?.strategicAdvice ??
    null;
  const actionPlanHref = sourceAction
    ? `/dashboard/properties/${encodeURIComponent(propertyId)}/action-plan?focusActionId=${encodeURIComponent(sourceAction.id)}`
    : null;
  const journeyHref = journey
    ? `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/guidance-overview?journeyId=${encodeURIComponent(journey.id)}`
    : null;

  return {
    sourceAction,
    sourceActionFound: Boolean(sourceAction),
    journey,
    nextJourneyLabel: args.journeyDetail?.next?.nextStepLabel ?? journey?.nextStepLabel ?? null,
    contextVersionStatus: contextVersionStatus(context.contextVersion, currentContextVersion),
    currentContextVersion,
    recommendationLabel,
    sourceTitle,
    sourceSummary,
    prefill: {
      entityType,
      entityId,
      itemId,
      journeyId: journey?.id ?? context.journeyId ?? null,
      serviceKey: journey?.serviceKey ?? null,
      issueType: journey?.issueType ?? null,
      scopeCategory: journey?.scopeCategory ?? null,
      scopeId: journeyScopeId,
    },
    actionPlanHref,
    journeyHref,
  };
}
