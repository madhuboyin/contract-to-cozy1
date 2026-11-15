import type { AskOperationResult } from '../askOperationRegistry';
import { SemanticReadReceiptSchema, type SemanticReadReceipt } from './semanticExecutionReceipt';

export interface SemanticReceiptEntailmentVerdict {
  readonly outcome: 'PASS' | 'FAIL';
  readonly reasonCodes: readonly string[];
  readonly receipt: SemanticReadReceipt | null;
}

/** Structural FR-ANS-2 checks; no text similarity or source scanning. */
export function verifySemanticReadReceiptEntailment(result: AskOperationResult): SemanticReceiptEntailmentVerdict {
  const parsed = SemanticReadReceiptSchema.safeParse((result.parameters as { semanticExecutionReceipt?: unknown } | undefined)?.semanticExecutionReceipt);
  const fail = (code: string): SemanticReceiptEntailmentVerdict => ({ outcome: 'FAIL', reasonCodes: ['SEMANTIC_RECEIPT_NOT_ENTAILED', code], receipt: parsed.success ? parsed.data : null });
  if (!parsed.success) return fail('RECEIPT_SCHEMA_INVALID');
  const receipt = parsed.data;
  const variant = result.blocks.find((block) => block.id === receipt.answerVariantId);
  if (!variant || variant.type !== 'SUMMARY') return fail('ANSWER_VARIANT_MISSING');
  if (receipt.population.totalMatchCount !== receipt.population.confirmedCount) return fail('CONFIRMED_POPULATION_MISMATCH');
  if (new Set(receipt.resolvedRecordIds).size !== receipt.resolvedRecordIds.length) return fail('DUPLICATE_RESOLVED_RECORD');
  if (receipt.resolvedRecordIds.length > receipt.population.totalMatchCount) return fail('RESOLVED_RECORD_COUNT_EXCEEDS_POPULATION');
  if ((receipt.projection === 'LIST' || receipt.projection === 'DETAIL') && receipt.resolvedRecordIds.length < receipt.population.displayedCount) {
    return fail('RESOLVED_RECORD_COUNT_MISMATCH');
  }
  if ((receipt.projection === 'COUNT' || receipt.projection === 'AGGREGATE') && receipt.resolvedRecordIds.length > 0 && receipt.resolvedRecordIds.length !== receipt.population.totalMatchCount) {
    return fail('RESOLVED_RECORD_COUNT_MISMATCH');
  }
  if (receipt.population.displayedCount > receipt.population.totalMatchCount) return fail('DISPLAYED_COUNT_EXCEEDS_POPULATION');
  if (receipt.population.truncated !== (receipt.population.displayedCount < receipt.population.totalMatchCount)) return fail('TRUNCATION_FLAG_MISMATCH');
  if (receipt.projection === 'COUNT') {
    const summary = `${String((variant as { title?: unknown }).title ?? '')} ${String((variant as { body?: unknown }).body ?? '')}`;
    if (!new RegExp(`\\b${receipt.population.confirmedCount}\\b`).test(summary)) return fail('COUNT_NOT_RENDERED');
  }
  if ((receipt.projection === 'LIST' || receipt.projection === 'DETAIL') && receipt.population.confirmedCount > 0 && receipt.population.displayedCount === 0) {
    return fail('NON_EMPTY_POPULATION_NOT_DISPLAYED');
  }
  return { outcome: 'PASS', reasonCodes: ['SEMANTIC_RECEIPT_ENTAILED'], receipt };
}
