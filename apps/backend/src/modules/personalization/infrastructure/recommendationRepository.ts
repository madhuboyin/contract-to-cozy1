// apps/backend/src/modules/personalization/infrastructure/recommendationRepository.ts
//
// Prisma-backed repository for persisting shadow-evaluated recommendation
// instances (migration steps 4-6). Not read by any consumer yet — writes
// only, for the shadow-diagnostic pipeline to prove the schema/lifecycle
// works before anything is ever shown to a user.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface ReasonCode {
  code: string;
  templateKey: string;
  params?: Record<string, unknown>;
}

export interface UpsertShadowRecommendationParams {
  propertyId: string;
  definitionId: string;
  evaluationRunId: string | null;
  ruleVersion: number;
  dedupeKey: string;
  headline: string;
  reasonCodes: ReasonCode[];
  evidence: unknown;
}

/**
 * Upserts the one ACTIVE recommendation instance for a (property, definition)
 * pair — this slice only ever has one occurrence per pair (`occurrenceKey:
 * 'default'`), so re-running the shadow job just refreshes the same row's
 * evaluationRunId/ruleVersion/lastEvaluatedAt rather than creating a new one.
 * The explanation is upserted at version 1 for the same reason — this slice
 * doesn't keep an explanation version history, just a current one.
 */
export async function upsertShadowRecommendation(
  params: UpsertShadowRecommendationParams,
): Promise<{ id: string }> {
  const recommendation = await prisma.personalizedRecommendation.upsert({
    where: {
      propertyId_definitionId_occurrenceKey: {
        propertyId: params.propertyId,
        definitionId: params.definitionId,
        occurrenceKey: 'default',
      },
    },
    create: {
      propertyId: params.propertyId,
      definitionId: params.definitionId,
      evaluationRunId: params.evaluationRunId,
      ruleVersion: params.ruleVersion,
      dedupeKey: params.dedupeKey,
      status: 'ACTIVE',
    },
    update: {
      evaluationRunId: params.evaluationRunId,
      ruleVersion: params.ruleVersion,
      lastEvaluatedAt: new Date(),
    },
  });

  await prisma.recommendationExplanation.upsert({
    where: {
      recommendationId_version: { recommendationId: recommendation.id, version: 1 },
    },
    create: {
      recommendationId: recommendation.id,
      version: 1,
      headline: params.headline,
      reasonCodes: params.reasonCodes as unknown as Prisma.InputJsonValue,
      evidenceJson: params.evidence as Prisma.InputJsonValue,
    },
    update: {
      headline: params.headline,
      reasonCodes: params.reasonCodes as unknown as Prisma.InputJsonValue,
      evidenceJson: params.evidence as Prisma.InputJsonValue,
    },
  });

  return { id: recommendation.id };
}

/**
 * Retires a previously-ACTIVE recommendation once re-evaluation comes back
 * FALSE/UNKNOWN, so it doesn't stay stale indefinitely (e.g. an HVAC filter
 * gets serviced after an earlier eligible run). No-op (updateMany matches
 * zero rows) if no ACTIVE recommendation exists for this pair — this slice
 * only ever has one occurrence per (property, definition), same as
 * upsertShadowRecommendation above.
 */
export async function expireRecommendationIfActive(propertyId: string, definitionId: string): Promise<void> {
  await prisma.personalizedRecommendation.updateMany({
    where: {
      propertyId,
      definitionId,
      occurrenceKey: 'default',
      status: 'ACTIVE',
    },
    data: {
      status: 'EXPIRED',
      expiresAt: new Date(),
    },
  });
}
