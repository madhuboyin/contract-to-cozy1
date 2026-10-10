import type { DiyDecisionVerdict } from '@prisma/client';
import { logger } from '../../lib/logger';
import { recordToolLifecycleEvents, type ToolLifecycleEventInput } from './toolLifecycle';

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


/**
 * Records the DIY capability completion for a project that was just created. Called by the SERVICE that creates it (diyService), below the
 * transport layer, so the page's HTTP route and Ask's confirmed "start this project" share one completion rule instead of each controller or
 * handler carrying its own hook (capability discovery plan, Phase 6 follow-up). Fire-and-forget: analytics never fails or delays the write, and a
 * rejection is logged, not left unhandled.
 */
export function recordDiyProjectCreated(
  input: { userId: string; propertyId: string; project: { id: string; category: string; decisionVerdict?: DiyDecisionVerdict | null } },
  record: typeof recordToolLifecycleEvents = recordToolLifecycleEvents,
): void {
  void Promise.resolve()
    .then(() => record({
      userId: input.userId,
      propertyId: input.propertyId,
      events: [diyProjectCompletionEvent({ projectId: input.project.id, category: input.project.category, decisionVerdict: input.project.decisionVerdict })],
    }))
    .catch((error) => logger.warn({ err: error, propertyId: input.propertyId, projectId: input.project.id }, 'DIY project lifecycle event not recorded; the project was created'));
}
