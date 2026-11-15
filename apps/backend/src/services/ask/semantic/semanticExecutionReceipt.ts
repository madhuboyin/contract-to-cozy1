import { z } from 'zod';
import { ASK_SEMANTIC_PLAN_VERSION } from './semanticRequestPlan';

export const ASK_SEMANTIC_RECEIPT_VERSION = '1.0.0' as const;

export const SemanticReadReceiptSchema = z.object({
  schemaVersion: z.literal(ASK_SEMANTIC_RECEIPT_VERSION),
  planVersion: z.literal(ASK_SEMANTIC_PLAN_VERSION),
  facetId: z.string().min(1),
  requestClass: z.enum(['DATA_QUERY', 'CAPABILITY']),
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

export interface BuildSemanticReadReceiptInput {
  readonly facetId: string;
  readonly requestClass?: 'DATA_QUERY' | 'CAPABILITY';
  readonly entityId: string;
  readonly operationAdapter?: string;
  readonly projection: SemanticReadReceipt['projection'];
  readonly predicateIds: readonly string[];
  readonly resolvedRecordIds: readonly string[];
  readonly confirmedCount?: number;
  readonly conflictedCount?: number;
  readonly unknownCount?: number;
  readonly displayedCount: number;
  readonly propertyId: string;
  readonly role: string;
  readonly sourceType: string;
  readonly observedAt?: string;
  readonly answerVariantId: string;
}

/**
 * FR-ANS-1 / §18 Phase 1: Standardized minimal read receipt builder with
 * schema validation at construction time.
 */
export function buildSemanticReadReceipt(input: BuildSemanticReadReceiptInput): SemanticReadReceipt {
  const uniqueRecordIds = [...new Set(input.resolvedRecordIds.filter(Boolean))];
  const confirmedCount = input.confirmedCount ?? uniqueRecordIds.length;
  const displayedCount = Math.min(input.displayedCount, confirmedCount);
  return SemanticReadReceiptSchema.parse({
    schemaVersion: ASK_SEMANTIC_RECEIPT_VERSION,
    planVersion: ASK_SEMANTIC_PLAN_VERSION,
    facetId: input.facetId,
    requestClass: input.requestClass ?? 'DATA_QUERY',
    target: {
      entityId: input.entityId,
      operationAdapter: input.operationAdapter ?? 'data-point-read.read',
    },
    projection: input.projection,
    predicateIds: input.predicateIds.length > 0 ? [...input.predicateIds] : [`predicate.${input.entityId}.read`],
    resolvedRecordIds: uniqueRecordIds,
    population: {
      confirmedCount,
      conflictedCount: input.conflictedCount ?? 0,
      unknownCount: input.unknownCount ?? 0,
      totalMatchCount: confirmedCount,
      displayedCount,
      truncated: displayedCount < confirmedCount,
    },
    authorization: {
      propertyId: input.propertyId,
      role: input.role,
      decision: 'ALLOWED',
    },
    provenance: {
      sourceType: input.sourceType,
      observedAt: input.observedAt ?? new Date().toISOString(),
    },
    answerVariantId: input.answerVariantId,
  });
}
