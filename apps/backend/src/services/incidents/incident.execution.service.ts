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

    // ✅ Execute is strictly user-driven and must be idempotent (actionKey is the anchor).
    // ✅ Always return a fresh incident snapshot so UI/backend never drift.
    const result = await prisma.$transaction(async (tx) => {
      const action = await tx.incidentAction.findUnique({
        where: { id: actionId },
        include: { incident: { include: { actions: true } } },
      });
      if (!action) throw new Error('Incident action not found');
      if (action.incidentId !== incidentId) throw new Error('Incident/action mismatch');

      const incident = action.incident;
      if (!incident) throw new Error('Incident not found');

      // Idempotent success: if already created, just return current state
      if (action.status === IncidentActionStatus.CREATED) {
        const fresh = await tx.incident.findUnique({
          where: { id: incidentId },
          include: { actions: true },
        });
        return {
          incident: fresh!,
          action,
          linkedEntity: action.entityId
            ? { entityType: action.entityType ?? null, entityId: action.entityId, actionUrl: action.ctaUrl ?? null }
            : null,
          didCreate: false,
        };
      }

      if (action.status !== IncidentActionStatus.PROPOSED) {
        throw new Error(`Action must be PROPOSED to execute. Current status: ${action.status}`);
      }

      // Product rule: incidents can only execute TASK actions (no bookings or other side-effects)
      if (action.type !== 'TASK') {
        throw new Error(`Only TASK actions are allowed from incidents. Got: ${action.type}`);
      }

if ((incident as any).isSuppressed) {
        throw new Error('Incident is suppressed; cannot execute actions');
      }

      const payload: any = action.payload ?? {};
      const actionKey = payload?.actionKey ?? (action as any).actionKey;
      if (!actionKey) throw new Error('Missing actionKey on action payload');

      // Create or reuse the linked entity (PropertyMaintenanceTask) deterministically
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
        prismaClient: tx as any,
      });

      // Persist the action as CREATED + deterministic ctaUrl
      const updatedAction = await tx.incidentAction.update({
        where: { id: actionId },
        data: {
          status: IncidentActionStatus.CREATED,
          entityType: entity.entityType,
          entityId: entity.entityId,
          ctaUrl: entity.actionUrl ?? action.ctaUrl,
        },
      });

      // Mark incident as ACTIONED and suppress future nudges (cooldown suppression)
      const reason = SuppressionReason.TASK_EXISTS;

      // Persist a suppression rule (best-effort idempotent)
      try {
        await tx.incidentSuppressionRule.create({
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
      } catch (e: any) {
        // ignore unique violations (rule already exists)
        const code = e?.code ?? e?.meta?.cause;
        if (code !== 'P2002') throw e;
      }

      await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: IncidentStatus.ACTIONED,
          isSuppressed: true,
          suppressedAt: new Date(),
          suppressionReason: String(reason),
        },
      });

      const freshIncident = await tx.incident.findUnique({
        where: { id: incidentId },
        include: { actions: true },
      });

      return { incident: freshIncident!, action: updatedAction, linkedEntity: entity, didCreate: true, reason };
    });

    // Audit trail (outside txn is OK; DB state is the source of truth)
    if (result.didCreate) {
      await logIncidentEvent({
        incidentId,
        propertyId: result.incident.propertyId,
        userId,
        type: IncidentEventType.ACTION_CREATED,
        message: `Action executed -> ${result.linkedEntity?.entityType}:${result.linkedEntity?.entityId}`,
        payload: { actionId, entity: result.linkedEntity },
      });

      await logIncidentEvent({
        incidentId,
        propertyId: result.incident.propertyId,
        userId,
        type: IncidentEventType.SUPPRESSED,
        message: 'Incident suppressed after creating maintenance task',
        payload: { reason: result.reason },
      });
    }

    // Notifications (only after DB commit)
    if (result.didCreate) {
      await IncidentNotificationService.notifyAfterActionExecuted({
        incident: result.incident as any,
        userId,
        action: result.action as any,
        severity: ((result.incident as any).severity as any) ?? IncidentSeverity.INFO,
      });
    }

    return { incident: result.incident, action: result.action, linkedEntity: result.linkedEntity };
  }
}
