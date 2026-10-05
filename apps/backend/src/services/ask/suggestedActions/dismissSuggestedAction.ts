// Owner-approved dismissal control for Suggested Next Actions ("Not now" / "Not relevant"). The caller names an execution, one of the actions
// it offered and a reason; EVERYTHING else is resolved server-side from the stored offer: the operation, outcome and property come from the
// offered-action ledger, never from the client. Not wired into any surface yet (exact-four activates atomically at the end).
import { prisma } from '../../../lib/prisma';
import { ensurePropertyAccess } from '../support/propertyContext';
import { readStoredSuggestedNextActions } from './suggestedNextAction.contract';
import {
  dismissalReasonsFor, starterDismissalFingerprint, type DismissalReason,
} from './suggestedNextActionExactFourRegistry';
import { enforceDismissalCap, recordSuggestedActionDismissal } from './askSuggestedActionLifecycle.service';

export type DismissSuggestedActionErrorCode = 'EXECUTION_NOT_FOUND' | 'ACTION_NOT_OFFERED' | 'ACCESS_DENIED' | 'NOT_DISMISSIBLE' | 'REASON_NOT_ALLOWED' | 'WRITE_FAILED';

export class DismissSuggestedActionError extends Error {
  constructor(readonly code: DismissSuggestedActionErrorCode) { super(code); }
}

export interface DismissSuggestedActionInput { userId: string; executionId: string; actionId: string; reason: DismissalReason; now?: Date }
export interface DismissSuggestedActionDeps {
  loadExecution?: (userId: string, executionId: string) => Promise<{ propertyId: string | null; resultJson: unknown } | null>;
  hasPropertyAccess?: (userId: string, propertyId: string) => Promise<boolean>;
  record?: typeof recordSuggestedActionDismissal;
  enforceCap?: typeof enforceDismissalCap;
}

const defaultLoadExecution = (userId: string, executionId: string) =>
  prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { propertyId: true, resultJson: true } });
const defaultHasPropertyAccess = async (userId: string, propertyId: string) => {
  try { await ensurePropertyAccess(userId, propertyId); return true; } catch { return false; }
};

export async function dismissSuggestedAction(input: DismissSuggestedActionInput, deps: DismissSuggestedActionDeps = {}): Promise<{ liftedOlderDismissals: number }> {
  // By user: another user's execution is indistinguishable from a missing one.
  const execution = await (deps.loadExecution ?? defaultLoadExecution)(input.userId, input.executionId);
  if (!execution) throw new DismissSuggestedActionError('EXECUTION_NOT_FOUND');
  const action = readStoredSuggestedNextActions(execution.resultJson).find((candidate) => candidate.id === input.actionId);
  if (!action) throw new DismissSuggestedActionError('ACTION_NOT_OFFERED');
  // A dismissal is per property: the action's own property, which must still be one this user can access.
  const propertyId = action.entityContext.propertyId;
  if (!propertyId || propertyId !== execution.propertyId) throw new DismissSuggestedActionError('ACCESS_DENIED');
  if (!(await (deps.hasPropertyAccess ?? defaultHasPropertyAccess)(input.userId, propertyId))) throw new DismissSuggestedActionError('ACCESS_DENIED');

  const allowed = dismissalReasonsFor(action.operationId, action.outcomeKey);
  if (allowed.length === 0) throw new DismissSuggestedActionError('NOT_DISMISSIBLE');
  if (!allowed.includes(input.reason)) throw new DismissSuggestedActionError('REASON_NOT_ALLOWED');

  const now = input.now ?? new Date();
  const identity = { operationId: action.operationId, outcomeKey: action.outcomeKey, entityType: action.entityContext.entityType, entityId: action.entityContext.entityId };
  const ok = await (deps.record ?? recordSuggestedActionDismissal)({
    userId: input.userId, propertyId, identity, reason: input.reason, now,
    contextFingerprint: input.reason === 'NOT_RELEVANT' ? starterDismissalFingerprint(action.operationId, action.outcomeKey) : null,
  });
  if (!ok) throw new DismissSuggestedActionError('WRITE_FAILED');
  return { liftedOlderDismissals: await (deps.enforceCap ?? enforceDismissalCap)(input.userId, propertyId) };
}
