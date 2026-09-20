import type { AskPresentationBlock } from './types';

export type TablePresentationPreference = 'AUTO' | 'TABLE' | 'CARDS';
export type TablePresentationMode = 'RESPONSIVE' | 'TABLE' | 'CARDS';
type TableBlock = Extract<AskPresentationBlock, { type: 'TABLE' }>;
type ComparisonBlock = Extract<AskPresentationBlock, { type: 'COMPARISON' }>;
type GroupedListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

export type AdaptiveTableDecision = {
  mode: TablePresentationMode;
  offersChoice: boolean;
  reason: 'USER_CHOICE' | 'SINGLE_RECORD' | 'INSUFFICIENT_COMPARISON_DIMENSIONS' | 'RESPONSIVE_DEFAULT';
};

/**
 * A bounded, deterministic resolver for the first adaptive-presentation slice.
 * The server still owns the semantic TABLE declaration; the client only chooses
 * between registered, lossless table and labeled-card renderers.
 */
export function resolveAdaptiveTablePresentation(block: TableBlock, preference: TablePresentationPreference): AdaptiveTableDecision {
  if (block.rows.length <= 1) return { mode: 'CARDS', offersChoice: false, reason: 'SINGLE_RECORD' };
  if (block.columns.length <= 1) return { mode: 'CARDS', offersChoice: false, reason: 'INSUFFICIENT_COMPARISON_DIMENSIONS' };
  if (preference === 'TABLE') return { mode: 'TABLE', offersChoice: true, reason: 'USER_CHOICE' };
  if (preference === 'CARDS') return { mode: 'CARDS', offersChoice: true, reason: 'USER_CHOICE' };
  return { mode: 'RESPONSIVE', offersChoice: true, reason: 'RESPONSIVE_DEFAULT' };
}

export type ComparisonPresentationPreference = 'AUTO' | 'STRIP' | 'GRID';
export type AdaptiveComparisonDecision = {
  layout: 'STRIP' | 'GRID';
  offersChoice: boolean;
  reason: 'USER_CHOICE' | 'SMALL_SET' | 'BOUNDED_ALTERNATIVES';
};

/** Two options fit side by side; a larger bounded set gets a navigable strip.
 * A saved homeowner choice wins when both registered layouts are useful. */
export function resolveAdaptiveComparisonPresentation(
  block: ComparisonBlock,
  preference: ComparisonPresentationPreference,
): AdaptiveComparisonDecision {
  if (block.options.length <= 2) return { layout: 'GRID', offersChoice: false, reason: 'SMALL_SET' };
  if (preference !== 'AUTO') return { layout: preference, offersChoice: true, reason: 'USER_CHOICE' };
  return { layout: 'STRIP', offersChoice: true, reason: 'BOUNDED_ALTERNATIVES' };
}

export type GroupedListPresentation = 'COMPACT_LIST' | 'CARDS';

/** Dense homogeneous results scan better as a list; a small or richly
 * described result keeps the more spacious record-card treatment. */
export function resolveAdaptiveGroupedListPresentation(block: GroupedListBlock): GroupedListPresentation {
  const items = block.sections.flatMap((section) => section.items);
  return items.length >= 5 && items.every((item) => item.meta.length <= 2 && !item.description)
    ? 'COMPACT_LIST' : 'CARDS';
}
