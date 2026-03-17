// apps/backend/src/modules/gazette/editorial/GazetteEditorialService.ts
// Orchestrates AI editorial generation for all stories in a Gazette edition.
// Enriches already-assembled GazetteStory records with AI-generated copy.
// Falls back gracefully to deterministic copy on any failure.

import { GazetteEdition, GazetteStory } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { GazetteHeadlineGenerator } from './GazetteHeadlineGenerator';
import { GazetteSummaryGenerator } from './GazetteSummaryGenerator';
import { GazetteEditorialFallbackBuilder } from './GazetteEditorialFallbackBuilder';
import { GAZETTE_EDITORIAL_PROMPT_VERSION } from './GazetteEditorialPromptBuilder';
import {
  StoryEditorialInput,
  EditionEditorialInput,
  StoryEditorialOutput,
  EditionEditorialOutput,
} from './GazetteEditorialTypes';

export class GazetteEditorialService {
  /**
   * Check whether AI editorial generation is enabled.
   * Requires GEMINI_API_KEY to be set.
   */
  static isEnabled(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  /**
   * Enrich all stories in an edition with AI-generated editorial copy.
   * Updates each story's headline/dek/summary + aiStatus in the DB.
   * Then generates and persists edition-level summary copy.
   *
   * Safe to call even when AI is disabled — falls back gracefully.
   */
  static async enrichStories(stories: GazetteStory[], editionId: string): Promise<void> {
    if (stories.length === 0) return;

    const apiKey = process.env.GEMINI_API_KEY;
    const aiEnabled = Boolean(apiKey);

    const headlineGen = aiEnabled ? new GazetteHeadlineGenerator(apiKey!) : null;
    const summaryGen = aiEnabled ? new GazetteSummaryGenerator(apiKey!) : null;

    // ── Story-level enrichment ──────────────────────────────────────────────
    for (const story of stories) {
      const input = storyToEditorialInput(story);
      let output: StoryEditorialOutput;

      if (headlineGen) {
        output = await headlineGen.generate(input);
      } else {
        output = GazetteEditorialFallbackBuilder.buildStoryFallback(input, 'NOT_REQUESTED');
      }

      await persistStoryEditorial(story.id, output);
    }

    // ── Edition-level enrichment ────────────────────────────────────────────
    const updatedStories = await prisma.gazetteStory.findMany({
      where: { editionId },
      orderBy: { rank: 'asc' },
    });

    const heroStory = updatedStories.find((s) => s.isHero) ?? updatedStories[0];
    const heroCategory = heroStory ? (heroStory.storyCategory as string) : 'GENERAL';

    const editionInput: EditionEditorialInput = {
      editionId,
      selectedCount: updatedStories.length,
      heroCategory,
      topStories: updatedStories.slice(0, 5).map((s) => ({
        headline: s.headline,
        storyCategory: s.storyCategory as string,
        rank: s.rank,
      })),
    };

    let editionOutput: EditionEditorialOutput;
    if (summaryGen) {
      editionOutput = await summaryGen.generate(editionInput);
    } else {
      editionOutput = GazetteEditorialFallbackBuilder.buildEditionFallback(editionInput, 'NOT_REQUESTED');
    }

    await persistEditionEditorial(editionId, editionOutput);
  }

  /**
   * Enrich a single story with AI editorial copy.
   * Useful for regeneration of individual stories.
   */
  static async enrichSingleStory(story: GazetteStory): Promise<StoryEditorialOutput> {
    const apiKey = process.env.GEMINI_API_KEY;
    const input = storyToEditorialInput(story);

    if (!apiKey) {
      const output = GazetteEditorialFallbackBuilder.buildStoryFallback(input, 'NOT_REQUESTED');
      await persistStoryEditorial(story.id, output);
      return output;
    }

    const gen = new GazetteHeadlineGenerator(apiKey);
    const output = await gen.generate(input);
    await persistStoryEditorial(story.id, output);
    return output;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function storyToEditorialInput(story: GazetteStory): StoryEditorialInput {
  return {
    storyId: story.id,
    storyCategory: story.storyCategory as string,
    storyTag: story.storyTag ?? undefined,
    headlineHint: undefined,    // not stored on GazetteStory; candidate had this field
    supportingFacts: (story.supportingFactsJson ?? {}) as Record<string, unknown>,
    urgencyScore: story.urgencyScore ?? undefined,
    financialImpactEstimate: story.financialImpactEstimate ?? undefined,
    confidenceScore: story.confidenceScore ?? undefined,
    primaryDeepLink: story.primaryDeepLink,
    rankExplanation: story.rankExplanation ?? undefined,
    sourceFeature: story.sourceFeature,
    shareSafe: story.shareSafe,
    isHero: story.isHero,
    rank: story.rank,
  };
}

async function persistStoryEditorial(storyId: string, output: StoryEditorialOutput): Promise<void> {
  await prisma.gazetteStory.update({
    where: { id: storyId },
    data: {
      headline: output.headline,
      dek: output.dek,
      summary: output.summary,
      aiStatus: output.aiStatus as any,
      aiModel: output.aiModel ?? null,
      aiPromptVersion: output.aiPromptVersion ?? GAZETTE_EDITORIAL_PROMPT_VERSION,
      aiValidationJson: output.validationResult
        ? (output.validationResult as any)
        : undefined,
    },
  });
}

async function persistEditionEditorial(
  editionId: string,
  output: EditionEditorialOutput,
): Promise<void> {
  await prisma.gazetteEdition.update({
    where: { id: editionId },
    data: {
      summaryHeadline: output.summaryHeadline,
      summaryDeck: output.summaryDeck,
      tickerJson: output.tickerItems as any,
      generationVersion: output.aiPromptVersion ?? GAZETTE_EDITORIAL_PROMPT_VERSION,
    },
  });
}
