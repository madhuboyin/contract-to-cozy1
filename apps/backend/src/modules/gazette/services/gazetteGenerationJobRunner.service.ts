// apps/backend/src/modules/gazette/services/gazetteGenerationJobRunner.service.ts
// Orchestrates the complete gazette generation pipeline.

import { GazetteEdition, GazetteGenerationJob, GazetteStoryCandidate } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { GenerationOptions, GenerationResult, GazetteWeekWindow } from '../types/gazette.types';
import { GazetteSignalCollectorService } from './gazetteSignalCollector.service';
import { GazetteCandidateFactoryService } from './gazetteCandidateFactory.service';
import { GazetteRankingEngineService } from './gazetteRankingEngine.service';
import { GazetteEditionAssemblerService } from './gazetteEditionAssembler.service';
import { GazettePublishService } from './gazettePublish.service';
import { GazetteEditorialService } from '../editorial/GazetteEditorialService';
import { NotificationService } from '../../../services/notification.service';
import { analyticsEmitter } from '../../../services/analytics/emitter';
import { AnalyticsModule, AnalyticsFeature, AnalyticsSource, ProductAnalyticsEventType } from '../../../services/analytics/taxonomy';

type GazetteGenerationStage =
  | 'SIGNAL_COLLECTION'
  | 'CANDIDATE_GENERATION'
  | 'RANKING'
  | 'EDITORIAL_GENERATION'
  | 'VALIDATION'
  | 'PUBLICATION';

export class GazetteGenerationJobRunnerService {
  /**
   * Execute the full gazette generation pipeline for a property.
   */
  static async generate(options: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
    const { propertyId, dryRun = false } = options;
    const completedStages: string[] = [];

    // 1. Resolve week window
    const weekWindow: GazetteWeekWindow =
      options.weekWindow ?? GazettePublishService.getWeekWindow();

    let edition: GazetteEdition;
    let editionId: string | undefined;

    try {
      // 2. Find or create edition (idempotent)
      const { edition: foundEdition, isNew } = await GazettePublishService.findOrCreateEdition(
        propertyId,
        weekWindow,
      );
      edition = foundEdition;
      editionId = edition.id;

      // 3. If already published, return early
      if (edition.status === 'PUBLISHED') {
        return {
          editionId,
          status: 'PUBLISHED',
          qualifiedCount: edition.qualifiedCount,
          selectedCount: edition.selectedCount,
          dryRun,
          stages: ['ALREADY_PUBLISHED'],
          durationMs: Date.now() - startTime,
        };
      }

      // 4. If FAILED, reset to DRAFT for retry
      if (edition.status === 'FAILED') {
        edition = await prisma.gazetteEdition.update({
          where: { id: edition.id },
          data: { status: 'DRAFT' as any },
        });
      }

      // ── STAGE: SIGNAL_COLLECTION ──────────────────────────────────────────
      const signalJob = await GazetteGenerationJobRunnerService._createJob(
        editionId,
        propertyId,
        'SIGNAL_COLLECTION',
      );

      const signals = await GazetteSignalCollectorService.collectSignals(
        propertyId,
        weekWindow,
      );
      completedStages.push('SIGNAL_COLLECTION');

      await GazetteGenerationJobRunnerService._completeJob(signalJob.id, {
        signalCount: signals.length,
      });

      // ── STAGE: CANDIDATE_GENERATION ───────────────────────────────────────
      const candidateJob = await GazetteGenerationJobRunnerService._createJob(
        editionId,
        propertyId,
        'CANDIDATE_GENERATION',
      );

      const candidateResults = dryRun
        ? []
        : await GazetteCandidateFactoryService.buildCandidates(
            propertyId,
            signals,
            editionId,
          );

      const candidates: GazetteStoryCandidate[] = candidateResults.map(
        (r) => r.candidate,
      );
      completedStages.push('CANDIDATE_GENERATION');

      await GazetteGenerationJobRunnerService._completeJob(candidateJob.id, {
        candidateCount: candidates.length,
        newCandidates: candidateResults.filter((r) => r.isNew).length,
      });

      // ── Check qualified count ─────────────────────────────────────────────
      const qualifiedCount = GazetteRankingEngineService.countQualified(candidates);

      if (!dryRun) {
        await prisma.gazetteEdition.update({
          where: { id: editionId },
          data: { qualifiedCount },
        });
      }

      // If not enough qualified stories, skip the edition
      if (qualifiedCount < edition.minQualifiedNeeded) {
        const skippedEdition = dryRun
          ? edition
          : await GazettePublishService.publishOrSkip(edition, qualifiedCount, 0);

        return {
          editionId,
          status: skippedEdition.status,
          qualifiedCount,
          selectedCount: 0,
          skippedReason: skippedEdition.skippedReason ?? undefined,
          dryRun,
          stages: completedStages,
          durationMs: Date.now() - startTime,
        };
      }

      // ── STAGE: RANKING ────────────────────────────────────────────────────
      const rankingJob = await GazetteGenerationJobRunnerService._createJob(
        editionId,
        propertyId,
        'RANKING',
      );

      let rankedCandidates: GazetteStoryCandidate[] = [];
      if (!dryRun) {
        const { ranked } = await GazetteRankingEngineService.rankCandidates(
          editionId,
          propertyId,
          candidates,
        );
        rankedCandidates = ranked;
      }
      completedStages.push('RANKING');

      await GazetteGenerationJobRunnerService._completeJob(rankingJob.id, {
        rankedCount: rankedCandidates.length,
      });

      // ── STAGE: EDITORIAL_GENERATION ───────────────────────────────────────
      const editorialJob = await GazetteGenerationJobRunnerService._createJob(
        editionId,
        propertyId,
        'EDITORIAL_GENERATION',
      );

      let stories: any[] = [];
      if (!dryRun && rankedCandidates.length > 0) {
        stories = await GazetteEditionAssemblerService.assembleEdition(
          edition,
          rankedCandidates,
        );
        // AI editorial enrichment — upgrades fallback copy with AI-generated
        // headlines/deks/summaries. Safe no-op when GEMINI_API_KEY is not set.
        await GazetteEditorialService.enrichStories(stories, edition.id);
      }
      completedStages.push('EDITORIAL_GENERATION');

      await GazetteGenerationJobRunnerService._completeJob(editorialJob.id, {
        storyCount: stories.length,
        aiEditorialEnabled: GazetteEditorialService.isEnabled(),
      });

      // ── STAGE: VALIDATION ─────────────────────────────────────────────────
      const validationJob = await GazetteGenerationJobRunnerService._createJob(
        editionId,
        propertyId,
        'VALIDATION',
      );

      // Basic validation: all required story fields present
      const invalidStories = stories.filter(
        (s) => !s.headline || !s.summary || !s.primaryDeepLink,
      );

      if (invalidStories.length > 0) {
        console.warn(
          `[GazetteJobRunner] ${invalidStories.length} stories failed validation for edition ${editionId}`,
        );
      }
      completedStages.push('VALIDATION');

      await GazetteGenerationJobRunnerService._completeJob(validationJob.id, {
        validCount: stories.length - invalidStories.length,
        invalidCount: invalidStories.length,
      });

      // ── STAGE: PUBLICATION ────────────────────────────────────────────────
      const publicationJob = await GazetteGenerationJobRunnerService._createJob(
        editionId,
        propertyId,
        'PUBLICATION',
      );

      // Reload edition to get latest qualifiedCount
      const latestEdition = await prisma.gazetteEdition.findUnique({
        where: { id: editionId },
      });

      const finalEdition = dryRun
        ? edition
        : await GazettePublishService.publishOrSkip(
            latestEdition ?? edition,
            qualifiedCount,
            rankedCandidates.length,
          );
      completedStages.push('PUBLICATION');

      await GazetteGenerationJobRunnerService._completeJob(publicationJob.id, {
        status: finalEdition.status,
        selectedCount: finalEdition.selectedCount,
      });

      // ── POST-PUBLISH: Notification + Analytics ────────────────────────────
      if (finalEdition.status === 'PUBLISHED' && !dryRun) {
        // Fire-and-forget: do not let these block or fail the pipeline
        GazetteGenerationJobRunnerService._onPublished(
          propertyId,
          editionId!,
          finalEdition,
        ).catch((err) => {
          console.warn('[GazetteJobRunner] Post-publish hooks failed (non-fatal):', err?.message);
        });
      }

      return {
        editionId,
        status: finalEdition.status,
        qualifiedCount,
        selectedCount: rankedCandidates.length,
        skippedReason: finalEdition.skippedReason ?? undefined,
        dryRun,
        stages: completedStages,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      // Update edition status to FAILED
      if (editionId) {
        try {
          await prisma.gazetteEdition.update({
            where: { id: editionId },
            data: { status: 'FAILED' as any },
          });
        } catch (updateErr) {
          console.error('[GazetteJobRunner] Failed to mark edition as FAILED:', updateErr);
        }
      }

      throw new APIError(
        err?.message ?? 'Gazette generation failed',
        500,
        'GAZETTE_GENERATION_FAILED',
        { stages: completedStages, originalError: err?.message },
      );
    }
  }

  /**
   * Reset an edition to DRAFT, clear existing stories/candidates, and re-run.
   */
  static async regenerateEdition(editionId: string): Promise<GenerationResult> {
    const edition = await prisma.gazetteEdition.findUnique({
      where: { id: editionId },
    });

    if (!edition) {
      throw new APIError('Edition not found', 404, 'EDITION_NOT_FOUND');
    }

    // Delete existing stories
    await prisma.gazetteStory.deleteMany({ where: { editionId } });

    // Reset candidates to ACTIVE
    await prisma.gazetteStoryCandidate.updateMany({
      where: { editionId },
      data: {
        status: 'ACTIVE' as any,
        selectionRank: null,
        exclusionReason: null,
        exclusionDetail: null,
        rankAdjustmentReason: null,
      },
    });

    // Reset edition to DRAFT
    await prisma.gazetteEdition.update({
      where: { id: editionId },
      data: {
        status: 'DRAFT' as any,
        qualifiedCount: 0,
        selectedCount: 0,
        heroStoryId: null,
        summaryHeadline: null,
        summaryDeck: null,
        tickerJson: undefined,
        publishedAt: null,
        skippedReason: null,
      },
    });

    const weekWindow: GazetteWeekWindow = {
      weekStart: edition.weekStart,
      weekEnd: edition.weekEnd,
    };

    return GazetteGenerationJobRunnerService.generate({
      propertyId: edition.propertyId,
      weekWindow,
    });
  }

  /**
   * Get generation jobs, optionally filtered.
   */
  static async getJobs(filter: {
    propertyId?: string;
    stage?: string;
    limit?: number;
  }): Promise<GazetteGenerationJob[]> {
    return prisma.gazetteGenerationJob.findMany({
      where: {
        ...(filter.propertyId ? { propertyId: filter.propertyId } : {}),
        ...(filter.stage ? { stage: filter.stage as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 50,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fire-and-forget hooks after a new edition is successfully published.
   * Emits analytics + in-app notification. Never throws — caller wraps in catch.
   */
  private static async _onPublished(
    propertyId: string,
    editionId: string,
    edition: GazetteEdition,
  ): Promise<void> {
    // Resolve the homeowner userId for this property
    const property = await prisma.property.findFirst({
      where: { id: propertyId },
      select: { homeownerProfile: { select: { userId: true } } },
    });
    const userId = property?.homeownerProfile?.userId;

    // Analytics — edition generated + published
    analyticsEmitter.track({
      eventType: ProductAnalyticsEventType.FEATURE_OPENED,
      propertyId,
      userId: userId ?? undefined,
      moduleKey: AnalyticsModule.GAZETTE,
      featureKey: AnalyticsFeature.GAZETTE_EDITION,
      source: AnalyticsSource.SYSTEM,
      metadataJson: {
        editionId,
        selectedCount: edition.selectedCount,
        action: 'PUBLISHED',
      },
    });

    if (!userId) return; // Cannot notify without userId

    // In-app notification
    await NotificationService.create({
      userId,
      type: 'GAZETTE_PUBLISHED',
      title: 'Your Home Gazette is ready',
      message:
        (edition.summaryHeadline as string | null) ??
        'Your weekly home intelligence briefing is available.',
      actionUrl: `/dashboard/properties/${propertyId}/tools/home-gazette`,
      entityType: 'GAZETTE_EDITION',
      entityId: editionId,
      metadata: {
        propertyId,
        selectedCount: edition.selectedCount,
        weekStart: edition.weekStart,
        weekEnd: edition.weekEnd,
      },
    });
  }

  private static async _createJob(
    editionId: string,
    propertyId: string,
    stage: GazetteGenerationStage,
  ): Promise<GazetteGenerationJob> {
    return prisma.gazetteGenerationJob.create({
      data: {
        editionId,
        propertyId,
        stage: stage as any,
        status: 'DRAFT' as any,
        startedAt: new Date(),
        attemptCount: 1,
      },
    });
  }

  private static async _completeJob(
    jobId: string,
    metrics: Record<string, unknown>,
  ): Promise<void> {
    await prisma.gazetteGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'PUBLISHED' as any,
        finishedAt: new Date(),
        metricsJson: metrics as any,
      },
    });
  }
}
