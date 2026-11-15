import { z } from 'zod';
import { findSemanticPredicateRegistration, findSemanticRelationConstraintRegistration } from './semanticRelationRegistry';

export const ASK_SEMANTIC_PLAN_VERSION = '1.3.0' as const;

const SpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string(),
}).strict().refine((span) => span.end >= span.start, 'span end must not precede start');

const RankedCandidateSchema = z.object({
  id: z.string().min(1),
  score: z.number().min(0).max(1),
}).strict();

export type SemanticWhereExpression =
  | { kind: 'PREDICATE'; predicateId: string; relationPathId: string }
  | { kind: 'AND' | 'OR'; operands: SemanticWhereExpression[] }
  | { kind: 'NOT'; operand: SemanticWhereExpression };

const RegisteredPredicateExpressionSchema = z.object({
  kind: z.literal('PREDICATE'),
  predicateId: z.string().min(1),
  relationPathId: z.string().min(1),
}).strict().superRefine((predicate, context) => {
  if (!findSemanticPredicateRegistration(predicate.predicateId, predicate.relationPathId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'predicate and relation path must be registered together' });
  }
});

export const SemanticWhereExpressionSchema: z.ZodType<SemanticWhereExpression> = z.lazy(() => z.union([
  RegisteredPredicateExpressionSchema,
  z.object({
    kind: z.literal('AND'),
    operands: z.array(SemanticWhereExpressionSchema).min(2).max(20),
  }).strict(),
  z.object({
    kind: z.literal('OR'),
    operands: z.array(SemanticWhereExpressionSchema).min(2).max(20),
  }).strict(),
  z.object({
    kind: z.literal('NOT'),
    operand: SemanticWhereExpressionSchema,
  }).strict(),
]));

function collectPredicateExpressions(expression: SemanticWhereExpression | null): Extract<SemanticWhereExpression, { kind: 'PREDICATE' }>[] {
  if (!expression) return [];
  if (expression.kind === 'PREDICATE') return [expression];
  if (expression.kind === 'NOT') return collectPredicateExpressions(expression.operand);
  return expression.operands.flatMap(collectPredicateExpressions);
}

export const SemanticFacetSchema = z.object({
  id: z.string().min(1),
  sourceSpan: SpanSchema,
  requestClass: z.enum(['DATA_QUERY', 'CAPABILITY', 'COMMAND']),
  domainCandidates: z.array(RankedCandidateSchema).min(1),
  subject: z.object({
    entityId: z.string().min(1),
    recordId: z.string().min(1).nullable(),
  }).strict().nullable(),
  relations: z.array(z.object({
    semanticRelationId: z.string().min(1),
    predicateId: z.string().min(1),
    targetEntityId: z.string().min(1),
  }).strict()),
  polarity: z.enum(['POSITIVE', 'NEGATIVE', 'UNKNOWN']).nullable(),
  projection: z.enum(['EXISTS', 'COUNT', 'LIST', 'DETAIL', 'AGGREGATE', 'COMPARE', 'TIMELINE', 'ANALYSIS']),
  fields: z.array(z.object({ fieldId: z.string().min(1) }).strict()),
  where: SemanticWhereExpressionSchema.nullable(),
  sort: z.array(z.object({ fieldId: z.string().min(1), direction: z.enum(['ASC', 'DESC']) }).strict()),
  limit: z.number().int().positive().nullable(),
  time: z.unknown().nullable(),
  groupBy: z.array(z.object({ fieldId: z.string().min(1) }).strict()),
  targetCandidates: z.array(RankedCandidateSchema),
  requiredSlots: z.array(z.object({ slotId: z.string().min(1), state: z.enum(['RESOLVED', 'UNRESOLVED']) }).strict()),
  dependsOn: z.array(z.string().min(1)),
  evidence: z.object({
    jobMatch: z.string(),
    subjectNamed: z.boolean(),
    relationNamed: z.boolean(),
    projectionNamed: z.boolean(),
    polarityNamed: z.boolean(),
  }).strict(),
  confidenceSignals: z.object({
    grammarComplete: z.boolean(),
    unresolvedSpanCount: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((facet, context) => {
  const registeredRelations = facet.relations.map((relation, index) => {
    const registration = findSemanticRelationConstraintRegistration(relation.semanticRelationId, relation.predicateId);
    if (!registration) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['relations', index], message: 'relation and predicate must be registered together' });
      return null;
    }
    if (facet.subject?.entityId !== registration.sourceEntityId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['subject', 'entityId'], message: 'relation source must match the facet subject' });
    }
    if (relation.targetEntityId !== registration.targetEntityId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['relations', index, 'targetEntityId'], message: 'relation target must match the registry' });
    }
    return registration;
  });

  if (facet.requestClass !== 'DATA_QUERY') return;
  const wherePredicates = collectPredicateExpressions(facet.where);
  for (const [index, predicate] of wherePredicates.entries()) {
    const registration = findSemanticPredicateRegistration(predicate.predicateId, predicate.relationPathId);
    const declared = registration && facet.relations.some((relation) => relation.semanticRelationId === registration.semanticRelationId
      && relation.predicateId === predicate.predicateId);
    if (!declared) context.addIssue({ code: z.ZodIssueCode.custom, path: ['where', index], message: 'where predicate must have a matching declared relation' });
  }
  for (const [index, relation] of facet.relations.entries()) {
    const registration = registeredRelations[index];
    const constrained = registration && wherePredicates.some((predicate) => predicate.predicateId === relation.predicateId
      && predicate.relationPathId === registration.relationPathId);
    if (!constrained) context.addIssue({ code: z.ZodIssueCode.custom, path: ['relations', index], message: 'data-query relation must have a matching where predicate' });
  }
});

const PlanBaseSchema = z.object({
  schemaVersion: z.literal(ASK_SEMANTIC_PLAN_VERSION),
  producer: z.object({ kind: z.enum(['DETERMINISTIC', 'PROVIDER']), version: z.string().min(1) }).strict(),
  rawText: z.string(),
  normalizedText: z.string(),
  minimizedText: z.string(),
  unresolvedSpans: z.array(SpanSchema),
}).strict();

export const SemanticRequestPlanSchema = z.discriminatedUnion('outcome', [
  PlanBaseSchema.extend({ outcome: z.literal('MATCH'), facets: z.array(SemanticFacetSchema).min(1).max(6) }),
  PlanBaseSchema.extend({
    outcome: z.enum(['NONE_FITS', 'INSUFFICIENT_TEXT', 'BOUNDARY', 'SCHEMA_INVALID', 'PROVIDER_UNAVAILABLE']),
    facets: z.array(SemanticFacetSchema).max(0),
  }),
]).superRefine((plan, context) => {
  if (plan.outcome !== 'MATCH') return;
  const facetIds = new Set<string>();
  for (const [index, facet] of plan.facets.entries()) {
    if (facetIds.has(facet.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['facets', index, 'id'], message: 'facet ids must be unique' });
    facetIds.add(facet.id);
    if (new Set(facet.dependsOn).size !== facet.dependsOn.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['facets', index, 'dependsOn'], message: 'facet dependencies must be unique' });
    }
  }

  const dependencies = new Map(plan.facets.map((facet) => [facet.id, facet.dependsOn]));
  for (const [index, facet] of plan.facets.entries()) {
    for (const dependencyId of facet.dependsOn) {
      if (dependencyId === facet.id) context.addIssue({ code: z.ZodIssueCode.custom, path: ['facets', index, 'dependsOn'], message: 'facet cannot depend on itself' });
      else if (!dependencies.has(dependencyId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['facets', index, 'dependsOn'], message: 'facet dependency must reference this plan' });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (facetId: string): boolean => {
    if (visiting.has(facetId)) return true;
    if (visited.has(facetId)) return false;
    visiting.add(facetId);
    const cyclic = (dependencies.get(facetId) ?? []).some((dependencyId) => dependencies.has(dependencyId) && visit(dependencyId));
    visiting.delete(facetId);
    visited.add(facetId);
    return cyclic;
  };
  if (plan.facets.some((facet) => visit(facet.id))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['facets'], message: 'facet dependency graph must be acyclic' });
  }
});

export type SemanticRequestPlan = z.infer<typeof SemanticRequestPlanSchema>;
export type SemanticFacet = z.infer<typeof SemanticFacetSchema>;
export type SemanticSourceSpan = z.infer<typeof SpanSchema>;
