import { prisma } from '../../../lib/prisma';
import {
  evaluateRadarNotificationPolicy,
  type RadarNotificationPreviousDecision,
} from '../domain/radarNotificationPolicy';
import {
  isIanaTimezone,
  minutesToClockTime,
  RADAR_NOTIFICATION_CATEGORIES,
  type RadarNotificationChannel,
  type RadarNotificationPreferenceProjection,
} from '../domain/radarNotificationPreferences';
import {
  radarNotificationDeliveryService,
  type RadarNotificationMaterializationInput,
} from './radarNotificationDelivery.service';

type RadarNotificationDecisionDatabase = {
  property: {
    findUnique(args: unknown): Promise<any>;
  };
  propertyRadarNotificationPreference: {
    findMany(args: unknown): Promise<any[]>;
  };
  propertyRadarNotificationDecision: {
    findMany(args: unknown): Promise<any[]>;
    upsert(args: unknown): Promise<any>;
  };
};

export type RadarNotificationDecisionEvaluationInput = {
  propertyId: string;
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
    status: string;
    startAt: Date | string;
    endAt?: Date | string | null;
    severity: string;
    sourceDefinition?: {
      key?: string | null;
      family?: string | null;
      environments?: string[] | null;
    } | null;
  };
  revision: {
    id: string;
    normalizedJson?: unknown;
  } | null;
  isInitialMatch: boolean;
  isMaterialRevision: boolean;
  evaluatedAt: Date;
};

export type RadarNotificationDecisionEvaluationResult = {
  evaluated: number;
  created: number;
  deduped: number;
  eligible: number;
  suppressed: number;
};

type Recipient = {
  id: string;
  status: string;
  emailVerified: boolean;
  pushSubscriptions: Array<{ id: string }>;
};

function uniqueActiveRecipients(property: any): Recipient[] {
  const candidates: Recipient[] = [
    property?.homeownerProfile?.user,
    ...(property?.householdMembers ?? []).map((member: any) => member.user),
  ].filter(Boolean);
  const byId = new Map<string, Recipient>();
  for (const user of candidates) {
    if (user.status !== 'ACTIVE') continue;
    byId.set(user.id, user);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function defaultPreference(
  propertyId: string,
  userId: string,
  timezone: string | null | undefined,
): RadarNotificationPreferenceProjection {
  return {
    propertyId,
    userId,
    isEnabled: true,
    enabledCategories: [...RADAR_NOTIFICATION_CATEGORIES],
    channels: ['in_app'],
    minimumSeverity: 'moderate',
    minimumImpact: 'moderate',
    deliveryMode: 'immediate',
    criticalSafetyOverrideEnabled: false,
    quietHours: null,
    timezone: timezone && isIanaTimezone(timezone) ? timezone : 'UTC',
    persisted: false,
    updatedAt: null,
  };
}

function persistedPreference(row: any): RadarNotificationPreferenceProjection {
  const hasQuietHours = (
    row.quietHoursStartMinutes !== null
    && row.quietHoursEndMinutes !== null
  );
  return {
    propertyId: row.propertyId,
    userId: row.userId,
    isEnabled: row.isEnabled,
    enabledCategories: row.enabledCategories,
    channels: row.channels,
    minimumSeverity: row.minimumSeverity,
    minimumImpact: row.minimumImpact,
    deliveryMode: row.deliveryMode,
    criticalSafetyOverrideEnabled: row.criticalSafetyOverrideEnabled,
    quietHours: hasQuietHours
      ? {
          start: minutesToClockTime(row.quietHoursStartMinutes),
          end: minutesToClockTime(row.quietHoursEndMinutes),
        }
      : null,
    timezone: row.timezone,
    persisted: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function availableChannels(user: Recipient): RadarNotificationChannel[] {
  const channels: RadarNotificationChannel[] = ['in_app'];
  if (user.emailVerified) channels.push('email');
  if (user.pushSubscriptions.length > 0) channels.push('push');
  return channels;
}

function normalizedRevision(revision: { normalizedJson?: unknown } | null): Record<string, any> {
  return revision?.normalizedJson && typeof revision.normalizedJson === 'object'
    ? revision.normalizedJson as Record<string, any>
    : {};
}

function previousDecision(row: any): RadarNotificationPreviousDecision {
  if (!row) return null;
  const evidence = row.evidenceJson && typeof row.evidenceJson === 'object'
    ? row.evidenceJson as Record<string, any>
    : {};
  const normalized = evidence.normalized && typeof evidence.normalized === 'object'
    ? evidence.normalized as Record<string, any>
    : {};
  if (
    typeof normalized.severity !== 'string'
    || typeof normalized.impact !== 'string'
    || !['active', 'imminent', 'future', 'ended'].includes(normalized.timing)
  ) {
    return null;
  }
  return {
    outcome: row.outcome,
    severity: normalized.severity,
    impact: normalized.impact,
    timing: normalized.timing,
  };
}

function sourceIsSynthetic(
  event: RadarNotificationDecisionEvaluationInput['event'],
  env: NodeJS.ProcessEnv,
): boolean {
  const source = event.sourceDefinition;
  const key = source?.key?.toLowerCase() ?? '';
  return env.NODE_ENV !== 'production'
    || !source?.environments?.includes('production')
    || /(?:^|[-_])(dummy|fixture|synthetic|test)(?:$|[-_])/.test(key);
}

export class RadarNotificationDecisionService {
  constructor(
    private readonly db: RadarNotificationDecisionDatabase = prisma as any,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly deliveryService: {
      materialize(input: RadarNotificationMaterializationInput): Promise<unknown>;
    } = radarNotificationDeliveryService,
  ) {}

  async evaluateMatch(
    input: RadarNotificationDecisionEvaluationInput,
  ): Promise<RadarNotificationDecisionEvaluationResult> {
    if (!input.revision) {
      return { evaluated: 0, created: 0, deduped: 0, eligible: 0, suppressed: 0 };
    }
    const property = await this.db.property.findUnique({
      where: { id: input.propertyId },
      select: {
        timezone: true,
        homeownerProfile: {
          select: {
            user: {
              select: {
                id: true,
                status: true,
                emailVerified: true,
                pushSubscriptions: {
                  where: { revokedAt: null },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
        householdMembers: {
          select: {
            user: {
              select: {
                id: true,
                status: true,
                emailVerified: true,
                pushSubscriptions: {
                  where: { revokedAt: null },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    const recipients = uniqueActiveRecipients(property);
    if (!recipients.length) {
      return { evaluated: 0, created: 0, deduped: 0, eligible: 0, suppressed: 0 };
    }
    const userIds = recipients.map((recipient) => recipient.id);
    const [preferences, currentDecisions, priorDecisions] = await Promise.all([
      this.db.propertyRadarNotificationPreference.findMany({
        where: { propertyId: input.propertyId, userId: { in: userIds } },
      }),
      this.db.propertyRadarNotificationDecision.findMany({
        where: {
          propertyRadarMatchId: input.match.id,
          radarEventRevisionId: input.revision.id,
          userId: { in: userIds },
        },
      }),
      this.db.propertyRadarNotificationDecision.findMany({
        where: {
          propertyRadarMatchId: input.match.id,
          radarEventRevisionId: { not: input.revision.id },
          userId: { in: userIds },
        },
        orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const preferenceByUserId = new Map(
      preferences.map((preference) => [preference.userId, persistedPreference(preference)]),
    );
    const currentByUserId = new Map(
      currentDecisions.map((decision) => [decision.userId, decision]),
    );
    const priorAnyByUserId = new Map<string, any>();
    const priorEligibleByUserId = new Map<string, any>();
    for (const decision of priorDecisions) {
      if (!priorAnyByUserId.has(decision.userId)) {
        priorAnyByUserId.set(decision.userId, decision);
      }
      if (
        decision.outcome !== 'suppressed'
        && !priorEligibleByUserId.has(decision.userId)
      ) {
        priorEligibleByUserId.set(decision.userId, decision);
      }
    }
    const revision = normalizedRevision(input.revision);
    const sourceFamily = String(
      revision.sourceFamily ?? input.event.sourceDefinition?.family ?? 'other',
    );
    const severity = String(revision.severity ?? input.event.severity);
    const providerUrgency = revision.providerUrgency
      ? String(revision.providerUrgency).toLowerCase()
      : null;
    const certainty = revision.certainty
      ? String(revision.certainty).toLowerCase()
      : null;
    const synthetic = sourceIsSynthetic(input.event, this.env);
    let created = 0;
    let deduped = 0;
    let eligible = 0;
    let suppressed = 0;

    for (const recipient of recipients) {
      const existing = currentByUserId.get(recipient.id);
      if (existing) {
        deduped += 1;
        if (existing.outcome === 'suppressed') suppressed += 1;
        else {
          eligible += 1;
          await this.deliveryService.materialize({
            propertyId: input.propertyId,
            decision: existing,
            match: input.match,
            event: input.event,
            revision: { id: input.revision.id },
          });
        }
        continue;
      }
      const preference = preferenceByUserId.get(recipient.id)
        ?? defaultPreference(input.propertyId, recipient.id, property?.timezone);
      const prior = priorEligibleByUserId.get(recipient.id)
        ?? priorAnyByUserId.get(recipient.id);
      // If the match write succeeded but the decision write failed, a durable
      // retry sees an existing match. The absence of any prior user decision
      // is the authoritative initial-decision signal for that user.
      const isInitialDecision = input.isInitialMatch || !prior;
      const decision = evaluateRadarNotificationPolicy({
        preference,
        availableChannels: availableChannels(recipient),
        event: {
          sourceFamily,
          severity,
          impact: input.match.impactLevel,
          confidence: input.match.confidence ?? null,
          lifecycleStatus: input.match.lifecycleStatus === 'no_longer_applicable'
            ? 'no_longer_applicable'
            : String(revision.lifecycleStatus ?? input.event.status),
          effectiveAt: revision.effectiveAt ?? input.event.startAt,
          expiresAt: revision.expiresAt ?? input.event.endAt ?? null,
          providerUrgency,
          certainty,
          isSynthetic: synthetic,
        },
        isInitialMatch: isInitialDecision,
        isMaterialRevision: input.isMaterialRevision,
        previousDecision: previousDecision(prior),
        evaluatedAt: input.evaluatedAt,
      });
      const evidenceJson = {
        policyVersion: decision.policyVersion,
        normalized: decision.normalized,
        sourceFamily,
        isSynthetic: synthetic,
        isInitialMatch: isInitialDecision,
        isMaterialRevision: input.isMaterialRevision,
        providerUrgency,
        certainty,
        preference: {
          persisted: preference.persisted,
          updatedAt: preference.updatedAt,
          isEnabled: preference.isEnabled,
          enabledCategories: preference.enabledCategories,
          channels: preference.channels,
          deliveryMode: preference.deliveryMode,
          minimumSeverity: preference.minimumSeverity,
          minimumImpact: preference.minimumImpact,
          criticalSafetyOverrideEnabled: preference.criticalSafetyOverrideEnabled,
          quietHoursConfigured: Boolean(preference.quietHours),
          timezone: preference.timezone,
        },
        previousDecisionId: prior?.id ?? null,
        availableChannels: availableChannels(recipient),
      };
      const persistedDecision = await this.db.propertyRadarNotificationDecision.upsert({
        where: {
          propertyRadarMatchId_radarEventRevisionId_userId: {
            propertyRadarMatchId: input.match.id,
            radarEventRevisionId: input.revision.id,
            userId: recipient.id,
          },
        },
        create: {
          propertyId: input.propertyId,
          propertyRadarMatchId: input.match.id,
          radarEventRevisionId: input.revision.id,
          userId: recipient.id,
          outcome: decision.outcome,
          reasonCodes: decision.reasonCodes,
          eligibleChannels: decision.eligibleChannels,
          deferredUntil: decision.deferredUntil,
          criticalOverrideApplied: decision.criticalOverrideApplied,
          policyVersion: decision.policyVersion,
          evaluatedAt: input.evaluatedAt,
          evidenceJson,
        },
        update: {},
      });
      created += 1;
      if (decision.outcome === 'suppressed') suppressed += 1;
      else {
        eligible += 1;
        await this.deliveryService.materialize({
          propertyId: input.propertyId,
          decision: persistedDecision,
          match: input.match,
          event: input.event,
          revision: { id: input.revision.id },
        });
      }
    }
    return {
      evaluated: recipients.length,
      created,
      deduped,
      eligible,
      suppressed,
    };
  }
}

export const radarNotificationDecisionService =
  new RadarNotificationDecisionService();
