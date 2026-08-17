import { prisma } from '../lib/prisma';
import type { MovingPlan, MovingTask } from './movingConcierge.service';
import { HomeBuyerTaskService } from './HomeBuyerTask.service';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';

export const MOVING_CONCIERGE_GENERATION_VERSION = 'moving-concierge-buyer-tasks-v1';
export const MOVING_CONCIERGE_SOURCE_ENTITY = 'MOVING_CONCIERGE_TASK';

export const MOVING_TIMELINE_PERIODS = [
  'weeks8Before',
  'weeks6Before',
  'weeks4Before',
  'weeks2Before',
  'week1Before',
  'movingDay',
  'week1After',
] as const satisfies readonly (keyof MovingPlan['timeline'])[];

export interface MovingTimelineTaskRef {
  period: keyof MovingPlan['timeline'];
  sourceTaskId: string;
  task: MovingTask;
  sortOrder: number;
}

export function movingTaskActionKey(period: keyof MovingPlan['timeline'], sourceTaskId: string): string {
  const stableId = sourceTaskId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  return `buyer:moving-concierge:${period}:${stableId || 'task'}`;
}

export function flattenMovingTimeline(plan: Pick<MovingPlan, 'timeline'>): MovingTimelineTaskRef[] {
  const refs: MovingTimelineTaskRef[] = [];
  for (const [periodIndex, period] of MOVING_TIMELINE_PERIODS.entries()) {
    for (const [taskIndex, task] of (plan.timeline[period] ?? []).entries()) {
      refs.push({
        period,
        sourceTaskId: task.sourceTaskId ?? task.id,
        task,
        sortOrder: 500 + periodIndex * 100 + taskIndex,
      });
    }
  }
  return refs;
}

/**
 * Removes response-only canonical completion projections before persisting the
 * planning envelope. HomeBuyerTask is the only durable moving execution state.
 */
export function movingPlanForStorage(plan: MovingPlan): Record<string, unknown> {
  const { completedTasks: _completedTasks, ...planWithoutCompletion } = plan;
  const timeline = Object.fromEntries(MOVING_TIMELINE_PERIODS.map((period) => [
    period,
    (plan.timeline[period] ?? []).map((task) => {
      const { completed: _completed, ...taskWithoutCompletion } = task;
      return taskWithoutCompletion;
    }),
  ]));

  return { ...planWithoutCompletion, timeline };
}

function buyerPriority(priority: MovingTask['priority']): 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER' {
  if (priority === 'CRITICAL') return 'NOW';
  if (priority === 'HIGH') return 'SOON';
  if (priority === 'MEDIUM') return 'PLAN';
  return 'CONSIDER';
}

async function assertContributor(userId: string, propertyId: string): Promise<void> {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) {
    throw new Error('Property not found or contributor access is required.');
  }
}

/**
 * Materializes the rich Moving Concierge timeline into the canonical Buyer Plan.
 * Stable period/source keys make regeneration idempotent while deliberately
 * preserving completion, assignment, notes, evidence, and other user work.
 */
export async function reconcileMovingPlanTasks(
  propertyId: string,
  userId: string,
  plan: MovingPlan,
): Promise<MovingPlan> {
  await assertContributor(userId, propertyId);
  const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
  const refs = flattenMovingTimeline(plan);
  const reconciled = await prisma.$transaction(async (tx) => {
    const output = new Map<string, { id: string; completed: boolean }>();
    const actionKeys = refs.map((ref) => movingTaskActionKey(ref.period, ref.sourceTaskId));
    const existingTasks = await tx.homeBuyerTask.findMany({
      where: { checklistId: checklist.id, actionKey: { in: actionKeys } },
      select: { id: true, actionKey: true, status: true, userEditedAt: true },
    });
    const existingByActionKey = new Map(existingTasks.map((task) => [task.actionKey, task]));
    for (const ref of refs) {
      const actionKey = movingTaskActionKey(ref.period, ref.sourceTaskId);
      const existing = existingByActionKey.get(actionKey);
      const task = existing
        ? await tx.homeBuyerTask.update({
          where: { id: existing.id },
          data: {
            sourceEntityType: MOVING_CONCIERGE_SOURCE_ENTITY,
            sourceEntityId: ref.sourceTaskId,
            generatedBy: 'MOVING_CONCIERGE',
            generationVersion: MOVING_CONCIERGE_GENERATION_VERSION,
            sortOrder: ref.sortOrder,
            ...(existing.userEditedAt ? {} : {
              title: ref.task.title,
              description: ref.task.description,
              phase: 'MOVE_IN',
              priority: buyerPriority(ref.task.priority),
              taskType: 'MOVE',
              checklistSection: 'MOVE_POSSESSION',
              applicability: 'APPLICABLE',
              dueAt: new Date(ref.task.dueDate),
            }),
          },
          select: { id: true, status: true },
        })
        : await tx.homeBuyerTask.create({
          data: {
            checklistId: checklist.id,
            actionKey,
            title: ref.task.title,
            description: ref.task.description,
            status: 'PENDING',
            phase: 'MOVE_IN',
            priority: buyerPriority(ref.task.priority),
            taskType: 'MOVE',
            checklistSection: 'MOVE_POSSESSION',
            evidenceRequirement: 'NONE',
            applicability: 'APPLICABLE',
            required: false,
            blocking: false,
            dueAt: new Date(ref.task.dueDate),
            assignedToUserId: userId,
            sourceType: 'SYSTEM',
            sourceEntityType: MOVING_CONCIERGE_SOURCE_ENTITY,
            sourceEntityId: ref.sourceTaskId,
            generatedBy: 'MOVING_CONCIERGE',
            generationVersion: MOVING_CONCIERGE_GENERATION_VERSION,
            sortOrder: ref.sortOrder,
          },
          select: { id: true, status: true },
        });
      output.set(`${ref.period}:${ref.sourceTaskId}`, { id: task.id, completed: task.status === 'COMPLETED' });
    }
    return output;
  });

  const timeline = { ...plan.timeline };
  for (const period of MOVING_TIMELINE_PERIODS) {
    timeline[period] = (plan.timeline[period] ?? []).map((task) => {
      const sourceTaskId = task.sourceTaskId ?? task.id;
      const canonical = reconciled.get(`${period}:${sourceTaskId}`);
      return { ...task, id: canonical?.id ?? task.id, sourceTaskId, completed: canonical?.completed ?? false };
    });
  }
  const completedTasks = flattenMovingTimeline({ timeline })
    .filter(({ task }) => task.completed)
    .map(({ task }) => task.id);
  return { ...plan, timeline, completedTasks };
}

/** Projects the sole durable completion state from canonical HomeBuyerTask rows. */
export async function projectCanonicalMovingCompletion(propertyId: string, plan: MovingPlan): Promise<MovingPlan> {
  const refs = flattenMovingTimeline(plan);
  const ids = refs.map(({ task }) => task.id);
  const canonicalTasks = ids.length ? await prisma.homeBuyerTask.findMany({
    where: {
      id: { in: ids },
      checklist: { propertyId },
      sourceEntityType: MOVING_CONCIERGE_SOURCE_ENTITY,
    },
    select: { id: true, status: true },
  }) : [];
  const completionById = new Map(canonicalTasks.map((task) => [task.id, task.status === 'COMPLETED']));
  const timeline = { ...plan.timeline };
  for (const period of MOVING_TIMELINE_PERIODS) {
    timeline[period] = (plan.timeline[period] ?? []).map((task) => ({
      ...task,
      completed: completionById.get(task.id) ?? false,
    }));
  }
  return {
    ...plan,
    timeline,
    completedTasks: flattenMovingTimeline({ timeline }).filter(({ task }) => task.completed).map(({ task }) => task.id),
  };
}
