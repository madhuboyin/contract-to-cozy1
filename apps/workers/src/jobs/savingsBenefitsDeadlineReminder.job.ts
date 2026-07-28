import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { logger, AppLogger } from '../lib/logger';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import type { WorkerRunResult } from '../lib/workerRunResult';
import { savingsBenefitsUrl } from '../lib/deepLinks';

const REMINDER_WINDOW_DAYS = 5;

export interface SavingsBenefitsDeadlineReminderDeps {
  prisma: Pick<typeof prisma, 'propertyHiddenAssetMatch'>;
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
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const matches = await (prisma as any).propertyHiddenAssetMatch.findMany({
    where: {
      status: { in: ['DETECTED', 'VIEWED', 'PURSUING'] },
      notificationSentAt: null,
      outcomes: { none: {} },
      program: {
        isActive: true,
        reviewStatus: 'PUBLISHED',
        applicationWindowClosesAt: { gte: now, lte: windowEnd },
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
      program: { select: { name: true, applicationWindowClosesAt: true } },
    },
  });

  logger.info(
    `[SavingsBenefitsDeadlineReminder] Found ${matches.length} match(es) with a closing application window${dryRun ? ' (dry run)' : ''}`,
  );

  let notified = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of matches) {
    try {
      const userId = match.property?.homeownerProfile?.userId;
      if (!userId || !match.program?.applicationWindowClosesAt) {
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

      await notificationService.create({
        userId,
        type: 'SAVINGS_BENEFIT_DEADLINE_REMINDER',
        title: `Application window closing: ${match.program.name}`,
        message: `The application window for "${match.program.name}" at ${propertyLabel} closes ${closesAt}. Review it before it's too late to apply.`,
        actionUrl: savingsBenefitsUrl(match.propertyId),
        entityType: 'PropertyHiddenAssetMatch',
        entityId: match.id,
        // MATERIAL_DEADLINE / MATERIAL explicitly, not left to
        // notificationPreference.service.ts's type-string regex inference —
        // see permitInspectionReminder.job.ts for why that matters (a
        // regex-inferred category can silently downgrade a real deadline to
        // routine, mutable-cadence chatter).
        category: 'MATERIAL_DEADLINE',
        urgency: 'MATERIAL',
        metadata: {
          propertyId: match.propertyId,
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
      });

      await (prisma as any).propertyHiddenAssetMatch.update({
        where: { id: match.id },
        data: { notificationSentAt: new Date() },
      });

      notified += 1;
      logger.info(`[SavingsBenefitsDeadlineReminder] Sent reminder for match ${match.id} (user ${userId})`);
    } catch (err) {
      failed += 1;
      logger.error({ err, matchId: match.id }, '[SavingsBenefitsDeadlineReminder] Failed to send reminder');
    }
  }

  return { examined: matches.length, notified, skipped, failed, smokeCorrelationId };
}
