// The category and difficulty filters of the DIY template browse (FRD v1.459). The browse is launch-only, so a filter is a declared message on a declared action
// (operationId DIY_TEMPLATE_BROWSE), never typed wording: "Show the DIY projects I can start." plus an optional " Category: X." and " Difficulty: Y.", both from the
// closed lists below. Anything else parses to null and the browse stays unfiltered. Pure.
import { DIY_TEMPLATE_BROWSE_ACTION } from '../../diy/projectGuide';

export const DIY_FILTER_CATEGORIES = ['HVAC', 'PLUMBING', 'ELECTRICAL', 'PAINTING', 'GENERAL', 'EXTERIOR', 'FLOORING', 'APPLIANCE', 'LANDSCAPING', 'OTHER'] as const;
export const DIY_FILTER_DIFFICULTIES = ['EASY', 'MODERATE', 'HARD', 'EXPERT_ONLY'] as const;
export const DIY_DIFFICULTY_LABELS: Record<string, string> = { EASY: 'Easy', MODERATE: 'Moderate', HARD: 'Hard', EXPERT_ONLY: 'Expert only' };
export interface DiyBrowseFilter { category?: string; difficulty?: string }

export const diyBrowseFilterMessage = (filter: DiyBrowseFilter): string =>
  `${DIY_TEMPLATE_BROWSE_ACTION.message}${filter.category ? ` Category: ${filter.category}.` : ''}${filter.difficulty ? ` Difficulty: ${filter.difficulty}.` : ''}`;

/** The filter a declared browse message carries; null when the message is not exactly the browse message plus listed values. */
export function parseDiyBrowseFilter(message: string): DiyBrowseFilter | null {
  const text = message.trim();
  if (!text.startsWith(DIY_TEMPLATE_BROWSE_ACTION.message)) return null;
  const match = /^(?: Category: ([A-Z]+)\.)?(?: Difficulty: ([A-Z_]+)\.)?$/.exec(text.slice(DIY_TEMPLATE_BROWSE_ACTION.message.length));
  if (!match) return null;
  const [, category, difficulty] = match;
  if (category && !(DIY_FILTER_CATEGORIES as readonly string[]).includes(category)) return null;
  if (difficulty && !(DIY_FILTER_DIFFICULTIES as readonly string[]).includes(difficulty)) return null;
  return { ...(category ? { category } : {}), ...(difficulty ? { difficulty } : {}) };
}

export const DIY_FILTER_CLEAR_ACTION_ID = 'diy-template-filter-clear';
export const diyFilterActionId = (kind: 'category' | 'difficulty', value: string) => `diy-template-filter-${kind}-${value.toLowerCase().replace(/_/g, '-')}`;
/** Every filter action id the browse can carry, for the answer-trust allowlist. */
export const DIY_FILTER_ACTION_IDS: readonly string[] = [
  DIY_FILTER_CLEAR_ACTION_ID,
  ...DIY_FILTER_CATEGORIES.map((c) => diyFilterActionId('category', c)),
  ...DIY_FILTER_DIFFICULTIES.map((d) => diyFilterActionId('difficulty', d)),
];
