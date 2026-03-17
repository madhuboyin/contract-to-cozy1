// apps/backend/src/modules/gazette/editorial/GazetteEditorialFallbackBuilder.ts
// Builds deterministic, production-safe editorial copy when AI is unavailable or
// when AI output fails validation.

import {
  buildFallbackHeadline,
  buildFallbackDek,
  buildFallbackSummary,
  buildEditionTickerItem,
  buildEditionSummaryHeadline,
  buildEditionSummaryDeck,
} from './gazetteFallbackEditorial';
import {
  StoryEditorialInput,
  StoryEditorialOutput,
  EditionEditorialInput,
  EditionEditorialOutput,
} from './GazetteEditorialTypes';

export class GazetteEditorialFallbackBuilder {
  /**
   * Build deterministic fallback editorial copy for a single story.
   */
  static buildStoryFallback(
    input: StoryEditorialInput,
    reason: 'FALLBACK_USED' | 'FAILED' | 'NOT_REQUESTED' = 'FALLBACK_USED',
  ): StoryEditorialOutput {
    const headline = buildFallbackHeadline(
      input.storyCategory,
      input.storyTag,
      input.sourceFeature,
    );
    const dek = buildFallbackDek(input.storyCategory);
    const summary = buildFallbackSummary(input.storyCategory, input.supportingFacts);

    return {
      storyId: input.storyId,
      headline,
      dek,
      summary,
      ...(input.isHero ? { whyItMatters: dek } : {}),
      aiStatus: reason,
    };
  }

  /**
   * Build deterministic fallback editorial copy for an edition.
   */
  static buildEditionFallback(
    input: EditionEditorialInput,
    reason: 'FALLBACK_USED' | 'FAILED' | 'NOT_REQUESTED' = 'FALLBACK_USED',
  ): EditionEditorialOutput {
    const summaryHeadline = buildEditionSummaryHeadline(
      input.selectedCount,
      input.heroCategory,
    );
    const summaryDeck = buildEditionSummaryDeck(input.selectedCount);
    const tickerItems = input.topStories
      .slice(0, 5)
      .map((s) => buildEditionTickerItem(s.headline, s.storyCategory));

    return {
      summaryHeadline,
      summaryDeck,
      tickerItems,
      aiStatus: reason,
    };
  }
}
