// apps/backend/src/services/incidents/incident.execution.service.ts
import { prisma } from '../../lib/prisma';
import {
  IncidentActionStatus,
  IncidentEventType,
  IncidentSeverity,
  IncidentStatus,
  SuppressionReason,
  SuppressionScope,
} from '@prisma/client';
import { logIncidentEvent } from './incident.events';
import { MaintenanceTaskAdapter } from './integrations/maintenanceTask.adapter';
import { IncidentNotificationService } from './integrations/incidentNotification.service';

type ExecuteArgs = {
  incidentId: string;
  actionId: string;
  userId: string;
};

export class IncidentExecutionService {
  static async executeAction(args: ExecuteArgs) {
    const { incidentId, actionId, userId } = args;

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { actions: true },
    });
    if (!incident) throw new Error('Incident not found');

    const action = incident.actions.find((a) => a.id === actionId);
    if (!action) throw new Error('Incident action not found');

    if (action.status !== IncidentActionStatus.PROPOSED) {
      throw new Error(`Action must be PROPOSED to execute. Current status: ${action.status}`);
    }
    if (incident.isSuppressed) throw new Error('Incident is suppressed; cannot execute actions');

    const payload: any = action.payload ?? {};
    if (!payload) throw new Error('Action payload missing');

    // For your schema: both BOOKING + TASK should materialize as a PropertyMaintenanceTask
    if (action.type !== 'BOOKING' && action.type !== 'TASK') {
      throw new Error(`Execution not supported for action type: ${action.type}`);
    }

    const entity = await MaintenanceTaskAdapter.findOrCreateFromIncidentAction({
      incident: {
        id: incident.id,
        propertyId: incident.propertyId,
        typeKey: incident.typeKey,
        title: incident.title,
        summary: incident.summary ?? null,
        category: incident.category ?? null,
      },
      userId,
      action: { id: action.id, type: action.type },
      payload,
    });

    // Link IncidentAction -> task
    const updatedAction = await prisma.incidentAction.update({
      where: { id: actionId },
      data: {
        status: IncidentActionStatus.CREATED,
        entityType: entity.entityType,
        entityId: entity.entityId,
        ctaUrl: entity.actionUrl ?? action.ctaUrl,
      },
    });

    // Incident lifecycle
    const updatedIncident = await prisma.incident.update({
      where: { id: incidentId },
      data: { status: IncidentStatus.ACTIONED },
    });

    await logIncidentEvent({
      incidentId,
      propertyId: incident.propertyId,
      userId,
      type: IncidentEventType.ACTION_CREATED,
      message: `Action executed -> ${entity.entityType}:${entity.entityId}`,
      payload: { actionId, entity },
    });

    // Suppress further duplicate nudges (cooldown)
    const reason =
      action.type === 'BOOKING' ? SuppressionReason.BOOKING_EXISTS : SuppressionReason.TASK_EXISTS;

    await prisma.incidentSuppressionRule.create({
      data: {
        scope: SuppressionScope.PROPERTY,
        propertyId: incident.propertyId,
        typeKey: incident.typeKey,
        reason,
        suppressUntil: new Date(Date.now() + 72 * 3600 * 1000),
        params: { from: 'incident_action_execute', actionType: action.type, entity },
        isEnabled: true,
      },
    });

    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        isSuppressed: true,
        status: IncidentStatus.SUPPRESSED,
        suppressedAt: new Date(),
        suppressionReason: String(reason),
      },
    });

    await logIncidentEvent({
      incidentId,
      propertyId: incident.propertyId,
      userId,
      type: IncidentEventType.SUPPRESSED,
      message: 'Incident suppressed after creating maintenance task',
      payload: { reason },
    });

    // Notifications
    await IncidentNotificationService.notifyAfterActionExecuted({
      incident: updatedIncident,
      userId,
      action: updatedAction,
      severity: (incident.severity as any) ?? IncidentSeverity.INFO,
    });

    return { incident: updatedIncident, action: updatedAction, linkedEntity: entity };
  }
}
