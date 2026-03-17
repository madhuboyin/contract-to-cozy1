// apps/backend/src/modules/gazette/editorial/GazetteTickerGenerator.ts
// Builds ticker items deterministically from story data.
// Used as a standalone fallback when edition AI generation is not available.

import { buildEditionTickerItem } from './gazetteFallbackEditorial';

export interface TickerStoryInput {
  headline: string;
  storyCategory: string;
  rank: number;
}

const MAX_TICKER_LEN = 60;

export class GazetteTickerGenerator {
  /**
   * Build ticker items from a list of ranked stories.
   * Deterministic — no AI. Used when AI edition generation is disabled/failed.
   */
  static buildTickerItems(stories: TickerStoryInput[], maxItems = 5): string[] {
    return stories
      .slice(0, maxItems)
      .map((s) => {
        const raw = buildEditionTickerItem(s.headline, s.storyCategory);
        // Truncate to max length if needed
        return raw.length > MAX_TICKER_LEN ? raw.slice(0, MAX_TICKER_LEN - 1) + '…' : raw;
      });
  }

  /**
   * Validate a set of ticker items for quality.
   * Returns only items that pass length and non-empty checks.
   */
  static filterValidTickerItems(items: string[]): string[] {
    return items.filter(
      (item) => typeof item === 'string' && item.trim().length > 0 && item.trim().length <= MAX_TICKER_LEN + 20,
    );
  }
}
