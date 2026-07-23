// apps/workers/src/jobs/reserveFundBalanceReminder.job.ts
//
// Monthly nudge for active Reserve Funds that haven't had a contribution
// logged in 45+ days. Balances here are entirely self-reported — no
// bank-linking integration exists anywhere on this platform — so a fund that
// never gets updated silently drifts from reality.
// See docs/functional/HOME_RESERVE_FUND_PLANNER_FRD.md, Section 7 and 10.
//
// No persisted "last reminded at" field exists on HomeReserveFund. This is
// intentionally self-limiting instead: the 45-day-since-last-contribution
// check combined with this job's monthly cadence means a given fund can be
// re-notified at most once a month, which is an acceptable cadence for a
// reminder without needing new schema.

import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { logger, AppLogger } from '../lib/logger';
import { checkReserveFundWorkerContext } from '@worker-shared/services/financialContext/reserveFundWorkerContext.service';
import { reserveFundUrl } from '../lib/deepLinks';

const STALE_BALANCE_DAYS = 45;

// W4 item 1: small, job-scoped dependency interface — only the slice of
// each collaborator this job actually calls, not the full Prisma client or
// service surface. `defaultDeps` wires the real implementations so every
// existing caller (scheduleCronJobs()'s CRON_HANDLERS entry, which invokes
// this with zero arguments) is unaffected; tests inject fakes as a normal
// argument instead of swapping require.cache entries.
export interface ReserveFundBalanceReminderDeps {
  prisma: Pick<typeof prisma, 'homeReserveFund'>;
  notificationService: Pick<typeof NotificationService, 'create'>;
  logger: AppLogger;
  checkReserveFundWorkerContext: typeof checkReserveFundWorkerContext;
}

const defaultDeps: ReserveFundBalanceReminderDeps = {
  prisma,
  notificationService: NotificationService,
  logger,
  checkReserveFundWorkerContext,
};

export async function reserveFundBalanceReminderJob(
  deps: ReserveFundBalanceReminderDeps = defaultDeps,
): Promise<void> {
  const { prisma, notificationService, logger, checkReserveFundWorkerContext } = deps;
  const cutoff = new Date(Date.now() - STALE_BALANCE_DAYS * 24 * 60 * 60 * 1000);

  const funds = await prisma.homeReserveFund.findMany({
    where: { isActive: true },
    select: {
      id: true,
      propertyId: true,
      createdAt: true,
      homeownerProfile: { select: { userId: true } },
      contributions: {
        orderBy: { occurredAt: 'desc' },
        take: 1,
        select: { occurredAt: true },
      },
    },
  });

  logger.info(`[ReserveFundBalanceReminder] Checking ${funds.length} active fund(s)`);

  let notified = 0;

  for (const fund of funds) {
    const userId = fund.homeownerProfile?.userId;
    if (!userId) continue;

    const lastContributionAt = fund.contributions[0]?.occurredAt ?? null;
    const referenceDate = lastContributionAt ?? fund.createdAt;
    if (referenceDate > cutoff) continue;

    try {
      const context = await checkReserveFundWorkerContext(fund.propertyId);
      if (!context.allowed) {
        logger.warn(
          { propertyId: fund.propertyId, reasonCodes: context.reasonCodes },
          '[ReserveFundBalanceReminder] Skipping because Property Context is not applicable',
        );
        continue;
      }
      await notificationService.create({
        userId,
        type: 'RESERVE_FUND_BALANCE_REMINDER',
        title: 'Is your reserve fund balance still accurate?',
        message: lastContributionAt
          ? `You haven't logged a deposit or withdrawal in over ${STALE_BALANCE_DAYS} days. Take a moment to confirm your reserve fund balance is still up to date.`
          : "You haven't logged any contributions to your reserve fund yet. Log your current balance to start tracking progress.",
        actionUrl: reserveFundUrl(fund.propertyId),
        entityType: 'HomeReserveFund',
        entityId: fund.id,
        category: 'GENERAL',
        urgency: 'ROUTINE',
        metadata: { propertyId: fund.propertyId },
      });
      notified++;
    } catch (err) {
      logger.error({ err, propertyId: fund.propertyId }, '[ReserveFundBalanceReminder] Failed to notify');
    }
  }

  logger.info(`[ReserveFundBalanceReminder] Done — notified ${notified} homeowner(s)`);
}
