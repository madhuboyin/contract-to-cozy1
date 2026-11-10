import type { AskExecutionResponse } from './types';

/**
 * The second part of a typed two-part question, when the server offered it as an "Also answer: ..." button on the first answer.
 * The workspace asks it automatically right after the first answer, as its own turn: routed, executed and trust-checked like any question,
 * so no two operations' blocks are ever merged. Only the server's own offer (a read operation, confident routing) is followed, and only once.
 */
export function alsoAnswerFollowUp(execution: Pick<AskExecutionResponse, 'status' | 'blocks'> | null | undefined): { message: string; operationId: string } | null {
  if (!execution || execution.status !== 'ANSWERED') return null;
  for (const block of execution.blocks ?? []) {
    if (block.type !== 'SUMMARY') continue;
    for (const action of (block as { actions?: Array<{ id?: string; interactionType?: string; message?: string; operationId?: string }> }).actions ?? []) {
      if (action.id?.startsWith('also-answer-') && action.interactionType === 'START_WORKFLOW' && action.message && action.operationId) {
        return { message: action.message, operationId: action.operationId };
      }
    }
  }
  return null;
}
