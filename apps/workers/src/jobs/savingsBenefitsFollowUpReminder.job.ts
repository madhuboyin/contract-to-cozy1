import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { logger, AppLogger } from '../lib/logger';
import { savingsBenefitsUrl } from '../lib/deepLinks';
import type { WorkerRunResult } from '../lib/workerRunResult';

const CLAIM_LEASE_MS = 30 * 60 * 1000;

export interface SavingsBenefitsFollowUpReminderDeps {
  prisma: Pick<
    typeof prisma,
    'savingsBenefitAction' | 'property' | 'notificationPreference' | 'notification'
  >;
  notificationService: Pick<typeof NotificationService, 'create'>;
  logger: AppLogger;
}

const defaultDeps: SavingsBenefitsFollowUpReminderDeps = {
  prisma,
  notificationService: NotificationService,
  logger,
};

export async function savingsBenefitsFollowUpReminderJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: SavingsBenefitsFollowUpReminderDeps = defaultDeps,
): Promise<WorkerRunResult> {
  const now = new Date();
  const staleClaimBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  const actions = await deps.prisma.savingsBenefitAction.findMany({
    where: {
      state: 'STARTED',
      followUpAt: { lte: now },
      followUpNotificationSentAt: null,
      OR: [
        { followUpNotificationClaimedAt: null },
        { followUpNotificationClaimedAt: { lt: staleClaimBefore } },
      ],
      ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
    },
    orderBy: { followUpAt: 'asc' },
    take: 500,
  });

  let notified = 0;
  let skipped = 0;
  let failed = 0;
  for (const action of actions) {
    let claimTime: Date | null = null;
    try {
      const followUpAt = action.followUpAt;
      if (!followUpAt) {
        skipped += 1;
        continue;
      }
      const property = await deps.prisma.property.findUnique({
        where: { id: action.propertyId },
        select: { homeownerProfile: { select: { userId: true } } },
      });
      const userId = property?.homeownerProfile?.userId;
      if (!userId) {
        skipped += 1;
        continue;
      }
      const preferences = await deps.prisma.notificationPreference.findMany({
        where: {
          userId,
          category: 'SAVINGS_BENEFITS',
          channel: 'EMAIL',
          scopeKey: { in: [`PROPERTY:${action.propertyId}`, 'GLOBAL'] },
        },
      });
      const preference =
        preferences.find((item) => item.scopeKey === `PROPERTY:${action.propertyId}`)
        ?? preferences.find((item) => item.scopeKey === 'GLOBAL');
      if (!preference?.enabled || preference.cadence === 'MUTED') {
        skipped += 1;
        continue;
      }
      if (opts?.dryRun) {
        notified += 1;
        continue;
      }

      claimTime = new Date();
      const claimed = await deps.prisma.savingsBenefitAction.updateMany({
        where: {
          id: action.id,
          state: 'STARTED',
          followUpNotificationSentAt: null,
          OR: [
            { followUpNotificationClaimedAt: null },
            { followUpNotificationClaimedAt: { lt: staleClaimBefore } },
          ],
        },
        data: { followUpNotificationClaimedAt: claimTime },
      });
      if (claimed.count !== 1) {
        skipped += 1;
        continue;
      }

      const existingNotification = await deps.prisma.notification.findFirst({
        where: {
          userId,
          type: 'SAVINGS_BENEFIT_ACTION_FOLLOW_UP',
          entityType: 'SavingsBenefitAction',
          entityId: action.id,
          metadata: {
            path: ['followUpAt'],
            equals: followUpAt.toISOString(),
          },
        },
        select: { id: true },
      });
      if (!existingNotification) {
        const created = await deps.notificationService.create({
          userId,
          type: 'SAVINGS_BENEFIT_ACTION_FOLLOW_UP',
          title: 'Savings & Benefits follow-up due',
          message: 'Resume your saved checklist and record what happened.',
          actionUrl: `${savingsBenefitsUrl(action.propertyId)}?section=in-progress&actionId=${action.id}`,
          entityType: 'SavingsBenefitAction',
          entityId: action.id,
          category: 'SAVINGS_BENEFITS',
          urgency: 'ROUTINE',
          metadata: {
            propertyId: action.propertyId,
            followUpAt: followUpAt.toISOString(),
          },
        });
        if (!created) {
          await deps.prisma.savingsBenefitAction.updateMany({
            where: { id: action.id, followUpNotificationClaimedAt: claimTime },
            data: { followUpNotificationClaimedAt: null },
          });
          claimTime = null;
          skipped += 1;
          continue;
        }
      }
      await deps.prisma.savingsBenefitAction.updateMany({
        where: {
          id: action.id,
          followUpNotificationSentAt: null,
          followUpNotificationClaimedAt: claimTime,
        },
        data: {
          followUpNotificationSentAt: new Date(),
          followUpNotificationClaimedAt: null,
        },
      });
      claimTime = null;
      notified += 1;
    } catch (err) {
      if (claimTime) {
        await deps.prisma.savingsBenefitAction.updateMany({
          where: { id: action.id, followUpNotificationClaimedAt: claimTime },
          data: { followUpNotificationClaimedAt: null },
        }).catch((releaseError) => {
          deps.logger.error(
            { err: releaseError, actionId: action.id },
            '[SavingsBenefitsFollowUpReminder] Failed to release claim',
          );
        });
      }
      failed += 1;
      deps.logger.error(
        { err, actionId: action.id },
        '[SavingsBenefitsFollowUpReminder] Failed to send follow-up',
      );
    }
  }
  return { examined: actions.length, notified, skipped, failed };
}
