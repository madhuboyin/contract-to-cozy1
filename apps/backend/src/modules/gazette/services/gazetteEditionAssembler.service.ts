// apps/backend/src/modules/gazette/services/gazetteEditionAssembler.service.ts
// Assembles a final GazetteEdition from ranked candidates.

import { GazetteEdition, GazetteStory, GazetteStoryCandidate } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  buildFallbackHeadline,
  buildFallbackDek,
  buildFallbackSummary,
  buildEditionTickerItem,
  buildEditionSummaryHeadline,
  buildEditionSummaryDeck,
} from '../editorial/gazetteFallbackEditorial';

export type GazetteStoryPriority = 'HERO' | 'HIGH' | 'MEDIUM' | 'LOW';

export class GazetteEditionAssemblerService {
  /**
   * Assemble the final edition by creating GazetteStory records for each ranked candidate.
   */
  static async assembleEdition(
    edition: GazetteEdition,
    rankedCandidates: GazetteStoryCandidate[],
  ): Promise<GazetteStory[]> {
    const stories: GazetteStory[] = [];

    // Create stories for each ranked candidate in order
    for (let i = 0; i < rankedCandidates.length; i++) {
      const candidate = rankedCandidates[i];
      const rank = (candidate.selectionRank ?? i + 1);
      const priority = GazetteEditionAssemblerService.determinePriority(rank);
      const isHero = rank === 1;

      const category = candidate.storyCategory as string;
      const supportingFacts = (candidate.supportingFactsJson ?? {}) as Record<string, unknown>;

      const headline = buildFallbackHeadline(
        category,
        candidate.storyTag ?? undefined,
        candidate.entityType,
      );
      const dek = buildFallbackDek(category);
      const summary = buildFallbackSummary(category, supportingFacts);

      const story = await prisma.gazetteStory.create({
        data: {
          editionId: edition.id,
          propertyId: edition.propertyId,
          sourceFeature: candidate.sourceFeature,
          sourceEventId: candidate.sourceEventId ?? null,
          storyCategory: candidate.storyCategory as any,
          storyTag: candidate.storyTag ?? null,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          priority: priority as any,
          rank,
          isHero,
          headline,
          dek,
          summary,
          supportingFactsJson: candidate.supportingFactsJson ?? undefined,
          rankExplanation: `Ranked ${rank} with composite score ${(candidate.compositeScore ?? 0).toFixed(3)}`,
          urgencyScore: candidate.urgencyScoreInput ?? null,
          financialImpactEstimate: candidate.financialImpactEstimate ?? null,
          confidenceScore: candidate.confidenceScore ?? null,
          noveltyScore: candidate.noveltyScore ?? null,
          engagementScore: candidate.engagementScore ?? null,
          compositeScore: candidate.compositeScore ?? null,
          primaryDeepLink: candidate.primaryDeepLink,
          secondaryDeepLink: candidate.secondaryDeepLink ?? null,
          shareSafe: candidate.shareSafe,
          aiStatus: 'NOT_REQUESTED' as any,
        },
      });

      stories.push(story);
    }

    if (stories.length === 0) {
      return stories;
    }

    // Build ticker items for top 5 stories
    const topStories = stories.slice(0, 5);
    const tickerItems = topStories.map((story) =>
      buildEditionTickerItem(story.headline, story.storyCategory as string),
    );

    // Determine top category from the hero story
    const heroStory = stories.find((s) => s.isHero) ?? stories[0];
    const topCategory = heroStory.storyCategory as string;

    // Build edition-level copy
    const summaryHeadline = buildEditionSummaryHeadline(stories.length, topCategory);
    const summaryDeck = buildEditionSummaryDeck(stories.length);

    // Update edition with hero pointer and summary copy
    await prisma.gazetteEdition.update({
      where: { id: edition.id },
      data: {
        heroStoryId: heroStory.id,
        tickerJson: tickerItems,
        summaryHeadline,
        summaryDeck,
      },
    });

    return stories;
  }

  /**
   * Determine story priority based on rank.
   */
  static determinePriority(rank: number): GazetteStoryPriority {
    if (rank === 1) return 'HERO';
    if (rank <= 4) return 'HIGH';
    if (rank <= 7) return 'MEDIUM';
    return 'LOW';
  }
}
