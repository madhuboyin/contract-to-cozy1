import type { ToolLifecycleEventInput } from './toolLifecycle';

export function homeDigitalWillCompletionEvent(input: {
  willId: string;
  trustedContactCount: number;
  entryCount: number;
}): ToolLifecycleEventInput {
  return {
    toolId: 'home-digital-will',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: 'COMPLETION',
    sourceEntityType: 'DOCUMENT',
    sourceEntityId: input.willId,
    completionKind: 'ARTIFACT_CREATED',
    outputKey: input.willId,
    metadata: {
      artifactType: 'governed-home-handoff',
      trustedContactCount: input.trustedContactCount,
      entryCount: input.entryCount,
      livingHomeRecordWrites: [
        'governed-home-handoff',
        'trusted-contact-access-policy',
      ],
    },
  };
}
