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
  predicates: readonly SemanticWhereExpression[];
}): SemanticBooleanAssembly {
  const parsed = input.predicates.map((predicate) => SemanticWhereExpressionSchema.safeParse(predicate));
  if (parsed.some((result) => !result.success)) {
    return { outcome: 'INVALID', reasonCode: 'INVALID_PREDICATE' };
  }
  const expressions = parsed.map((result) => result.data as SemanticWhereExpression);
  const predicateAtoms = expressions.filter((expr): expr is PredicateExpression => expr.kind === 'PREDICATE');
  const identities = predicateAtoms.map(
    (predicate) => `${predicate.predicateId}:${predicate.relationPathId}:${predicate.targetRecordId ?? ''}:${(predicate.targetCategorySet ?? []).join(',')}:${predicate.enumStatus ?? ''}:${predicate.thresholdYears ?? ''}:${predicate.amountOverCents ?? ''}`
  );
  if (new Set(identities).size !== identities.length) return { outcome: 'INVALID', reasonCode: 'DUPLICATE_PREDICATE' };

  if (input.coordination === 'AMBIGUOUS_NEGATIVE_OR') {
    return { outcome: 'CLARIFY', reasonCode: 'AMBIGUOUS_NEGATIVE_COORDINATION' };
  }
  if (input.coordination === 'SINGLE') {
    return expressions.length === 1
      ? { outcome: 'ASSEMBLED', expression: expressions[0] }
      : { outcome: 'INVALID', reasonCode: 'INVALID_ARITY' };
  }
  if (expressions.length < 2 || expressions.length > 20) return { outcome: 'INVALID', reasonCode: 'INVALID_ARITY' };
  if (input.coordination === 'AND') return { outcome: 'ASSEMBLED', expression: { kind: 'AND', operands: expressions } };
  if (input.coordination === 'EITHER_OR') return { outcome: 'ASSEMBLED', expression: { kind: 'OR', operands: expressions } };
  return {
    outcome: 'ASSEMBLED',
    expression: {
      kind: 'AND',
      operands: expressions.map((expr) => (expr.kind === 'NOT' ? expr : { kind: 'NOT', operand: expr })),
    },
  };
}
