import type { ToolLifecycleEventInput } from './toolLifecycle';

export function sellerPrepPlanCompletionEvent(input: {
  planId: string;
  operation: 'preferences_saved' | 'checklist_item_completed';
  sourceActionId?: string | null;
  sourceJourneyId?: string | null;
  sourceProjectId?: string | null;
  itemId?: string | null;
}): ToolLifecycleEventInput {
  const sourceEntityType = input.sourceProjectId ? 'PROJECT' : 'PROPERTY';
  const sourceEntityId = input.sourceProjectId ?? input.planId;
  return {
    toolId: 'seller-prep',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: input.sourceJourneyId
      ? 'JOURNEY'
      : input.sourceProjectId
        ? 'PROJECT'
        : input.sourceActionId
          ? 'HOME_ACTION'
          : 'COMPLETION',
    sourceActionId: input.sourceActionId ?? null,
    sourceEntityType,
    sourceEntityId,
    journeyId: input.sourceJourneyId ?? null,
    completionKind: 'PLAN_CREATED',
    outputKey: input.planId,
    metadata: {
      operation: input.operation,
      itemId: input.itemId ?? null,
      sourceProjectId: input.sourceProjectId ?? null,
      livingHomeRecordWrites: [
        'seller-prep-plan',
        input.operation === 'preferences_saved'
          ? 'seller-prep-preferences'
          : 'seller-prep-checklist-progress',
      ],
    },
  };
}

