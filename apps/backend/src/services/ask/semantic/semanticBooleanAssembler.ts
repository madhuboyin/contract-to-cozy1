import { SemanticWhereExpressionSchema, type SemanticWhereExpression } from './semanticRequestPlan';

export const ASK_SEMANTIC_BOOLEAN_ASSEMBLER_VERSION = 'semantic-boolean-0.1.0' as const;

type PredicateExpression = Extract<SemanticWhereExpression, { kind: 'PREDICATE' }>;

export type SemanticCoordination = 'SINGLE' | 'AND' | 'EITHER_OR' | 'NEITHER_NOR' | 'AMBIGUOUS_NEGATIVE_OR';

export type SemanticBooleanAssembly =
  | { outcome: 'ASSEMBLED'; expression: SemanticWhereExpression }
  | { outcome: 'CLARIFY'; reasonCode: 'AMBIGUOUS_NEGATIVE_COORDINATION' }
  | { outcome: 'INVALID'; reasonCode: 'INVALID_PREDICATE' | 'INVALID_ARITY' | 'DUPLICATE_PREDICATE' };

/**
 * Builds a Boolean tree only after lexical/grammar analysis has assigned an
 * explicit coordination meaning. It never infers storage paths or chooses a
 * reading for ambiguous negative coordination.
 */
export function assembleSemanticBooleanExpression(input: {
  coordination: SemanticCoordination;
  predicates: readonly PredicateExpression[];
}): SemanticBooleanAssembly {
  const parsed = input.predicates.map((predicate) => SemanticWhereExpressionSchema.safeParse(predicate));
  if (parsed.some((result) => !result.success || result.data.kind !== 'PREDICATE')) {
    return { outcome: 'INVALID', reasonCode: 'INVALID_PREDICATE' };
  }
  const predicates = parsed.map((result) => result.data as PredicateExpression);
  const identities = predicates.map((predicate) => `${predicate.predicateId}:${predicate.relationPathId}`);
  if (new Set(identities).size !== identities.length) return { outcome: 'INVALID', reasonCode: 'DUPLICATE_PREDICATE' };

  if (input.coordination === 'AMBIGUOUS_NEGATIVE_OR') {
    return { outcome: 'CLARIFY', reasonCode: 'AMBIGUOUS_NEGATIVE_COORDINATION' };
  }
  if (input.coordination === 'SINGLE') {
    return predicates.length === 1
      ? { outcome: 'ASSEMBLED', expression: predicates[0] }
      : { outcome: 'INVALID', reasonCode: 'INVALID_ARITY' };
  }
  if (predicates.length < 2 || predicates.length > 20) return { outcome: 'INVALID', reasonCode: 'INVALID_ARITY' };
  if (input.coordination === 'AND') return { outcome: 'ASSEMBLED', expression: { kind: 'AND', operands: predicates } };
  if (input.coordination === 'EITHER_OR') return { outcome: 'ASSEMBLED', expression: { kind: 'OR', operands: predicates } };
  return {
    outcome: 'ASSEMBLED',
    expression: { kind: 'AND', operands: predicates.map((predicate) => ({ kind: 'NOT', operand: predicate })) },
  };
}
