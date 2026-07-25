import type { ToolLifecycleEventInput } from './toolLifecycle';

type MaterialSpecLifecycleSource = {
  id: string;
  projectId?: string | null;
  roomId?: string | null;
};

export function materialSpecCompletionEvent(
  spec: MaterialSpecLifecycleSource,
  operation: 'create' | 'update',
): ToolLifecycleEventInput {
  const sourceEntityType = spec.projectId
    ? 'PROJECT'
    : spec.roomId
      ? 'ROOM'
      : 'PROPERTY';
  const sourceEntityId = spec.projectId ?? spec.roomId ?? null;

  return {
    toolId: 'material-specs',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: spec.projectId ? 'PROJECT' : 'COMPLETION',
    sourceEntityType,
    sourceEntityId,
    completionKind: 'ARTIFACT_CREATED',
    outputKey: spec.id,
    metadata: {
      operation,
      livingHomeRecordWrite: 'material-specification',
    },
  };
}
