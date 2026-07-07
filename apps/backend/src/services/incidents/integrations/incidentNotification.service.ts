// apps/backend/src/services/incidents/integrations/incidentNotification.service.ts
import { prisma } from '../../../lib/prisma';
import { DeliveryStatus, IncidentSeverity, NotificationChannel } from '@prisma/client';

type GuidanceContextBadge = {
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  itemId?: string | null;
  homeAssetId?: string | null;
};

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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Property-level incidents created by automated jobs (freeze-risk,
 * severe-weather-alerts, coverage-lapse, etc.) are created with
 * userId: null — they're not tied to a specific user action. Without this
 * fallback, notifyIncidentActivated/notifyAfterActionExecuted silently
 * returned before creating any notification at all (recipientUserId would
 * resolve to an empty string, which is falsy) — no IN_APP row, no EMAIL row,
 * nothing. Resolve the property's owner as the recipient in that case.
 */
async function resolvePropertyOwnerUserId(propertyId: string): Promise<string | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { homeownerProfile: { select: { userId: true } } },
  });
  return property?.homeownerProfile?.userId ?? null;
}

/**
 * If this incident's details carry severe-weather fields (set by
 * severeWeatherAlerts.job.ts), returns a compact sub-object the email
 * builders (buildWeatherAlertCardHtml) use to render a hazard-specific card
 * instead of the generic title/message one. Returns null for every other
 * incident type.
 */
function buildWeatherMetadata(typeKey: string, details: Record<string, unknown>) {
  const hazardFamily = asStringOrNull(details.hazardFamily);
  if (typeKey !== 'SEVERE_WEATHER_ALERT' || !hazardFamily) return null;

  return {
    hazardFamily,
    nwsEvent: asStringOrNull(details.nwsEvent),
    senderName: asStringOrNull(details.senderName),
    headline: asStringOrNull(details.headline),
    description: asStringOrNull(details.description),
    instruction: asStringOrNull(details.instruction),
  };
}

function hasGuidanceContext(context: GuidanceContextBadge | null | undefined): context is GuidanceContextBadge {
  if (!context) return false;
  return Boolean(
    context.guidanceJourneyId ||
      context.guidanceStepKey ||
      context.guidanceSignalIntentFamily ||
      context.itemId ||
      context.homeAssetId
  );
}

function appendGuidanceContextToActionUrl(
  actionUrl: string,
  context: GuidanceContextBadge | null
): string {
  if (!hasGuidanceContext(context)) return actionUrl;

  try {
    const url = new URL(actionUrl, 'https://contracttocozy.local');
    if (context.guidanceJourneyId && !url.searchParams.get('guidanceJourneyId')) {
      url.searchParams.set('guidanceJourneyId', context.guidanceJourneyId);
    }
    if (context.guidanceStepKey && !url.searchParams.get('guidanceStepKey')) {
      url.searchParams.set('guidanceStepKey', context.guidanceStepKey);
    }
    if (
      context.guidanceSignalIntentFamily &&
      !url.searchParams.get('guidanceSignalIntentFamily')
    ) {
      url.searchParams.set(
        'guidanceSignalIntentFamily',
        context.guidanceSignalIntentFamily
      );
    }
    if (context.itemId && !url.searchParams.get('itemId')) {
      url.searchParams.set('itemId', context.itemId);
    }
    if (context.homeAssetId && !url.searchParams.get('homeAssetId')) {
      url.searchParams.set('homeAssetId', context.homeAssetId);
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return actionUrl;
  }
}

async function resolveGuidanceContextForIncident(args: {
  propertyId: string;
  incidentId: string;
  details?: unknown;
}): Promise<GuidanceContextBadge | null> {
  const details = asRecord(args.details);

  const context: GuidanceContextBadge = {
    guidanceJourneyId:
      typeof details.guidanceJourneyId === 'string' && details.guidanceJourneyId.trim().length > 0
        ? details.guidanceJourneyId
        : null,
    guidanceStepKey:
      typeof details.guidanceStepKey === 'string' && details.guidanceStepKey.trim().length > 0
        ? details.guidanceStepKey
        : null,
    guidanceSignalIntentFamily:
      typeof details.guidanceSignalIntentFamily === 'string' &&
      details.guidanceSignalIntentFamily.trim().length > 0
        ? details.guidanceSignalIntentFamily
        : null,
    itemId:
      typeof details.inventoryItemId === 'string' && details.inventoryItemId.trim().length > 0
        ? details.inventoryItemId
        : null,
    homeAssetId:
      typeof details.homeAssetId === 'string' && details.homeAssetId.trim().length > 0
        ? details.homeAssetId
        : null,
  };

  if (!context.guidanceJourneyId) {
    const journey = await prisma.guidanceJourney.findFirst({
      where: {
        propertyId: args.propertyId,
        status: 'ACTIVE',
        primarySignal: {
          is: {
            sourceEntityType: 'INCIDENT',
            sourceEntityId: args.incidentId,
          },
        },
      },
      select: {
        id: true,
        currentStepKey: true,
        inventoryItemId: true,
        homeAssetId: true,
        primarySignal: {
          select: {
            signalIntentFamily: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (journey) {
      context.guidanceJourneyId = journey.id;
      if (!context.guidanceStepKey) {
        context.guidanceStepKey = journey.currentStepKey ?? null;
      }
      if (!context.guidanceSignalIntentFamily) {
        context.guidanceSignalIntentFamily = journey.primarySignal?.signalIntentFamily ?? null;
      }
      if (!context.itemId) {
        context.itemId = journey.inventoryItemId ?? null;
      }
      if (!context.homeAssetId) {
        context.homeAssetId = journey.homeAssetId ?? null;
      }
    }
  }

  return hasGuidanceContext(context) ? context : null;
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
      details?: Record<string, unknown> | null;
    };
    userId: string; // fallback
  }) {
    const sev = args.incident.severity ?? IncidentSeverity.INFO;
    if (!shouldSendInApp(sev) && !shouldSendEmail(sev)) return;

    const recipientUserId =
      args.incident.userId || args.userId || (await resolvePropertyOwnerUserId(args.incident.propertyId));
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

    const guidanceContext = await resolveGuidanceContextForIncident({
      propertyId: args.incident.propertyId,
      incidentId: args.incident.id,
      details: args.incident.details ?? null,
    });
    const actionUrl = appendGuidanceContextToActionUrl(
      `/dashboard/properties/${args.incident.propertyId}/incidents/${args.incident.id}`,
      guidanceContext
    );

    const title = sev === IncidentSeverity.CRITICAL ? `⚠️ ${args.incident.title}` : args.incident.title;
    const weather = buildWeatherMetadata(args.incident.typeKey, asRecord(args.incident.details));

    const notification = await prisma.notification.create({
      data: {
        userId: recipientUserId,
        type,
        title,
        message: args.incident.summary ?? 'New incident detected.',
        actionUrl,
        entityType: 'Incident',
        entityId: args.incident.id,
        metadata: {
          dedupeKey,
          severity: sev,
          incidentId: args.incident.id,
          propertyId: args.incident.propertyId,
          typeKey: args.incident.typeKey,
          guidanceContext,
          // Used by buildWeatherAlertCardHtml (email builders) to render a
          // hazard-specific card instead of the generic title/message one.
          ...(weather ? { weather } : {}),
          // CRITICAL incidents (severe weather, etc.) skip the once-daily
          // digest and go out via the immediate-send path instead — see
          // highPriorityEmailEnqueue.poller.ts + sendEmailNotification.job.ts.
          ...(sev === IncidentSeverity.CRITICAL ? { priority: 'HIGH' } : {}),
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
    const recipientUserId =
      args.incident.userId || args.userId || (await resolvePropertyOwnerUserId(args.incident.propertyId));
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

    const guidanceContext = await resolveGuidanceContextForIncident({
      propertyId: args.incident.propertyId,
      incidentId: args.incident.id,
      details: (args.incident as any)?.details ?? null,
    });
    const actionUrl = appendGuidanceContextToActionUrl(
      `/dashboard/properties/${args.incident.propertyId}/maintenance/tasks/${args.action.entityId ?? ''}`,
      guidanceContext
    );

    const notification = await prisma.notification.create({
      data: {
        userId: recipientUserId,
        type,
        title: 'Action created',
        message: `We created a maintenance task to address this incident.`,
        actionUrl,
        entityType: 'Incident',
        entityId: args.incident.id,
        metadata: {
          dedupeKey,
          severity: args.severity,
          incidentId: args.incident.id,
          actionId: args.action.id,
          linkedEntityType: args.action.entityType,
          linkedEntityId: args.action.entityId,
          guidanceContext,
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
