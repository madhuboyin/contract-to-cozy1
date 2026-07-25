import type { DiyDecisionVerdict } from '@prisma/client';
import type { ToolLifecycleEventInput } from './toolLifecycle';

export function diyDecisionCompletionEvent(input: {
  propertyId: string;
  verdict: DiyDecisionVerdict;
  score: number;
  category: string;
}): ToolLifecycleEventInput {
  return {
    toolId: 'diy',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: 'COMPLETION',
    sourceEntityType: 'PROPERTY',
    sourceEntityId: input.propertyId,
    completionKind: 'DECISION_RECORDED',
    outputKey: `diy-decision:${input.propertyId}:${input.category}:${input.verdict}:${input.score}`,
    metadata: {
      operation: 'decision_recorded',
      verdict: input.verdict,
      score: input.score,
      category: input.category,
      livingHomeRecordWrite: 'diy-decision',
    },
  };
}

export function diyProjectCompletionEvent(input: {
  projectId: string;
  category: string;
  decisionVerdict?: DiyDecisionVerdict | null;
}): ToolLifecycleEventInput {
  return {
    toolId: 'diy',
    stage: 'COMPLETED',
    surface: 'workflow',
    sourceKind: 'PROJECT',
    sourceEntityType: 'PROJECT',
    sourceEntityId: input.projectId,
    completionKind: 'DECISION_RECORDED',
    outputKey: input.projectId,
    metadata: {
      operation: 'eligible_project_created',
      category: input.category,
      decisionVerdict: input.decisionVerdict ?? null,
      reviewedLowRisk: true,
      livingHomeRecordWrite: 'diy-project',
    },
  };
}

