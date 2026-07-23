// apps/workers/src/jobs/seasonalNotification.job.ts
//
// WKR-002 fix: this previously read a legacy PropertyClimateSetting flag and
// called the SMTP transport (sendEmail) directly — bypassing every
// preference, quiet-hours, cadence, mute, and duplicate-suppression control
// every other notification in the product goes through, and building its
// own bespoke HTML email inline. It also included a non-existent
// `property.user` Prisma relation (Property only has `homeownerProfile`,
// which itself relates to `user`), which would throw on the very first
// query — so beyond the governance bypass, this job could not have run
// successfully in its previous form.
//
// This now creates one governed notification per checklist via
// NotificationService.create, which applies the homeowner's real
// preferences/cadence/quiet-hours policy and only the delivery worker
// (sendEmailNotification.job.ts) ever calls the email transport. Outbound
// send is additionally gated by WORKER_OUTBOUND_NOTIFICATIONS_ENABLED
// (transportEnabled) — the Notification + PENDING delivery rows are still
// created for in-app display / dry-run inspection either way.

import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';
import { evaluateSeasonalTemplateApplicability } from '@worker-shared/services/seasonal/applicabilityPolicy';
import { buildSeasonalPropertyContext } from './seasonalChecklistGeneration.job';
import { NotificationService } from '@worker-shared/services/notification.service';
import { areWorkerOutboundNotificationsEnabled } from '@worker-shared/config/workerExecutionPolicy';
import { seasonalChecklistUrl } from '../lib/deepLinks';

const SEASON_NAMES: Record<string, string> = {
  SPRING: 'Spring',
  SUMMER: 'Summer',
  FALL: 'Fall',
  WINTER: 'Winter',
};

function getSeasonName(season: string): string {
  return SEASON_NAMES[season] || season;
}

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern). Includes the two pure
// applicability/context functions alongside the I/O collaborators — the
// existing test suite for this job already needed to substitute them (a
// checklist fixture only has to satisfy whatever shape the fake expects,
// not the real, much larger PropertyContextSnapshot).
export interface SeasonalNotificationDeps {
  prisma: Pick<typeof prisma, 'seasonalChecklist' | 'propertyClimateSetting' | 'orchestrationActionEvent' | 'orchestrationActionSnooze'>;
  logger: AppLogger;
  notificationService: Pick<typeof NotificationService, 'create'>;
  areWorkerOutboundNotificationsEnabled: typeof areWorkerOutboundNotificationsEnabled;
  evaluateSeasonalTemplateApplicability: typeof evaluateSeasonalTemplateApplicability;
  buildSeasonalPropertyContext: typeof buildSeasonalPropertyContext;
}

const defaultDeps: SeasonalNotificationDeps = {
  prisma,
  logger,
  notificationService: NotificationService,
  areWorkerOutboundNotificationsEnabled,
  evaluateSeasonalTemplateApplicability,
  buildSeasonalPropertyContext,
};

export async function sendSeasonalNotifications(deps: SeasonalNotificationDeps = defaultDeps) {
  const { prisma, logger } = deps;
  logger.info('[SEASONAL-NOTIFY] Starting notification job...');
  const transportEnabled = deps.areWorkerOutboundNotificationsEnabled();

  const checklistsToNotify = await (prisma as any).seasonalChecklist.findMany({
    where: {
      status: 'PENDING',
      notificationSentAt: null,
    },
    include: {
      property: {
        include: {
          homeownerProfile: { select: { userId: true } },
          exteriorProfile: true,
          responsibilities: true,
          inventoryItems: { select: { category: true, name: true, tags: true } },
          maintenanceTasks: {
            select: {
              status: true,
              lastCompletedDate: true,
              updatedAt: true,
              seasonalChecklistItem: { select: { taskKey: true } },
            },
          },
        },
      },
      items: {
        include: {
          seasonalTaskTemplate: true,
        },
      },
    },
  });

  logger.info(`[SEASONAL-NOTIFY] Found ${checklistsToNotify.length} checklists to potentially notify`);

  let notified = 0;
  let skipped = 0;
  let errors = 0;

  for (const checklist of checklistsToNotify) {
    try {
      const sent = await notifyForChecklist(checklist, transportEnabled, deps);
      if (sent) notified += 1;
      else skipped += 1;
    } catch (error) {
      errors += 1;
      logger.error({ err: error }, `[SEASONAL-NOTIFY] Failed for checklist ${checklist.id}`);
    }
  }

  logger.info(
    `[SEASONAL-NOTIFY] Job complete. Notified: ${notified}, Skipped: ${skipped}, Errors: ${errors}, Total: ${checklistsToNotify.length}`,
  );

  if (errors > 0 && errors === checklistsToNotify.length) {
    throw new Error(`[SEASONAL-NOTIFY] All ${errors} checklist(s) failed — rejecting run instead of reporting false success`);
  }

  return { examined: checklistsToNotify.length, notified, skipped, failed: errors };
}

// The canonical seasonal Home Action's identity, per
// homeActionSourcePromotion.service.ts#loadSeasonalChecklistActions — a
// homeowner snoozing/dismissing that card in Unified Home records an
// OrchestrationActionSnooze/OrchestrationActionEvent row keyed by exactly
// this string. Must match precisely or the two systems silently disagree.
function seasonalChecklistActionKey(checklistId: string): string {
  return `seasonal-checklist:${checklistId}`;
}

/**
 * WKR-002 follow-up: this notification previously only had one-shot
 * idempotency (notificationSentAt) — a homeowner who dismissed or snoozed
 * the canonical seasonal Home Action in Unified Home could still get a
 * fresh notification for the same checklist if it was ever regenerated or
 * reconciled (which clears notificationSentAt). Checking the same
 * snooze/dismiss records the Home Action itself uses closes that gap —
 * maintenance reminders get equivalent suppression for free through the
 * aggregationContext lifecycle system, which doesn't cover seasonal
 * checklists (a checklist-level entity, not a per-task one).
 */
async function isSeasonalChecklistActionSuppressed(
  propertyId: string,
  checklistId: string,
  deps: SeasonalNotificationDeps,
): Promise<boolean> {
  const actionKey = seasonalChecklistActionKey(checklistId);
  const [dismissed, snoozed] = await Promise.all([
    deps.prisma.orchestrationActionEvent.findFirst({
      where: { propertyId, actionKey, actionType: { in: ['USER_MARKED_COMPLETE', 'USER_DISMISSED'] } },
      select: { id: true },
    }),
    deps.prisma.orchestrationActionSnooze.findFirst({
      where: { propertyId, actionKey, endedAt: null, snoozeUntil: { gt: new Date() } },
      select: { id: true },
    }),
  ]);
  return !!(dismissed || snoozed);
}

async function notifyForChecklist(
  checklist: any,
  transportEnabled: boolean,
  deps: SeasonalNotificationDeps,
): Promise<boolean> {
  const { prisma, logger, notificationService, evaluateSeasonalTemplateApplicability, buildSeasonalPropertyContext } = deps;
  const userId = checklist.property.homeownerProfile?.userId;
  if (!userId) {
    logger.warn(`[SEASONAL-NOTIFY] Skipping checklist ${checklist.id}; property has no homeowner`);
    return false;
  }

  if (await isSeasonalChecklistActionSuppressed(checklist.propertyId, checklist.id, deps)) {
    logger.info(`[SEASONAL-NOTIFY] Skipping checklist ${checklist.id}; canonical Home Action is snoozed or dismissed`);
    return false;
  }

  // PropertyClimateSetting.notificationEnabled is a legacy, seasonal-specific
  // opt-out that predates NotificationService's canonical preference system.
  // Respect it as an additional (not replacement) filter — an explicit
  // "false" here still suppresses the notification even if canonical
  // preferences would otherwise allow it.
  const climateSetting = await (prisma as any).propertyClimateSetting.findUnique({
    where: { propertyId: checklist.propertyId },
  });
  if (climateSetting?.notificationEnabled === false) {
    return false;
  }

  const propertyContext = buildSeasonalPropertyContext(checklist.property);
  const applicableItems = checklist.items.filter((item: any) =>
    evaluateSeasonalTemplateApplicability(propertyContext, {
      taskKey: item.taskKey,
      priority: item.priority,
      requiredAssetCheck: item.seasonalTaskTemplate.requiredAssetCheck,
      requiredAssetType: item.seasonalTaskTemplate.requiredAssetType,
    }).status === 'APPLICABLE',
  );
  if (applicableItems.length === 0) {
    logger.info(`[SEASONAL-NOTIFY] Skipping checklist ${checklist.id}; no tasks remain applicable`);
    return false;
  }

  const criticalCount = applicableItems.filter((item: any) => item.priority === 'CRITICAL').length;
  const seasonName = getSeasonName(checklist.season);
  const daysUntil = Math.floor(
    (new Date(checklist.seasonStartDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  const result = await notificationService.create({
    userId,
    type: 'SEASONAL_CHECKLIST_READY',
    title: `${seasonName} checklist ready — ${applicableItems.length} task${applicableItems.length === 1 ? '' : 's'}`,
    message:
      criticalCount > 0
        ? `Your ${seasonName} maintenance checklist has ${applicableItems.length} applicable tasks, including ${criticalCount} critical. Season starts in ${Math.max(daysUntil, 0)} days.`
        : `Your ${seasonName} maintenance checklist has ${applicableItems.length} applicable tasks. Season starts in ${Math.max(daysUntil, 0)} days.`,
    actionUrl: seasonalChecklistUrl(checklist.propertyId),
    entityType: 'SEASONAL_CHECKLIST',
    entityId: checklist.id,
    category: 'MAINTENANCE',
    urgency: criticalCount > 0 ? 'MATERIAL' : 'ROUTINE',
    transportEnabled,
    metadata: {
      propertyId: checklist.propertyId,
      season: checklist.season,
      year: checklist.year,
      applicableTaskCount: applicableItems.length,
      criticalTaskCount: criticalCount,
    },
  });

  await (prisma as any).seasonalChecklist.update({
    where: { id: checklist.id },
    data: { notificationSentAt: new Date() },
  });

  return !!result;
}
