// Plan §7.3: result-card and block actions publish the same semantic identity fields to response finalization even though they
// stay rendered in their richer surface. They never become follow-up candidates; their identities only suppress an equivalent
// compact action before the response is persisted.
//
// Only a rich item action that declares a registered `outcomeKey` publishes an identity: without it the semantic key cannot be
// formed, and the plan forbids inferring an outcome from label or message.
import { suggestedNextActionSemanticKey } from './suggestedNextActionIdentity';
import { isRegisteredOutcome } from './suggestedNextActionRegistry';
import { SUGGESTED_NEXT_ACTION_INTERACTION_TYPES } from '../../../productFramework/ask/ask.contract';

type Json = unknown;

const COMPACT_INTERACTIONS = new Set<string>(SUGGESTED_NEXT_ACTION_INTERACTION_TYPES);
const MAX_DEPTH = 6;
const MAX_NODES = 2000;

/**
 * A structured action rendered in the answer is already the contextual next-action surface for that result. The finalizer uses this
 * signal to avoid padding the composer with unrelated curated starters. This deliberately reads only declared action metadata; labels,
 * messages and block types are never used to infer intent.
 */
export function hasContextualPresentationActions(blocks: readonly Json[]): boolean {
  let found = false;
  let visited = 0;
  const walk = (node: Json, depth: number): void => {
    if (found || depth > MAX_DEPTH || visited >= MAX_NODES || !node || typeof node !== 'object') return;
    visited += 1;
    if (Array.isArray(node)) { for (const entry of node) walk(entry, depth + 1); return; }
    const record = node as Record<string, Json>;
    if (Array.isArray(record.actions) && record.actions.some((action) => {
      const candidate = action as Record<string, Json> | null;
      return Boolean(candidate
        && typeof candidate.operationId === 'string'
        && typeof candidate.interactionType === 'string'
        && COMPACT_INTERACTIONS.has(candidate.interactionType));
    })) {
      found = true;
      return;
    }
    for (const value of Object.values(record)) walk(value, depth + 1);
  };
  walk(blocks, 0);
  return found;
}

export function collectPresentationIdentities(blocks: readonly Json[], propertyId: string | null): Set<string> {
  const identities = new Set<string>();
  let visited = 0;
  const walk = (node: Json, depth: number): void => {
    if (depth > MAX_DEPTH || visited >= MAX_NODES || !node || typeof node !== 'object') return;
    visited += 1;
    if (Array.isArray(node)) { for (const entry of node) walk(entry, depth + 1); return; }
    const record = node as Record<string, Json>;
    const parentEntityType = typeof record.entityType === 'string' ? record.entityType : null;
    const parentEntityId = typeof record.id === 'string' ? record.id : null;
    if (Array.isArray(record.actions)) {
      for (const action of record.actions) {
        const a = action as Record<string, Json> | null;
        if (!a || typeof a.operationId !== 'string' || typeof a.outcomeKey !== 'string' || typeof a.interactionType !== 'string') continue;
        if (!COMPACT_INTERACTIONS.has(a.interactionType) || !isRegisteredOutcome(a.operationId, a.outcomeKey)) continue;
        // Item actions inherit their enclosing entity. Response-level actions
        // are intentionally entity-less unless they explicitly own a complete
        // entity pair. Never infer scope from labels, messages, or action ids.
        const actionEntityType = typeof a.entityType === 'string' ? a.entityType : null;
        const actionEntityId = typeof a.entityId === 'string' ? a.entityId : null;
        const hasActionEntity = Boolean(actionEntityType && actionEntityId);
        const hasParentEntity = Boolean(parentEntityType && parentEntityId);
        const entityType = hasActionEntity ? actionEntityType : hasParentEntity ? parentEntityType : null;
        const entityId = hasActionEntity ? actionEntityId : hasParentEntity ? parentEntityId : null;
        identities.add(suggestedNextActionSemanticKey({
          operationId: a.operationId, interactionType: a.interactionType as 'CONVERSATION_CONTINUE' | 'MUTATE_RECORD' | 'START_WORKFLOW',
          propertyId, entityType, entityId, outcomeKey: a.outcomeKey,
        }));
      }
    }
    for (const value of Object.values(record)) walk(value, depth + 1);
  };
  walk(blocks, 0);
  return identities;
}
