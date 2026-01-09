// apps/backend/src/services/incidents/incident.orchestrator.ts
import {
  IncidentActionType,
  IncidentSeverity,
  MaintenanceTaskSource,
  MaintenanceTaskStatus,
  MaintenanceTaskPriority,
  RiskLevel,
  IncidentEventType,
  IncidentActionStatus,
  IncidentStatus,
} from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { logIncidentEvent } from './incident.events';

/**
 * ✅ Action recommendation for incident types.
 * IMPORTANT CONSTRAINT:
 * - Do NOT propose booking actions inside incidents.
 * - Incidents propose TASK actions only. Bookings happen later, user-driven.
 */
function recommendActions(typeKey: string, severity?: IncidentSeverity | null) {
  const isCritical = severity === IncidentSeverity.CRITICAL;

  switch (typeKey) {
    case 'FREEZE_RISK':
      return [
        {
          type: IncidentActionType.TASK,
          ctaLabel: isCritical
            ? 'Create urgent winterization task'
            : 'Add winterization task',
          payload: {
            source: MaintenanceTaskSource.ACTION_CENTER,
            status: MaintenanceTaskStatus.PENDING,

            // ✅ Stable actionKey = idempotency anchor for orchestration
            // You can later bucket by day if desired (see notes below)
            actionKey: 'FREEZE_RISK:WINTERIZE',

            title: 'Winterize exposed plumbing',
            description:
              'Protect exposed pipes, outdoor faucets, and shutoff valves before freezing temperatures.',
            priority: isCritical
              ? MaintenanceTaskPriority.URGENT
              : MaintenanceTaskPriority.HIGH,
            riskLevel: isCritical ? RiskLevel.CRITICAL : RiskLevel.HIGH,
            category: 'PLUMBING',
            serviceCategory: 'PLUMBING', // if ServiceCategory enum exists in your schema
          },
        },
      ];

    case 'COVERAGE_LAPSE':
      return [
        {
          type: IncidentActionType.TASK,
          ctaLabel: 'Create renewal task',
          payload: {
            source: MaintenanceTaskSource.ACTION_CENTER,
            status: MaintenanceTaskStatus.PENDING,
            actionKey: 'COVERAGE_LAPSE:RENEW',
            title: 'Renew coverage',
            description: 'Renew homeowner coverage to avoid a lapse.',
            priority: MaintenanceTaskPriority.URGENT,
            riskLevel: RiskLevel.HIGH,
            category: 'INSURANCE',
          },
        },
      ];

    default:
      return [];
  }
}

type DecisionTrace = {
  evaluatedAt: string;
  incident: {
    id: string;
    typeKey: string;
    severity: IncidentSeverity | null;
    status: IncidentStatus;
    isSuppressed: boolean;
  };
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    details?: Record<string, any>;
  }>;
  existingActionKeys: string[];
  recommended: Array<{
    actionKey: string | null;
    type: IncidentActionType;
    ctaLabel?: string | null;
    willPropose: boolean;
    reason: string;
  }>;
  outcome: {
    proposedCount: number;
    message: string;
  };
};

function extractActionKeyFromPayload(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === 'object' && typeof payload.actionKey === 'string') return payload.actionKey;
  return null;
}

export async function orchestrateIncident(incidentId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { actions: true },
  });
  if (!incident) return null;

  // Only orchestrate user-relevant incidents
  // (suppression is first-class noise control)
  if (incident.isSuppressed) return incident;

  // Orchestrate only when it makes sense
  const isOrchestratable =
    incident.status === IncidentStatus.ACTIVE ||
    incident.status === IncidentStatus.ACTIONED;

  if (!isOrchestratable) return incident;

  const existingActionKeys = incident.actions
    .map((a) => extractActionKeyFromPayload(a.payload))
    .filter((k): k is string => !!k);

  const trace: DecisionTrace = {
    evaluatedAt: new Date().toISOString(),
    incident: {
      id: incident.id,
      typeKey: incident.typeKey,
      severity: incident.severity ?? null,
      status: incident.status,
      isSuppressed: incident.isSuppressed,
    },
    checks: [],
    existingActionKeys,
    recommended: [],
    outcome: { proposedCount: 0, message: '' },
  };

  // Recommend actions based on incident type + severity
  const recs = recommendActions(incident.typeKey, incident.severity);

  trace.checks.push({
    id: 'recs.present',
    label: 'Recommendations available for this incident type',
    passed: recs.length > 0,
    details: { typeKey: incident.typeKey, count: recs.length },
  });

  if (!recs.length) {
    trace.outcome = { proposedCount: 0, message: 'No recommendations for incident type.' };

    await logIncidentEvent({
      incidentId: incident.id,
      propertyId: incident.propertyId,
      userId: incident.userId,
      type: IncidentEventType.ACTION_PROPOSED,
      message: `Orchestrated: no recommendations`,
      payload: {
        count: 0,
        typeKey: incident.typeKey,
        decisionTrace: trace,
      },
    });
    
    return incident;
  }

  // ✅ Idempotency: only propose actions that aren't already present by actionKey
  const deduped = recs.filter((r) => {
    const key = extractActionKeyFromPayload(r.payload);
    if (!key) return true; // if no key, allow (but ideally every action has a key)
    return !existingActionKeys.includes(key);
  });

  for (const r of recs) {
    const key = extractActionKeyFromPayload(r.payload);
    const exists = key ? existingActionKeys.includes(key) : false;

    trace.recommended.push({
      actionKey: key,
      type: r.type,
      ctaLabel: r.ctaLabel ?? null,
      willPropose: !exists,
      reason: exists ? 'Skipped: actionKey already exists on incident' : 'Will propose',
    });
  }

  if (!deduped.length) {
    trace.outcome = { proposedCount: 0, message: 'All recommended actions already exist.' };

    await logIncidentEvent({
      incidentId: incident.id,
      propertyId: incident.propertyId,
      userId: incident.userId,
      type: IncidentEventType.ACTION_PROPOSED,
      message: `Orchestrated: no new actions to propose`,
      payload: {
        count: 0,
        typeKey: incident.typeKey,
        decisionTrace: trace,
      },
    });    

    return prisma.incident.findUnique({
      where: { id: incident.id },
      include: { actions: true },
    });
  }

  // Create PROPOSED actions (UI can show suggested CTAs)
  const created = await prisma.incidentAction.createMany({
    data: deduped.map((r) => ({
      incidentId: incident.id,
      type: r.type,
      status: IncidentActionStatus.PROPOSED,
      ctaLabel: r.ctaLabel ?? null,
      payload: r.payload ?? null,
    })),
  });

  trace.outcome = {
    proposedCount: created.count,
    message: `Proposed ${created.count} action(s) after dedupe by actionKey.`,
  };

  // Ensure trace always contains proposed action payloads too
  const proposedActions = deduped.map((r) => ({
    type: r.type,
    ctaLabel: r.ctaLabel ?? null,
    actionKey: r.payload?.actionKey ?? null,
    payload: r.payload ?? null,
  }));
  

  await logIncidentEvent({
    incidentId: incident.id,
    propertyId: incident.propertyId,
    userId: incident.userId,
    type: IncidentEventType.ACTION_PROPOSED,
    message: `Proposed ${created.count} actions`,
    payload: {
      count: created.count,
      typeKey: incident.typeKey,
      decisionTrace: {
        ...trace,
        proposedActions, // ✅ add this field for UI mapping convenience
      },
    },
  });

  // Mark as ACTIONED only after an action is actually CREATED (not merely proposed).
  // ✅ You already do NOT mark ACTIONED here — keep it that way.
  return prisma.incident.findUnique({
    where: { id: incident.id },
    include: { actions: true },
  });
}
