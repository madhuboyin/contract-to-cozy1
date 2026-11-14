import { z } from 'zod';
import { ASK_SEMANTIC_PLAN_VERSION } from './semanticRequestPlan';

export const ASK_SEMANTIC_RECEIPT_VERSION = '1.0.0' as const;

export const SemanticReadReceiptSchema = z.object({
  schemaVersion: z.literal(ASK_SEMANTIC_RECEIPT_VERSION),
  planVersion: z.literal(ASK_SEMANTIC_PLAN_VERSION),
  facetId: z.string().min(1),
  requestClass: z.literal('DATA_QUERY'),
  target: z.object({ entityId: z.string().min(1), operationAdapter: z.string().min(1) }).strict(),
  projection: z.enum(['EXISTS', 'COUNT', 'LIST', 'DETAIL', 'AGGREGATE', 'COMPARE', 'TIMELINE']),
  predicateIds: z.array(z.string().min(1)).min(1),
  resolvedRecordIds: z.array(z.string().min(1)),
  population: z.object({
    confirmedCount: z.number().int().nonnegative(),
    conflictedCount: z.number().int().nonnegative(),
    unknownCount: z.number().int().nonnegative(),
    totalMatchCount: z.number().int().nonnegative(),
    displayedCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }).strict(),
  authorization: z.object({ propertyId: z.string().min(1), role: z.string().min(1), decision: z.literal('ALLOWED') }).strict(),
  provenance: z.object({ sourceType: z.string().min(1), observedAt: z.string().datetime() }).strict(),
  answerVariantId: z.string().min(1),
}).strict();

export type SemanticReadReceipt = z.infer<typeof SemanticReadReceiptSchema>;
