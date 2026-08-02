import type { ToolLifecycleEventInput } from './toolLifecycle';

export function saleCaseMilestoneCompletionEvent(input: {
  saleCaseId: string;
  milestoneId: string;
  operation: 'readiness_verified' | 'handoff_published' | 'transition_recorded';
  sourceActionId?: string | null;
  sourceJourneyId?: string | null;
  sourceProjectId?: string | null;
}): ToolLifecycleEventInput {
  const sourceEntityType = input.sourceProjectId ? 'PROJECT' : 'PROPERTY';
  const sourceEntityId = input.sourceProjectId ?? input.saleCaseId;
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
    completionKind: 'OUTCOME_VERIFIED',
    outputKey: input.milestoneId,
    metadata: {
      operation: input.operation,
      saleCaseId: input.saleCaseId,
      milestoneId: input.milestoneId,
      sourceProjectId: input.sourceProjectId ?? null,
      livingHomeRecordWrites: [
        'sale-case',
        'sale-milestone',
      ],
    },
  };
}
