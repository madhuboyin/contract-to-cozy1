import type { ToolLifecycleEventInput } from './toolLifecycle';

export function plantAdvisorCompletionEvent(input: {
  roomId: string;
  profileId: string;
  recommendationIds: string[];
}): ToolLifecycleEventInput {
  return {
    toolId: 'plant-advisor',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: 'COMPLETION',
    sourceEntityType: 'ROOM',
    sourceEntityId: input.roomId,
    completionKind: 'OUTPUT_GENERATED',
    outputKey: `plant-recommendations:${input.profileId}`,
    metadata: {
      recommendationCount: input.recommendationIds.length,
      recommendationIds: input.recommendationIds,
      livingHomeRecordWrites: [
        'room-plant-profile',
        'plant-recommendation',
      ],
    },
  };
}
