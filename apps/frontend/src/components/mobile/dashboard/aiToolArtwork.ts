export type AIToolArtworkKey =
  | 'repair-vs-replace'
  | 'risk-optimizer'
  | 'coverage-intelligence'
  | 'do-nothing-simulator'
  | 'home-savings-check'
  | 'view-all';

export const AI_TOOL_ARTWORK: Record<AIToolArtworkKey, string> = {
  'repair-vs-replace': '/images/ai-tools/repair-vs-replace.svg',
  'risk-optimizer': '/images/ai-tools/risk-optimizer.svg',
  'coverage-intelligence': '/images/ai-tools/coverage-intelligence.svg',
  'do-nothing-simulator': '/images/ai-tools/do-nothing-simulator.svg',
  'home-savings-check': '/images/ai-tools/home-savings-check.svg',
  'view-all': '/images/ai-tools/view-all.svg',
};
