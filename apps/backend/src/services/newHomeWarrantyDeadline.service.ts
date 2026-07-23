import { prisma } from '../lib/prisma';
import { NotificationService } from './notification.service';
import { isPropertyAllowlisted } from '../config/smokeTestConfig';
import { generateSmokeCorrelationId } from '../lib/smokeTestCorrelation';
import { newHomeWarrantyPlanUrl } from '../lib/notificationDeepLinks';

const DAY_MS = 24 * 60 * 60 * 1000;

export type NewHomeWarrantySweepResult = {
  examined: number;
  promoted: number;
  notified: number;
  expired: number;
  /** Present when this run was a scoped smoke-test run (W6) — lets its writes be found and cleaned up by exact ID. */
  smokeCorrelationId?: string;
};

export async function processNewHomeWarrantyDeadlines(options: {
  propertyId?: string;
  now?: Date;
  horizonDays?: number;
  dryRun?: boolean;
} = {}): Promise<NewHomeWarrantySweepResult> {
  // W6 item 5 (smoke validation): a scoped smoke run passes an explicit
  // propertyId — it must itself be operator-allowlisted so a caller can't
  // accidentally point a "safe" scoped run at a real homeowner's property.
  // The unscoped nightly sweep passes no propertyId and is unaffected.
  if (options.propertyId && !isPropertyAllowlisted(options.propertyId)) {
    throw new Error(
      `[NewHomeWarrantyDeadline] propertyId ${options.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const dryRun = options.dryRun === true;
  const smokeCorrelationId = options.propertyId ? generateSmokeCorrelationId('new-home-warranty-deadlines') : undefined;

  const now = options.now ?? new Date();
  const horizon = new Date(now.getTime() + (options.horizonDays ?? 90) * DAY_MS);
  const propertyFilter = options.propertyId ? { propertyId: options.propertyId } : {};

  const expired = dryRun
    ? { count: await prisma.newHomeWarrantyRight.count({
        where: { ...propertyFilter, status: { in: ['VERIFIED', 'NOTICE_DUE'] }, expiresAt: { lt: now } },
      }) }
    : await prisma.newHomeWarrantyRight.updateMany({
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
    const actionKey = `new-home:warranty-deadline:${right.id}`;
    const homeownerUserId = right.plan.property.homeownerProfile.userId;
    const willNotify = !right.notifiedAt && !!homeownerUserId;

    if (dryRun) {
      promoted += 1;
      if (willNotify) notified += 1;
      continue;
    }

    const task = await prisma.propertyMaintenanceTask.upsert({
      where: {
        propertyId_actionKey: {
          propertyId: right.propertyId,
          actionKey,
        },
      },
      create: {
        propertyId: right.propertyId,
        title: `Protect warranty right: ${right.coverageTitle}`,
        description: `${right.coverageSummary}\nNotice: ${right.noticeMethod ?? 'Review source terms'}\nSource: ${right.sourceCitation}`,
        source: 'WARRANTY_RENEWAL',
        actionKey,
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

    let notifiedAt = right.notifiedAt;
    if (willNotify) {
      await NotificationService.create({
        userId: homeownerUserId,
        type: 'NEW_HOME_WARRANTY_DEADLINE',
        title: `Warranty deadline: ${right.coverageTitle}`,
        message: `Review notice requirements before ${dueAt.toLocaleDateString()}.`,
        actionUrl: newHomeWarrantyPlanUrl(right.propertyId),
        entityType: 'NEW_HOME_WARRANTY_RIGHT',
        entityId: right.id,
        category: 'MATERIAL_DEADLINE',
        urgency: 'MATERIAL',
        metadata: {
          propertyId: right.propertyId,
          actionKey: task.actionKey,
          sourceCitation: right.sourceCitation,
          effectiveDeadlineAt: dueAt.toISOString(),
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
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

  return { examined: rights.length, promoted, notified, expired: expired.count, smokeCorrelationId };
}
