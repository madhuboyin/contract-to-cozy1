import { prisma } from '../../../lib/prisma';
import { DISMISSED_SUPPRESSION_DAYS } from '../domain/feedbackPolicy';

export type PersonalizationHomeCommand =
  | 'COMPLETE'
  | 'ALREADY_DONE'
  | 'DEFER'
  | 'SNOOZE'
  | 'DISMISS'
  | 'NOT_RELEVANT';

export async function applyPersonalizationHomeActionLifecycle(params: {
  recommendationId: string;
  propertyId: string;
  userId: string;
  command: PersonalizationHomeCommand;
  reason: string;
  nextTriggerAt: Date | null;
}): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (db) => {
    const recommendation = await db.personalizedRecommendation.findFirst({
      where: { id: params.recommendationId, propertyId: params.propertyId },
      select: { id: true, definitionId: true },
    });
    if (!recommendation) throw new Error('Personalization recommendation was not found for this property.');

    const feedbackType = params.command === 'ALREADY_DONE' ? 'COMPLETED' : params.command;
    await db.recommendationFeedback.upsert({
      where: { eventId: `home:${params.recommendationId}:${params.command}` },
      create: {
        recommendationId: params.recommendationId,
        eventId: `home:${params.recommendationId}:${params.command}`,
        type: feedbackType,
        explicit: true,
        reasonCode: params.command,
        comment: params.reason,
      },
      update: {},
    });

    const completed = params.command === 'COMPLETE' || params.command === 'ALREADY_DONE';
    const temporary = params.command === 'DEFER' || params.command === 'SNOOZE' || params.command === 'DISMISS';
    const requestedUntil = params.command === 'DEFER' || params.command === 'SNOOZE'
      ? params.nextTriggerAt
      : params.command === 'DISMISS'
        ? new Date(now.getTime() + DISMISSED_SUPPRESSION_DAYS * 86_400_000)
        : null;
    const existing = await db.recommendationSuppression.findUnique({
      where: { propertyId_definitionId: { propertyId: params.propertyId, definitionId: recommendation.definitionId } },
      select: { until: true },
    });
    const until = existing?.until === null
      ? null
      : existing?.until && requestedUntil
        ? (existing.until > requestedUntil ? existing.until : requestedUntil)
        : requestedUntil;

    await db.recommendationSuppression.upsert({
      where: { propertyId_definitionId: { propertyId: params.propertyId, definitionId: recommendation.definitionId } },
      create: {
        propertyId: params.propertyId,
        definitionId: recommendation.definitionId,
        reason: completed ? 'COMPLETED' : params.command === 'NOT_RELEVANT' ? 'USER_DISMISSED' : 'SYSTEM',
        until,
      },
      update: {
        reason: completed ? 'COMPLETED' : params.command === 'NOT_RELEVANT' ? 'USER_DISMISSED' : 'SYSTEM',
        until,
      },
    });

    await db.personalizedRecommendation.update({
      where: { id: params.recommendationId },
      data: {
        status: completed ? 'COMPLETED' : temporary ? 'SUPPRESSED' : 'DISMISSED',
        ...(completed || !temporary ? { expiresAt: now } : {}),
      },
    });
  });
}
