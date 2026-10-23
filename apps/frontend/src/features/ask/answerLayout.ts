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
  // A chart answer (Break-Even) is a few short tables around one chart; it reads at the standard measure, like Home Actions.
  if (blocks.some((block) => block.type === 'TREND_CHART')) return 'STANDARD';
  return blocks.some((block) => WIDE_BLOCK_TYPES.has(block.type)
    || (block.type === 'PRIORITY_LIST' && block.items.length > 1)
    || (block.type === 'GROUPED_LIST' && Boolean(block.presentation)))
    ? 'WIDE'
    : 'STANDARD';
}

export function askAnswerWidthClass(width: AskAnswerWidth): string {
  return width === 'WIDE' ? 'w-full max-w-[1140px]' : 'w-full max-w-[920px]';
}
