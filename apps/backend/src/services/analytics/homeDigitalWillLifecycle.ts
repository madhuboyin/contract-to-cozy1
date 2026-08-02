import type { ToolLifecycleEventInput } from './toolLifecycle';

export function homeContinuityAccessTestCompletionEvent(input: {
  handoffPackageId: string;
  grantId: string;
  recipientId: string;
  accessTestId: string;
}): ToolLifecycleEventInput {
  return {
    toolId: 'home-digital-will',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: 'COMPLETION',
    sourceEntityType: 'HANDOFF_PACKAGE',
    sourceEntityId: input.handoffPackageId,
    completionKind: 'ARTIFACT_CREATED',
    outputKey: input.accessTestId,
    metadata: {
      artifactType: 'home-continuity-package',
      grantId: input.grantId,
      recipientId: input.recipientId,
      accessTestId: input.accessTestId,
      livingHomeRecordWrites: [
        'home-continuity-package',
        'handoff-recipient',
        'handoff-access-grant',
        'handoff-access-log',
      ],
    },
  };
}
