import type { AskPresentationBlock } from './types';

// IW-PRES-011 ("reduced-motion behavior"): a single source of truth for the reduced-motion check, reused
// wherever Ask JS-drives a scroll or transition, so a smooth/animated affordance never overrides the homeowner's
// OS-level preference. Previously checked inline, only inside ComparisonStripBlock's own strip-navigation
// scroll -- AskWorkspace.tsx's two unconditional `behavior: 'smooth'` autoscrolls (new message, just-updated
// result) never checked it at all.
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

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

export type ComparisonPresentationPreference = 'AUTO' | 'STRIP' | 'GRID' | 'TABLE';
export type AdaptiveComparisonDecision = {
  layout: 'STRIP' | 'GRID' | 'TABLE';
  /** The layouts offered in the switch, in order. */
  choices: ComparisonPresentationPreference[];
  reason: 'USER_CHOICE' | 'SMALL_SET' | 'BOUNDED_ALTERNATIVES';
};

/** Two options fit side by side; a larger bounded set gets a navigable strip.
 * IW-PRES-016 (FRD v1.76): every comparison also offers a Table view of the same options.
 * A saved homeowner choice wins when that layout is offered. */
export function resolveAdaptiveComparisonPresentation(
  block: ComparisonBlock,
  preference: ComparisonPresentationPreference,
): AdaptiveComparisonDecision {
  if (block.options.length <= 2) {
    const choices: ComparisonPresentationPreference[] = ['GRID', 'TABLE'];
    return preference === 'TABLE'
      ? { layout: 'TABLE', choices, reason: 'USER_CHOICE' }
      : { layout: 'GRID', choices, reason: 'SMALL_SET' };
  }
  const choices: ComparisonPresentationPreference[] = ['AUTO', 'STRIP', 'GRID', 'TABLE'];
  if (preference !== 'AUTO') return { layout: preference, choices, reason: 'USER_CHOICE' };
  return { layout: 'STRIP', choices, reason: 'BOUNDED_ALTERNATIVES' };
}

/** Price bars are drawn only when every option declares an amount in one currency and the highest is above zero;
 * each width is the option's share of the highest amount. Returns null otherwise. */
export function comparisonPriceShares(block: ComparisonBlock): number[] | null {
  const amounts = block.options.map((option) => option.amount ?? null);
  if (amounts.some((amount) => !amount)) return null;
  if (new Set(amounts.map((amount) => amount!.currency)).size !== 1) return null;
  const max = Math.max(...amounts.map((amount) => amount!.value));
  if (!(max > 0)) return null;
  return amounts.map((amount) => amount!.value / max);
}

export type GroupedListPresentation = 'COMPACT_LIST' | 'CARDS';
export type GroupedListPresentationPreference = 'AUTO' | 'LIST' | 'CARDS';

/** Dense homogeneous results scan better as a list; a small or richly
 * described result keeps the more spacious record-card treatment. */
export function resolveAdaptiveGroupedListPresentation(block: GroupedListBlock): GroupedListPresentation {
  const items = block.sections.flatMap((section) => section.items);
  return items.length >= 5 && items.every((item) => item.meta.length <= 2 && !item.description)
    ? 'COMPACT_LIST' : 'CARDS';
}

export function resolveGroupedListView(block: GroupedListBlock, preference: GroupedListPresentationPreference) {
  const itemCount = block.sections.reduce((total, section) => total + section.items.length, 0);
  const offersChoice = itemCount >= 5;
  const mode = offersChoice && preference !== 'AUTO'
    ? preference === 'LIST' ? 'COMPACT_LIST' : 'CARDS'
    : resolveAdaptiveGroupedListPresentation(block);
  return { mode, offersChoice } as const;
}
