// apps/backend/src/services/incidents/incident.orchestrator.ts
import {
    IncidentActionType,
    IncidentSeverity,
    // add these:
    MaintenanceTaskSource,
    MaintenanceTaskStatus,
    MaintenanceTaskPriority,
    RiskLevel,
  } from '@prisma/client';
  import { prisma } from '../../lib/prisma';
  import { logIncidentEvent } from './incident.events';
  import { IncidentEventType, IncidentActionStatus, IncidentStatus } from '@prisma/client';
  function recommendActions(typeKey: string, severity?: IncidentSeverity | null) {
    const isCritical = severity === IncidentSeverity.CRITICAL;
  
    switch (typeKey) {
      case 'FREEZE_RISK':
        return [
          {
            type: IncidentActionType.TASK,
            ctaLabel: isCritical ? 'Create urgent winterization task' : 'Add winterization task',
            payload: {
              source: MaintenanceTaskSource.ACTION_CENTER,
              status: MaintenanceTaskStatus.PENDING,
              actionKey: 'FREEZE_RISK:WINTERIZE',
              title: 'Winterize exposed plumbing',
              description:
                'Protect exposed pipes, outdoor faucets, and shutoff valves before freezing temperatures.',
              priority: isCritical ? MaintenanceTaskPriority.URGENT : MaintenanceTaskPriority.HIGH,
              riskLevel: isCritical ? RiskLevel.CRITICAL : RiskLevel.HIGH,
              category: 'PLUMBING',
              serviceCategory: 'PLUMBING', // ServiceCategory enum value
            },
          },
          {
            type: IncidentActionType.BOOKING,
            ctaLabel: 'Schedule a plumber',
            payload: {
              source: MaintenanceTaskSource.ACTION_CENTER,
              status: MaintenanceTaskStatus.PENDING,
              actionKey: 'FREEZE_RISK:PLUMBER_BOOKING',
              title: 'Book plumber for freeze protection',
              description:
                'Schedule a plumber to winterize and inspect for freeze-related vulnerabilities.',
              priority: isCritical ? MaintenanceTaskPriority.URGENT : MaintenanceTaskPriority.HIGH,
              riskLevel: isCritical ? RiskLevel.CRITICAL : RiskLevel.HIGH,
              category: 'PLUMBING',
              serviceCategory: 'PLUMBING',
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
  
export async function orchestrateIncident(incidentId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { actions: true },
  });
  if (!incident) return null;

  // Only orchestrate user-relevant incidents
  if (incident.isSuppressed) return incident;
  if (incident.status !== IncidentStatus.ACTIVE && incident.status !== IncidentStatus.ACTIONED) return incident;

  // Avoid spamming: if any actions already exist, do nothing (tune later with action types)
  if (incident.actions.length > 0) return incident;

  const recs = recommendActions(incident.typeKey, incident.severity);
  if (!recs.length) return incident;

  // Create PROPOSED actions (UI can show suggested CTAs)
  const created = await prisma.incidentAction.createMany({
    data: recs.map((r) => ({
      incidentId: incident.id,
      type: r.type,
      status: IncidentActionStatus.PROPOSED,
      ctaLabel: r.ctaLabel ?? null,
      payload: r.payload ?? null,
    })),
  });

  await logIncidentEvent({
    incidentId: incident.id,
    propertyId: incident.propertyId,
    userId: incident.userId,
    type: IncidentEventType.ACTION_PROPOSED,
    message: `Proposed ${created.count} actions`,
    payload: { count: created.count, typeKey: incident.typeKey },
  });

  // Mark as ACTIONED only after an action is actually CREATED (not merely proposed).
  return prisma.incident.findUnique({ where: { id: incident.id }, include: { actions: true } });
}
