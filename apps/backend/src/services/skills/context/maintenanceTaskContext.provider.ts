import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import type { SkillContextProviderDefinition } from './skillContext.contract';
import { MAINTENANCE_TASK_CONTEXT_PROVIDER } from '../maintenance/skill.manifest';

type CanonicalMaintenanceTask = Awaited<ReturnType<typeof PropertyMaintenanceTaskService.getTasksForProperty>>[number];

export interface MaintenanceTaskContextTask {
  id: CanonicalMaintenanceTask['id'];
  title: CanonicalMaintenanceTask['title'];
  description: CanonicalMaintenanceTask['description'];
  category: CanonicalMaintenanceTask['category'];
  assetType: CanonicalMaintenanceTask['assetType'];
  serviceCategory: CanonicalMaintenanceTask['serviceCategory'];
  season: CanonicalMaintenanceTask['season'];
  status: CanonicalMaintenanceTask['status'];
  priority: CanonicalMaintenanceTask['priority'];
  source: CanonicalMaintenanceTask['source'];
  nextDueDate: CanonicalMaintenanceTask['nextDueDate'];
  lastCompletedDate: CanonicalMaintenanceTask['lastCompletedDate'];
  updatedAt: CanonicalMaintenanceTask['updatedAt'];
  actualCost: CanonicalMaintenanceTask['actualCost'];
  estimatedCost: CanonicalMaintenanceTask['estimatedCost'];
  isRecurring: CanonicalMaintenanceTask['isRecurring'];
  frequency: CanonicalMaintenanceTask['frequency'];
  inventoryItem: { name: string } | null;
  room: { name: string } | null;
}

export interface MaintenanceTaskContext {
  tasks: MaintenanceTaskContextTask[];
  propertyTimezone: string | null;
  purchaseDate: Date | null;
}

const maintenanceTaskContextProviderDefinition: SkillContextProviderDefinition<MaintenanceTaskContext> = {
  ...MAINTENANCE_TASK_CONTEXT_PROVIDER,
  canonicalOwner: 'PropertyMaintenanceTaskService',
  description: 'Canonical maintenance tasks and the property date context needed to interpret them.',
  minimumRole: 'VIEWER',
  sensitivity: 'STANDARD',
  defaultTimeoutMs: 2_000,
  maxSerializedBytes: 64_000,
  supportedOperations: ['MAINTENANCE_STATUS'],
  async load({ userId, propertyId }) {
    const [tasks, property, financing] = await Promise.all([
      PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true }),
      prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }),
      prisma.propertyFinancingProfile.findUnique({ where: { propertyId }, select: { purchaseDate: true } }),
    ]);
    const boundedTasks: MaintenanceTaskContextTask[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      category: task.category,
      assetType: task.assetType,
      serviceCategory: task.serviceCategory,
      season: task.season,
      status: task.status,
      priority: task.priority,
      source: task.source,
      nextDueDate: task.nextDueDate,
      lastCompletedDate: task.lastCompletedDate,
      updatedAt: task.updatedAt,
      actualCost: task.actualCost,
      estimatedCost: task.estimatedCost,
      isRecurring: task.isRecurring,
      frequency: task.frequency,
      inventoryItem: task.inventoryItem ? { name: task.inventoryItem.name } : null,
      room: task.room ? { name: task.room.name } : null,
    }));
    const sourceVersion = createHash('sha256')
      .update(JSON.stringify(tasks.map((task) => ({ id: task.id, status: task.status, updatedAt: task.updatedAt }))))
      .digest('hex');
    const newestObservedAt = tasks.reduce<Date | null>(
      (latest, task) => !latest || task.updatedAt > latest ? task.updatedAt : latest,
      null,
    );
    return {
      status: 'AVAILABLE',
      data: {
        tasks: boundedTasks,
        propertyTimezone: property?.timezone ?? null,
        purchaseDate: financing?.purchaseDate ?? null,
      },
      observedAt: newestObservedAt?.toISOString() ?? null,
      sourceVersion,
      entityCount: boundedTasks.length,
      factCount: boundedTasks.length,
    };
  },
};

export const maintenanceTaskContextProvider = Object.freeze(maintenanceTaskContextProviderDefinition);
