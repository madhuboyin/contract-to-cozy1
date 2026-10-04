// Plan §5.2: semantic identity and deterministic action ids. Neither is derived from label, message, score, producer,
// timestamps, or array position, so an id is stable across a refresh of the same execution and across producer
// precedence changes, while any material target/outcome change yields a new id.
import { createHash } from 'node:crypto';
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import { SUGGESTED_NEXT_ACTION_SCHEMA_VERSION } from './suggestedNextAction.contract';

export interface SuggestedNextActionIdentityFields {
  operationId: string;
  interactionType: SuggestedNextAction['interactionType'];
  propertyId: string | null;
  entityType: string | null;
  entityId: string | null;
  outcomeKey: string;
}

function canonical(parts: ReadonlyArray<string | null>): string {
  // JSON-encode each part so a delimiter inside a value cannot collide two different tuples.
  return JSON.stringify(parts.map((part) => part ?? null));
}

/** Cross-surface dedup key (plan §5.2): operation + interaction + property + entity + outcome. */
export function suggestedNextActionSemanticKey(fields: SuggestedNextActionIdentityFields): string {
  return canonical([fields.operationId, fields.interactionType, fields.propertyId, fields.entityType, fields.entityId, fields.outcomeKey]);
}

function encode(serialized: string): string {
  return createHash('sha256').update(serialized).digest('base64url').slice(0, 32);
}

/** Answer-follow-up id: schema version + sourceExecutionId + the semantic fields. */
export function deriveSuggestedNextActionId(sourceExecutionId: string, fields: SuggestedNextActionIdentityFields): string {
  const serialized = canonical([SUGGESTED_NEXT_ACTION_SCHEMA_VERSION, sourceExecutionId, fields.operationId, fields.interactionType, fields.propertyId, fields.entityType, fields.entityId, fields.outcomeKey]);
  return `${SUGGESTED_NEXT_ACTION_SCHEMA_VERSION}.${encode(serialized)}`;
}

/**
 * Non-reversible form of the semantic key for telemetry/history: lets "this outcome was already completed" be recognised
 * across executions without persisting an entity id outside the ledger itself.
 */
export function suggestedNextActionSemanticKeyHash(fields: SuggestedNextActionIdentityFields): string {
  return createHash('sha256').update(suggestedNextActionSemanticKey(fields)).digest('base64url').slice(0, 22);
}
