import type { AskPresentationBlock } from './types';

export type AskAnswerWidth = 'STANDARD' | 'WIDE';

const WIDE_BLOCK_TYPES = new Set<AskPresentationBlock['type']>([
  'TABLE',
  'TIMELINE',
  'COMPARISON',
  'SCENARIO_COMPARISON',
  'ENVIRONMENT_REPORT',
]);

/**
 * Ordinary conversational answers stay at a readable measure. Only artifacts
 * whose meaning depends on side-by-side scanning use the workspace's full
 * width. This is presentation-only: it never changes block selection or data.
 */
export function askAnswerWidth(blocks: AskPresentationBlock[]): AskAnswerWidth {
  // Property completeness is a compact record readout. Its fact-grid happens to
  // use TABLE semantics, but it should align with Home Actions rather than
  // widening the whole conversation like a comparison artifact.
  if (blocks.some((block) => block.id === 'property-completeness-progress')
    && blocks.some((block) => block.id === 'property-summary-facts')) return 'STANDARD';
  // The room map is a compact home-record overview, not a scan-heavy workspace.
  // Keep it aligned with Home Actions and the other ordinary conversation turns;
  // its responsive tile grid already adapts within the standard measure.
  if (blocks.some((block) => block.id === 'property-rooms')) return 'STANDARD';
  // Reserve Fund is a decision answer with one supporting timeline. Keep the
  // whole conversation at the Home Actions reading measure; the timeline is
  // responsive inside that measure and should not widen every surrounding card.
  if (blocks.some((block) => block.id === 'reserve-fund-overview')) return 'STANDARD';
  // A chart answer (Break-Even) is a few short tables around one chart; it reads at the standard measure, like Home Actions.
  if (blocks.some((block) => block.type === 'TREND_CHART' || block.id.startsWith('break-even-'))) return 'STANDARD';
  // Sell / Hold / Rent, Ownership Costs, Coverage Reviews, and the Do-Nothing Simulator are the same kind of decision answer (summary, scenario cards, short tables), so they share that measure.
  if (blocks.some((block) => block.id.startsWith('sell-hold-rent-') || block.id.startsWith('do-nothing-') || block.id.startsWith('ownership-cost') || block.id.startsWith('coverage-'))) return 'STANDARD';
  // Home Operations is a scan-heavy operational artifact. Its desktop rows use
  // aligned metadata, state and action columns, so give the list the wider
  // workspace measure while retaining the ordinary single-column mobile flow.
  if (blocks.some((block) => block.id === 'home-work-items')) return 'WIDE';
  // Recurring costs are a four-way comparison and setup workspace. Its dedicated
  // responsive grid uses the extra desktop measure while remaining stacked on mobile.
  if (blocks.some((block) => block.id === 'savings-recurring-setup')) return 'WIDE';
  return blocks.some((block) => WIDE_BLOCK_TYPES.has(block.type)
    || (block.type === 'PRIORITY_LIST' && block.items.length > 1)
    || (block.type === 'GROUPED_LIST' && Boolean(block.presentation)))
    ? 'WIDE'
    : 'STANDARD';
}

export function askAnswerWidthClass(width: AskAnswerWidth): string {
  return width === 'WIDE' ? 'w-full max-w-[1140px]' : 'w-full max-w-[960px]';
}
