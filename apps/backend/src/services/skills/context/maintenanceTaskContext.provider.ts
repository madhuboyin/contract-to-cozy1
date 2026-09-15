import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import type { SkillContextProviderDefinition } from './skillContext.contract';
import { MAINTENANCE_TASK_CONTEXT_PROVIDER } from '../maintenance/skill.manifest';

type CanonicalMaintenanceTask = Awaited<ReturnType<typeof PropertyMaintenanceTaskService.getTasksForProperty>>[number];
// External review [P1]: this provider used to slice the canonical list to
// a flat 50 BEFORE maintenanceResult() ever filtered or counted it, on the
// mistaken premise that "the adapter renders at most 50 records" (a
// per-section DISPLAY limit applied AFTER filtering) meant the source data
// could be bounded the same way. It could not: includeCompleted: true
// pulls in years of completed/cancelled history that competes with open
// tasks for the same 50 slots, so a genuinely open, urgent task could
// simply fall outside the slice -- wrong totals, false "no matches," and
// missing urgent/overdue tasks for any property with more than 50 total
// records. Fixed below by mapping the FULL list and only bounding it if
// the composer's own context budget would otherwise be exceeded -- and
// even then, active (non-completed/cancelled) tasks are always kept
// first, since those are what filtering/counting/urgency answers are
// actually about; only completed/cancelled history is trimmed.
// wasTruncated/totalTaskCount let maintenanceResult disclose a partial
// answer honestly instead of presenting it as complete.
//
// Two independent ceilings, not just bytes: skillRegistry.ts's
// PLATFORM_CONTEXT_BUDGET_MAXIMUMS caps every Skill's contextBudget at
// maxEntities: 100 (skillPlatformFoundation.test.js asserts no Skill
// exceeds this platform-wide governance limit) -- one task is one entity
// here, so 100 tasks is a hard ceiling regardless of how few bytes they
// serialize to. MAX_CONTEXT_TASKS enforces that; PROVIDER_MAX_SERIALIZED_BYTES
// stays comfortably under the skill's own maxSerializedBytes total (256_000),
// leaving headroom for the optional seasonal-checklist-context provider's
// own budget (up to 128_000) when both load together.
const MAX_CONTEXT_TASKS = 100;
const PROVIDER_MAX_SERIALIZED_BYTES = 110_000;
const SERIALIZATION_SAFETY_MARGIN_BYTES = 8_000;
const byteSizeOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');

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
  // External review [P1]: true only when the total canonical task count
  // (across every status) would have exceeded this provider's context
  // budget -- lets maintenanceResult disclose a partial result honestly
  // rather than presenting truncated data as the complete answer.
  wasTruncated: boolean;
  totalTaskCount: number;
}

const maintenanceTaskContextProviderDefinition: SkillContextProviderDefinition<MaintenanceTaskContext> = {
  ...MAINTENANCE_TASK_CONTEXT_PROVIDER,
  canonicalOwner: 'PropertyMaintenanceTaskService',
  description: 'Canonical maintenance tasks and the property date context needed to interpret them.',
  minimumRole: 'VIEWER',
  sensitivity: 'STANDARD',
  defaultTimeoutMs: 2_000,
  maxSerializedBytes: PROVIDER_MAX_SERIALIZED_BYTES,
  supportedOperations: ['MAINTENANCE_STATUS'],
  async load({ userId, propertyId }) {
    const [tasks, property, financing] = await Promise.all([
      PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true }),
      prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }),
      prisma.propertyFinancingProfile.findUnique({ where: { propertyId }, select: { purchaseDate: true } }),
    ]);
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
    const active = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED').map(toContextTask);
    const historical = tasks.filter((task) => task.status === 'COMPLETED' || task.status === 'CANCELLED').map(toContextTask);
    const byteBudget = PROVIDER_MAX_SERIALIZED_BYTES - SERIALIZATION_SAFETY_MARGIN_BYTES;
    let boundedTasks: MaintenanceTaskContextTask[];
    let wasTruncated: boolean;
    if (byteSizeOf(active) <= byteBudget) {
      boundedTasks = [...active];
      let runningBytes = byteSizeOf(boundedTasks);
      wasTruncated = false;
      for (const task of historical) {
        const candidateBytes = runningBytes + byteSizeOf(task) + 1;
        if (candidateBytes > byteBudget) { wasTruncated = true; break; }
        boundedTasks.push(task);
        runningBytes = candidateBytes;
      }
    } else {
      // Extreme edge case: hundreds of simultaneously OPEN tasks alone
      // exceed the budget. Still bounded by size rather than an arbitrary
      // count, and still disclosed -- never silently presented as complete.
      boundedTasks = [];
      let runningBytes = 0;
      wasTruncated = true;
      for (const task of active) {
        const candidateBytes = runningBytes + byteSizeOf(task) + 1;
        if (candidateBytes > byteBudget) break;
        boundedTasks.push(task);
        runningBytes = candidateBytes;
      }
    }
    // The platform-wide maxEntities ceiling (see comment above) applies
    // regardless of byte size -- trimming from the end preserves the
    // active-first ordering already established above.
    if (boundedTasks.length > MAX_CONTEXT_TASKS) {
      boundedTasks = boundedTasks.slice(0, MAX_CONTEXT_TASKS);
      wasTruncated = true;
    }
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
        wasTruncated,
        totalTaskCount: tasks.length,
      },
      observedAt: newestObservedAt?.toISOString() ?? null,
      sourceVersion,
      entityCount: boundedTasks.length,
      factCount: boundedTasks.length,
    };
  },
};

export const maintenanceTaskContextProvider = Object.freeze(maintenanceTaskContextProviderDefinition);
