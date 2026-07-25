import type { ToolLifecycleEventInput } from './toolLifecycle';

type ComplianceRecordCompletionInput = {
  recordId: string;
  sourceActionId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceJourneyId?: string | null;
};

function sourceKind(
  input: ComplianceRecordCompletionInput,
): ToolLifecycleEventInput['sourceKind'] {
  if (input.sourceJourneyId) return 'JOURNEY';
  if (input.sourceEntityType === 'PROJECT') return 'PROJECT';
  if (input.sourceActionId) return 'HOME_ACTION';
  return 'COMPLETION';
}

export function permitRecordCompletionEvent(
  input: ComplianceRecordCompletionInput,
): ToolLifecycleEventInput {
  return {
    toolId: 'permits',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: sourceKind(input),
    sourceActionId: input.sourceActionId ?? null,
    sourceEntityType: input.sourceEntityType ?? 'DOCUMENT',
    sourceEntityId: input.sourceEntityId ?? input.recordId,
    journeyId: input.sourceJourneyId ?? null,
    completionKind: 'PLAN_CREATED',
    outputKey: input.recordId,
    metadata: {
      operation: 'permit_record_created',
      livingHomeRecordWrite: 'permit-record',
      legalComplianceDetermination: false,
    },
  };
}

export function hoaApprovalRecordCompletionEvent(
  input: ComplianceRecordCompletionInput,
): ToolLifecycleEventInput {
  return {
    toolId: 'hoa-compliance',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: sourceKind(input),
    sourceActionId: input.sourceActionId ?? null,
    sourceEntityType: input.sourceEntityType ?? 'DOCUMENT',
    sourceEntityId: input.sourceEntityId ?? input.recordId,
    journeyId: input.sourceJourneyId ?? null,
    completionKind: 'PLAN_CREATED',
    outputKey: input.recordId,
    metadata: {
      operation: 'hoa_approval_record_created',
      livingHomeRecordWrite: 'hoa-approval-record',
      legalComplianceDetermination: false,
    },
  };
}
