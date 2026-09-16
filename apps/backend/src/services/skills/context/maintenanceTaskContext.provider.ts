import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import type { SkillContextProviderDefinition } from './skillContext.contract';
import { MAINTENANCE_TASK_CONTEXT_PROVIDER } from '../maintenance/skill.manifest';

type CanonicalMaintenanceTask = Awaited<ReturnType<typeof PropertyMaintenanceTaskService.getTasksForProperty>>[number];

// External review [P1] follow-up (MAINT-003/A02): when a property genuinely
// has more active (non-completed/cancelled) tasks than either bound allows,
// SOME active tasks must be dropped from this context load -- there is no
// way around the platform-wide maxEntities ceiling (skillRegistry.ts's
// PLATFORM_CONTEXT_BUDGET_MAXIMUMS caps every Skill's contextBudget at
// maxEntities: 100; skillPlatformFoundation.test.js asserts no Skill
// exceeds it). Previously that drop fell out of whatever order
// getTasksForProperty happened to return, so a genuinely overdue/urgent
// task could be the one silently cut while a low-priority, far-future task
// survived. Sorting active tasks by urgency BEFORE bounding means that if a
// cut is unavoidable, it takes the least urgent tasks, not an arbitrary
// DB-order slice.
const PRIORITY_URGENCY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
function compareActiveTaskUrgency(left: MaintenanceTaskContextTask, right: MaintenanceTaskContextTask, now: number): number {
  const leftOverdue = left.nextDueDate ? left.nextDueDate.getTime() < now : false;
  const rightOverdue = right.nextDueDate ? right.nextDueDate.getTime() < now : false;
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
  const priorityDiff = (PRIORITY_URGENCY_RANK[left.priority] ?? 99) - (PRIORITY_URGENCY_RANK[right.priority] ?? 99);
  if (priorityDiff !== 0) return priorityDiff;
  const leftDue = left.nextDueDate ? left.nextDueDate.getTime() : Infinity;
  const rightDue = right.nextDueDate ? right.nextDueDate.getTime() : Infinity;
  return leftDue - rightDue;
}

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

// External review [P1] follow-up (MAINT-003/A02): this provider's `data`
// used to carry a budget-bounded task list (tasks/wasTruncated/
// totalTaskCount/totalActiveTaskCount) that maintenanceResult filtered and
// counted over -- so its totals and filter matches were only ever correct
// up to whatever this provider's entity/byte ceiling let through. That
// ceiling is not negotiable: composeSkillContext (skillContextComposer.ts)
// hard-enforces it by zeroing an ENTIRE provider's data, not just the
// excess, once entityCount exceeds it -- so this provider genuinely cannot
// carry a full canonical task list without also losing propertyTimezone/
// purchaseDate. Filter membership and totals must instead reflect the
// canonical FULL collection, with limits applied only to what's displayed
// (MAINT-003/A02) -- so maintenanceResult now calls
// loadCanonicalMaintenanceTaskSet directly for its task data, bypassing
// this provider entirely for that purpose. What's left here is exactly
// what the composed skill context can safely carry: the two small date
// facts needed to interpret due dates, plus staleness metadata
// (observedAt/sourceVersion below) still genuinely derived from the
// maintenance domain.
export interface MaintenanceTaskContext {
  propertyTimezone: string | null;
  purchaseDate: Date | null;
}

const toContextTask = (task: CanonicalMaintenanceTask): MaintenanceTaskContextTask => ({
  id: task.id,
  title: task.title,
  description: task.description?.slice(0, 400) ?? null,
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
});

export interface CanonicalMaintenanceTaskSet {
  // Urgency-sorted (overdue, then priority, then soonest due date), FULL,
  // uncapped -- the actual source of truth for filtering/counting.
  active: MaintenanceTaskContextTask[];
  historical: MaintenanceTaskContextTask[];
  totalTaskCount: number;
  sourceVersion: string;
  newestObservedAt: Date | null;
}

// The single canonical fetch, shared by this provider (which still needs
// staleness metadata derived from it) and by maintenanceResult (which uses
// it directly for correctness -- see the MaintenanceTaskContext comment
// above for why it cannot go through this provider's own bounded `data`).
export async function loadCanonicalMaintenanceTaskSet(userId: string, propertyId: string): Promise<CanonicalMaintenanceTaskSet> {
  const tasks = await PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true });
  const now = Date.now();
  const active = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
    .map(toContextTask)
    .sort((left, right) => compareActiveTaskUrgency(left, right, now));
  const historical = tasks.filter((task) => task.status === 'COMPLETED' || task.status === 'CANCELLED').map(toContextTask);
  const sourceVersion = createHash('sha256')
    .update(JSON.stringify(tasks.map((task) => ({ id: task.id, status: task.status, updatedAt: task.updatedAt }))))
    .digest('hex');
  const newestObservedAt = tasks.reduce<Date | null>(
    (latest, task) => !latest || task.updatedAt > latest ? task.updatedAt : latest,
    null,
  );
  return { active, historical, totalTaskCount: tasks.length, sourceVersion, newestObservedAt };
}

const maintenanceTaskContextProviderDefinition: SkillContextProviderDefinition<MaintenanceTaskContext> = {
  ...MAINTENANCE_TASK_CONTEXT_PROVIDER,
  canonicalOwner: 'PropertyMaintenanceTaskService',
  description: 'Property date context (timezone, purchase date) needed to interpret maintenance due dates. Task filtering/counting is done directly against the canonical full collection by maintenanceResult, not through this provider -- see loadCanonicalMaintenanceTaskSet.',
  minimumRole: 'VIEWER',
  sensitivity: 'STANDARD',
  defaultTimeoutMs: 2_000,
  maxSerializedBytes: 4_096,
  supportedOperations: ['MAINTENANCE_STATUS'],
  async load({ userId, propertyId }) {
    const [{ sourceVersion, newestObservedAt }, property, financing] = await Promise.all([
      loadCanonicalMaintenanceTaskSet(userId, propertyId),
      prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }),
      prisma.propertyFinancingProfile.findUnique({ where: { propertyId }, select: { purchaseDate: true } }),
    ]);
    return {
      status: 'AVAILABLE',
      data: {
        propertyTimezone: property?.timezone ?? null,
        purchaseDate: financing?.purchaseDate ?? null,
      },
      observedAt: newestObservedAt?.toISOString() ?? null,
      sourceVersion,
      entityCount: 1,
      factCount: 2,
    };
  },
};

export const maintenanceTaskContextProvider = Object.freeze(maintenanceTaskContextProviderDefinition);
