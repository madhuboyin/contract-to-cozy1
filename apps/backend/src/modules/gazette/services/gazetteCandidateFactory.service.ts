// apps/backend/src/modules/gazette/services/gazetteCandidateFactory.service.ts
// Transforms SourceSignal[] into GazetteStoryCandidate Prisma records.

import { createHash } from 'crypto';
import { GazetteStoryCandidate } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { SourceSignal } from '../types/gazette.types';
import { logger } from '../../../lib/logger';

const DEFAULT_EXPIRY_DAYS = 14;
const HIGH_URGENCY_EXPIRY_DAYS = 7;
const HIGH_URGENCY_THRESHOLD = 0.7;
const MIN_SUPPORTING_FACTS_KEYS = 1;

export class GazetteCandidateFactoryService {
  /**
   * Transform an array of SourceSignals into GazetteStoryCandidate records.
   * Handles upsert logic: existing candidates are updated, new ones are created.
   */
  static async buildCandidates(
    propertyId: string,
    signals: SourceSignal[],
    editionId?: string,
  ): Promise<Array<{ candidate: GazetteStoryCandidate; isNew: boolean }>> {
    const results: Array<{ candidate: GazetteStoryCandidate; isNew: boolean }> = [];

    for (const signal of signals) {
      try {
        // Validate: primaryDeepLink required and must start with /dashboard/
        if (
          !signal.primaryDeepLink ||
          !signal.primaryDeepLink.startsWith('/dashboard/')
        ) {
          logger.warn(
            `[GazetteCandidateFactory] Signal for ${signal.entityType}:${signal.entityId} skipped — invalid primaryDeepLink`,
          );
          continue;
        }

        // Validate: supportingFacts must have at least 1 key
        if (
          !signal.supportingFacts ||
          Object.keys(signal.supportingFacts).length < MIN_SUPPORTING_FACTS_KEYS
        ) {
          logger.warn(
            `[GazetteCandidateFactory] Signal for ${signal.entityType}:${signal.entityId} skipped — missing supportingFacts`,
          );
          continue;
        }

        // Compute novelty key: sha256(sourceFeature:entityType:entityId)
        const keyStr = `${signal.sourceFeature}:${signal.entityType}:${signal.entityId}`;
        const noveltyKey = createHash('sha256').update(keyStr).digest('hex');

        // Determine expiry deadline
        const now = new Date();
        let deadline: Date;
        if (signal.storyDeadline) {
          deadline = signal.storyDeadline;
        } else if (signal.urgency >= HIGH_URGENCY_THRESHOLD) {
          deadline = new Date(now.getTime() + HIGH_URGENCY_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        } else {
          deadline = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        }

        const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 2 * 24 * 60 * 60 * 1000);

        // Check for existing active candidate with same noveltyKey + propertyId
        const existing = await prisma.gazetteStoryCandidate.findFirst({
          where: {
            propertyId,
            noveltyKey,
            status: { not: 'EXPIRED' as any },
          },
        });

        if (existing) {
          // Update existing candidate
          const updated = await prisma.gazetteStoryCandidate.update({
            where: { id: existing.id },
            data: {
              editionId: editionId ?? existing.editionId,
              lastUpdatedAt: now,
              urgencyScoreInput: signal.urgency,
              financialImpactEstimate: signal.financialImpact,
              confidenceScore: signal.confidence,
              engagementScore: signal.engagement,
              supportingFactsJson: signal.supportingFacts as any,
              headlineHint: signal.headlineHint ?? existing.headlineHint,
              primaryDeepLink: signal.primaryDeepLink,
              secondaryDeepLink: signal.secondaryDeepLink ?? existing.secondaryDeepLink,
              shareSafe: signal.shareSafe,
              storyDeadline: deadline,
              storyTag: signal.storyTag ?? existing.storyTag,
            },
          });
          results.push({ candidate: updated, isNew: false });
        } else {
          // Create new candidate
          const created = await prisma.gazetteStoryCandidate.create({
            data: {
              editionId: editionId ?? null,
              propertyId,
              sourceFeature: signal.sourceFeature,
              sourceEventId: signal.sourceEventId ?? null,
              storyCategory: signal.storyCategory as any,
              storyTag: signal.storyTag ?? null,
              entityType: signal.entityType,
              entityId: signal.entityId,
              headlineHint: signal.headlineHint ?? null,
              supportingFactsJson: signal.supportingFacts as any,
              urgencyScoreInput: signal.urgency,
              financialImpactEstimate: signal.financialImpact,
              confidenceScore: signal.confidence,
              engagementScore: signal.engagement,
              noveltyScore: 1.0, // new candidates start with maximum novelty
              noveltyKey,
              firstDetectedAt: now,
              lastUpdatedAt: now,
              storyDeadline: deadline,
              expiresAt,
              primaryDeepLink: signal.primaryDeepLink,
              secondaryDeepLink: signal.secondaryDeepLink ?? null,
              shareSafe: signal.shareSafe,
              status: 'ACTIVE' as any,
            },
          });
          results.push({ candidate: created, isNew: true });
        }
      } catch (err) {
        logger.error(
          `[GazetteCandidateFactory] Failed to process signal for ${signal.entityType}:${signal.entityId}:`,
          err,
        );
      }
    }

    return results;
  }

  /**
   * Mark ACTIVE candidates whose hard expiry (expiresAt) has passed as EXPIRED.
   * Should be called at the start of each generation run to keep the candidate
   * pool clean. Returns the number of candidates expired.
   */
  static async markExpiredCandidates(propertyId: string): Promise<number> {
    const now = new Date();
    const result = await prisma.gazetteStoryCandidate.updateMany({
      where: {
        propertyId,
        status: 'ACTIVE' as any,
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' as any },
    });
    return result.count;
  }

  /**
   * Compute a stable novelty key for a signal.
   * Exposed for testing and reuse.
   */
  static computeNoveltyKey(
    sourceFeature: string,
    entityType: string,
    entityId: string,
  ): string {
    const keyStr = `${sourceFeature}:${entityType}:${entityId}`;
    return createHash('sha256').update(keyStr).digest('hex');
  }
}
