import { prisma } from '../../../lib/prisma';
import { DISMISSED_SUPPRESSION_DAYS } from '../domain/feedbackPolicy';
import { recordTypedFeedback } from '../../../services/feedback/typedFeedback.service';

export type PersonalizationHomeCommand =
  | 'COMPLETE'
  | 'ALREADY_DONE'
  | 'DEFER'
  | 'SNOOZE'
  | 'DISMISS'
  | 'NOT_RELEVANT';

const FEEDBACK_BY_COMMAND: Record<PersonalizationHomeCommand, {
  type: 'COMPLETED' | 'SNOOZED' | 'DISMISSED' | 'NOT_RELEVANT';
  reasonCode: 'ALREADY_DONE' | 'BAD_TIMING' | 'NOT_APPLICABLE' | 'OTHER' | null;
}> = {
  COMPLETE: { type: 'COMPLETED', reasonCode: null },
  ALREADY_DONE: { type: 'COMPLETED', reasonCode: 'ALREADY_DONE' },
  DEFER: { type: 'SNOOZED', reasonCode: 'BAD_TIMING' },
  SNOOZE: { type: 'SNOOZED', reasonCode: 'BAD_TIMING' },
  DISMISS: { type: 'DISMISSED', reasonCode: 'OTHER' },
  NOT_RELEVANT: { type: 'NOT_RELEVANT', reasonCode: 'NOT_APPLICABLE' },
};

export async function applyPersonalizationHomeActionLifecycle(params: {
  recommendationId: string;
  propertyId: string;
  actionKey: string;
  userId: string;
  command: PersonalizationHomeCommand;
  reason: string;
  nextTriggerAt: Date | null;
}): Promise<{ feedbackEventId: string; snoozed: boolean }> {
  const now = new Date();
  return prisma.$transaction(async (db) => {
    const recommendation = await db.personalizedRecommendation.findFirst({
      where: { id: params.recommendationId, propertyId: params.propertyId },
      select: { id: true, definitionId: true },
    });
    if (!recommendation) throw new Error('Personalization recommendation was not found for this property.');

    let lifecycleRecordId: string;
    if (params.nextTriggerAt) {
      await db.orchestrationActionSnooze.updateMany({
        where: { propertyId: params.propertyId, actionKey: params.actionKey, endedAt: null },
        data: { endedAt: now },
      });
      const snooze = await db.orchestrationActionSnooze.create({
        data: {
          propertyId: params.propertyId,
          actionKey: params.actionKey,
          snoozeUntil: params.nextTriggerAt,
          snoozeReason: params.reason,
        },
        select: { id: true },
      });
      lifecycleRecordId = `snooze:${snooze.id}`;
    } else {
      const event = await db.orchestrationActionEvent.upsert({
        where: {
          propertyId_actionKey_actionType: {
            propertyId: params.propertyId,
            actionKey: params.actionKey,
            actionType: params.command === 'COMPLETE' || params.command === 'ALREADY_DONE'
              ? 'USER_MARKED_COMPLETE'
              : 'USER_DISMISSED',
          },
        },
        create: {
          propertyId: params.propertyId,
          actionKey: params.actionKey,
          actionType: params.command === 'COMPLETE' || params.command === 'ALREADY_DONE'
            ? 'USER_MARKED_COMPLETE'
            : 'USER_DISMISSED',
          source: 'USER',
          createdBy: params.userId,
          payload: { command: params.command, reason: params.reason },
        },
        update: {
          source: 'USER',
          createdBy: params.userId,
          payload: { command: params.command, reason: params.reason },
        },
        select: { id: true },
      });
      lifecycleRecordId = `event:${event.id}`;
    }

    const feedback = FEEDBACK_BY_COMMAND[params.command];
    const feedbackEventId = `home:${lifecycleRecordId}:${params.command}`;
    await db.recommendationFeedback.upsert({
      where: { eventId: feedbackEventId },
      create: {
        recommendationId: params.recommendationId,
        eventId: feedbackEventId,
        type: feedback.type,
        explicit: true,
        reasonCode: feedback.reasonCode,
        comment: params.reason,
      },
      update: {},
    });
    await recordTypedFeedback({
      userId: params.userId,
      propertyId: params.propertyId,
      page: 'personalization',
      rating: feedback.type === 'COMPLETED' ? 'up' : 'down',
      comment: params.reason,
      targetType: 'OTHER',
      targetId: params.recommendationId,
      surface: 'HOME',
      reasonCodes: [
        feedback.type === 'COMPLETED' ? 'USEFUL' : 'NOT_USEFUL',
        ...(feedback.reasonCode === 'ALREADY_DONE' ? ['ALREADY_HANDLED' as const]
          : feedback.reasonCode === 'BAD_TIMING' ? ['WRONG_TIMING' as const]
            : feedback.reasonCode === 'NOT_APPLICABLE' ? ['NOT_APPLICABLE' as const] : []),
      ],
      capabilityId: 'personalization',
    }, db);

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
        reason: completed
          ? 'COMPLETED'
          : params.command === 'NOT_RELEVANT' || params.command === 'DISMISS'
            ? 'USER_DISMISSED'
            : 'SYSTEM',
        until,
      },
      update: {
        reason: completed
          ? 'COMPLETED'
          : params.command === 'NOT_RELEVANT' || params.command === 'DISMISS'
            ? 'USER_DISMISSED'
            : 'SYSTEM',
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
    return { feedbackEventId, snoozed: Boolean(params.nextTriggerAt) };
  });
}
