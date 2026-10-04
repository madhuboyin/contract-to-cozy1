// Plan §4.1: resolves a selected Suggested Next Action against the server's own record of what it offered, so a client
// can never prove app authorship by echoing an operationId. The source execution's persisted result JSON is the offered-
// action ledger; the stored message, operation, entity context, outcome key and provenance are authoritative.
import { prisma } from '../../../lib/prisma';
import type { SuggestedNextAction, SuggestedNextActionSelection } from '../../../productFramework/ask/ask.contract';
import {
  effectiveSuggestedActionExpiryMs,
  isRegisteredSuggestedActionOperation,
  readStoredSuggestedNextActions,
} from './suggestedNextAction.contract';
import { systemSuggestedNextActionClock, type SuggestedNextActionClock } from './suggestedNextActionClock';
import { verifyStarterToken, type StarterTokenRejection } from './suggestedNextActionSigner';

export type SuggestedActionRejectionReason =
  | 'SOURCE_NOT_FOUND' | 'SOURCE_EXPIRED' | 'PROPERTY_MISMATCH' | 'ACTION_NOT_OFFERED' | 'ACTION_EXPIRED'
  | 'OPERATION_UNREGISTERED' | 'MESSAGE_MISMATCH' | `STARTER_${StarterTokenRejection}`;

export type SuggestedActionResolution =
  | { kind: 'VERIFIED'; source: 'EXECUTION'; action: SuggestedNextAction; sourceExecutionId: string }
  /**
   * The starter token verified, but no landing-starter registry exists yet (Phase 4), so there is no server-declared starter to
   * dispatch. The caller treats the turn as ordinary homeowner text: no app-authored deterministic-dispatch attribution.
   */
  | { kind: 'STARTER_PROOF_VERIFIED'; starterActionId: string; starterRegistryId: string }
  | { kind: 'REJECTED'; reason: SuggestedActionRejectionReason };

export interface ResolveSuggestedActionInput {
  userId: string;
  sessionId: string;
  /** The request's effective property scope (null for a property-less turn). */
  propertyId: string | null;
  clientRequestId: string;
  selection: SuggestedNextActionSelection;
  clock?: SuggestedNextActionClock;
  env?: Readonly<Record<string, string | undefined>>;
}

export async function resolveSuggestedActionSelection(input: ResolveSuggestedActionInput): Promise<SuggestedActionResolution> {
  const now = (input.clock ?? systemSuggestedNextActionClock).now();
  const { selection } = input;

  if (selection.signedStarterToken) {
    const verified = verifyStarterToken(selection.signedStarterToken, {
      userId: input.userId, sessionId: input.sessionId, propertyId: input.propertyId,
      clientRequestId: input.clientRequestId, actionId: selection.suggestedActionId, now,
    }, input.env);
    if (!verified.ok) return { kind: 'REJECTED', reason: `STARTER_${verified.reason}` };
    return { kind: 'STARTER_PROOF_VERIFIED', starterActionId: verified.claims.aid, starterRegistryId: verified.claims.stid };
  }

  const sourceExecutionId = selection.suggestedActionFromExecutionId;
  if (!sourceExecutionId) return { kind: 'REJECTED', reason: 'SOURCE_NOT_FOUND' };
  // By user AND session: another user's or another session's execution is indistinguishable from a purged one.
  const source = await prisma.askExecution.findFirst({
    where: { id: sourceExecutionId, userId: input.userId, sessionId: input.sessionId },
    select: { id: true, propertyId: true, expiresAt: true, resultJson: true },
  });
  if (!source) return { kind: 'REJECTED', reason: 'SOURCE_NOT_FOUND' };
  if (source.expiresAt && source.expiresAt.getTime() <= now.getTime()) return { kind: 'REJECTED', reason: 'SOURCE_EXPIRED' };

  const action = readStoredSuggestedNextActions(source.resultJson).find((candidate) => candidate.id === selection.suggestedActionId);
  if (!action) return { kind: 'REJECTED', reason: 'ACTION_NOT_OFFERED' };
  if (!isRegisteredSuggestedActionOperation(action.operationId)) return { kind: 'REJECTED', reason: 'OPERATION_UNREGISTERED' };
  if (effectiveSuggestedActionExpiryMs(action, source.expiresAt) <= now.getTime()) return { kind: 'REJECTED', reason: 'ACTION_EXPIRED' };
  // Property scope: the offered action, its source execution, and the request must all agree.
  if (action.entityContext.propertyId !== source.propertyId || input.propertyId !== source.propertyId) return { kind: 'REJECTED', reason: 'PROPERTY_MISMATCH' };
  // The submitted message exists for request-schema compatibility only; the stored message is authoritative.
  if (selection.message !== action.message) return { kind: 'REJECTED', reason: 'MESSAGE_MISMATCH' };

  return { kind: 'VERIFIED', source: 'EXECUTION', action, sourceExecutionId: source.id };
}
