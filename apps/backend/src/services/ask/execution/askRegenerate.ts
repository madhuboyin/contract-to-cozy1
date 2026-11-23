import { prisma } from '../../../lib/prisma';
import type { AskExecutionResponse, RegenerateAskExecution } from '../../../productFramework/ask/ask.contract';
import type { AskAccountRole } from '../askAccountEligibility';
import { asInputJson, mapPersistedExecution, propertySummary } from '../askHandlerSupport';
import { regenerationSourceOf, withRegenerationLink } from '../support/regeneration';
import { buildAskRetryRequest } from './askRetry';
import { createAskExecution } from './createAskExecution';
import { getAskExecution } from './askSessions';

const codedError = (code: string, message: string) => Object.assign(new Error(message), { code });

/**
 * BICC-CTX-006: asks the same settled read question again as a NEW execution linked to the original. The original is never modified, both results stay
 * (each with its own feedback), and a write or confirmation is never repeated: only a plain read answer is regenerable (support/regeneration.ts). The
 * same clientRequestId delivered twice returns the same attempt, because createAskExecution is idempotent on it.
 */
export async function regenerateAskExecution(
  userId: string,
  executionId: string,
  input: RegenerateAskExecution,
  accountRole?: AskAccountRole,
  options: { signal?: AbortSignal } = {},
): Promise<AskExecutionResponse> {
  const source = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!source || source.parentExecutionId) throw codedError('ASK_EXECUTION_NOT_FOUND', 'Ask execution not found.');
  const current = mapPersistedExecution(source, await propertySummary(source.propertyId));
  if (!current.correctionCapabilities.regenerate) throw codedError('ASK_EXECUTION_NOT_REGENERABLE', 'This answer cannot be regenerated. Ask the question again to get a fresh answer.');

  // The same request rules as a retry: the operation resolved on the source is pinned, and every authorization, entity and freshness check runs again.
  const created = await createAskExecution(userId, buildAskRetryRequest(source, { clientRequestId: input.clientRequestId }), accountRole, { signal: options.signal });
  if (created.executionId !== source.id) {
    const row = await prisma.askExecution.findUnique({ where: { id: created.executionId }, select: { id: true, parametersJson: true } });
    if (row && !regenerationSourceOf(row.parametersJson)) {
      await prisma.askExecution.update({ where: { id: row.id }, data: { parametersJson: asInputJson(withRegenerationLink(row.parametersJson, source.id)) } });
      await prisma.askExecutionEvent.create({ data: { executionId: row.id, eventType: 'REGENERATION_ATTEMPT', metadataJson: asInputJson({ ofExecutionId: source.id }) } });
      await prisma.askExecutionEvent.create({ data: { executionId: source.id, eventType: 'REGENERATED', metadataJson: asInputJson({ newExecutionId: row.id }) } });
    }
  }
  return getAskExecution(userId, created.executionId);
}
