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
import { logger } from '../lib/logger';
import { evaluateSeasonalTemplateApplicability } from '../../../backend/src/services/seasonal/applicabilityPolicy';
import { buildSeasonalPropertyContext } from './seasonalChecklistGeneration.job';
import { NotificationService } from '../../../backend/src/services/notification.service';
import { areWorkerOutboundNotificationsEnabled } from '../../../backend/src/config/workerExecutionPolicy';

const SEASON_NAMES: Record<string, string> = {
  SPRING: 'Spring',
  SUMMER: 'Summer',
  FALL: 'Fall',
  WINTER: 'Winter',
};

function getSeasonName(season: string): string {
  return SEASON_NAMES[season] || season;
}

export async function sendSeasonalNotifications() {
  logger.info('[SEASONAL-NOTIFY] Starting notification job...');
  const transportEnabled = areWorkerOutboundNotificationsEnabled();

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
      const sent = await notifyForChecklist(checklist, transportEnabled);
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

async function notifyForChecklist(checklist: any, transportEnabled: boolean): Promise<boolean> {
  const userId = checklist.property.homeownerProfile?.userId;
  if (!userId) {
    logger.warn(`[SEASONAL-NOTIFY] Skipping checklist ${checklist.id}; property has no homeowner`);
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

  const result = await NotificationService.create({
    userId,
    type: 'SEASONAL_CHECKLIST_READY',
    title: `${seasonName} checklist ready — ${applicableItems.length} task${applicableItems.length === 1 ? '' : 's'}`,
    message:
      criticalCount > 0
        ? `Your ${seasonName} maintenance checklist has ${applicableItems.length} applicable tasks, including ${criticalCount} critical. Season starts in ${Math.max(daysUntil, 0)} days.`
        : `Your ${seasonName} maintenance checklist has ${applicableItems.length} applicable tasks. Season starts in ${Math.max(daysUntil, 0)} days.`,
    actionUrl: `/dashboard/seasonal?propertyId=${checklist.propertyId}`,
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
