// BICC-CTX-006 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md §9): regeneration creates a NEW attempt linked to the original, keeps
// both results for audit, and never silently overwrites a prior answer or repeats a consequential write. Only a settled, plain READ answer can be
// regenerated: a write, a confirmation, a composed parent, a model-backed operation or a boundary never is.
import type { AskOperationId } from '../askOperationRegistry';
import { getAskOperationDefinition } from '../askOperationRegistry';
import { isWriteCapableOperation } from './writeCapability';

const SETTLED_ANSWER = new Set(['ANSWERED', 'READY_WITH_LIMITATIONS']);

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);

export function canRegenerate(input: { status: string; operationId: AskOperationId | null; parametersJson?: unknown }): boolean {
  if (!SETTLED_ANSWER.has(input.status) || !input.operationId) return false;
  // A composed parent has its own attempt, retry and refresh machinery (composition FRD); it is not regenerated here.
  if (record(record(input.parametersJson)?.composition)) return false;
  const definition = getAskOperationDefinition(input.operationId);
  if (definition.executionMode !== 'DETERMINISTIC' || definition.semantic.effect !== 'READ') return false;
  if (String(definition.safetyClass).endsWith('_BOUNDARY') || definition.safetyClass === 'MATERIAL_DECISION') return false;
  return !isWriteCapableOperation(input.operationId);
}

export function regenerationSourceOf(parametersJson: unknown): string | null {
  const source = record(record(parametersJson)?.regeneration)?.ofExecutionId;
  return typeof source === 'string' && source ? source : null;
}

/** The parameters of a regeneration attempt: the link to the original, merged without disturbing any other stored parameter. */
export function withRegenerationLink(parametersJson: unknown, ofExecutionId: string): Record<string, unknown> {
  return { ...(record(parametersJson) ?? {}), regeneration: { ofExecutionId } };
}
