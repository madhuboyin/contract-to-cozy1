import { prisma } from '../../../lib/prisma';
import {
  CreateAskExecutionRequestSchema,
  type AskExecutionResponse,
  type AskExecutionStatus,
  type CreateAskExecutionRequest,
  type RetryAskExecution,
} from '../../../productFramework/ask/ask.contract';
import type { AskAccountRole } from '../askAccountEligibility';
import { asInputJson, compatibilityPresentationCanRetry, isCompatibilityPresentationFallback, mapPersistedExecution, propertySummary } from '../askHandlerSupport';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../askOperationRegistry';
import { createAskExecution } from './createAskExecution';

export function askExecutionCanRetry(status: AskExecutionStatus, reasonCode?: string | null): boolean {
  return status === 'FAILED_RETRYABLE'
    || (status === 'UNAVAILABLE' && reasonCode !== 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION');
}

export function buildAskRetryRequest(source: {
  id: string;
  sessionId: string;
  propertyId: string | null;
  message: string;
  operationId: string | null;
  launchContextJson: unknown;
}, input: RetryAskExecution): CreateAskExecutionRequest {
  const storedContext = source.launchContextJson && typeof source.launchContextJson === 'object' && !Array.isArray(source.launchContextJson)
    ? source.launchContextJson
    : {};
  return CreateAskExecutionRequestSchema.parse({
    clientRequestId: input.clientRequestId,
    sessionId: source.sessionId,
    message: source.message,
    propertyId: source.propertyId,
    launchContext: {
      ...storedContext,
      // The operation was resolved and governed on the source execution. Pin
      // that same operation for this retry while every normal authorization,
      // entity and freshness check still runs again in createAskExecution.
      ...(source.operationId ? { operationId: source.operationId } : {}),
    },
  });
}

export function hasRetryableCompatibilityFallback(
  source: Parameters<typeof mapPersistedExecution>[0],
  property: Parameters<typeof mapPersistedExecution>[1],
): boolean {
  const operationId = source.operationId && source.operationId in ASK_OPERATION_DEFINITIONS
    ? source.operationId as AskOperationId
    : null;
  if (!compatibilityPresentationCanRetry(source.status, operationId)) return false;
  return isCompatibilityPresentationFallback(mapPersistedExecution(source, property));
}

export async function retryAskExecution(
  userId: string,
  executionId: string,
  input: RetryAskExecution,
  accountRole?: AskAccountRole,
): Promise<AskExecutionResponse> {
  const source = await prisma.askExecution.findFirst({
    where: { id: executionId, userId },
  });
  if (!source) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const ordinaryRetry = askExecutionCanRetry(source.status, source.reasonCode);
  const compatibilityRetry = !ordinaryRetry
    && hasRetryableCompatibilityFallback(source, await propertySummary(source.propertyId));
  if (!ordinaryRetry && !compatibilityRetry) {
    const error = new Error('This response no longer needs a retry.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_RETRYABLE';
    throw error;
  }

  const retried = await createAskExecution(userId, buildAskRetryRequest(source, input), accountRole);
  const retriedRow = await prisma.askExecution.findUnique({ where: { id: retried.executionId }, select: { resultJson: true } });
  const resultJson = retriedRow?.resultJson && typeof retriedRow.resultJson === 'object' && !Array.isArray(retriedRow.resultJson)
    ? retriedRow.resultJson
    : {};
  await prisma.$transaction([
    prisma.askExecution.update({
      where: { id: retried.executionId },
      data: { resultJson: asInputJson({ ...resultJson, continuesExecutionId: source.id }) },
    }),
    prisma.askExecutionEvent.create({
      data: { executionId: source.id, eventType: 'RETRY_STARTED', metadataJson: asInputJson({ retryExecutionId: retried.executionId }) },
    }),
    prisma.askExecutionEvent.create({
      data: { executionId: retried.executionId, eventType: 'RETRY_OF_EXECUTION', metadataJson: asInputJson({ sourceExecutionId: source.id }) },
    }),
  ]);
  return {
    ...retried,
    continuesExecutionId: source.id,
  };
}
