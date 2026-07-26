import { prisma } from '../../../config/database';
import { APIError } from '../../../middleware/error.middleware';
import {
  projectRadarActions,
  type RadarActionCode,
  type RadarActionConfidence,
  type RadarActionEventFamily,
  type RadarActionImpact,
  type RadarActionTaskOperation,
  type RadarStoredAction,
} from '../domain/radarActionRegistry';
import {
  deriveRadarTaskDueDate,
  RadarTaskDueDateError,
} from '../domain/radarTaskDueDate';

type RadarTaskIntegrationDependencies = {
  db?: any;
  now?: () => Date;
};

export type RadarTaskIntegrationInput = {
  operation: RadarActionTaskOperation;
  maintenanceTaskId?: string | null;
  dueAt?: string | null;
  assigneeUserId?: string | null;
};

function storedArray(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

function sourceFamily(value: unknown): RadarActionEventFamily {
  return ['weather', 'air_quality', 'disaster', 'utility', 'tax', 'insurance', 'other']
    .includes(String(value))
    ? value as RadarActionEventFamily
    : 'other';
}

function impact(value: unknown): RadarActionImpact {
  return ['none', 'watch', 'moderate', 'high'].includes(String(value))
    ? value as RadarActionImpact
    : 'none';
}

function confidence(value: unknown): RadarActionConfidence {
  return ['low', 'medium', 'high'].includes(String(value))
    ? value as RadarActionConfidence
    : 'low';
}

function priority(value: 'high' | 'medium' | 'low'): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (value === 'high') return 'HIGH';
  if (value === 'low') return 'LOW';
  return 'MEDIUM';
}

function taskHref(propertyId: string, taskId: string, matchId: string): string {
  const query = new URLSearchParams({
    propertyId,
    taskId,
    from: 'home-event-radar',
    radarMatchId: matchId,
  });
  return `/dashboard/maintenance?${query.toString()}`;
}

export function serializeRadarTaskLink(link: any): Record<string, unknown> {
  const task = link.maintenanceTask;
  return {
    id: String(link.id),
    actionCode: String(link.actionCode),
    operation: link.linkType,
    dueAt: link.dueAt ? new Date(link.dueAt).toISOString() : null,
    dueDateSource: link.dueDateSource ?? null,
    task: {
      id: String(task.id),
      title: String(task.title),
      status: task.status,
      nextDueDate: task.nextDueDate ? new Date(task.nextDueDate).toISOString() : null,
      assignedToUserId: task.assignedToUserId ?? null,
      href: taskHref(
        String(task.propertyId),
        String(task.id),
        String(link.propertyRadarMatchId),
      ),
    },
    createdAt: new Date(link.createdAt).toISOString(),
    updatedAt: new Date(link.updatedAt).toISOString(),
  };
}

export class RadarTaskIntegrationService {
  private readonly db: any;
  private readonly clock: () => Date;

  constructor(dependencies: RadarTaskIntegrationDependencies = {}) {
    this.db = dependencies.db ?? prisma;
    this.clock = dependencies.now ?? (() => new Date());
  }

  private async loadMatch(propertyId: string, matchId: string): Promise<any> {
    const match = await this.db.propertyRadarMatch.findFirst({
      where: { id: matchId, propertyId, isVisible: true },
      include: {
        radarEvent: {
          include: {
            sourceDefinition: { select: { family: true } },
            revisions: {
              orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        },
        taskLinks: {
          include: { maintenanceTask: true },
        },
      },
    });
    if (!match) {
      throw new APIError('Radar match not found', 404, 'RADAR_MATCH_NOT_FOUND');
    }
    return match;
  }

  private eligibleAction(
    match: any,
    actionCode: string,
    operation: RadarActionTaskOperation,
  ) {
    const storedActions = storedArray(match.recommendedActionsJson, 'actions')
      .filter((value): value is RadarStoredAction => (
        Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      ));
    const actions = projectRadarActions({
      storedActions,
      sourceFamily: sourceFamily(match.radarEvent.sourceDefinition?.family),
      impact: impact(match.impactLevel),
      confidence: confidence(match.confidence),
      propertyId: String(match.propertyId),
      matchId: String(match.id),
      eventId: String(match.radarEvent.id),
      officialSourceUrl: match.radarEvent.canonicalUrl ?? null,
    });
    const action = actions.find((candidate) => candidate.code === actionCode);
    if (!action) {
      throw new APIError('Radar action is unavailable', 404, 'RADAR_ACTION_NOT_AVAILABLE');
    }
    if (!action.supportedTaskOperations.includes(operation)) {
      throw new APIError(
        'This Radar action does not support the requested task operation',
        400,
        'RADAR_TASK_OPERATION_UNAVAILABLE',
      );
    }
    return action;
  }

  private async validateAssignee(
    propertyId: string,
    assigneeUserId: string | null | undefined,
  ): Promise<void> {
    if (!assigneeUserId) return;
    const member = await this.db.householdMember.findUnique({
      where: {
        propertyId_userId: {
          propertyId,
          userId: assigneeUserId,
        },
      },
      select: { id: true },
    });
    if (!member) {
      throw new APIError(
        'Assignee is not a member of this household',
        400,
        'RADAR_ASSIGNEE_NOT_IN_HOUSEHOLD',
      );
    }
  }

  async createOrLink(
    propertyId: string,
    matchId: string,
    actionCode: string,
    userId: string,
    input: RadarTaskIntegrationInput,
  ): Promise<{ link: Record<string, unknown>; deduped: boolean }> {
    const match = await this.loadMatch(propertyId, matchId);
    const action = this.eligibleAction(match, actionCode, input.operation);
    const existing = match.taskLinks?.find(
      (link: any) => link.actionCode === action.code,
    );
    if (existing) {
      return { link: serializeRadarTaskLink(existing), deduped: true };
    }
    await this.validateAssignee(propertyId, input.assigneeUserId);
    if (input.operation === 'link_existing_task' && input.dueAt) {
      throw new APIError(
        'dueAt is managed by the existing task when linking',
        400,
        'RADAR_LINK_DUE_DATE_NOT_ALLOWED',
      );
    }

    const revision = match.radarEvent.revisions?.[0];
    let dueDate;
    try {
      dueDate = deriveRadarTaskDueDate({
        now: this.clock(),
        operation: input.operation,
        priority: action.priority,
        effectiveAt: revision?.effectiveAt ?? match.radarEvent.startAt ?? null,
        expiresAt: revision?.expiresAt ?? match.radarEvent.endAt ?? null,
        requestedDueAt: input.dueAt ?? null,
      });
    } catch (error) {
      if (error instanceof RadarTaskDueDateError) {
        throw new APIError(error.message, 400, error.code);
      }
      throw error;
    }

    if (input.operation === 'link_existing_task' && !input.maintenanceTaskId) {
      throw new APIError(
        'maintenanceTaskId is required when linking an existing task',
        400,
        'RADAR_MAINTENANCE_TASK_REQUIRED',
      );
    }

    const result = await this.db.$transaction(async (tx: any) => {
      let task;
      if (input.operation === 'link_existing_task') {
        task = await tx.propertyMaintenanceTask.findFirst({
          where: {
            id: input.maintenanceTaskId,
            propertyId,
            status: { notIn: ['CANCELLED'] },
          },
        });
        if (!task) {
          throw new APIError(
            'Maintenance task not found',
            404,
            'RADAR_MAINTENANCE_TASK_NOT_FOUND',
          );
        }
        if (input.assigneeUserId && task.assignedToUserId !== input.assigneeUserId) {
          task = await tx.propertyMaintenanceTask.update({
            where: { id: task.id },
            data: { assignedToUserId: input.assigneeUserId },
          });
        }
      } else {
        const actionKey = `radar:${match.id}:${action.code}`;
        task = await tx.propertyMaintenanceTask.upsert({
          where: {
            propertyId_actionKey: { propertyId, actionKey },
          },
          create: {
            propertyId,
            title: input.operation === 'create_reminder'
              ? `Reminder: ${action.label}`
              : action.label,
            description: `Created from Home Event Radar for “${match.radarEvent.title}”.`,
            status: 'PENDING',
            source: 'ACTION_CENTER',
            actionKey,
            priority: priority(action.priority),
            assetType: action.responsibilityScope ?? match.radarEvent.eventType,
            isRecurring: false,
            nextDueDate: dueDate?.dueAt ?? null,
            assignedToUserId: input.assigneeUserId ?? null,
            completionMetadata: {
              source: 'HOME_EVENT_RADAR',
              propertyRadarMatchId: match.id,
              radarEventId: match.radarEvent.id,
              actionCode: action.code,
              operation: input.operation,
            },
          },
          update: {},
        });
      }

      const link = await tx.propertyRadarTaskLink.upsert({
        where: {
          propertyRadarMatchId_actionCode: {
            propertyRadarMatchId: match.id,
            actionCode: action.code,
          },
        },
        create: {
          propertyRadarMatchId: match.id,
          actionCode: action.code,
          maintenanceTaskId: task.id,
          linkType: input.operation,
          dueDateSource: dueDate?.source ?? null,
          dueAt: dueDate?.dueAt ?? task.nextDueDate ?? null,
          createdByUserId: userId,
        },
        update: {},
        include: { maintenanceTask: true },
      });
      await tx.propertyRadarAction.create({
        data: {
          propertyRadarMatchId: match.id,
          actionType: ({
            create_task: 'create_maintenance_task',
            create_reminder: 'create_reminder',
            link_existing_task: 'link_maintenance_task',
          } as const)[input.operation],
          actionMetaJson: {
            actorUserId: userId,
            actionCode: action.code,
            maintenanceTaskId: task.id,
            dueAt: dueDate?.dueAt?.toISOString() ?? task.nextDueDate?.toISOString() ?? null,
            dueDateSource: dueDate?.source ?? null,
            assigneeUserId: input.assigneeUserId ?? task.assignedToUserId ?? null,
          },
        },
      });
      return link;
    });

    return { link: serializeRadarTaskLink(result), deduped: false };
  }

  async listCandidateTasks(
    propertyId: string,
    matchId: string,
    actionCode: string,
  ): Promise<Array<Record<string, unknown>>> {
    const match = await this.loadMatch(propertyId, matchId);
    this.eligibleAction(match, actionCode, 'link_existing_task');
    const tasks = await this.db.propertyMaintenanceTask.findMany({
      where: {
        propertyId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'NEEDS_REVIEW'] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        nextDueDate: true,
        assignedToUserId: true,
      },
      orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
    return tasks.map((task: any) => ({
      id: String(task.id),
      title: String(task.title),
      status: task.status,
      priority: task.priority,
      nextDueDate: task.nextDueDate ? new Date(task.nextDueDate).toISOString() : null,
      assignedToUserId: task.assignedToUserId ?? null,
    }));
  }
}

export const radarTaskIntegrationService = new RadarTaskIntegrationService();
