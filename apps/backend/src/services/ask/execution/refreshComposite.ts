// Composition FRD FR-REF: refreshing a composed parent. Kept out of executeOperation (which createAskExecution imports) so the two do not import each other.
import { prisma } from '../../../lib/prisma';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { buildAuthorizationView } from '../composition/authorizationView';
import { recoverComposedTurn, refreshComposedTurn } from '../composition/runComposedTurn';
import { createAskExecution } from './createAskExecution';
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
