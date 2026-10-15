// Presentation Quality 2D: the inputs and issue codes of the pure presentation-quality evaluator. Nothing here is persisted or
// sent to a client; a profile is declared by a fixture or test, not stored on the response (FRD §4.2 of the implementation plan).
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';

export const ASK_PRESENTATION_PROFILES = ['DIRECT_ANSWER', 'COLLECTION', 'ATTENTION', 'COMPARE', 'GUIDE'] as const;
export type AskPresentationProfile = typeof ASK_PRESENTATION_PROFILES[number];

export const PRESENTATION_QUALITY_ISSUE_CODES = [
  // every profile
  'FIRST_BLOCK_NOT_ANSWER',
  'MULTIPLE_PRIMARY_ACTIONS',
  'COLLECTION_DESCRIPTOR_CONTRADICTION',
  'SECTION_COUNT_BELOW_DELIVERED',
  'NEXT_PAGE_WITHOUT_CONTINUATION',
  'TABLE_TOTAL_BELOW_ROWS',
  'UNKNOWN_PRESENTED_AS_GOOD',
  // COLLECTION
  'COLLECTION_BLOCK_MISSING',
  // ATTENTION
  'ATTENTION_ITEM_WITHOUT_REASON',
  // COMPARE
  'COMPARISON_BLOCK_MISSING',
  'MATERIAL_COMPARISON_WITHOUT_BASIS',
  'MATERIAL_COMPARISON_WITHOUT_ASSUMPTIONS_OR_LIMITS',
  // GUIDE
  'GUIDE_WITHOUT_PROGRESS_SOURCE',
] as const;
export type PresentationQualityIssueCode = typeof PRESENTATION_QUALITY_ISSUE_CODES[number];

export interface PresentationQualityIssue {
  code: PresentationQualityIssueCode;
  blockId?: string;
  detail: string;
}

export interface PresentationQualityInput {
  profile: AskPresentationProfile;
  result: {
    blocks: readonly AskPresentationBlock[];
    parameters?: Record<string, unknown> | null;
  };
  /**
   * Explicit exceptions the FRD allows to a single primary action: a confirmation, a balanced choice between equal alternatives,
   * or an emergency. A fixture must say so; the evaluator never infers it.
   */
  allowMultiplePrimaryActions?: boolean;
  /**
   * Ids of list blocks that are themselves the comparison (a "ways to pay" list rather than a COMPARISON or TABLE block). Declared by
   * the fixture, never inferred, so a COMPARE result still has to name what is being compared.
   */
  comparisonBlockIds?: readonly string[];
  /** Stricter checks apply to a declared material decision (default for COMPARE); a simple low-risk answer is never failed for lacking evidence. */
  material?: boolean;
}
