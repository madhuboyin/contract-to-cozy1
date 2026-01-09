// apps/backend/src/services/incidents/integrations/maintenanceTask.adapter.ts
import { prisma } from '../../../lib/prisma';
import {
  MaintenanceTaskPriority,
  MaintenanceTaskSource,
  MaintenanceTaskStatus,
  RiskLevel,
  ServiceCategory,
} from '@prisma/client';

export class MaintenanceTaskAdapter {
  static async findOrCreateFromIncidentAction(args: {
    incident: {
      id: string;
      propertyId: string;
      typeKey: string;
      title: string;
      summary: string | null;
      category?: string | null;
    };
    userId: string;
    action: { id: string; type: string };
    payload: any;
  }): Promise<{ entityType: string; entityId: string; actionUrl?: string | null }> {
    const { incident, action, payload } = args;

    const actionKey: string = payload.actionKey ?? `incident:${incident.id}:${action.type}:${action.id}`;
    const title: string = payload.title ?? incident.title;
    const description: string =
      payload.description ?? incident.summary ?? `Created from incident ${incident.typeKey}`;

    const source: MaintenanceTaskSource = payload.source ?? MaintenanceTaskSource.ACTION_CENTER;
    const status: MaintenanceTaskStatus = payload.status ?? MaintenanceTaskStatus.PENDING;
    const priority: MaintenanceTaskPriority = payload.priority ?? MaintenanceTaskPriority.MEDIUM;
    const riskLevel: RiskLevel | null = payload.riskLevel ?? null;

    const serviceCategory: ServiceCategory | null = payload.serviceCategory ?? null;

    // Dedup via unique (propertyId, actionKey)
    const existing = await prisma.propertyMaintenanceTask.findUnique({
      where: { propertyId_actionKey: { propertyId: incident.propertyId, actionKey } },
    });

    if (existing) {
      return { entityType: 'PropertyMaintenanceTask', entityId: existing.id, actionUrl: payload.actionUrl ?? null };
    }

    const created = await prisma.propertyMaintenanceTask.create({
      data: {
        propertyId: incident.propertyId,
        title,
        description,

        status,
        source,
        actionKey,

        priority,
        riskLevel,

        assetType: payload.assetType ?? null,
        category: payload.category ?? incident.category ?? null,
        serviceCategory,

        isRecurring: payload.isRecurring ?? false,
        frequency: payload.frequency ?? null,
        nextDueDate: payload.nextDueDate ? new Date(payload.nextDueDate) : null,

        estimatedCost: payload.estimatedCost ?? null,

        warrantyId: payload.warrantyId ?? null,
        homeAssetId: payload.homeAssetId ?? null,
      },
    });

    return { entityType: 'PropertyMaintenanceTask', entityId: created.id, actionUrl: payload.actionUrl ?? null };
  }
}
