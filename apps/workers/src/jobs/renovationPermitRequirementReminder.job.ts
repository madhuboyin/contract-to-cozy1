import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { areWorkerOutboundNotificationsEnabled } from '@worker-shared/config/workerExecutionPolicy';
import type { WorkerRunResult } from '../lib/workerRunResult';
import { logger, type AppLogger } from '../lib/logger';

export interface RenovationPermitReminderDeps {
  prisma: Pick<typeof prisma, 'renovationRequirement'>;
  notificationService: Pick<typeof NotificationService, 'create'>;
  now: () => Date;
  logger: AppLogger;
}

const defaultDeps: RenovationPermitReminderDeps = {
  prisma,
  notificationService: NotificationService,
  now: () => new Date(),
  logger,
};

export async function renovationPermitRequirementReminderJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: RenovationPermitReminderDeps = defaultDeps,
): Promise<WorkerRunResult> {
  const now = deps.now();
  const reminderWindowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const requirements = await deps.prisma.renovationRequirement.findMany({
    where: {
      family: 'PERMIT',
      recordStatus: 'CURRENT',
      determination: 'UNDETERMINED',
      isBlocking: true,
      dueAt: { gte: now, lte: reminderWindowEnd },
      ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
    },
    select: {
      id: true,
      propertyId: true,
      question: true,
      dueAt: true,
      ownerUserId: true,
      renovationCase: {
        select: {
          id: true,
          name: true,
          createdByUserId: true,
        },
      },
      property: {
        select: {
          homeownerProfile: { select: { userId: true } },
        },
      },
    },
  });

  let notified = 0;
  let skipped = 0;
  let failed = 0;
  for (const requirement of requirements) {
    const userId = requirement.ownerUserId
      ?? requirement.renovationCase.createdByUserId
      ?? requirement.property.homeownerProfile?.userId
      ?? null;
    if (!userId) {
      skipped += 1;
      continue;
    }
    if (opts?.dryRun) {
      notified += 1;
      continue;
    }
    try {
      const dueDate = requirement.dueAt!.toISOString().slice(0, 10);
      await deps.notificationService.create({
        userId,
        deduplicationKey: `renovation-permit-requirement:${requirement.id}:${dueDate}`,
        type: 'RENOVATION_PERMIT_REQUIREMENT_DUE',
        title: `Permit research due for ${requirement.renovationCase.name}`,
        message: `The permit requirement is still unresolved and is due ${requirement.dueAt!.toLocaleDateString('en-US')}. Verify it with the responsible authority before work advances.`,
        actionUrl: `/dashboard/properties/${requirement.propertyId}/renovations/${requirement.renovationCase.id}/requirements`,
        entityType: 'RenovationRequirement',
        entityId: requirement.id,
        category: 'MATERIAL_DEADLINE',
        urgency: 'MATERIAL',
        transportEnabled: areWorkerOutboundNotificationsEnabled(),
        metadata: {
          propertyId: requirement.propertyId,
          renovationCaseId: requirement.renovationCase.id,
          requirementFamily: 'PERMIT',
          renovationAutomation: true,
          dueAt: requirement.dueAt!.toISOString(),
        },
      });
      notified += 1;
    } catch (error) {
      failed += 1;
      deps.logger.error(
        { err: error, requirementId: requirement.id },
        '[RenovationPermitRequirementReminder] notification failed',
      );
    }
  }
  return {
    examined: requirements.length,
    notified,
    skipped,
    failed,
  };
}
