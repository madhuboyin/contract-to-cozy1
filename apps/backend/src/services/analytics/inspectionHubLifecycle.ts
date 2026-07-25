import type { ToolLifecycleEventInput } from './toolLifecycle';

export function hasTrackableInspectionFindings(findingCount: number): boolean {
  return Number.isInteger(findingCount) && findingCount > 0;
}

export function inspectionFindingsCompletionEvent(input: {
  reportId: string;
  findingCount: number;
  sourceActionId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceJourneyId?: string | null;
}): ToolLifecycleEventInput {
  return {
    toolId: 'inspection-hub',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: input.sourceJourneyId
      ? 'JOURNEY'
      : input.sourceActionId
        ? 'HOME_ACTION'
        : 'COMPLETION',
    sourceActionId: input.sourceActionId ?? null,
    sourceEntityType: input.sourceEntityType ?? 'DOCUMENT',
    sourceEntityId: input.sourceEntityId ?? input.reportId,
    journeyId: input.sourceJourneyId ?? null,
    completionKind: 'ARTIFACT_CREATED',
    outputKey: input.reportId,
    metadata: {
      operation: 'inspection_findings_extracted',
      findingCount: input.findingCount,
      outputEntityType: 'ISSUE',
      livingHomeRecordWrites: ['inspection-report', 'inspection-finding'],
    },
  };
}
