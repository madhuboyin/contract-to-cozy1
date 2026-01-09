// apps/backend/src/services/incidents/incident.service.ts
import { prisma } from '../../lib/prisma';
import {
  AcknowledgementType,
  IncidentActionStatus,
  IncidentSeverity,
  IncidentStatus,
  SuppressionScope,
  IncidentEventType,

} from '@prisma/client';
import {
  AddIncidentSignalInput,
  AcknowledgeIncidentInput,
  CreateIncidentActionInput,
  CreateIncidentInput,
  CreateSuppressionRuleInput,
  ListIncidentsQuery,
} from '../../types/incidents.types';
import { clampInt, toDateOrNull } from './incident.utils';
import { logIncidentEvent } from './incident.events';
import { evaluateIncident } from './incident.evaluator';
import { orchestrateIncident } from './incident.orchestrator';

function computeStatusTimestamps(nextStatus: IncidentStatus) {
  const now = new Date();
  const patch: Record<string, Date> = {};
  if (nextStatus === IncidentStatus.ACTIVE) patch.activatedAt = now;
  if (nextStatus === IncidentStatus.MITIGATED) patch.mitigatedAt = now;
  if (nextStatus === IncidentStatus.RESOLVED) patch.resolvedAt = now;
  if (nextStatus === IncidentStatus.EXPIRED) patch.expiredAt = now;
  if (nextStatus === IncidentStatus.SUPPRESSED) patch.suppressedAt = now;
  return patch;
}

/**
 * Checks if an incident should be suppressed based on rules.
 * MVP: property + user + global rules matching typeKey (or wildcard).
 */
async function shouldSuppress(args: { propertyId: string; userId?: string | null; typeKey: string }) {
  const now = new Date();
  const { propertyId, userId, typeKey } = args;

  const rules = await prisma.incidentSuppressionRule.findMany({
    where: {
      isEnabled: true,
      AND: [
        {
          OR: [
            // property scoped
            { scope: SuppressionScope.PROPERTY, propertyId, OR: [{ typeKey }, { typeKey: null }] },
            // user scoped
            ...(userId
              ? [{ scope: SuppressionScope.USER, userId, OR: [{ typeKey }, { typeKey: null }] } as any]
              : []),
            // global scoped
            { scope: SuppressionScope.GLOBAL, OR: [{ typeKey }, { typeKey: null }] },
          ],
        },
        {
          OR: [{ suppressUntil: null }, { suppressUntil: { gt: now } }],
        },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  if (!rules.length) return { suppressed: false as const };

  // pick top rule (most recently updated)
  const r = rules[0];
  return {
    suppressed: true as const,
    ruleId: r.id,
    reason: r.reason,
  };
}

export class IncidentService {
  /**
   * Create (or update existing) incident by fingerprint.
   * - Dedupe by propertyId + fingerprint within a time window (optional).
   * - Adds optional signals.
   */
  static async upsertIncident(
    input: CreateIncidentInput,
    signals?: AddIncidentSignalInput[]
  ) {
    const now = new Date();

    const severityScore = input.severityScore == null ? null : clampInt(input.severityScore, 0, 100);
    const confidence = input.confidence == null ? null : clampInt(input.confidence, 0, 100);

    // suppression check (before user-facing activation)
    const sup = await shouldSuppress({
      propertyId: input.propertyId,
      userId: input.userId ?? null,
      typeKey: input.typeKey,
    });

    const initialStatus = input.status ?? IncidentStatus.DETECTED;

    // Dedupe logic:
    // - Prefer updating an existing incident with same fingerprint if it's still "open-ish"
    const existing = await prisma.incident.findFirst({
      where: {
        propertyId: input.propertyId,
        fingerprint: input.fingerprint,
        status: { in: [IncidentStatus.DETECTED, IncidentStatus.EVALUATED, IncidentStatus.ACTIVE, IncidentStatus.ACTIONED, IncidentStatus.MITIGATED, IncidentStatus.SUPPRESSED] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const baseData = {
      propertyId: input.propertyId,
      userId: input.userId ?? null,

      sourceType: input.sourceType,
      typeKey: input.typeKey,
      category: input.category ?? null,
      title: input.title,
      summary: input.summary ?? null,
      details: input.details ?? null,

      status: sup.suppressed ? IncidentStatus.SUPPRESSED : initialStatus,
      isSuppressed: sup.suppressed,
      suppressionRuleId: sup.suppressed ? sup.ruleId ?? null : null,
      suppressionReason: sup.suppressed ? String(sup.reason ?? 'UNKNOWN') : null,

      severity: input.severity ?? null,
      severityScore,
      scoreBreakdown: input.scoreBreakdown ?? null,
      confidence,

      fingerprint: input.fingerprint,
      recurrenceKey: input.recurrenceKey ?? null,
      dedupeWindowMins: input.dedupeWindowMins ?? null,

      openedAt: existing?.openedAt ?? now,
    };

    const incident =
      existing
        ? await prisma.incident.update({
            where: { id: existing.id },
            data: {
              ...baseData,
              // keep createdAt stable; update updatedAt automatically
            },
          })
        : await prisma.incident.create({
            data: baseData,
          });

    // attach signals
    if (signals?.length) {
      await prisma.incidentSignal.createMany({
        data: signals.map((s) => ({
          incidentId: incident.id,
          signalType: s.signalType,
          externalRef: s.externalRef ?? null,
          observedAt: toDateOrNull(s.observedAt ?? null) ?? new Date(),
          payload: s.payload,
          scoreHint: s.scoreHint ?? null,
          confidence: s.confidence == null ? null : clampInt(s.confidence, 0, 100),
        })),
      });
    }
    await logIncidentEvent({
        incidentId: incident.id,
        propertyId: incident.propertyId,
        userId: incident.userId,
        type: existing ? IncidentEventType.STATUS_CHANGED : IncidentEventType.CREATED,
        message: existing ? 'Incident updated' : 'Incident created',
        payload: { typeKey: incident.typeKey, status: incident.status, suppressed: incident.isSuppressed },
      });
    await evaluateIncident(incident.id);
    await orchestrateIncident(incident.id);
    return this.getIncidentById(incident.id);
  }

  static async addSignal(incidentId: string, signal: AddIncidentSignalInput) {
    const created = await prisma.incidentSignal.create({
      data: {
        incidentId,
        signalType: signal.signalType,
        externalRef: signal.externalRef ?? null,
        observedAt: toDateOrNull(signal.observedAt ?? null) ?? new Date(),
        payload: signal.payload,
        scoreHint: signal.scoreHint ?? null,
        confidence: signal.confidence == null ? null : clampInt(signal.confidence, 0, 100),
      },
    });
    return created;
  }

  static async listIncidents(q: ListIncidentsQuery) {
    const limit = Math.min(Math.max(q.limit ?? 30, 1), 100);

    const where: any = {
      propertyId: q.propertyId,
    };
    if (q.status) where.status = q.status;
    if (!q.includeSuppressed) where.isSuppressed = false;

    const items = await prisma.incident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
      include: {
        actions: true,
      },
    });

    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? slice[slice.length - 1].id : null;

    return { items: slice, nextCursor };
  }

  static async getIncidentById(id: string) {
    return prisma.incident.findUnique({
      where: { id },
      include: {
        signals: { orderBy: { observedAt: 'desc' }, take: 50 },
        actions: { orderBy: { createdAt: 'desc' } },
        acknowledgements: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }

  static async setStatus(id: string, status: IncidentStatus) {
    const patch = computeStatusTimestamps(status);
    const data: any = { status, ...patch };

    // keep suppression flags consistent
    if (status === IncidentStatus.SUPPRESSED) {
      data.isSuppressed = true;
      data.suppressedAt = data.suppressedAt ?? new Date();
    }
    if (status === IncidentStatus.ACTIVE) {
      data.isSuppressed = false;
      data.suppressedAt = null;
      data.suppressionReason = null;
      data.suppressionRuleId = null;
    }

    return prisma.incident.update({
      where: { id },
      data,
    });
  }

  static async acknowledge(incidentId: string, userId: string, input: AcknowledgeIncidentInput) {
    const ack = await prisma.incidentAcknowledgement.create({
      data: {
        incidentId,
        userId,
        type: input.type,
        note: input.note ?? null,
        snoozeUntil: toDateOrNull(input.snoozeUntil ?? null),
      },
    });
  
    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) return ack;
  
    // Map acknowledgement -> event type once (no TS narrowing issues)
    const eventType =
      input.type === AcknowledgementType.ACKNOWLEDGED
        ? IncidentEventType.ACKNOWLEDGED
        : input.type === AcknowledgementType.DISMISSED
        ? IncidentEventType.DISMISSED
        : IncidentEventType.SNOOZED;
  
    await logIncidentEvent({
      incidentId,
      propertyId: incident.propertyId,
      userId,
      type: eventType,
      message: `User ${input.type.toLowerCase()}`,
      payload: { note: input.note ?? null, snoozeUntil: input.snoozeUntil ?? null },
    });
  
    // Snooze => suppression + mark incident suppressed
    if (input.type === AcknowledgementType.SNOOZED && ack.snoozeUntil) {
      await prisma.incidentSuppressionRule.create({
        data: {
          scope: SuppressionScope.USER,
          userId,
          typeKey: incident.typeKey,
          reason: 'SNOOZED',
          suppressUntil: ack.snoozeUntil,
          params: { from: 'incident_ack', incidentId },
          isEnabled: true,
        },
      });
  
      await prisma.incident.update({
        where: { id: incidentId },
        data: {
          isSuppressed: true,
          status: IncidentStatus.SUPPRESSED,
          suppressedAt: new Date(),
          suppressionReason: 'SNOOZED',
        },
      });
  
      await logIncidentEvent({
        incidentId,
        propertyId: incident.propertyId,
        userId,
        type: IncidentEventType.SUPPRESSED,
        message: 'Incident suppressed due to snooze',
        payload: { suppressUntil: ack.snoozeUntil },
      });
    }
  
    return ack;
  }  
  static async createAction(incidentId: string, action: CreateIncidentActionInput) {
    const created = await prisma.incidentAction.create({
      data: {
        incidentId,
        type: action.type,
        status: action.status ?? IncidentActionStatus.PROPOSED,
        entityType: action.entityType ?? null,
        entityId: action.entityId ?? null,
        ctaLabel: action.ctaLabel ?? null,
        ctaUrl: action.ctaUrl ?? null,
        payload: action.payload ?? null,
      },
    });

    // promote incident lifecycle if needed
    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: IncidentStatus.ACTIONED,
      },
    });

    return created;
  }

  static async createSuppressionRule(input: CreateSuppressionRuleInput) {
    return prisma.incidentSuppressionRule.create({
      data: {
        scope: input.scope ?? SuppressionScope.PROPERTY,
        propertyId: input.propertyId ?? null,
        userId: input.userId ?? null,

        typeKey: input.typeKey ?? null,
        assetId: input.assetId ?? null,

        reason: input.reason,
        params: input.params ?? null,
        suppressUntil: toDateOrNull(input.suppressUntil ?? null),
        isEnabled: input.isEnabled ?? true,
      },
    });
  }
}
