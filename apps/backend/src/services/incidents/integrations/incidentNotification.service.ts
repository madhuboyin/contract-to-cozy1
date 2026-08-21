// apps/backend/src/services/incidents/integrations/incidentNotification.service.ts
import { prisma } from '../../../lib/prisma';
import { IncidentSeverity } from '@prisma/client';
import { getProtectionContextDecisions } from '../../protection/context';
import type { FeatureDecision } from '../../../modules/propertyContext';
import { NotificationService } from '../../notification.service';
import { operatingModeForOwnershipState } from '../../skills/context/propertyJourneyContext.contract';

type GuidanceContextBadge = {
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  itemId?: string | null;
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

async function resolveIncidentNotificationContext(propertyId: string, userId: string): Promise<{
  propertyId: string;
  contextVersion: string;
  decision: FeatureDecision;
}> {
  try {
    const context = await getProtectionContextDecisions(propertyId, userId, 'INCIDENT_NOTIFICATION');
    return { propertyId, contextVersion: context.contextVersion, decision: context.decisions.incidentNotifications };
  } catch {
    // Safety alerts fail open when context is temporarily unavailable, but the
    // UNKNOWN decision is retained in notification metadata for auditability.
    return {
      propertyId,
      contextVersion: 'unavailable',
      decision: {
        status: 'UNKNOWN',
        reasonCodes: ['PROPERTY_CONTEXT_UNAVAILABLE'],
        usedFactKeys: [],
        missingFactKeys: ['risk.activeIncidents'],
        conflictedFactKeys: [],
        validUntil: null,
        correctionPaths: [],
      },
    };
  }
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

type WeatherMetadata = NonNullable<ReturnType<typeof buildWeatherMetadata>>;

/**
 * A buyer who hasn't closed yet can't act on "monitor your gutters" the way
 * an owner can — they don't possess the home. But a severe-weather signal is
 * still useful to them: it's something to flag for their inspector (or, once
 * the inspection is done, for the closing walkthrough) rather than something
 * to personally maintain. Reframes the same underlying hazard signal instead
 * of suppressing it outright, using whatever inspection-scheduling state
 * already exists on BuyerInspectionPlan.
 */
async function resolveBuyerWeatherFraming(
  propertyId: string,
  weather: WeatherMetadata,
): Promise<string | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      onboarding: { select: { ownershipState: true } },
      buyerInspectionPlan: { select: { scheduledAt: true, appointmentCompletedAt: true } },
    },
  });
  if (operatingModeForOwnershipState(property?.onboarding?.ownershipState) !== 'BUYING') return null;

  const hazardLabel = weather.headline ?? weather.nwsEvent ?? 'A severe weather event';
  const inspectionPlan = property?.buyerInspectionPlan;

  if (inspectionPlan?.appointmentCompletedAt) {
    return `${hazardLabel} was reported near this home. Note it for your closing walkthrough and ask about any related damage before you close.`;
  }
  if (inspectionPlan?.scheduledAt) {
    return `${hazardLabel} was reported near this home. Ask your inspector to check for related issues (drainage, foundation, roof) during the scheduled inspection.`;
  }
  return `${hazardLabel} was reported near this home. When you schedule your inspection, flag this so your inspector can check for related issues.`;
}

function hasGuidanceContext(context: GuidanceContextBadge | null | undefined): context is GuidanceContextBadge {
  if (!context) return false;
  return Boolean(
    context.guidanceJourneyId ||
      context.guidanceStepKey ||
      context.guidanceSignalIntentFamily ||
      context.itemId
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

    const protectionContext = await resolveIncidentNotificationContext(args.incident.propertyId, recipientUserId);
    const notificationDecision = protectionContext.decision;
    if (notificationDecision.status === 'NOT_APPLICABLE') return;

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
    const buyerWeatherFraming = weather
      ? await resolveBuyerWeatherFraming(args.incident.propertyId, weather)
      : null;

    await NotificationService.create({
        userId: recipientUserId,
        type,
        title,
        message: buyerWeatherFraming ?? args.incident.summary ?? 'New incident detected.',
        actionUrl,
        entityType: 'Incident',
        entityId: args.incident.id,
        category: sev === IncidentSeverity.CRITICAL ? 'SAFETY' : 'ACTIVE_DAMAGE',
        urgency: sev === IncidentSeverity.CRITICAL ? 'CRITICAL' : 'URGENT',
        metadata: {
          dedupeKey,
          severity: sev,
          incidentId: args.incident.id,
          propertyId: args.incident.propertyId,
          typeKey: args.incident.typeKey,
          guidanceContext,
          propertyContext: {
            propertyId: protectionContext.propertyId,
            contextVersion: protectionContext.contextVersion,
            decision: notificationDecision,
          },
          // Used by buildWeatherAlertCardHtml (email builders) to render a
          // hazard-specific card instead of the generic title/message one.
          ...(weather ? { weather } : {}),
          // CRITICAL incidents (severe weather, etc.) skip the once-daily
          // digest and go out via the immediate-send path instead — see
          // highPriorityEmailEnqueue.poller.ts + sendEmailNotification.job.ts.
          ...(sev === IncidentSeverity.CRITICAL ? { priority: 'HIGH' } : {}),
        },
    });

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

    const protectionContext = await resolveIncidentNotificationContext(args.incident.propertyId, recipientUserId);
    const notificationDecision = protectionContext.decision;
    if (notificationDecision.status === 'NOT_APPLICABLE') return;

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

    await NotificationService.create({
        userId: recipientUserId,
        type,
        title: 'Action created',
        message: `We created a maintenance task to address this incident.`,
        actionUrl,
        entityType: 'Incident',
        entityId: args.incident.id,
        category: 'WORKFLOW',
        urgency: args.severity === IncidentSeverity.CRITICAL ? 'CRITICAL' : 'MATERIAL',
        metadata: {
          dedupeKey,
          severity: args.severity,
          incidentId: args.incident.id,
          actionId: args.action.id,
          linkedEntityType: args.action.entityType,
          linkedEntityId: args.action.entityId,
          guidanceContext,
          propertyContext: {
            propertyId: protectionContext.propertyId,
            contextVersion: protectionContext.contextVersion,
            decision: notificationDecision,
          },
        },
    });

  }
}
