import { prisma } from '../../../lib/prisma';
import { homeEventRadarNotificationUrl } from '../../../lib/notificationDeepLinks';

type RadarNotificationDeliveryDatabase = {
  notification: {
    findUnique(args: unknown): Promise<any>;
    create(args: unknown): Promise<any>;
  };
  propertyRadarNotificationDecision: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

type DeliveryDecision = {
  id: string;
  userId: string;
  notificationId?: string | null;
  outcome: 'immediate' | 'digest' | 'deferred' | 'suppressed';
  reasonCodes: string[];
  eligibleChannels: Array<'in_app' | 'email' | 'push'>;
  deferredUntil?: Date | null;
  criticalOverrideApplied: boolean;
  policyVersion: string;
  evaluatedAt: Date;
  evidenceJson?: unknown;
};

export type RadarNotificationMaterializationInput = {
  propertyId: string;
  decision: DeliveryDecision;
  match: {
    id: string;
    impactLevel: string;
    impactSummary?: string | null;
    confidence?: string | null;
    lifecycleStatus?: string | null;
  };
  event: {
    id: string;
    title?: string | null;
    summary?: string | null;
    eventType?: string | null;
    severity: string;
    startAt: Date | string;
    endAt?: Date | string | null;
    sourceDefinition?: {
      key?: string | null;
      family?: string | null;
    } | null;
  };
  revision: { id: string };
};

export type RadarNotificationMaterializationResult = {
  outcome: 'created' | 'deduped' | 'suppressed';
  notificationId: string | null;
};

const CHANNEL_MAP = {
  in_app: 'IN_APP',
  email: 'EMAIL',
  push: 'PUSH',
} as const;

function boundedText(value: string | null | undefined, max: number): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function notificationUrgency(
  decision: DeliveryDecision,
): 'MATERIAL' | 'URGENT' | 'CRITICAL' {
  const evidence = decision.evidenceJson && typeof decision.evidenceJson === 'object'
    ? decision.evidenceJson as Record<string, any>
    : {};
  const severity = String(evidence.normalized?.severity ?? '').toLowerCase();
  if (decision.criticalOverrideApplied || severity === 'extreme') return 'CRITICAL';
  if (severity === 'severe' || severity === 'high') return 'URGENT';
  return 'MATERIAL';
}

function notificationCategory(
  family: string | null | undefined,
): 'SAFETY' | 'NEIGHBORHOOD' | 'GENERAL' {
  if (['weather', 'air_quality', 'disaster', 'utility'].includes(family ?? '')) {
    return 'SAFETY';
  }
  if (family === 'tax' || family === 'insurance') return 'NEIGHBORHOOD';
  return 'GENERAL';
}

function notificationMessage(input: RadarNotificationMaterializationInput): string {
  return boundedText(input.match.impactSummary, 500)
    ?? boundedText(input.event.summary, 500)
    ?? 'A monitored event may affect this property. Review the latest details and recommended actions.';
}

export class RadarNotificationDeliveryService {
  constructor(
    private readonly db: RadarNotificationDeliveryDatabase = prisma as any,
  ) {}

  async materialize(
    input: RadarNotificationMaterializationInput,
  ): Promise<RadarNotificationMaterializationResult> {
    const { decision } = input;
    if (decision.outcome === 'suppressed' || decision.eligibleChannels.length === 0) {
      return { outcome: 'suppressed', notificationId: null };
    }

    const deduplicationKey = `home-event-radar:${decision.id}`;
    let notification = decision.notificationId
      ? await this.db.notification.findUnique({ where: { id: decision.notificationId } })
      : await this.db.notification.findUnique({ where: { deduplicationKey } });
    let created = false;

    if (!notification) {
      const evidence = decision.evidenceJson && typeof decision.evidenceJson === 'object'
        ? decision.evidenceJson as Record<string, any>
        : {};
      const family = String(
        evidence.sourceFamily ?? input.event.sourceDefinition?.family ?? 'other',
      );
      const urgency = notificationUrgency(decision);
      const cadence = decision.outcome === 'digest' ? 'DAILY_DIGEST' : 'IMMEDIATE';
      try {
        notification = await this.db.notification.create({
          data: {
            userId: decision.userId,
            deduplicationKey,
            type: 'HOME_EVENT_RADAR_ALERT',
            title: boundedText(input.event.title, 180) ?? 'Home Event Radar update',
            message: notificationMessage(input),
            actionUrl: homeEventRadarNotificationUrl(input.propertyId, input.match.id),
            entityType: 'PROPERTY_RADAR_MATCH',
            entityId: input.match.id,
            metadata: {
              propertyId: input.propertyId,
              radarEventId: input.event.id,
              radarEventRevisionId: input.revision.id,
              radarMatchId: input.match.id,
              radarNotificationDecisionId: decision.id,
              sourceDefinitionKey: input.event.sourceDefinition?.key ?? null,
              sourceFamily: family,
              eventType: input.event.eventType ?? null,
              severity: input.event.severity,
              impact: input.match.impactLevel,
              confidence: input.match.confidence ?? null,
              lifecycleStatus: input.match.lifecycleStatus ?? null,
              effectiveAt: new Date(input.event.startAt).toISOString(),
              expiresAt: input.event.endAt ? new Date(input.event.endAt).toISOString() : null,
              decisionOutcome: decision.outcome,
              reasonCodes: decision.reasonCodes,
              criticalOverrideApplied: decision.criticalOverrideApplied,
              deferredUntil: decision.deferredUntil?.toISOString() ?? null,
              policyVersion: decision.policyVersion,
              priority: decision.outcome === 'immediate' ? 'HIGH' : 'LOW',
              attentionPriority: urgency === 'CRITICAL' ? 'NOW' : 'SOON',
              notificationPolicy: {
                category: notificationCategory(family),
                urgency,
                channels: decision.eligibleChannels.map((channel) => ({
                  channel: CHANNEL_MAP[channel],
                  enabled: true,
                  cadence,
                  deliverImmediately: decision.outcome === 'immediate',
                  quietHoursApplied: decision.outcome === 'deferred',
                })),
              },
            },
            deliveries: {
              create: decision.eligibleChannels.map((channel) => ({
                channel: CHANNEL_MAP[channel],
                status: channel === 'in_app' ? 'SENT' : 'PENDING',
                sentAt: channel === 'in_app' ? decision.evaluatedAt : null,
              })),
            },
          },
          include: { deliveries: true },
        });
        created = true;
      } catch (error) {
        // Concurrent/retried matchers converge on the deterministic unique
        // key. If no canonical row exists, this was a real persistence error.
        notification = await this.db.notification.findUnique({ where: { deduplicationKey } });
        if (!notification) throw error;
      }
    }

    await this.db.propertyRadarNotificationDecision.updateMany({
      where: { id: decision.id, notificationId: null },
      data: { notificationId: notification.id },
    });
    return {
      outcome: created ? 'created' : 'deduped',
      notificationId: notification.id,
    };
  }
}

export const radarNotificationDeliveryService =
  new RadarNotificationDeliveryService();
