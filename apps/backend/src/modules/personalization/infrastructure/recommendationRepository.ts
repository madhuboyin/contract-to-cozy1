// apps/backend/src/modules/personalization/infrastructure/recommendationRepository.ts
//
// Prisma-backed recommendation lifecycle repository. The pilot read API now
// consumes these instances; the older shadow evaluator remains a compatibility
// caller for its diagnostic tests.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface ReasonCode {
  code: string;
  templateKey: string;
  params?: Record<string, unknown>;
}

export interface UpsertRecommendationParams {
  propertyId: string;
  householdId?: string | null;
  definitionId: string;
  evaluationRunId: string | null;
  ruleVersion: number;
  dedupeKey: string;
  headline: string;
  reasonCodes: ReasonCode[];
  evidence: unknown;
  score?: number;
  priorityBand?: string;
  confidence?: number;
  scoreBreakdown?: unknown;
}

/**
 * Upserts the one ACTIVE recommendation instance for a (property, definition)
 * pair — this slice only ever has one occurrence per pair (`occurrenceKey:
 * 'default'`), so re-running the shadow job just refreshes the same row's
 * evaluationRunId/ruleVersion/lastEvaluatedAt rather than creating a new one.
 * The explanation is upserted at version 1 for the same reason — this slice
 * doesn't keep an explanation version history, just a current one.
 */
export async function upsertRecommendation(
  params: UpsertRecommendationParams,
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
      householdId: params.householdId ?? null,
      definitionId: params.definitionId,
      evaluationRunId: params.evaluationRunId,
      ruleVersion: params.ruleVersion,
      dedupeKey: params.dedupeKey,
      status: 'ACTIVE',
      score: params.score,
      priorityBand: params.priorityBand,
      confidence: params.confidence,
      scoreBreakdown: params.scoreBreakdown as Prisma.InputJsonValue | undefined,
    },
    update: {
      householdId: params.householdId ?? null,
      evaluationRunId: params.evaluationRunId,
      ruleVersion: params.ruleVersion,
      lastEvaluatedAt: new Date(),
      // Re-eligibility after a prior EXPIRED/SUPPRESSED run must actually
      // revive the row, not just refresh its metadata — this was a latent
      // gap left by the FALSE/UNKNOWN expiry fix (expireRecommendationIfActive
      // below): without resetting status here, a once-expired recommendation
      // could never become ACTIVE again even after the property re-qualifies.
      status: 'ACTIVE',
      score: params.score,
      priorityBand: params.priorityBand,
      confidence: params.confidence,
      scoreBreakdown: params.scoreBreakdown as Prisma.InputJsonValue | undefined,
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

export type UpsertShadowRecommendationParams = UpsertRecommendationParams;
export const upsertShadowRecommendation = upsertRecommendation;

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

/**
 * Flips a previously-ACTIVE recommendation to SUPPRESSED when an active
 * RecommendationSuppression covers it — called instead of upserting when
 * shadowEvaluateHvacFilterProofForProperty finds an eligible result that's
 * suppressed. No-op if nothing is currently ACTIVE for this pair.
 */
export async function suppressRecommendationIfActive(propertyId: string, definitionId: string): Promise<void> {
  await prisma.personalizedRecommendation.updateMany({
    where: {
      propertyId,
      definitionId,
      occurrenceKey: 'default',
      status: 'ACTIVE',
    },
    data: {
      status: 'SUPPRESSED',
    },
  });
}

/**
 * Flips a recommendation to DISMISSED when explicit negative feedback
 * (application/recordRecommendationFeedback.usecase.ts + domain/feedbackPolicy.ts)
 * arrives for it — so it stops showing immediately rather than waiting for
 * the next shadow-eval tick. Guarded to only act on a currently-ACTIVE row,
 * same as its siblings above — a COMPLETED/EXPIRED/SUPPRESSED row is left as is.
 */
export async function markRecommendationDismissed(recommendationId: string): Promise<void> {
  await prisma.personalizedRecommendation.updateMany({
    where: {
      id: recommendationId,
      status: 'ACTIVE',
    },
    data: {
      status: 'DISMISSED',
    },
  });
}
