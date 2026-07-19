import { prisma } from '../lib/prisma';
import { NotificationService } from './notification.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export type NewHomeWarrantySweepResult = {
  examined: number;
  promoted: number;
  notified: number;
  expired: number;
};

export async function processNewHomeWarrantyDeadlines(options: {
  propertyId?: string;
  now?: Date;
  horizonDays?: number;
} = {}): Promise<NewHomeWarrantySweepResult> {
  const now = options.now ?? new Date();
  const horizon = new Date(now.getTime() + (options.horizonDays ?? 90) * DAY_MS);
  const propertyFilter = options.propertyId ? { propertyId: options.propertyId } : {};

  const expired = await prisma.newHomeWarrantyRight.updateMany({
    where: {
      ...propertyFilter,
      status: { in: ['VERIFIED', 'NOTICE_DUE'] },
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  });

  const rights = await prisma.newHomeWarrantyRight.findMany({
    where: {
      ...propertyFilter,
      status: { in: ['VERIFIED', 'NOTICE_DUE'] },
      expiresAt: { gte: now },
      OR: [
        { noticeDeadlineAt: { lte: horizon } },
        { noticeDeadlineAt: null, expiresAt: { lte: horizon } },
      ],
    },
    include: {
      plan: {
        select: {
          property: { select: { homeownerProfile: { select: { userId: true } } } },
        },
      },
    },
  });

  let promoted = 0;
  let notified = 0;
  for (const right of rights) {
    const dueAt = right.noticeDeadlineAt ?? right.expiresAt;
    const task = await prisma.propertyMaintenanceTask.upsert({
      where: {
        propertyId_actionKey: {
          propertyId: right.propertyId,
          actionKey: `new-home:warranty-deadline:${right.id}`,
        },
      },
      create: {
        propertyId: right.propertyId,
        title: `Protect warranty right: ${right.coverageTitle}`,
        description: `${right.coverageSummary}\nNotice: ${right.noticeMethod ?? 'Review source terms'}\nSource: ${right.sourceCitation}`,
        source: 'WARRANTY_RENEWAL',
        actionKey: `new-home:warranty-deadline:${right.id}`,
        priority: dueAt.getTime() - now.getTime() <= 30 * DAY_MS ? 'URGENT' : 'HIGH',
        nextDueDate: dueAt,
        assetType: 'NEW_HOME_WARRANTY_RIGHT',
        category: 'WARRANTY',
      },
      update: {
        nextDueDate: dueAt,
        priority: dueAt.getTime() - now.getTime() <= 30 * DAY_MS ? 'URGENT' : 'HIGH',
      },
    });
    promoted += 1;

    const homeownerUserId = right.plan.property.homeownerProfile.userId;
    let notifiedAt = right.notifiedAt;
    if (!notifiedAt && homeownerUserId) {
      await NotificationService.create({
        userId: homeownerUserId,
        type: 'NEW_HOME_WARRANTY_DEADLINE',
        title: `Warranty deadline: ${right.coverageTitle}`,
        message: `Review notice requirements before ${dueAt.toLocaleDateString()}.`,
        actionUrl: `/dashboard/properties/${right.propertyId}/new-home-plan`,
        entityType: 'NEW_HOME_WARRANTY_RIGHT',
        entityId: right.id,
        category: 'MATERIAL_DEADLINE',
        urgency: 'MATERIAL',
        metadata: {
          propertyId: right.propertyId,
          actionKey: task.actionKey,
          sourceCitation: right.sourceCitation,
          effectiveDeadlineAt: dueAt.toISOString(),
        },
      });
      notifiedAt = now;
      notified += 1;
    }
    await prisma.newHomeWarrantyRight.update({
      where: { id: right.id },
      data: { status: 'NOTICE_DUE', deadlineTaskId: task.id, notifiedAt },
    });
  }

  return { examined: rights.length, promoted, notified, expired: expired.count };
}
