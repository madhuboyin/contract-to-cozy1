// Best-effort product analytics for the governed Suggested Next Action funnel. Payloads deliberately exclude
// labels, messages, entity ids and homeowner data; execution/action ids remain restricted operational joins.
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule } from '../../analytics';

const FEATURE = 'ask_suggested_next_actions';

export function recordSuggestedActionImpressions(input: {
  userId: string; propertyId: string; executionId: string; actions: readonly SuggestedNextAction[];
}): void {
  analyticsEmitter.trackBatch(input.actions.map((action) => ({
    eventType: AnalyticsEvent.TOOL_USED,
    eventName: 'ask_suggested_action_impression',
    userId: input.userId,
    propertyId: input.propertyId,
    moduleKey: AnalyticsModule.AI_INSIGHTS,
    featureKey: FEATURE,
    source: 'ask',
    metadataJson: {
      actionId: action.id, sourceExecutionId: input.executionId, sourceCategory: action.provenance.source,
      sourceOperationId: action.provenance.sourceOperationId, targetOperationId: action.operationId,
      priorityTier: action.priority.tier, interactionType: action.interactionType, entityType: action.entityContext.entityType,
      outcomeKey: action.outcomeKey,
    },
  })));
}

export function recordSuggestedActionSuppression(input: {
  userId: string; propertyId: string; executionId: string; rejections: Readonly<Record<string, number>>;
}): void {
  const entries = Object.entries(input.rejections).filter(([, count]) => count > 0);
  if (!entries.length) return;
  analyticsEmitter.track({
    eventType: AnalyticsEvent.TOOL_USED, eventName: 'ask_suggested_action_suppressed', userId: input.userId,
    propertyId: input.propertyId, moduleKey: AnalyticsModule.AI_INSIGHTS, featureKey: FEATURE, source: 'ask',
    metadataJson: { sourceExecutionId: input.executionId, suppressionCounts: Object.fromEntries(entries) },
  });
}

export function recordSuggestedActionSelectedAnalytics(input: {
  userId: string; resultingExecutionId: string; sourceExecutionId: string; action: SuggestedNextAction;
}): void {
  analyticsEmitter.track({
    eventType: AnalyticsEvent.TOOL_USED, eventName: 'ask_suggested_action_selected', userId: input.userId,
    propertyId: input.action.entityContext.propertyId, moduleKey: AnalyticsModule.AI_INSIGHTS, featureKey: FEATURE, source: 'ask',
    metadataJson: {
      actionId: input.action.id, sourceExecutionId: input.sourceExecutionId, resultingExecutionId: input.resultingExecutionId,
      sourceCategory: input.action.provenance.source, sourceOperationId: input.action.provenance.sourceOperationId,
      targetOperationId: input.action.operationId, priorityTier: input.action.priority.tier,
      interactionType: input.action.interactionType, entityType: input.action.entityContext.entityType, outcomeKey: input.action.outcomeKey,
    },
  });
}

export function recordSuggestedActionOutcomeAnalytics(input: {
  userId: string; resultingExecutionId: string; sourceExecutionId: string; action: SuggestedNextAction;
  status: string; reasonCode: string | null;
}): void {
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, eventName: 'ask_suggested_action_outcome', userId: input.userId,
    propertyId: input.action.entityContext.propertyId, moduleKey: AnalyticsModule.AI_INSIGHTS, featureKey: FEATURE, source: 'ask',
    metadataJson: {
      actionId: input.action.id, sourceExecutionId: input.sourceExecutionId, resultingExecutionId: input.resultingExecutionId,
      targetOperationId: input.action.operationId, outcomeKey: input.action.outcomeKey, status: input.status,
      reasonCode: input.reasonCode,
    },
  });
}
