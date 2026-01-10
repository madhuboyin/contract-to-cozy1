// apps/backend/src/services/incidents/integrations/maintenanceTask.adapter.ts
import { prisma } from '../../../lib/prisma';
import {
  MaintenanceTaskPriority,
  MaintenanceTaskSource,
  MaintenanceTaskStatus,
  RiskLevel,
  ServiceCategory,
} from '@prisma/client';

function normalizeBaseUrl(url?: string | null) {
  if (!url) return null;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Build a deep-link to the maintenance task in the app.
 * Adjust the path/query if your UI uses a different route.
 */
function buildMaintenanceTaskUrl(args: { baseUrl: string; propertyId: string; taskId: string }) {
  // Preferred: a dedicated maintenance page + optional taskId
  return `${args.baseUrl}/dashboard/properties/${args.propertyId}/maintenance?taskId=${args.taskId}`;
}

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
    prismaClient?: typeof prisma;
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

    const baseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);
    const client = args.prismaClient ?? prisma;

    // Dedup via unique (propertyId, actionKey)
    const existing = await client.propertyMaintenanceTask.findUnique({
      where: { propertyId_actionKey: { propertyId: incident.propertyId, actionKey } },
    });

    if (existing) {
      const actionUrl =
        payload.actionUrl ??
        (baseUrl ? buildMaintenanceTaskUrl({ baseUrl, propertyId: incident.propertyId, taskId: existing.id }) : null);

      return { entityType: 'PropertyMaintenanceTask', entityId: existing.id, actionUrl };
    }

    const created = await client.propertyMaintenanceTask.create({
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

    const actionUrl =
      payload.actionUrl ??
      (baseUrl ? buildMaintenanceTaskUrl({ baseUrl, propertyId: incident.propertyId, taskId: created.id }) : null);

    return { entityType: 'PropertyMaintenanceTask', entityId: created.id, actionUrl };
  }
}
