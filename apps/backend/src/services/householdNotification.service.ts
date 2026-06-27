import { prisma } from '../lib/prisma';
import { NotificationService } from './notification.service';

type NotificationPrefKey =
  | 'notifyOnRiskChange'
  | 'notifyOnTaskDue'
  | 'notifyOnTaskAssigned'
  | 'notifyOnGuidanceUpdate'
  | 'notifyOnIncident'
  | 'notifyOnHomeEvent'
  | 'notifyOnAlerts';

interface FanOutPayload {
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
}

export class HouseholdNotificationService {
  async notifyEligibleMembers(
    propertyId: string,
    prefKey: NotificationPrefKey,
    payload: FanOutPayload
  ) {
    const members = await prisma.householdMember.findMany({
      where: { propertyId, [prefKey]: true },
      select: { userId: true },
    });

    await Promise.all(
      members.map((m) =>
        NotificationService.create({ userId: m.userId, ...payload }).catch(() => undefined)
      )
    );
  }

  async notifyAssignee(
    assigneeUserId: string,
    taskTitle: string,
    actionUrl?: string
  ) {
    await NotificationService.create({
      userId: assigneeUserId,
      type: 'TASK_ASSIGNED',
      title: 'New task assigned to you',
      message: `You've been assigned: ${taskTitle}`,
      actionUrl,
    });
  }

  async notifyAllOnCritical(propertyId: string, payload: FanOutPayload) {
    const members = await prisma.householdMember.findMany({
      where: { propertyId, role: { in: ['OWNER', 'CONTRIBUTOR'] } },
      select: { userId: true },
    });

    await Promise.all(
      members.map((m) =>
        NotificationService.create({ userId: m.userId, ...payload }).catch(() => undefined)
      )
    );
  }
}
