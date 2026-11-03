// Durable completion of a selected Suggested Next Action. A chip's answer can settle on a LATER request than the one that created the
// execution (a confirmation, a capture submission), and a settled read can be READY_WITH_LIMITATIONS; recording completion only at
// creation time left those outcomes un-retired. This module resolves the originally selected action from the persisted selection event
// and the source execution's offered-action ledger (never from client input) and marks the lifecycle row, fail open.
import { logger } from '../../../lib/logger';
import { prisma } from '../../../lib/prisma';
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import { recordSuggestedActionCompleted } from './askSuggestedActionLifecycle.service';
import { recordSuggestedActionOutcomeAnalytics } from './suggestedActionAnalytics';
import { readStoredSuggestedNextActions } from './suggestedNextAction.contract';
import { hasBlockingCaptureRequests } from './optionalNextActionCapture';

interface SettledResultShape {
  status: string;
  captureRequests?: readonly unknown[] | null;
  clarification?: unknown;
  confirmation?: unknown;
}

/**
 * Whether an execution's result is a settled answer for the purpose of retiring the outcome that launched it: ANSWERED or COMPLETED, or
 * READY_WITH_LIMITATIONS that is a finished answer with caveats (no open capture prompt, clarification or confirmation). A
 * READY_WITH_LIMITATIONS that still asks the homeowner for something is not complete.
 */
export function isSettledForCompletion(result: SettledResultShape): boolean {
  if (result.status === 'ANSWERED' || result.status === 'COMPLETED') return true;
  return result.status === 'READY_WITH_LIMITATIONS'
    && !hasBlockingCaptureRequests(result.captureRequests as readonly { captureKey?: unknown }[] | null | undefined) && !result.clarification && !result.confirmation;
}

/** The persisted result's blocking capture prompts (optional next-action prompts do not count); keeps an unfinished capture out of completed history. */
export function storedResultHasOpenCaptureRequests(resultJson: unknown): boolean {
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) return false;
  const captures = (resultJson as { captureRequests?: unknown }).captureRequests;
  return Array.isArray(captures) && hasBlockingCaptureRequests(captures as readonly { captureKey?: unknown }[]);
}

/** The action a SUGGESTED_ACTION_SELECTED event verified for this execution, read back from the source execution's stored ledger. */
export async function loadSelectedSuggestedAction(userId: string, executionId: string): Promise<{ action: SuggestedNextAction; sourceExecutionId: string } | null> {
  const event = await prisma.askExecutionEvent.findFirst({
    where: { eventType: 'SUGGESTED_ACTION_SELECTED', executionId },
    orderBy: { createdAt: 'asc' },
    select: { metadataJson: true },
  });
  const metadata = event?.metadataJson as { suggestedActionId?: unknown; sourceExecutionId?: unknown } | null | undefined;
  if (!metadata || typeof metadata.suggestedActionId !== 'string' || typeof metadata.sourceExecutionId !== 'string') return null;
  const source = await prisma.askExecution.findFirst({ where: { id: metadata.sourceExecutionId, userId }, select: { resultJson: true } });
  if (!source) return null;
  const action = readStoredSuggestedNextActions(source.resultJson).find((candidate) => candidate.id === metadata.suggestedActionId);
  return action ? { action, sourceExecutionId: metadata.sourceExecutionId } : null;
}

/**
 * Marks the outcome that launched `executionId` as completed. Returns whether a lifecycle row was updated. Never throws: a failure only
 * means the outcome may be offered again. A no-op for an execution that was not launched from a verified chip.
 */
export async function recordSelectedSuggestedActionCompletion(input: {
  userId: string; executionId: string; status: string; reasonCode?: string | null;
}): Promise<boolean> {
  try {
    const selected = await loadSelectedSuggestedAction(input.userId, input.executionId);
    const propertyId = selected?.action.entityContext.propertyId;
    if (!selected || !propertyId) return false;
    const { action } = selected;
    const updated = await recordSuggestedActionCompleted(input.userId, propertyId, {
      operationId: action.operationId, outcomeKey: action.outcomeKey, entityType: action.entityContext.entityType, entityId: action.entityContext.entityId,
    }, new Date());
    recordSuggestedActionOutcomeAnalytics({
      userId: input.userId, resultingExecutionId: input.executionId, sourceExecutionId: selected.sourceExecutionId, action,
      status: input.status, reasonCode: input.reasonCode ?? null,
    });
    return updated;
  } catch (error) {
    logger.warn({ err: error, executionId: input.executionId }, '[ask-suggested-actions] completion record failed; outcome may be offered again');
    return false;
  }
}
