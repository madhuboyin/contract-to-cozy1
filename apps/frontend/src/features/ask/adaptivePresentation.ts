import type { AskPresentationBlock } from './types';

export type TablePresentationPreference = 'AUTO' | 'TABLE' | 'CARDS';
export type TablePresentationMode = 'RESPONSIVE' | 'TABLE' | 'CARDS';
type TableBlock = Extract<AskPresentationBlock, { type: 'TABLE' }>;

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
