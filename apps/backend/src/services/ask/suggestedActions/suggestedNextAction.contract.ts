// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN §4 (Phase 1). Service-side companion to the structural schema in
// productFramework/ask/ask.contract.ts: registry membership, stored-ledger reads, and expiry rules live here so the
// contract module never imports from the services layer.
import {
  SuggestedNextActionSchema,
  SUGGESTED_NEXT_ACTIONS_MAX,
  type SuggestedNextAction,
} from '../../../productFramework/ask/ask.contract';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../askOperationRegistry';

export { SUGGESTED_NEXT_ACTIONS_MAX, SuggestedNextActionSchema, type SuggestedNextAction };

/** Bumped when the action shape, id derivation, or registered outcome vocabulary changes incompatibly. */
export const SUGGESTED_NEXT_ACTION_SCHEMA_VERSION = 'v1';
export const SUGGESTED_NEXT_ACTION_REGISTRY_VERSION = '1';

/** Plan §4: 30 minutes for a write/workflow action, 24 hours for a pure conversation continuation. */
export const SUGGESTED_NEXT_ACTION_DEFAULT_TTL_MS: Record<SuggestedNextAction['interactionType'], number> = {
  CONVERSATION_CONTINUE: 24 * 60 * 60 * 1000,
  MUTATE_RECORD: 30 * 60 * 1000,
  START_WORKFLOW: 30 * 60 * 1000,
};

export function isRegisteredSuggestedActionOperation(operationId: string): operationId is AskOperationId {
  return operationId in ASK_OPERATION_DEFINITIONS;
}

/**
 * The action's own `expiresAt`, capped at the source execution's fixed `expiresAt` (plan §4). An unparseable value
 * resolves to 0 (already expired) so a malformed ledger entry can never be selected.
 */
export function effectiveSuggestedActionExpiryMs(action: Pick<SuggestedNextAction, 'expiresAt'>, executionExpiresAt: Date | null): number {
  const actionExpiry = Date.parse(action.expiresAt);
  if (!Number.isFinite(actionExpiry)) return 0;
  return executionExpiresAt ? Math.min(actionExpiry, executionExpiresAt.getTime()) : actionExpiry;
}

/**
 * Reads the offered-action ledger from a persisted result. Historical results have no `suggestedNextActions`; an entry that
 * fails schema or registry validation is dropped (never trusted), so a corrupted row cannot yield a selectable action.
 */
export function readStoredSuggestedNextActions(resultJson: unknown): SuggestedNextAction[] {
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) return [];
  const raw = (resultJson as { suggestedNextActions?: unknown }).suggestedNextActions;
  if (!Array.isArray(raw)) return [];
  const actions: SuggestedNextAction[] = [];
  for (const entry of raw.slice(0, SUGGESTED_NEXT_ACTIONS_MAX)) {
    const parsed = SuggestedNextActionSchema.safeParse(entry);
    if (parsed.success && isRegisteredSuggestedActionOperation(parsed.data.operationId)) actions.push(parsed.data);
  }
  return actions;
}
