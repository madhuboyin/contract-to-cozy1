import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { logger } from '../lib/logger';
import { checkPermitWorkerContext } from '@worker-shared/services/projectCompliance/permitWorkerContext.service';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import type { WorkerRunResult } from '../lib/workerRunResult';
import { permitTrackerUrl } from '../lib/deepLinks';

export async function permitInspectionReminderJob(
  opts?: { dryRun?: boolean; propertyId?: string },
): Promise<WorkerRunResult> {
  const dryRun = opts?.dryRun === true;
  // W6 item 5 (smoke validation): a scoped smoke run passes an explicit
  // propertyId — that property must itself be operator-allowlisted, so a
  // caller can't accidentally point a "safe" scoped run at a real
  // homeowner's property. The unscoped nightly sweep passes no propertyId
  // at all and is unaffected by this check.
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[PermitInspectionReminder] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId ? generateSmokeCorrelationId('permit-inspection-reminders') : undefined;

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const milestones = await (prisma as any).permitInspectionMilestone.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledDate: { gte: now, lte: threeDaysFromNow },
      notificationSentAt: null,
      ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
    },
    include: {
      property: {
        select: {
          homeownerProfileId: true,
          address: true,
          city: true,
          state: true,
          homeownerProfile: { select: { userId: true } },
        },
      },
      permitRecord: { select: { category: true, permitNumber: true, workTypes: true } },
    },
  });

  logger.info(`[PermitInspectionReminder] Found ${milestones.length} upcoming inspection milestone(s)${dryRun ? ' (dry run)' : ''}`);

  let notified = 0;
  let skipped = 0;
  let failed = 0;

  for (const milestone of milestones) {
    try {
      const userId = milestone.property?.homeownerProfile?.userId;
      if (!userId) { skipped += 1; continue; }

      const contextCheck = await checkPermitWorkerContext(
        milestone.propertyId,
        { permitWorkTypes: milestone.permitRecord?.workTypes ?? [] },
        true,
      );
      if (!contextCheck.allowed) {
        logger.info(
          { milestoneId: milestone.id, propertyId: milestone.propertyId, reasonCodes: contextCheck.reasonCodes },
          '[PermitInspectionReminder] skipped after property context recheck',
        );
        skipped += 1;
        continue;
      }

      const scheduledDate = milestone.scheduledDate
        ? new Date(milestone.scheduledDate).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : 'soon';

      const propertyLabel = [milestone.property?.address, milestone.property?.city]
        .filter(Boolean)
        .join(', ') || 'your property';

      const permitLabel = milestone.permitRecord?.permitNumber
        ? `Permit #${milestone.permitRecord.permitNumber}`
        : milestone.permitRecord?.category ?? 'Permit';

      if (dryRun) {
        notified += 1;
        logger.info(`[PermitInspectionReminder] (dry run) Would send reminder for milestone ${milestone.id} (user ${userId})`);
        continue;
      }

      await NotificationService.create({
        userId,
        type: 'MAINTENANCE_REMINDER',
        title: `Inspection Reminder: ${milestone.stageName}`,
        message: `Your ${milestone.stageName} inspection for ${permitLabel} at ${propertyLabel} is scheduled for ${scheduledDate}. Make sure your contractor is ready.`,
        actionUrl: permitTrackerUrl(milestone.propertyId),
        entityType: 'PermitInspectionMilestone',
        entityId: milestone.id,
        // W3 (permits): was uncategorized — inferred to 'MAINTENANCE' by
        // notificationPreference.service.ts's type-string regex, the same
        // bucket as routine seasonal/habit nudges, which meant (a) this
        // reminder defaulted to weekly-digest cadence instead of immediate
        // despite the 3-day inspection deadline, and (b) muting routine
        // maintenance chatter would have silently muted a real scheduling
        // deadline too. MATERIAL_DEADLINE is immediate-cadence by default.
        category: 'MATERIAL_DEADLINE',
        urgency: 'MATERIAL',
        metadata: {
          propertyId: milestone.propertyId,
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
      });

      await (prisma as any).permitInspectionMilestone.update({
        where: { id: milestone.id },
        data: { notificationSentAt: new Date() },
      });

      notified += 1;
      logger.info(`[PermitInspectionReminder] Sent reminder for milestone ${milestone.id} (user ${userId})`);
    } catch (err) {
      failed += 1;
      logger.error({ err, milestoneId: milestone.id }, '[PermitInspectionReminder] Failed to send reminder');
    }
  }

  return { examined: milestones.length, notified, skipped, failed, smokeCorrelationId };
}
