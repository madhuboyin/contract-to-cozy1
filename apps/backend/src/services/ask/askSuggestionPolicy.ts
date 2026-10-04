import type { AskOperationResult } from './askOperationRegistry';
import { normalizeAskMessage } from './askSemanticRouter';
import { suggestedNextActionSemanticKeyHash } from './suggestedActions/suggestedNextActionIdentity';

function suggestionKey(value: string): string {
  return normalizeAskMessage(value).normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function messageKeys(value: string): string[] {
  const whole = suggestionKey(value);
  const firstTurn = suggestionKey(value.split(/\n(?:clarification|context):/i, 1)[0] ?? value);
  return [...new Set([whole, firstTurn].filter(Boolean))];
}

/**
 * Follow-up suggestions must move the conversation forward. Suppress prompts
 * that duplicate the current request or a recently completed request in this
 * Ask session, and collapse duplicate suggestions emitted by an adapter.
 */
export function suppressRepeatedAskSuggestions(
  result: AskOperationResult,
  currentMessage: string,
  recentCompletedMessages: readonly string[] = [],
): AskOperationResult {
  if (!result.suggestions.length) return result;
  const excluded = new Set([currentMessage, ...recentCompletedMessages].flatMap(messageKeys));
  const emitted = new Set<string>();
  const suggestions = result.suggestions.filter((suggestion) => {
    const key = suggestionKey(suggestion);
    if (!key || excluded.has(key) || emitted.has(key)) return false;
    emitted.add(key);
    return true;
  });
  return suggestions.length === result.suggestions.length ? result : { ...result, suggestions };
}

/**
 * Typed counterpart of `suppressRepeatedAskSuggestions` (SUGGESTED_NEXT_ACTIONS plan §9 Phase 1): history is matched on the
 * registered semantic identity (operation + interaction + property + entity + outcome), never on label or message text.
 * The repeatable-outcome exception in plan §4.1 needs the per-operation outcome registry and lands with Phase 2.
 */
export function suppressRepeatedSuggestedNextActions(
  result: AskOperationResult,
  completedSemanticKeyHashes: ReadonlySet<string>,
): AskOperationResult {
  const actions = result.suggestedNextActions;
  if (!actions?.length || completedSemanticKeyHashes.size === 0) return result;
  const remaining = actions.filter((action) => !completedSemanticKeyHashes.has(suggestedNextActionSemanticKeyHash({
    operationId: action.operationId, interactionType: action.interactionType, propertyId: action.entityContext.propertyId,
    entityType: action.entityContext.entityType, entityId: action.entityContext.entityId, outcomeKey: action.outcomeKey,
  })));
  return remaining.length === actions.length ? result : { ...result, suggestedNextActions: remaining };
}
