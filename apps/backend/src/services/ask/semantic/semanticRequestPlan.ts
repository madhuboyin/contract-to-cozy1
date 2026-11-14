import { z } from 'zod';

export const ASK_SEMANTIC_PLAN_VERSION = '1.0.0' as const;

const SpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string(),
}).strict().refine((span) => span.end >= span.start, 'span end must not precede start');

const RankedCandidateSchema = z.object({
  id: z.string().min(1),
  score: z.number().min(0).max(1),
}).strict();

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
  where: z.unknown().nullable(),
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
}).strict();

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
]);

export type SemanticRequestPlan = z.infer<typeof SemanticRequestPlanSchema>;
export type SemanticFacet = z.infer<typeof SemanticFacetSchema>;
export type SemanticSourceSpan = z.infer<typeof SpanSchema>;
