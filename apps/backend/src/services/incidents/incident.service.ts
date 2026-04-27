// apps/backend/src/services/incidents/incident.service.ts
import { prisma } from '../../lib/prisma';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../analytics';
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
import { guidanceJourneyService } from '../guidanceEngine/guidanceJourney.service';
import { logger } from '../../lib/logger';

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

function normalizeIncidentTypeKey(typeKey: string): string {
  return String(typeKey || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapIncidentTypeToGuidance(typeKey: string): {
  signalIntentFamily: string;
  issueDomain:
    | 'WEATHER'
    | 'INSURANCE'
    | 'SAFETY'
    | 'MAINTENANCE'
    | 'ASSET_LIFECYCLE'
    | 'FINANCIAL'
    | 'OTHER';
  readiness: 'READY' | 'NEEDS_CONTEXT' | 'UNKNOWN';
  sourceToolKey: string;
} {
  const normalized = normalizeIncidentTypeKey(typeKey);

  if (normalized.includes('RECALL')) {
    return {
      signalIntentFamily: 'recall_detected',
      issueDomain: 'SAFETY',
      readiness: 'READY',
      sourceToolKey: 'recalls',
    };
  }

  if (normalized.includes('FREEZE') || normalized.includes('WEATHER') || normalized.includes('CLIMATE')) {
    return {
      signalIntentFamily: 'freeze_risk',
      issueDomain: 'WEATHER',
      readiness: 'READY',
      sourceToolKey: 'home-event-radar',
    };
  }

  if (normalized.includes('COVERAGE') || normalized.includes('POLICY') || normalized.includes('DEDUCTIBLE')) {
    return {
      signalIntentFamily: 'coverage_lapse_detected',
      issueDomain: 'INSURANCE',
      readiness: 'NEEDS_CONTEXT',
      sourceToolKey: 'coverage-intelligence',
    };
  }

  if (normalized.includes('INSPECTION')) {
    return {
      signalIntentFamily: 'inspection_followup_needed',
      issueDomain: 'MAINTENANCE',
      readiness: 'NEEDS_CONTEXT',
      sourceToolKey: 'inspection-report',
    };
  }

  if (normalized.includes('LIFECYCLE') || normalized.includes('END_OF_LIFE')) {
    return {
      signalIntentFamily: 'lifecycle_end_or_past_life',
      issueDomain: 'ASSET_LIFECYCLE',
      readiness: 'NEEDS_CONTEXT',
      sourceToolKey: 'replace-repair',
    };
  }

  if (normalized.includes('MAINTENANCE')) {
    return {
      signalIntentFamily: 'maintenance_failure_risk',
      issueDomain: 'MAINTENANCE',
      readiness: 'NEEDS_CONTEXT',
      sourceToolKey: 'maintenance',
    };
  }

  if (
    normalized.includes('FINANCIAL') ||
    normalized.includes('BUDGET') ||
    normalized.includes('CAPITAL') ||
    normalized.includes('COST_OF_INACTION')
  ) {
    return {
      signalIntentFamily: 'financial_exposure',
      issueDomain: 'FINANCIAL',
      readiness: 'NEEDS_CONTEXT',
      sourceToolKey: 'true-cost',
    };
  }

  return {
    signalIntentFamily: 'generic_actionable_signal',
    issueDomain: 'OTHER',
    readiness: 'UNKNOWN',
    sourceToolKey: 'home-event-radar',
  };
}

async function bridgeIncidentToGuidance(incident: any) {
  if (!incident?.propertyId || !incident?.id) return;
  if (
    incident.isSuppressed ||
    incident.status === IncidentStatus.SUPPRESSED ||
    incident.status === IncidentStatus.RESOLVED ||
    incident.status === IncidentStatus.EXPIRED
  ) {
    return;
  }

  const mapped = mapIncidentTypeToGuidance(incident.typeKey);
  const details = asRecord(incident.details);
  const inventoryItemId =
    typeof details.inventoryItemId === 'string' && details.inventoryItemId.trim().length > 0
      ? details.inventoryItemId
      : null;
  const homeAssetId =
    typeof details.homeAssetId === 'string' && details.homeAssetId.trim().length > 0
      ? details.homeAssetId
      : null;

  await guidanceJourneyService.ingestSignal({
    propertyId: incident.propertyId,
    actorUserId: incident.userId ?? null,
    inventoryItemId,
    homeAssetId,
    signalIntentFamily: mapped.signalIntentFamily,
    issueDomain: mapped.issueDomain,
    executionReadiness: mapped.readiness,
    severity: incident.severity ?? null,
    severityScore: incident.severityScore ?? null,
    confidenceScore: incident.confidence ?? null,
    sourceType: incident.sourceType ?? 'INCIDENT',
    sourceFeatureKey: 'incident-service',
    sourceToolKey: mapped.sourceToolKey,
    sourceEntityType: 'INCIDENT',
    sourceEntityId: incident.id,
    payloadJson: {
      incidentId: incident.id,
      typeKey: incident.typeKey,
      status: incident.status,
      severity: incident.severity ?? null,
      confidence: incident.confidence ?? null,
    },
    metadataJson: {
      incidentCategory: incident.category ?? null,
      incidentTitle: incident.title ?? null,
    },
  });
}

async function archiveIncidentGuidance(incidentId: string) {
  const db = prisma as any;
  const guidanceSignal = db.guidanceSignal;
  const guidanceJourney = db.guidanceJourney;
  if (!guidanceSignal || !guidanceJourney) return;

  const now = new Date();

  await guidanceSignal.updateMany({
    where: {
      sourceEntityType: 'INCIDENT',
      sourceEntityId: incidentId,
      status: 'ACTIVE',
    },
    data: {
      status: 'ARCHIVED',
      archivedAt: now,
    },
  });

  const sourceSignals = await guidanceSignal.findMany({
    where: {
      sourceEntityType: 'INCIDENT',
      sourceEntityId: incidentId,
    },
    select: {
      id: true,
    },
  });

  const sourceSignalIds = sourceSignals.map((signal: { id: string }) => signal.id);
  if (sourceSignalIds.length === 0) return;

  await guidanceJourney.updateMany({
    where: {
      status: 'ACTIVE',
      primarySignalId: {
        in: sourceSignalIds,
      },
    },
    data: {
      status: 'ARCHIVED',
      completedAt: now,
      lastTransitionAt: now,
    },
  });
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
    // Step 1: Auto-resolve old unactioned incidents before creating new ones
    const oldUnactionedIncidents = await prisma.incident.findMany({
      where: {
        propertyId: input.propertyId,
        fingerprint: input.fingerprint,
        status: { 
          in: [IncidentStatus.DETECTED, IncidentStatus.EVALUATED, IncidentStatus.ACTIVE] 
        },
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Older than 24 hours
        }
      },
    });

    // Auto-resolve old incidents
    for (const oldIncident of oldUnactionedIncidents) {
      await prisma.incident.update({
        where: { id: oldIncident.id },
        data: {
          status: IncidentStatus.RESOLVED,
          resolvedAt: now,
        },
      });
      
      await logIncidentEvent({
        incidentId: oldIncident.id,
        propertyId: oldIncident.propertyId,
        userId: oldIncident.userId,
        type: IncidentEventType.RESOLVED,
        message: 'Auto-resolved due to new incident creation (no user action taken)',
        payload: { 
          autoResolved: true, 
          reason: 'new_incident_created',
          newIncidentFingerprint: input.fingerprint 
        },
      });

      // Archive guidance for auto-resolved incidents
      try {
        await archiveIncidentGuidance(oldIncident.id);
      } catch (guidanceError) {
        logger.warn({ guidanceError }, '[GUIDANCE] auto-resolve archive hook failed');
      }
    }

    // Step 2: Prefer updating an existing incident with same fingerprint if it's still "open-ish"
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

    // Analytics: incident created (only for genuinely new incidents, not updates)
    if (!existing) {
      analyticsEmitter.track({
        eventType: AnalyticsEvent.INCIDENT_CREATED,
        userId: incident.userId ?? null,
        propertyId: incident.propertyId,
        moduleKey: AnalyticsModule.INCIDENTS,
        featureKey: AnalyticsFeature.INCIDENT,
        metadataJson: {
          typeKey: incident.typeKey,
          severity: incident.severity ?? null,
          isSuppressed: incident.isSuppressed,
        },
      });
    }

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

    const hydrated = await this.getIncidentById(incident.id);

    if (hydrated) {
      try {
        await bridgeIncidentToGuidance(hydrated);
      } catch (guidanceError) {
        logger.warn({ guidanceError }, '[GUIDANCE] incident bridge hook failed');
      }
    }

    return hydrated;
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
    
    // If a specific status is requested, use it
    if (q.status) {
      where.status = q.status;
    } else {
      // By default, exclude terminal states (RESOLVED, EXPIRED, SUPPRESSED)
      // This prevents resolved incidents from showing in dashboards
      where.status = {
        notIn: ['RESOLVED', 'EXPIRED', 'SUPPRESSED'],
      };
    }
    
    if (!q.includeSuppressed) where.isSuppressed = false;

    // Filter by archived status if specified
    if (q.archived !== undefined) {
      where.userPreferences = {
        some: {
          isArchived: q.archived,
        },
      };
    }

    const items = await prisma.incident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
      include: {
        actions: true,
        userPreferences: true,
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

    const updated = await prisma.incident.update({
      where: { id },
      data,
    });

    if (
      status === IncidentStatus.SUPPRESSED ||
      status === IncidentStatus.RESOLVED ||
      status === IncidentStatus.EXPIRED
    ) {
      try {
        await archiveIncidentGuidance(id);
      } catch (guidanceError) {
        logger.warn({ guidanceError }, '[GUIDANCE] incident archive hook failed');
      }
    }

    return updated;
  }

static async acknowledge(incidentId: string, userId: string, input: AcknowledgeIncidentInput) {
  // ✅ Single-path, idempotent suppression enforcement for DISMISS/SNOOZE
  const { ack, incident, didSuppress } = await prisma.$transaction(async (tx) => {
    const ack = await tx.incidentAcknowledgement.create({
      data: {
        incidentId,
        userId,
        type: input.type,
        note: input.note ?? null,
        snoozeUntil: toDateOrNull(input.snoozeUntil ?? null),
      },
    });

    const incident = await tx.incident.findUnique({ where: { id: incidentId } });
    if (!incident) return { ack, incident: null as any, didSuppress: false };

    const isSuppressionAction =
      input.type === AcknowledgementType.SNOOZED || input.type === AcknowledgementType.DISMISSED;

    let didSuppress = false;

    if (isSuppressionAction) {
      const reason = input.type === AcknowledgementType.SNOOZED ? 'SNOOZED' : 'USER_DISMISSED';
      const suppressUntil = input.type === AcknowledgementType.SNOOZED ? ack.snoozeUntil : null;

      // ✅ Persist suppression rule (best-effort idempotent)
      try {
        await tx.incidentSuppressionRule.create({
          data: {
            scope: SuppressionScope.PROPERTY,
            propertyId: incident.propertyId,
            typeKey: incident.typeKey,
            reason: reason as any,
            suppressUntil,
            params: { from: 'incident_ack', incidentId, userId, note: input.note ?? null },
            isEnabled: true,
          },
        });
      } catch (e: any) {
        // ignore unique violations (rule already exists)
        const code = e?.code ?? e?.meta?.cause;
        if (code !== 'P2002') throw e;
      }

      // ✅ Update incident suppression state (source of truth)
      await tx.incident.update({
        where: { id: incidentId },
        data: {
          isSuppressed: true,
          status: IncidentStatus.SUPPRESSED,
          suppressedAt: new Date(),
          suppressionReason: reason,
          snoozedUntil: suppressUntil,
        },
      });

      didSuppress = true;
    }

    return { ack, incident, didSuppress };
  });

  if (!incident) return ack;

  // 1) Log the direct user action (ACK/DISMISS/SNOOZE)
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

  // 2) If suppression action, also log SUPPRESSED for deterministic noise control
  if (didSuppress) {
    await logIncidentEvent({
      incidentId,
      propertyId: incident.propertyId,
      userId,
      type: IncidentEventType.SUPPRESSED,
      message: `Incident suppressed due to user ${input.type.toLowerCase()}`,
      payload: {
        action: input.type,
        suppressUntil:
          input.type === AcknowledgementType.SNOOZED ? (ack as any).snoozeUntil : 'PERMANENT',
      },
    });

    try {
      await archiveIncidentGuidance(incidentId);
    } catch (guidanceError) {
      logger.warn({ guidanceError }, '[GUIDANCE] incident suppression archive hook failed');
    }
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
