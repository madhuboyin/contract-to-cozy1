// apps/backend/src/services/diyCompletion.service.ts
import { DiyProject, DiyProjectCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HomeEventsService } from './homeEvents.service';
import { logger } from '../lib/logger';

const homeEventsService = new HomeEventsService();

const IMPROVEMENT_CATEGORIES: DiyProjectCategory[] = ['PAINTING', 'EXTERIOR', 'FLOORING'];

export class DiyCompletionService {
  async onComplete(project: DiyProject): Promise<void> {
    const eventType = IMPROVEMENT_CATEGORIES.includes(project.category) ? 'IMPROVEMENT' : 'MAINTENANCE';

    let homeEventId: string | null = null;

    try {
      const event = await homeEventsService.createHomeEvent({
        propertyId: project.propertyId,
        userId: project.userId,
        body: {
          type: eventType,
          importance: 'NORMAL',
          occurredAt: project.completedAt?.toISOString() ?? new Date().toISOString(),
          title: project.title,
          summary: 'DIY — completed by homeowner',
          amount: project.actualMaterialCostCents != null
            ? project.actualMaterialCostCents / 100
            : undefined,
          meta: {
            source: 'DIY_PROJECT_CENTER',
            diyProjectId: project.id,
            actualMinutes: project.actualMinutes,
            category: project.category,
          },
          idempotencyKey: `diy-complete-${project.id}`,
        },
      });
      homeEventId = event.id;
    } catch (err) {
      logger.error({ err }, `[DIY-COMPLETION] Failed to create HomeEvent for project ${project.id}`);
    }

    const updates: Promise<unknown>[] = [];

    if (homeEventId) {
      updates.push(
        prisma.diyProject.update({
          where: { id: project.id },
          data: { homeEventId },
        }),
      );
    }

    if (project.maintenanceTaskId) {
      updates.push(
        prisma.propertyMaintenanceTask.updateMany({
          where: { id: project.maintenanceTaskId, propertyId: project.propertyId },
          data: { status: 'COMPLETED' },
        }).catch((err: unknown) => {
          logger.error({ err }, `[DIY-COMPLETION] Failed to complete maintenance task ${project.maintenanceTaskId}`);
        }),
      );
    }

    if (project.incidentId) {
      updates.push(
        prisma.incident.updateMany({
          where: {
            id: project.incidentId,
            propertyId: project.propertyId,
            status: { notIn: ['RESOLVED', 'SUPPRESSED', 'EXPIRED'] },
          },
          data: { status: 'RESOLVED', resolvedAt: project.completedAt ?? new Date() },
        }).catch((err: unknown) => {
          logger.error({ err }, `[DIY-COMPLETION] Failed to resolve incident ${project.incidentId}`);
        }),
      );
    }

    await Promise.all(updates);
  }
}

export const diyCompletionService = new DiyCompletionService();
