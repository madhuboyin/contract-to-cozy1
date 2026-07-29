import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { logger, AppLogger } from '../lib/logger';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import type { WorkerRunResult } from '../lib/workerRunResult';
import { savingsBenefitsUrl } from '../lib/deepLinks';
import { isProgramActionableNow } from '@worker-shared/services/hiddenAssets/sourceFreshness';

const REMINDER_SCAN_WINDOW_DAYS = 90;
const REMINDER_CLAIM_LEASE_MS = 30 * 60 * 1000;

export interface SavingsBenefitsDeadlineReminderDeps {
  prisma: Pick<typeof prisma, 'propertyHiddenAssetMatch' | 'notificationPreference' | 'notification'>;
  notificationService: Pick<typeof NotificationService, 'create'>;
  logger: AppLogger;
}

const defaultDeps: SavingsBenefitsDeadlineReminderDeps = {
  prisma,
  notificationService: NotificationService,
  logger,
};

/**
 * Reminds a homeowner before a benefit's application window closes
 * (HiddenAssetProgram.applicationWindowClosesAt, Slice 6) — that field has
 * had no consumer since it shipped. Mirrors permitInspectionReminder.job.ts's
 * pattern exactly: idempotent via notificationSentAt, dry-run and smoke-scope
 * aware, one match's failure never aborts the rest of the run.
 *
 * Skips a match once any outcome has been recorded for it
 * (HiddenAssetMatchOutcome, Slice 7) — SUBMITTED or later means the
 * homeowner has already acted, so a "the window is closing" reminder no
 * longer applies. Also fails closed on the program itself: a match whose
 * program has since been unpublished or deactivated is never reminded.
 */
export async function savingsBenefitsDeadlineReminderJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: SavingsBenefitsDeadlineReminderDeps = defaultDeps,
): Promise<WorkerRunResult> {
  const { prisma, notificationService, logger } = deps;
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[SavingsBenefitsDeadlineReminder] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId
    ? generateSmokeCorrelationId('savings-benefits-deadline-reminders')
    : undefined;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const matches = await (prisma as any).propertyHiddenAssetMatch.findMany({
    where: {
      status: { in: ['DETECTED', 'VIEWED', 'PURSUING'] },
      notificationSentAt: null,
      OR: [
        { notificationClaimedAt: null },
        { notificationClaimedAt: { lt: new Date(now.getTime() - REMINDER_CLAIM_LEASE_MS) } },
      ],
      outcomes: { none: {} },
      program: {
        isActive: true,
        reviewStatus: 'PUBLISHED',
        fundingStatus: { not: 'CLOSED' },
        applicationWindowClosesAt: { gte: now, lte: windowEnd },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          {
            OR: [
              { applicationWindowOpensAt: null },
              { applicationWindowOpensAt: { lte: now } },
            ],
          },
        ],
      },
      ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
    },
    include: {
      property: {
        select: {
          address: true,
          city: true,
          homeownerProfile: { select: { userId: true } },
        },
      },
      program: {
        include: {
          source: true,
        },
      },
    },
  });

  logger.info(
    `[SavingsBenefitsDeadlineReminder] Found ${matches.length} match(es) with a closing application window${dryRun ? ' (dry run)' : ''}`,
  );

  let notified = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of matches) {
    let claimTime: Date | null = null;
    try {
      const userId = match.property?.homeownerProfile?.userId;
      if (
        !userId
        || !match.program?.applicationWindowClosesAt
        || !isProgramActionableNow(match.program, match.program.source, now)
      ) {
        skipped += 1;
        continue;
      }
      const preferences = await (prisma as any).notificationPreference.findMany({
        where: {
          userId,
          category: 'SAVINGS_BENEFITS',
          channel: 'EMAIL',
          scopeKey: { in: [`PROPERTY:${match.propertyId}`, 'GLOBAL'] },
        },
      });
      const preference =
        preferences.find((item: any) => item.scopeKey === `PROPERTY:${match.propertyId}`)
        ?? preferences.find((item: any) => item.scopeKey === 'GLOBAL');
      if (!preference?.enabled || preference.cadence === 'MUTED') {
        skipped += 1;
        continue;
      }
      const leadDays = preference.deadlineLeadDays ?? 14;
      const daysUntilDeadline = Math.ceil(
        (new Date(match.program.applicationWindowClosesAt).getTime() - now.getTime())
        / (24 * 60 * 60 * 1000),
      );
      const estimatedValue = Number(
        match.estimatedValueMax?.toString?.()
        ?? match.estimatedValueMin?.toString?.()
        ?? 0,
      );
      const minimumValue = Number(preference.minimumValue?.toString?.() ?? 0);
      if (daysUntilDeadline > leadDays || estimatedValue < minimumValue) {
        skipped += 1;
        continue;
      }

      const closesAt = new Date(match.program.applicationWindowClosesAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const propertyLabel = [match.property?.address, match.property?.city].filter(Boolean).join(', ') || 'your property';

      if (dryRun) {
        notified += 1;
        logger.info(`[SavingsBenefitsDeadlineReminder] (dry run) Would send reminder for match ${match.id} (user ${userId})`);
        continue;
      }

      claimTime = new Date();
      const claim = await (prisma as any).propertyHiddenAssetMatch.updateMany({
        where: {
          id: match.id,
          notificationSentAt: null,
          OR: [
            { notificationClaimedAt: null },
            {
              notificationClaimedAt: {
                lt: new Date(claimTime.getTime() - REMINDER_CLAIM_LEASE_MS),
              },
            },
          ],
        },
        data: { notificationClaimedAt: claimTime },
      });
      if (claim.count !== 1) {
        skipped += 1;
        continue;
      }

      // A previous worker may have created the durable notification and
      // crashed before it could finalize notificationSentAt. Reconcile that
      // state after acquiring the lease instead of sending a duplicate.
      const existingNotification = await (prisma as any).notification.findFirst({
        where: {
          userId,
          type: 'SAVINGS_BENEFIT_DEADLINE_REMINDER',
          entityType: 'PropertyHiddenAssetMatch',
          entityId: match.id,
        },
        select: { id: true },
      });
      if (existingNotification) {
        await (prisma as any).propertyHiddenAssetMatch.updateMany({
          where: {
            id: match.id,
            notificationSentAt: null,
            notificationClaimedAt: claimTime,
          },
          data: {
            notificationSentAt: new Date(),
            notificationClaimedAt: null,
          },
        });
        claimTime = null;
        skipped += 1;
        continue;
      }

      const notification = await notificationService.create({
        userId,
        type: 'SAVINGS_BENEFIT_DEADLINE_REMINDER',
        title: `Application window closing: ${match.program.name}`,
        message: `The application window for "${match.program.name}" at ${propertyLabel} closes ${closesAt}. Review it before it's too late to apply.`,
        actionUrl: savingsBenefitsUrl(match.propertyId),
        entityType: 'PropertyHiddenAssetMatch',
        entityId: match.id,
        // SAVINGS_BENEFITS / MATERIAL explicitly, not left to
        // notificationPreference.service.ts's type-string regex inference —
        // see permitInspectionReminder.job.ts for why that matters (a
        // regex-inferred category can silently downgrade a real deadline to
        // routine, mutable-cadence chatter). A dedicated category (rather
        // than the generic MATERIAL_DEADLINE bucket shared with permits and
        // other deadlines) lets a homeowner mute this specific reminder
        // without silencing unrelated deadline notifications (HSB-037).
        category: 'SAVINGS_BENEFITS',
        urgency: 'MATERIAL',
        metadata: {
          propertyId: match.propertyId,
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
      });
      if (!notification) {
        await (prisma as any).propertyHiddenAssetMatch.updateMany({
          where: {
            id: match.id,
            notificationSentAt: null,
            notificationClaimedAt: claimTime,
          },
          data: { notificationClaimedAt: null },
        });
        claimTime = null;
        skipped += 1;
        logger.info(
          `[SavingsBenefitsDeadlineReminder] Notification policy/context suppressed match ${match.id}; leaving it retryable`,
        );
        continue;
      }

      await (prisma as any).propertyHiddenAssetMatch.updateMany({
        where: {
          id: match.id,
          notificationSentAt: null,
          notificationClaimedAt: claimTime,
        },
        data: {
          notificationSentAt: new Date(),
          notificationClaimedAt: null,
        },
      });
      claimTime = null;

      notified += 1;
      logger.info(`[SavingsBenefitsDeadlineReminder] Sent reminder for match ${match.id} (user ${userId})`);
    } catch (err) {
      if (claimTime) {
        try {
          await (prisma as any).propertyHiddenAssetMatch.updateMany({
            where: {
              id: match.id,
              notificationSentAt: null,
              notificationClaimedAt: claimTime,
            },
            data: { notificationClaimedAt: null },
          });
        } catch (releaseError) {
          logger.error(
            { err: releaseError, matchId: match.id },
            '[SavingsBenefitsDeadlineReminder] Failed to release reminder claim',
          );
        }
      }
      failed += 1;
      logger.error({ err, matchId: match.id }, '[SavingsBenefitsDeadlineReminder] Failed to send reminder');
    }
  }

  return { examined: matches.length, notified, skipped, failed, smokeCorrelationId };
}
