import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { logger } from '../lib/logger';
import { checkPermitWorkerContext } from '@worker-shared/services/projectCompliance/permitWorkerContext.service';

export async function permitInspectionReminderJob(): Promise<void> {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const milestones = await (prisma as any).permitInspectionMilestone.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledDate: { gte: now, lte: threeDaysFromNow },
      notificationSentAt: null,
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

  logger.info(`[PermitInspectionReminder] Found ${milestones.length} upcoming inspection milestone(s)`);

  for (const milestone of milestones) {
    try {
      const userId = milestone.property?.homeownerProfile?.userId;
      if (!userId) continue;

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

      await NotificationService.create({
        userId,
        type: 'MAINTENANCE_REMINDER',
        title: `Inspection Reminder: ${milestone.stageName}`,
        message: `Your ${milestone.stageName} inspection for ${permitLabel} at ${propertyLabel} is scheduled for ${scheduledDate}. Make sure your contractor is ready.`,
        actionUrl: `/dashboard/properties/${milestone.propertyId}/tools/permits`,
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
        metadata: { propertyId: milestone.propertyId },
      });

      await (prisma as any).permitInspectionMilestone.update({
        where: { id: milestone.id },
        data: { notificationSentAt: new Date() },
      });

      logger.info(`[PermitInspectionReminder] Sent reminder for milestone ${milestone.id} (user ${userId})`);
    } catch (err) {
      logger.error({ err, milestoneId: milestone.id }, '[PermitInspectionReminder] Failed to send reminder');
    }
  }
}
