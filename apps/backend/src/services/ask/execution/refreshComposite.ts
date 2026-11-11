// Composition FRD FR-REF: refreshing a composed parent. Kept out of executeOperation (which createAskExecution imports) so the two do not import each other.
import { prisma } from '../../../lib/prisma';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { buildAuthorizationView } from '../composition/authorizationView';
import { exhaustedComponentKeys, hasRetryRequest, recoverComposedTurn, refreshComposedTurn, retryExhaustedComposedTurn } from '../composition/runComposedTurn';
import { createAskExecution } from './createAskExecution';
import { gateComposedExecution } from './askSessions';
import { mapPersistedExecution, propertySummary } from '../askHandlerSupport';
import type { AskExecution } from '@prisma/client';
import type { AskAccountRole } from '../askAccountEligibility';
import type { AskExecutionResponse } from '../../../productFramework/ask/ask.contract';

export const isStoredComposite = (execution: Pick<AskExecution, 'assemblyVersion' | 'parentExecutionId'>): boolean => execution.assemblyVersion != null && !execution.parentExecutionId;

export async function refreshStoredComposite(userId: string, execution: AskExecution): Promise<AskExecutionResponse> {
  const controls = readAskOperationalControls();
  const propertyId = execution.propertyId!;
  const refreshed = await refreshComposedTurn({
    db: prisma as never, userId, parent: execution, message: execution.message, sessionId: execution.sessionId, propertyId,
    createChild: createAskExecution, executionTimeoutMs: controls.executionTimeoutMs,
    loadAuthorizationView: () => buildAuthorizationView(userId, propertyId, controls),
  });
  return mapPersistedExecution(refreshed, await propertySummary(propertyId));
}

/** A manual retry of an interrupted composed parent continues the SAME parent (attempt set kept), so it is one answer, not a second composite. */
export async function recoverStoredComposite(userId: string, execution: AskExecution, accountRole?: AskAccountRole): Promise<AskExecutionResponse> {
  const controls = readAskOperationalControls();
  const propertyId = execution.propertyId!;
  const recovered = await recoverComposedTurn({
    db: prisma as never, userId, accountRole, parent: execution, message: execution.message, sessionId: execution.sessionId, propertyId,
    createChild: createAskExecution, executionTimeoutMs: controls.executionTimeoutMs,
    loadAuthorizationView: () => buildAuthorizationView(userId, propertyId, controls),
  });
  return mapPersistedExecution(recovered, await propertySummary(propertyId));
}

/** True when a stored composite has a selected component that exhausted its automatic retry: the homeowner may retry it manually (FR-PER-16). */
export const hasExhaustedComponent = (execution: AskExecution): boolean => isStoredComposite(execution) && exhaustedComponentKeys(execution).length > 0;

/** Manual retry of exhausted components on the SAME parent. Returns null when the family is too near expiration: the caller says "ask again". */
export async function retryStoredCompositeComponents(userId: string, execution: AskExecution, accountRole: AskAccountRole | undefined, requestKey: string): Promise<AskExecutionResponse | null> {
  const controls = readAskOperationalControls();
  const propertyId = execution.propertyId!;
  const retried = await retryExhaustedComposedTurn({
    db: prisma as never, userId, accountRole, requestKey, parent: execution, message: execution.message, sessionId: execution.sessionId, propertyId,
    createChild: createAskExecution, executionTimeoutMs: controls.executionTimeoutMs,
    loadAuthorizationView: () => buildAuthorizationView(userId, propertyId, controls),
  });
  return retried === 'TOO_NEAR_EXPIRATION' ? null : mapPersistedExecution(retried, await propertySummary(propertyId));
}

export const hasStoredRetryRequest = (execution: AskExecution, requestKey: string): boolean => isStoredComposite(execution) && hasRetryRequest(execution, requestKey);

/** The parent as it stands now (re-read, then gated like any delivery), for a duplicate retry delivery. */
export async function currentStoredComposite(userId: string, execution: AskExecution): Promise<AskExecutionResponse> {
  const row = (await prisma.askExecution.findUnique({ where: { id: execution.id } })) ?? execution;
  const delivered = await gateComposedExecution(userId, row);
  if (!delivered) throw Object.assign(new Error('Ask execution not found.'), { code: 'ASK_EXECUTION_NOT_FOUND' });
  return mapPersistedExecution(delivered, await propertySummary(row.propertyId));
}
