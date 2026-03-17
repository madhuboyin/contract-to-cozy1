// apps/backend/src/modules/gazette/mappers/gazette.mapper.ts
// Maps DB records to DTOs for API responses.

import {
  GazetteEdition,
  GazetteStory,
  GazetteStoryCandidate,
  GazetteSelectionTrace,
  GazetteGenerationJob,
  GazetteShareLink,
} from '@prisma/client';
import {
  GazetteStoryDto,
  GazetteEditionDto,
  GazetteEditionCardDto,
  GazetteCandidateDto,
  GazetteSelectionTraceDto,
  GazetteGenerationJobDto,
  GazetteShareLinkDto,
} from '../dto/gazette.dto';

export class GazetteMapper {
  /**
   * Map a GazetteStory DB record to a GazetteStoryDto.
   */
  static toStoryDto(story: GazetteStory): GazetteStoryDto {
    return {
      id: story.id,
      editionId: story.editionId,
      propertyId: story.propertyId,
      sourceFeature: story.sourceFeature,
      sourceEventId: story.sourceEventId,
      storyCategory: story.storyCategory as string,
      storyTag: story.storyTag,
      entityType: story.entityType,
      entityId: story.entityId,
      priority: story.priority as string,
      rank: story.rank,
      isHero: story.isHero,
      headline: story.headline,
      dek: story.dek,
      summary: story.summary,
      supportingFactsJson: story.supportingFactsJson
        ? (story.supportingFactsJson as Record<string, unknown>)
        : null,
      urgencyScore: story.urgencyScore,
      financialImpactEstimate: story.financialImpactEstimate,
      confidenceScore: story.confidenceScore,
      noveltyScore: story.noveltyScore,
      engagementScore: story.engagementScore,
      compositeScore: story.compositeScore,
      primaryDeepLink: story.primaryDeepLink,
      secondaryDeepLink: story.secondaryDeepLink,
      shareSafe: story.shareSafe,
      aiStatus: story.aiStatus as string,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
    };
  }

  /**
   * Map a GazetteEdition with stories to a GazetteEditionDto.
   */
  static toEditionDto(
    edition: GazetteEdition & { stories: GazetteStory[] },
  ): GazetteEditionDto {
    return {
      id: edition.id,
      propertyId: edition.propertyId,
      weekStart: edition.weekStart,
      weekEnd: edition.weekEnd,
      publishDate: edition.publishDate,
      status: edition.status as string,
      minQualifiedNeeded: edition.minQualifiedNeeded,
      qualifiedCount: edition.qualifiedCount,
      selectedCount: edition.selectedCount,
      skippedReason: edition.skippedReason,
      heroStoryId: edition.heroStoryId,
      summaryHeadline: edition.summaryHeadline,
      summaryDeck: edition.summaryDeck,
      tickerJson: edition.tickerJson,
      generationVersion: edition.generationVersion,
      publishedAt: edition.publishedAt,
      createdAt: edition.createdAt,
      updatedAt: edition.updatedAt,
      stories: edition.stories.map((s) => GazetteMapper.toStoryDto(s)),
    };
  }

  /**
   * Map a GazetteEdition to a lightweight card DTO for list views.
   */
  static toEditionCard(edition: GazetteEdition): GazetteEditionCardDto {
    return {
      id: edition.id,
      propertyId: edition.propertyId,
      weekStart: edition.weekStart,
      weekEnd: edition.weekEnd,
      status: edition.status as string,
      qualifiedCount: edition.qualifiedCount,
      selectedCount: edition.selectedCount,
      summaryHeadline: edition.summaryHeadline,
      summaryDeck: edition.summaryDeck,
      publishedAt: edition.publishedAt,
      heroStoryId: edition.heroStoryId,
      createdAt: edition.createdAt,
    };
  }

  /**
   * Map a GazetteStoryCandidate to a GazetteCandidateDto.
   */
  static toCandidateDto(candidate: GazetteStoryCandidate): GazetteCandidateDto {
    return {
      id: candidate.id,
      editionId: candidate.editionId,
      propertyId: candidate.propertyId,
      sourceFeature: candidate.sourceFeature,
      sourceEventId: candidate.sourceEventId,
      storyCategory: candidate.storyCategory as string,
      storyTag: candidate.storyTag,
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      headlineHint: candidate.headlineHint,
      supportingFactsJson: candidate.supportingFactsJson as Record<string, unknown>,
      urgencyScoreInput: candidate.urgencyScoreInput,
      financialImpactEstimate: candidate.financialImpactEstimate,
      confidenceScore: candidate.confidenceScore,
      engagementScore: candidate.engagementScore,
      noveltyScore: candidate.noveltyScore,
      compositeScore: candidate.compositeScore,
      noveltyKey: candidate.noveltyKey,
      firstDetectedAt: candidate.firstDetectedAt,
      lastUpdatedAt: candidate.lastUpdatedAt,
      storyDeadline: candidate.storyDeadline,
      expiresAt: candidate.expiresAt,
      primaryDeepLink: candidate.primaryDeepLink,
      secondaryDeepLink: candidate.secondaryDeepLink,
      shareSafe: candidate.shareSafe,
      status: candidate.status as string,
      exclusionReason: candidate.exclusionReason as string | null,
      exclusionDetail: candidate.exclusionDetail,
      selectionRank: candidate.selectionRank,
      rankAdjustmentReason: candidate.rankAdjustmentReason,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    };
  }

  /**
   * Map a GazetteSelectionTrace to a GazetteSelectionTraceDto.
   */
  static toTraceDto(trace: GazetteSelectionTrace): GazetteSelectionTraceDto {
    return {
      id: trace.id,
      editionId: trace.editionId,
      candidateId: trace.candidateId,
      propertyId: trace.propertyId,
      preScore: trace.preScore,
      postScore: trace.postScore,
      finalRank: trace.finalRank,
      included: trace.included,
      exclusionReason: trace.exclusionReason as string | null,
      rankAdjustmentReason: trace.rankAdjustmentReason,
      rankExplanation: trace.rankExplanation,
      traceJson: trace.traceJson ? (trace.traceJson as Record<string, unknown>) : null,
      createdAt: trace.createdAt,
    };
  }

  /**
   * Map a GazetteGenerationJob to a GazetteGenerationJobDto.
   */
  static toJobDto(job: GazetteGenerationJob): GazetteGenerationJobDto {
    return {
      id: job.id,
      editionId: job.editionId,
      propertyId: job.propertyId,
      stage: job.stage as string,
      status: job.status as string,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      attemptCount: job.attemptCount,
      errorMessage: job.errorMessage,
      metricsJson: job.metricsJson ? (job.metricsJson as Record<string, unknown>) : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  /**
   * Map a GazetteShareLink to a GazetteShareLinkDto.
   * Optionally include the rawToken (only available immediately after creation).
   */
  static toShareLinkDto(
    shareLink: GazetteShareLink,
    rawToken?: string,
  ): GazetteShareLinkDto {
    return {
      id: shareLink.id,
      editionId: shareLink.editionId,
      propertyId: shareLink.propertyId,
      tokenHash: shareLink.tokenHash,
      status: shareLink.status as string,
      expiresAt: shareLink.expiresAt,
      revokedAt: shareLink.revokedAt,
      lastViewedAt: shareLink.lastViewedAt,
      viewCount: shareLink.viewCount,
      createdAt: shareLink.createdAt,
      updatedAt: shareLink.updatedAt,
      ...(rawToken !== undefined ? { rawToken } : {}),
    };
  }

  /**
   * Map an edition for public share view — only include share-safe stories.
   * Strips internal fields (rankExplanation, aiPromptVersion, etc.).
   */
  static toPublicEditionDto(
    edition: GazetteEdition & { stories: GazetteStory[] },
  ): GazetteEditionDto {
    const safestories = edition.stories.filter((s) => s.shareSafe);

    return {
      id: edition.id,
      propertyId: edition.propertyId,
      weekStart: edition.weekStart,
      weekEnd: edition.weekEnd,
      publishDate: edition.publishDate,
      status: edition.status as string,
      minQualifiedNeeded: edition.minQualifiedNeeded,
      qualifiedCount: edition.qualifiedCount,
      selectedCount: edition.selectedCount,
      skippedReason: null, // don't expose internal skip reason publicly
      heroStoryId: edition.heroStoryId,
      summaryHeadline: edition.summaryHeadline,
      summaryDeck: edition.summaryDeck,
      tickerJson: edition.tickerJson,
      generationVersion: null, // don't expose version publicly
      publishedAt: edition.publishedAt,
      createdAt: edition.createdAt,
      updatedAt: edition.updatedAt,
      stories: safestories.map((story) => ({
        id: story.id,
        editionId: story.editionId,
        propertyId: story.propertyId,
        sourceFeature: story.sourceFeature,
        sourceEventId: null, // strip internal source ref
        storyCategory: story.storyCategory as string,
        storyTag: story.storyTag,
        entityType: story.entityType,
        entityId: story.entityId,
        priority: story.priority as string,
        rank: story.rank,
        isHero: story.isHero,
        headline: story.headline,
        dek: story.dek,
        summary: story.summary,
        supportingFactsJson: null, // strip internal facts from public view
        urgencyScore: null,
        financialImpactEstimate: null,
        confidenceScore: null,
        noveltyScore: null,
        engagementScore: null,
        compositeScore: null,
        primaryDeepLink: story.primaryDeepLink,
        secondaryDeepLink: story.secondaryDeepLink,
        shareSafe: story.shareSafe,
        aiStatus: story.aiStatus as string,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      })),
    };
  }
}
