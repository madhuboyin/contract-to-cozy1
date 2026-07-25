import type { ToolLifecycleEventInput } from './toolLifecycle';

type ProjectTrackerCompletionInput = {
  projectId: string;
  milestoneId: string;
  sourceActionId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceJourneyId?: string | null;
};

export function hasTrackableProjectMilestone(
  milestone: { id?: string | null } | null | undefined,
): milestone is { id: string } {
  return Boolean(milestone?.id);
}

function baseEvent(
  input: ProjectTrackerCompletionInput,
): Omit<ToolLifecycleEventInput, 'metadata'> {
  return {
    toolId: 'project-tracker',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: input.sourceJourneyId
      ? 'JOURNEY'
      : input.sourceActionId
        ? 'HOME_ACTION'
        : 'PROJECT',
    sourceActionId: input.sourceActionId ?? null,
    sourceEntityType: input.sourceEntityType ?? 'PROJECT',
    sourceEntityId: input.sourceEntityId ?? input.projectId,
    journeyId: input.sourceJourneyId ?? null,
    completionKind: 'ACTION_COMPLETED',
    outputKey: input.projectId,
  };
}

export function projectMilestonePlanCompletionEvent(
  input: ProjectTrackerCompletionInput & {
    operation: 'project_created_with_milestone' | 'milestone_added';
  },
): ToolLifecycleEventInput {
  return {
    ...baseEvent(input),
    metadata: {
      operation: input.operation,
      milestoneId: input.milestoneId,
      livingHomeRecordWrites: ['project-record', 'project-milestone'],
    },
  };
}

export function projectProgressCompletionEvent(
  input: ProjectTrackerCompletionInput & {
    requiresPhotoEvidence: boolean;
  },
): ToolLifecycleEventInput {
  return {
    ...baseEvent(input),
    metadata: {
      operation: 'milestone_progress_verified',
      milestoneId: input.milestoneId,
      requiresPhotoEvidence: input.requiresPhotoEvidence,
      livingHomeRecordWrite: 'project-progress',
    },
  };
}
