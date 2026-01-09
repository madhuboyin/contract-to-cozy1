// apps/backend/src/services/incidents/integrations/incidentNotification.service.ts
import { prisma } from '../../../lib/prisma';
import { DeliveryStatus, IncidentSeverity, NotificationChannel } from '@prisma/client';

function shouldSendInApp(sev: IncidentSeverity) {
  return sev === IncidentSeverity.WARNING || sev === IncidentSeverity.CRITICAL;
}

function shouldSendEmail(sev: IncidentSeverity) {
  // policy: WARNING + CRITICAL generate EMAIL delivery (your worker can decide digest vs immediate)
  return sev === IncidentSeverity.WARNING || sev === IncidentSeverity.CRITICAL;
}

function buildDedupeKey(parts: string[]) {
  return parts.join('|');
}

async function alreadySentRecently(args: {
  userId: string;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey: string;
  lookbackHours?: number;
}) {
  const lookbackHours = args.lookbackHours ?? 72;
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000);

  const items = await prisma.notification.findMany({
    where: {
      userId: args.userId,
      type: args.type,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  for (const n of items) {
    const md: any = n.metadata ?? {};
    if (md?.dedupeKey === args.dedupeKey) return true;
  }
  return false;
}

export class IncidentNotificationService {
  static async notifyIncidentActivated(args: {
    incident: {
      id: string;
      propertyId: string;
      userId: string | null;
      typeKey: string;
      title: string;
      summary: string | null;
      severity: IncidentSeverity;
    };
    userId: string; // fallback
  }) {
    const sev = args.incident.severity ?? IncidentSeverity.INFO;
    if (!shouldSendInApp(sev) && !shouldSendEmail(sev)) return;

    const recipientUserId = args.incident.userId ?? args.userId;
    if (!recipientUserId) return;

    const type = 'INCIDENT_ACTIVATED';
    const dedupeKey = buildDedupeKey([type, args.incident.id, String(sev)]);

    if (
      await alreadySentRecently({
        userId: recipientUserId,
        type,
        entityType: 'Incident',
        entityId: args.incident.id,
        dedupeKey,
      })
    ) return;

    const notification = await prisma.notification.create({
      data: {
        userId: recipientUserId,
        type,
        title: args.incident.title,
        message: args.incident.summary ?? 'New incident detected.',
        actionUrl: `/dashboard/properties/${args.incident.propertyId}/incidents/${args.incident.id}`,
        entityType: 'Incident',
        entityId: args.incident.id,
        metadata: {
          dedupeKey,
          severity: sev,
          incidentId: args.incident.id,
          propertyId: args.incident.propertyId,
          typeKey: args.incident.typeKey,
        },
      },
    });

    const deliveries: any[] = [];

    if (shouldSendInApp(sev)) {
      deliveries.push({
        notificationId: notification.id,
        channel: NotificationChannel.IN_APP,
        status: DeliveryStatus.SENT,
      });
    }

    if (shouldSendEmail(sev)) {
      deliveries.push({
        notificationId: notification.id,
        channel: NotificationChannel.EMAIL,
        status: DeliveryStatus.PENDING,
        enqueuedAt: new Date(),
      });
    }

    if (deliveries.length) {
      await prisma.notificationDelivery.createMany({ data: deliveries });
    }
  }

  static async notifyAfterActionExecuted(args: {
    incident: { id: string; propertyId: string; userId: string | null };
    userId: string;
    action: { id: string; type: string; entityType: string | null; entityId: string | null };
    severity: IncidentSeverity;
  }) {
    const recipientUserId = args.incident.userId ?? args.userId;
    if (!recipientUserId) return;

    const type = 'INCIDENT_ACTION_CREATED';
    const dedupeKey = buildDedupeKey([type, args.incident.id, args.action.id]);

    if (
      await alreadySentRecently({
        userId: recipientUserId,
        type,
        entityType: 'Incident',
        entityId: args.incident.id,
        dedupeKey,
      })
    ) return;

    const notification = await prisma.notification.create({
      data: {
        userId: recipientUserId,
        type,
        title: 'Action created',
        message: `We created a maintenance task to address this incident.`,
        actionUrl: `/dashboard/properties/${args.incident.propertyId}/maintenance/tasks/${args.action.entityId ?? ''}`,
        entityType: 'Incident',
        entityId: args.incident.id,
        metadata: {
          dedupeKey,
          severity: args.severity,
          incidentId: args.incident.id,
          actionId: args.action.id,
          linkedEntityType: args.action.entityType,
          linkedEntityId: args.action.entityId,
        },
      },
    });

    // For “action created”, we keep email only for CRITICAL
    const deliveries: any[] = [
      {
        notificationId: notification.id,
        channel: NotificationChannel.IN_APP,
        status: DeliveryStatus.SENT,
      },
    ];

    if (args.severity === IncidentSeverity.CRITICAL) {
      deliveries.push({
        notificationId: notification.id,
        channel: NotificationChannel.EMAIL,
        status: DeliveryStatus.PENDING,
        enqueuedAt: new Date(),
      });
    }

    await prisma.notificationDelivery.createMany({ data: deliveries });
  }
}
