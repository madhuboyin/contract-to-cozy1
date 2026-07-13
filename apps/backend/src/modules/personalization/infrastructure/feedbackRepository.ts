// apps/backend/src/modules/personalization/infrastructure/feedbackRepository.ts
//
// Prisma-backed repository for RecommendationFeedback.
import { prisma } from '../../../lib/prisma';

export interface CreateFeedbackParams {
  recommendationId: string;
  eventId: string;
  type: string;
  explicit: boolean;
  reasonCode?: string | null;
  comment?: string | null;
}

/** Idempotency check — a duplicate eventId must be a true no-op, per PER-FR-011. */
export async function findFeedbackByEventId(eventId: string): Promise<{ id: string } | null> {
  return prisma.recommendationFeedback.findUnique({
    where: { eventId },
    select: { id: true },
  });
}

export async function createFeedback(params: CreateFeedbackParams): Promise<{ id: string }> {
  return prisma.recommendationFeedback.create({
    data: {
      recommendationId: params.recommendationId,
      eventId: params.eventId,
      type: params.type,
      explicit: params.explicit,
      reasonCode: params.reasonCode ?? null,
      comment: params.comment ?? null,
    },
    select: { id: true },
  });
}

export interface RecommendationSuppressionContext {
  propertyId: string;
  householdId: string | null;
  definitionId: string;
  definitionCode: string;
  category: string;
  dedupeKey: string;
}

/** One join covering everything recordRecommendationFeedback.usecase.ts needs to apply a suppression directive. Null if the recommendation doesn't exist. */
export async function loadRecommendationSuppressionContext(
  recommendationId: string,
): Promise<RecommendationSuppressionContext | null> {
  const recommendation = await prisma.personalizedRecommendation.findUnique({
    where: { id: recommendationId },
    select: {
      propertyId: true,
      householdId: true,
      definitionId: true,
      dedupeKey: true,
      definition: { select: { code: true, category: true } },
    },
  });
  if (!recommendation) return null;

  return {
    propertyId: recommendation.propertyId,
    householdId: recommendation.householdId,
    definitionId: recommendation.definitionId,
    definitionCode: recommendation.definition.code,
    category: recommendation.definition.category,
    dedupeKey: recommendation.dedupeKey,
  };
}
