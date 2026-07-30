// apps/backend/src/services/PropertyMaintenanceTask.service.ts
import {
    PropertyMaintenanceTask,
    MaintenanceTaskStatus,
    MaintenanceTaskSource,
    MaintenanceTaskPriority,
    RiskLevel,
    ServiceCategory,
    RecurrenceFrequency,
    Season,
    HouseholdRole,
  } from '@prisma/client';
  import { prisma } from '../lib/prisma';
  import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
  import { signalService } from './signal.service';
import { logger } from '../lib/logger';
import { resolveSeasonalTaskDueDate } from '../utils/maintenanceDueDate';
import { syncSeasonalChecklistStatus } from './seasonalChecklistStatus.service';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';
import {
  evaluateMaintenanceTemplateApplicability,
  maintenanceTemplateActionKey,
  maintenanceTemplateContextInput,
} from './maintenance/applicabilityPolicy';
import {
  requestRadarPropertyReconciliation,
} from '../modules/homeEventRadar/services/radarPropertyReconciliation.service';
import { maintenanceTaskSourceAdapter, resolveMaintenanceTaskWorkKey } from '../modules/homeOperations/adapters/maintenanceTask.adapter';
import { propagateFindingResolutionFromExecution } from '../modules/homeOperations/adapters/inspectionFinding.adapter';
import { resolveMaintenanceRecommendationWorkKey } from '../modules/homeOperations/adapters/homeActionWorkItem.adapter';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import {
  findWorkItemByWorkKey,
  findWorkItemsLinkedToMaintenanceTaskExecution,
  linkWorkExecution,
} from '../modules/homeOperations/infrastructure/workItemRepository';

  /**
   * Service for managing property maintenance tasks.
   * Handles property-scoped tasks from multiple sources:
   * - USER_CREATED: User-defined tasks
   * - ACTION_CENTER: Risk assessment recommendations
   * - SEASONAL: Seasonal maintenance tasks
   * - RISK_ASSESSMENT: Auto-generated from risk reports
   * - WARRANTY_RENEWAL: Warranty expiration reminders
   * - TEMPLATE: Template-based recurring tasks
   */
  export class PropertyMaintenanceTaskService {
    /**
     * Get all tasks for a property.
     */
    static async getTasksForProperty(
      userId: string,
      propertyId: string,
      filters?: {
        status?: MaintenanceTaskStatus[];
        priority?: MaintenanceTaskPriority[];
        source?: MaintenanceTaskSource[];
        includeCompleted?: boolean;
      }
    ) {
      // Verify property ownership
      await this.verifyPropertyOwnership(userId, propertyId);
  
      const where: any = {
        propertyId,
      };
  
      // Apply filters
      if (filters?.status && filters.status.length > 0) {
        where.status = { in: filters.status };
      } else if (!filters?.includeCompleted) {
        // By default, exclude COMPLETED and CANCELLED
        where.status = {
          notIn: ['COMPLETED', 'CANCELLED'],
        };
      }
  
      if (filters?.priority && filters.priority.length > 0) {
        where.priority = { in: filters.priority };
      }
  
      if (filters?.source && filters.source.length > 0) {
        where.source = { in: filters.source };
      }
  
      const tasks = await prisma.propertyMaintenanceTask.findMany({
        where,
        include: {
          booking: true,
          warranty: true,
          inventoryItem: true,
          seasonalChecklistItem: true,
        },
        orderBy: [
          { priority: 'desc' }, // HIGH, MEDIUM, LOW
          { nextDueDate: 'asc' },
          { createdAt: 'desc' },
        ],
      });
  
      return tasks;
    }
  
    /**
     * Get a single task by ID (with ownership verification).
     */
    static async getTask(userId: string, taskId: string, minRole: HouseholdRole = 'VIEWER') {
      const task = await prisma.propertyMaintenanceTask.findUnique({
        where: { id: taskId },
        include: {
          property: {
            include: {
              homeownerProfile: true,
            },
          },
          booking: true,
          warranty: true,
          inventoryItem: true,
          seasonalChecklistItem: true,
        },
      });

      if (!task) {
        throw new Error('Task not found.');
      }

      // Verify access: owner OR household collaborator (CONTRIBUTOR/VIEWER), not owner-only.
      const access = await resolvePropertyAccess(userId, task.propertyId);
      if (!access) {
        throw new Error('User does not have access to this task.');
      }
      if (ROLE_RANK[access.role] < ROLE_RANK[minRole]) {
        throw new Error('User does not have access to perform this action on this task.');
      }

      return task;
    }
  
    /**
     * Create a user-defined maintenance task.
     */
    static async createUserTask(
      userId: string,
      propertyId: string,
      data: {
        title: string;
        description?: string;
        priority?: MaintenanceTaskPriority;
        serviceCategory?: ServiceCategory;
        estimatedCost?: number;
        isRecurring?: boolean;
        frequency?: RecurrenceFrequency;
        nextDueDate?: string;
        templateId?: string;
      }
    ): Promise<PropertyMaintenanceTask> {
      // Verify property access (CONTRIBUTOR+ required to create tasks)
      await this.verifyPropertyOwnership(userId, propertyId, 'CONTRIBUTOR');
  
      // Validate serviceCategory if provided
      if (data.serviceCategory) {
        await this.validateServiceCategory(data.serviceCategory);
      }

      const template = data.templateId ? await prisma.maintenanceTaskTemplate.findFirst({
        where: { id: data.templateId, isActive: true },
      }) : null;
      if (data.templateId && !template) throw new Error('Maintenance template not found.');

      const actionKey = template ? maintenanceTemplateActionKey(template.id) : null;
      if (template) {
        const templateEvaluation = await evaluateFeatureContext(propertyId, userId, {
          featureKey: 'MAINTENANCE',
          operationKey: 'PREPARE_TEMPLATE',
          operationInput: maintenanceTemplateContextInput(template),
        });
        if (!templateEvaluation.canExecute) {
          const error = new Error(`Maintenance template needs more property context: ${templateEvaluation.reasonCodes.join(', ')}`);
          (error as any).evaluation = templateEvaluation;
          throw error;
        }
        if (/SMOKE.*DETECTOR|\b(CO|CARBON MONOXIDE).*DETECTOR/i.test(template.title)) {
          const evaluation = await evaluateFeatureContext(propertyId, userId, {
            featureKey: 'MAINTENANCE',
            operationKey: 'GENERATE_SAFETY_TASKS',
          });
          if (!evaluation.canExecute) {
            const error = new Error(`Maintenance template needs more property context: ${evaluation.reasonCodes.join(', ')}`);
            (error as any).evaluation = evaluation;
            throw error;
          }
        }
        const context = await getPropertyContext(propertyId, { userId }, {
          scopes: ['EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'MAINTENANCE'],
        });
        const decision = evaluateMaintenanceTemplateApplicability(context, template);
        if (decision.status !== 'APPLICABLE') {
          const error = new Error(`Maintenance template is not available: ${decision.reasonCodes.join(', ')}`);
          (error as any).decision = decision;
          throw error;
        }
        const existing = await prisma.propertyMaintenanceTask.findUnique({
          where: { propertyId_actionKey: { propertyId, actionKey: maintenanceTemplateActionKey(template.id) } },
        });
        if (existing) {
          const reactivated = await prisma.propertyMaintenanceTask.update({
            where: { id: existing.id },
            data: {
              title: data.title,
              description: data.description ?? null,
              status: 'PENDING',
              source: 'TEMPLATE',
              priority: data.priority ?? 'MEDIUM',
              serviceCategory: data.serviceCategory ?? template.serviceCategory,
              estimatedCost: data.estimatedCost ?? null,
              isRecurring: data.isRecurring ?? true,
              frequency: data.frequency ?? template.defaultFrequency,
              nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : this.calculateNextDueDate(template.defaultFrequency),
            },
          });
          await this.syncTaskWorkItem(userId, reactivated, false, reactivated.status === 'COMPLETED');
          return reactivated;
        }
      }

      const task = await prisma.propertyMaintenanceTask.create({
        data: {
          propertyId,
          title: data.title,
          description: data.description ?? null,
          status: 'PENDING',
          source: template ? 'TEMPLATE' : 'USER_CREATED',
          actionKey,
          priority: data.priority ?? 'MEDIUM',
          serviceCategory: data.serviceCategory ?? null,
          estimatedCost: data.estimatedCost ?? null,
          isRecurring: data.isRecurring ?? false,
          frequency: data.isRecurring ? data.frequency ?? null : null,
          nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : null,
        },
      });

      // Analytics: maintenance item created
      analyticsEmitter.track({
        eventType: AnalyticsEvent.MAINTENANCE_ITEM_CREATED,
        userId,
        propertyId,
        moduleKey: AnalyticsModule.MAINTENANCE,
        featureKey: AnalyticsFeature.MAINTENANCE_TASK,
        metadataJson: {
          source: template ? 'TEMPLATE' : 'USER_CREATED',
          priority: data.priority ?? 'MEDIUM',
          isRecurring: data.isRecurring ?? false,
        },
      });

      await this.syncTaskWorkItem(userId, task, false, task.status === 'COMPLETED');
      return task;
    }
  
    /**
     * Create a task from Action Center (idempotent).
     * Uses actionKey to prevent duplicates.
     */
/**
   * Create a task from Action Center (idempotent).
   * Uses actionKey to prevent duplicates.
   */
    static async createFromActionCenter(
      userId: string,
      propertyId: string,
      data: {
        title: string;
        description?: string;
        assetType: string;
        priority: MaintenanceTaskPriority;
        riskLevel?: RiskLevel;
        serviceCategory?: ServiceCategory;
        estimatedCost?: number;
        nextDueDate: string;
        actionKey?: string; // 🔑 ADD: Accept actionKey from caller
      }
    ): Promise<{ task: PropertyMaintenanceTask; deduped: boolean }> {
      // Verify property access (CONTRIBUTOR+ required to create tasks)
      await this.verifyPropertyOwnership(userId, propertyId, 'CONTRIBUTOR');

      // 🔑 FIX: Use provided actionKey OR fallback to generated one
      const actionKey = data.actionKey || `${propertyId}:ACTION_CENTER:${data.assetType}`;

      // Check if task already exists
      const existing = await prisma.propertyMaintenanceTask.findUnique({
        where: {
          propertyId_actionKey: {
            propertyId,
            actionKey,
          },
        },
      });

      if (existing) {
        logger.info({
          actionKey,
          taskId: existing.id,
        }, '✅ Task already exists (deduped)');
        return { task: existing, deduped: true };
      }

      // Validate serviceCategory if provided
      if (data.serviceCategory) {
        await this.validateServiceCategory(data.serviceCategory);
      }

      // Create new task
      try {
        const task = await prisma.propertyMaintenanceTask.create({
          data: {
            propertyId,
            title: data.title,
            description: data.description ?? null,
            status: 'PENDING',
            source: 'ACTION_CENTER',
            actionKey, // Use the correct actionKey
            assetType: data.assetType,
            priority: data.priority,
            riskLevel: data.riskLevel ?? null,
            serviceCategory: data.serviceCategory ?? null,
            estimatedCost: data.estimatedCost ?? null,
            nextDueDate: new Date(data.nextDueDate),
          },
        });

        logger.info({
          actionKey,
          taskId: task.id,
          title: task.title,
        }, '✅ Created PropertyMaintenanceTask with actionKey');

        // Home Operations Item #14 (Gap 1): a checklist-sourced recommendation
        // almost always already has a CANDIDATE work item at its own
        // recommendation-stage key (linkWorkItemsAndReconcile runs on every
        // Home-feed load) — reconcile onto it instead of forking a second one
        // at this task's own key. Best-effort: a lookup failure here must not
        // block task creation, which already succeeded above.
        const originatingChecklistItem = data.actionKey
          ? await prisma.checklistItem.findFirst({
              where: { propertyId, actionKey: data.actionKey },
              select: { id: true },
            }).catch(() => null)
          : null;

        await this.syncTaskWorkItem(userId, task, false, false, originatingChecklistItem?.id ?? null);
        return { task, deduped: false };
      } catch (err: any) {
        // Handle unique constraint race condition
        if (err?.code === 'P2002') {
          const fallback = await prisma.propertyMaintenanceTask.findUnique({
            where: {
              propertyId_actionKey: {
                propertyId,
                actionKey,
              },
            },
          });

          if (fallback) {
            return { task: fallback, deduped: true };
          }
        }
        throw err;
      }
    }
  
    /**
     * Create tasks from seasonal checklist items (user-initiated — enforces
     * property access). System-triggered callers (seasonal generation,
     * read-time self-heal) use createFromSeasonalItemInternal directly,
     * which has no acting user and must not be gated by ownership checks
     * meant for interactive requests.
     */
  static async createFromSeasonalItem(
    userId: string,
    propertyId: string,
    seasonalItemId: string
  ): Promise<PropertyMaintenanceTask> {
    // Verify property access (CONTRIBUTOR+ required to create tasks)
    await this.verifyPropertyOwnership(userId, propertyId, 'CONTRIBUTOR');
    return this.createFromSeasonalItemInternal(propertyId, seasonalItemId);
  }

  /**
   * Core seasonal-item-to-task promotion, with no access-control check.
   * W3 (maintenance/seasonal): every generated seasonal item is promoted
   * to a canonical PropertyMaintenanceTask automatically — this is the
   * shared implementation between that generation-time promotion and the
   * user-facing createFromSeasonalItem.
   */
  static async createFromSeasonalItemInternal(
    propertyId: string,
    seasonalItemId: string
  ): Promise<PropertyMaintenanceTask> {
    // Get seasonal item with all relations
    const seasonalItem = await prisma.seasonalChecklistItem.findUnique({
      where: { id: seasonalItemId },
      include: {
        seasonalTaskTemplate: true,
        seasonalChecklist: true,
        maintenanceTask: true,
      },
    });

    if (!seasonalItem) {
      throw new Error('Seasonal checklist item not found.');
    }

    if (seasonalItem.propertyId !== propertyId) {
      throw new Error('Seasonal item does not belong to this property.');
    }

    // Check if task already exists
    if (seasonalItem.maintenanceTask) {
      throw new Error('Task already created for this seasonal item.');
    }

    // 🔧 FIX: Validate and safely handle serviceCategory
    let validServiceCategory: ServiceCategory | null = null;
    
    if (seasonalItem.seasonalTaskTemplate?.serviceCategory) {
      const category = seasonalItem.seasonalTaskTemplate.serviceCategory as string;
      
      // Only validate if category exists
      try {
        await this.validateServiceCategory(category as ServiceCategory);
        validServiceCategory = category as ServiceCategory;
      } catch (error) {
        // Log but don't fail - just set to null
        logger.warn(
          `[SEASONAL] Invalid serviceCategory "${category}" for item ${seasonalItemId}, setting to null:`,
          error
        );
        validServiceCategory = null;
      }
    }

    // 🔧 FIX: Add detailed logging before create
    logger.info({
      propertyId,
      title: seasonalItem.title,
      status: 'PENDING',
      source: 'SEASONAL',
      priority: this.mapTaskPriorityToMaintenance(seasonalItem.priority),
      serviceCategory: validServiceCategory,
      isSeasonal: true,
      season: seasonalItem.seasonalChecklist.season,
    }, '[SEASONAL] Creating PropertyMaintenanceTask');

    try {
      const task = await prisma.propertyMaintenanceTask.create({
        data: {
          propertyId,
          title: seasonalItem.title,
          description: seasonalItem.description ?? null,
          status: 'PENDING',
          source: 'SEASONAL',
          priority: this.mapTaskPriorityToMaintenance(seasonalItem.priority),
          isSeasonal: true,
          season: seasonalItem.seasonalChecklist.season,
          seasonalChecklistItemId: seasonalItem.id,
          nextDueDate: resolveSeasonalTaskDueDate(seasonalItem.recommendedDate),
          serviceCategory: validServiceCategory,
        },
      });

      logger.info({ taskId: task.id }, '[SEASONAL] Successfully created PropertyMaintenanceTask');

      // Update seasonal item to mark as added. autoPromotionSkipped is
      // cleared here too — a task now exists again, so the "explicitly
      // removed" marker set by removeSeasonalTaskFromMaintenance no
      // longer applies.
      await prisma.seasonalChecklistItem.update({
        where: { id: seasonalItemId },
        data: {
          status: 'ADDED',
          addedAt: new Date(),
          autoPromotionSkipped: false,
        },
      });

      // No acting user — this runs from both the user-facing
      // createFromSeasonalItem and system-triggered generation/self-heal.
      await this.syncTaskWorkItem(null, task, false, false);
      return task;
    } catch (error) {
      // 🔧 FIX: Better error logging
      logger.error({
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        seasonalItemId,
        propertyId,
      }, '[SEASONAL] Failed to create PropertyMaintenanceTask');
      throw error;
    }
  }
  
    /**
     * Create tasks from templates.
     */
    static async createFromTemplates(
      userId: string,
      propertyId: string,
      templateIds: string[]
    ): Promise<{ count: number; tasks: PropertyMaintenanceTask[] }> {
      // Verify property access (CONTRIBUTOR+ required to create tasks)
      await this.verifyPropertyOwnership(userId, propertyId, 'CONTRIBUTOR');
  
      // Get templates
      const templates = await prisma.maintenanceTaskTemplate.findMany({
        where: {
          id: { in: templateIds },
          isActive: true,
        },
      });
  
      if (templates.length === 0) {
        throw new Error('No valid templates found.');
      }
  
      // Create tasks
      const tasks: PropertyMaintenanceTask[] = [];
  
      for (const template of templates) {
        // Validate serviceCategory if present
        if (template.serviceCategory) {
          try {
            await this.validateServiceCategory(template.serviceCategory as ServiceCategory);
          } catch (error) {
            // Skip invalid categories
            continue;
          }
        }
  
        const task = await this.createUserTask(userId, propertyId, {
          templateId: template.id,
          title: template.title,
          description: template.description ?? undefined,
          priority: 'MEDIUM',
          serviceCategory: template.serviceCategory as ServiceCategory | undefined,
          isRecurring: true,
          frequency: template.defaultFrequency,
          nextDueDate: this.calculateNextDueDate(template.defaultFrequency).toISOString(),
        });
  
        tasks.push(task);
      }
  
      return { count: tasks.length, tasks };
    }
  
    /**
     * Update task status.
     */
    /**
     * Build the Prisma update payload for a status transition, including the
     * completion-only fields (lastCompletedDate, project-follow-up metadata,
     * recurring nextDueDate). Shared by updateTaskStatus and updateTask so
     * both mutation paths write identical completion data.
     */
    private static buildStatusUpdateData(
      task: Pick<PropertyMaintenanceTask, 'actionKey' | 'isRecurring' | 'frequency'>,
      status: MaintenanceTaskStatus,
      userId: string,
      actualCost?: number,
      outcomeHealth?: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED',
    ): Record<string, unknown> {
      const updateData: Record<string, unknown> = { status };
      if (status !== 'COMPLETED') return updateData;

      updateData.lastCompletedDate = new Date();
      if (actualCost !== undefined) {
        updateData.actualCost = actualCost;
      }

      const projectFollowUpMatch = task.actionKey?.match(/^project:([^:]+):follow-up$/);
      if (projectFollowUpMatch) {
        updateData.completionMetadata = {
          kind: 'PROJECT_OUTCOME_FOLLOW_UP',
          projectId: projectFollowUpMatch[1],
          outcomeHealth: outcomeHealth ?? 'CONFIRMED_HEALTHY',
          recordedByUserId: userId,
        };
      }

      if (task.isRecurring && task.frequency) {
        updateData.nextDueDate = this.calculateNextDueDate(task.frequency);
      }

      return updateData;
    }

    /**
     * Run every side effect a maintenance task status transition must
     * produce (project follow-up remediation, analytics, seasonal sync,
     * Radar reconciliation, adherence signal), regardless of which mutation
     * path (updateTaskStatus or updateTask) triggered the transition. Prior
     * to this helper, updateTask's generic field-patch bypassed all of this
     * — see the Home Operations Slice 0 completion-endpoint matrix.
     */
    private static async applyTaskCompletionSideEffects(
      userId: string,
      task: PropertyMaintenanceTask,
      updatedTask: PropertyMaintenanceTask,
      wasCompleted: boolean,
      isNowCompleted: boolean,
      outcomeHealth?: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED',
    ): Promise<void> {
      const projectFollowUpMatch = task.actionKey?.match(/^project:([^:]+):follow-up$/);
      if (!wasCompleted && isNowCompleted && projectFollowUpMatch) {
        const projectId = projectFollowUpMatch[1];
        const health = outcomeHealth ?? 'CONFIRMED_HEALTHY';
        const project = await prisma.projectRecord.findFirst({
          where: { id: projectId, propertyId: task.propertyId },
          select: { id: true, name: true, guidanceJourneyId: true, verifiedAt: true },
        });
        if (project) {
          await prisma.projectRecord.update({
            where: { id: project.id },
            data: { followUpHealth: health, followUpCompletedAt: new Date() },
          });
          if (health !== 'CONFIRMED_HEALTHY') {
            const actionKey = `project:${project.id}:follow-up-remediation`;
            await prisma.propertyMaintenanceTask.upsert({
              where: { propertyId_actionKey: { propertyId: task.propertyId, actionKey } },
              create: {
                propertyId: task.propertyId,
                inventoryItemId: task.inventoryItemId,
                source: 'PROJECT_COMPLETION',
                actionKey,
                title: `Review follow-up concern for ${project.name}`,
                description: `The scheduled outcome follow-up was recorded as ${health.toLowerCase().replace(/_/g, ' ')}.`,
                priority: health === 'FAILED' ? 'URGENT' : 'HIGH',
                status: 'PENDING',
              },
              update: {
                status: 'PENDING',
                priority: health === 'FAILED' ? 'URGENT' : 'HIGH',
                description: `The scheduled outcome follow-up was recorded as ${health.toLowerCase().replace(/_/g, ' ')}.`,
              },
            });
          }
          analyticsEmitter.track({
            eventType: AnalyticsEvent.ACTION_COMPLETED,
            propertyId: task.propertyId,
            moduleKey: AnalyticsModule.PROJECT_MGMT,
            featureKey: AnalyticsFeature.PROJECT_TRACKER,
            metadataJson: {
              actionType: 'project_follow_up_health_recorded',
              projectId: project.id,
              journeyId: project.guidanceJourneyId,
              followUpHealth: health,
              daysSinceVerified: project.verifiedAt
                ? Math.max(0, Math.round((Date.now() - project.verifiedAt.getTime()) / 86_400_000))
                : null,
            },
          });
        }
      }

      // Analytics: maintenance item completed (only on first completion transition)
      if (!wasCompleted && isNowCompleted) {
        analyticsEmitter.track({
          eventType: AnalyticsEvent.MAINTENANCE_ITEM_COMPLETED,
          propertyId: task.propertyId,
          moduleKey: AnalyticsModule.MAINTENANCE,
          featureKey: AnalyticsFeature.MAINTENANCE_TASK,
          metadataJson: {
            source: task.source,
            priority: task.priority,
            isRecurring: task.isRecurring,
          },
        });
      }

      // Sync to seasonal checklist if this task is linked to one
      if (task.seasonalChecklistItemId) {
        const seasonalItem = await prisma.seasonalChecklistItem.findUnique({
          where: { id: task.seasonalChecklistItemId },
        });

        if (!seasonalItem) {
          logger.warn(`⚠️ Seasonal item ${task.seasonalChecklistItemId} not found`);
        } else if (!wasCompleted && isNowCompleted) {
          // Completing
          await prisma.seasonalChecklistItem.update({
            where: { id: task.seasonalChecklistItemId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });

          await prisma.seasonalChecklist.update({
            where: { id: seasonalItem.seasonalChecklistId },
            data: { tasksCompleted: { increment: 1 } },
          });
          await syncSeasonalChecklistStatus(seasonalItem.seasonalChecklistId);
          logger.info(`✅ Synced seasonal completion: checklist ${seasonalItem.seasonalChecklistId} tasks_completed++`);

        } else if (wasCompleted && !isNowCompleted) {
          // Uncompleting
          await prisma.seasonalChecklistItem.update({
            where: { id: task.seasonalChecklistItemId },
            data: { status: 'ADDED', completedAt: null },
          });

          const checklist = await prisma.seasonalChecklist.findUnique({
            where: { id: seasonalItem.seasonalChecklistId },
            select: { tasksCompleted: true },
          });

          if (checklist && checklist.tasksCompleted > 0) {
            await prisma.seasonalChecklist.update({
              where: { id: seasonalItem.seasonalChecklistId },
              data: { tasksCompleted: { decrement: 1 } },
            });
            logger.info(`🔄 Synced seasonal uncomplete: checklist ${seasonalItem.seasonalChecklistId} tasks_completed--`);
          }
          await syncSeasonalChecklistStatus(seasonalItem.seasonalChecklistId);
        }
      }

      if (wasCompleted !== isNowCompleted) {
        await requestRadarPropertyReconciliation({
          propertyId: task.propertyId,
          reasons: ['mitigation_changed'],
          changeToken: updatedTask.updatedAt.toISOString(),
          correlationId:
            `maintenance-task:${updatedTask.id}:${updatedTask.updatedAt.toISOString()}`,
        });
        try {
          await signalService.publishMaintenanceAdherenceSignal({
            propertyId: task.propertyId,
            sourceId: updatedTask.id,
          });
        } catch (signalError) {
          logger.warn({ signalError }, 'Maintenance adherence signal publish failed (task status update)');
        }
      }

      await this.syncTaskWorkItem(userId, updatedTask, wasCompleted, isNowCompleted);
    }

    /**
     * Home Operations Slice 3: keeps the task's OperationalWorkItem in step
     * with every create/status transition. Best-effort — a sync failure must
     * never block the actual maintenance-task mutation (same resilience
     * pattern Slice 2 used for Home Action feed resolution).
     *
     * Known simplification: a recurring task's work item cycles back through
     * FOLLOW_UP_DUE -> ACCEPTED for its next occurrence rather than minting a
     * new work item, but its presentation fields (including dueAt) are not
     * refreshed at that point — canRefreshFromSource() only allows silent
     * refresh while still CANDIDATE, by design, to protect homeowner-visible
     * state from being rewritten out from under them. A recurring task's
     * genuinely-new due date is therefore not reflected until a dedicated
     * refresh path is added — a follow-up, not solved here.
     */
    /**
     * Home Operations Item #14 (Gap 1): resolves the work item for a task,
     * reconciling onto a recommendation-stage CANDIDATE work item when one
     * was threaded in (see createFromActionCenter above) instead of letting
     * resolveAndUpsertWorkItem fork a second one at the task-stage key. Once
     * reconciled, the linked execution — not the task-stage workKey — is the
     * durable pointer back to the resolved item on every later call, since
     * the item's own workKey stays the recommendation-stage one.
     */
    private static async resolveTaskWorkItem(
      task: PropertyMaintenanceTask,
      proposal: NonNullable<ReturnType<typeof maintenanceTaskSourceAdapter.propose>>,
      recommendationSourceEntityId?: string | null,
    ) {
      const linked = await findWorkItemsLinkedToMaintenanceTaskExecution(task.id);
      if (linked.length > 0) return linked[0].workItem;

      if (recommendationSourceEntityId) {
        const candidateKey = resolveMaintenanceRecommendationWorkKey(task.propertyId, recommendationSourceEntityId);
        const candidate = await findWorkItemByWorkKey(task.propertyId, candidateKey);
        if (candidate && (candidate.state === 'CANDIDATE' || candidate.state === 'ACCEPTED')) {
          // Home Operations Item #15: bookingId is the existing "hired a
          // provider for this" signal already on the task.
          await linkWorkExecution({
            workItemId: candidate.id,
            executionType: 'MAINTENANCE_TASK',
            executionEntityId: task.id,
            responsibleParty: task.bookingId ? 'CONTRACTOR' : 'HOUSEHOLD',
          });
          return candidate;
        }
      }
      return resolveAndUpsertWorkItem(proposal);
    }

    private static async syncTaskWorkItem(
      actorUserId: string | null,
      updatedTask: PropertyMaintenanceTask,
      wasCompleted: boolean,
      isNowCompleted: boolean,
      recommendationSourceEntityId?: string | null,
    ): Promise<void> {
      const actorType = actorUserId ? 'USER' : 'SYSTEM';
      try {
        if (updatedTask.status === 'CANCELLED') {
          const linked = await findWorkItemsLinkedToMaintenanceTaskExecution(updatedTask.id);
          const workKey = resolveMaintenanceTaskWorkKey(updatedTask, updatedTask.propertyId);
          const existing = linked[0]?.workItem ?? await findWorkItemByWorkKey(updatedTask.propertyId, workKey);
          if (existing && existing.state !== 'CLOSED') {
            await transitionWorkItem({
              workItemId: existing.id,
              to: 'CLOSED',
              disposition: 'NOT_RELEVANT',
              actorType,
              actorUserId,
              idempotencyKey: `maintenance-task-cancelled:${updatedTask.id}:${updatedTask.updatedAt.toISOString()}`,
            });
          }
          return;
        }

        const proposal = maintenanceTaskSourceAdapter.propose(updatedTask, updatedTask.propertyId);
        if (!proposal) return;
        let workItem = await this.resolveTaskWorkItem(updatedTask, proposal, recommendationSourceEntityId);

        // Creating a task is itself an acceptance act — nothing separately
        // "recommended" it as a candidate distinct from its own existence.
        if (workItem.state === 'CANDIDATE') {
          workItem = await transitionWorkItem({
            workItemId: workItem.id,
            to: 'ACCEPTED',
            actorType,
            actorUserId,
            idempotencyKey: `maintenance-task-accepted:${workItem.id}`,
          });
        }

        if (!wasCompleted && isNowCompleted) {
          if (workItem.state !== 'REPORTED_COMPLETE' && workItem.state !== 'VERIFIED') {
            workItem = await transitionWorkItem({
              workItemId: workItem.id,
              to: 'REPORTED_COMPLETE',
              actorType,
              actorUserId,
              idempotencyKey: `maintenance-task-reported-complete:${workItem.id}:${updatedTask.updatedAt.toISOString()}`,
            });
          }
          if (workItem.state === 'REPORTED_COMPLETE') {
            // A plain maintenance task's homeowner-reported completion is
            // its own verification — matches the doc's completion-authority
            // table ("Simple homeowner task | Maintenance | Homeowner
            // evidence or low-risk self-attestation").
            workItem = await transitionWorkItem({
              workItemId: workItem.id,
              to: 'VERIFIED',
              actorType: 'SYSTEM',
              idempotencyKey: `maintenance-task-verified:${workItem.id}:${updatedTask.updatedAt.toISOString()}`,
            });
            // Home Operations Slice 5: this task may have been created by
            // accepting an Inspection Finding as work — a no-op otherwise.
            await propagateFindingResolutionFromExecution('MAINTENANCE_TASK', updatedTask.id);
          }
          if (updatedTask.isRecurring && workItem.state === 'VERIFIED') {
            workItem = await transitionWorkItem({
              workItemId: workItem.id,
              to: 'FOLLOW_UP_DUE',
              actorType: 'SYSTEM',
              idempotencyKey: `maintenance-task-follow-up-due:${workItem.id}:${updatedTask.updatedAt.toISOString()}`,
            });
            await transitionWorkItem({
              workItemId: workItem.id,
              to: 'ACCEPTED',
              actorType: 'SYSTEM',
              idempotencyKey: `maintenance-task-next-occurrence:${workItem.id}:${updatedTask.updatedAt.toISOString()}`,
            });
          }
        } else if (wasCompleted && !isNowCompleted &&
          (workItem.state === 'VERIFIED' || workItem.state === 'FOLLOW_UP_DUE')) {
          await transitionWorkItem({
            workItemId: workItem.id,
            to: 'REOPENED',
            actorType,
            actorUserId,
            idempotencyKey: `maintenance-task-reopened:${workItem.id}:${updatedTask.updatedAt.toISOString()}`,
          });
        }
      } catch (err) {
        logger.warn({ err, taskId: updatedTask.id }, 'Home Operations work item sync failed; maintenance task mutation proceeds regardless');
      }
    }

    static async updateTaskStatus(
      userId: string,
      taskId: string,
      status: MaintenanceTaskStatus,
      actualCost?: number,
      outcomeHealth?: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED',
    ): Promise<PropertyMaintenanceTask> {
      // Verify access (CONTRIBUTOR+ required to mutate tasks)
      await this.getTask(userId, taskId, 'CONTRIBUTOR');

      // Get current task state before update (need to check previous status)
      const task = await prisma.propertyMaintenanceTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new Error('Task not found.');
      }

      const wasCompleted = task.status === 'COMPLETED';
      const isNowCompleted = status === 'COMPLETED';

      const updateData = this.buildStatusUpdateData(task, status, userId, actualCost, outcomeHealth);

      const updatedTask = await prisma.propertyMaintenanceTask.update({
        where: { id: taskId },
        data: updateData,
      });

      await this.applyTaskCompletionSideEffects(userId, task, updatedTask, wasCompleted, isNowCompleted, outcomeHealth);

      return updatedTask;
    }
  
    /**
     * Update task details.
     */
    static async updateTask(
      userId: string,
      taskId: string,
      data: {
        title?: string;
        description?: string;
        priority?: MaintenanceTaskPriority;
        status?: MaintenanceTaskStatus;
        estimatedCost?: number;
        actualCost?: number;
        isRecurring?: boolean;
        frequency?: RecurrenceFrequency | null;
        nextDueDate?: string | null;
        serviceCategory?: ServiceCategory | null;
      }
    ): Promise<PropertyMaintenanceTask> {
      // Verify access (CONTRIBUTOR+ required to mutate tasks)
      const existingTask = await this.getTask(userId, taskId, 'CONTRIBUTOR');

      // Validate serviceCategory if provided
      if (data.serviceCategory) {
        await this.validateServiceCategory(data.serviceCategory);
      }
  
      // When status changes, route through the same buildStatusUpdateData
      // used by updateTaskStatus so both mutation paths write identical
      // completion fields (lastCompletedDate, project follow-up metadata,
      // recurring nextDueDate).
      const wasCompleted = existingTask.status === 'COMPLETED';
      const statusUpdateData = data.status !== undefined
        ? this.buildStatusUpdateData(existingTask, data.status, userId, data.actualCost)
        : {};

      const updatedTask = await prisma.propertyMaintenanceTask.update({
        where: { id: taskId },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.priority !== undefined && { priority: data.priority }),
          ...statusUpdateData,
          ...(data.estimatedCost !== undefined && { estimatedCost: data.estimatedCost }),
          ...(data.actualCost !== undefined && { actualCost: data.actualCost }),
          ...(data.isRecurring !== undefined && {
            isRecurring: data.isRecurring,
            ...(data.isRecurring === false && { frequency: null }),
          }),
          ...(data.frequency !== undefined &&
            data.isRecurring !== false && { frequency: data.frequency }),
          ...(data.nextDueDate !== undefined && {
            nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : null,
          }),
          ...(data.serviceCategory !== undefined && {
            serviceCategory: data.serviceCategory,
          }),
        },
      });

      if (data.status !== undefined) {
        const isNowCompleted = updatedTask.status === 'COMPLETED';
        await this.applyTaskCompletionSideEffects(userId, existingTask, updatedTask, wasCompleted, isNowCompleted);
      }

      return updatedTask;
    }
  
    /**
     * Delete a task.
     */
    static async deleteTask(userId: string, taskId: string): Promise<void> {
      // Verify access (CONTRIBUTOR+ required to mutate tasks)
      const task = await this.getTask(userId, taskId, 'CONTRIBUTOR');
  
      // Prevent deletion of ACTION_CENTER tasks (can only be cancelled)
      if (task.source === 'ACTION_CENTER') {
        throw new Error(
          'Action Center tasks cannot be deleted. Use status CANCELLED instead.'
        );
      }

      // OperationalWorkItem links to the task by sourceEntityId string, not
      // a FK, so it is not cascade-deleted with the task — close it first or
      // it dangles as an orphaned ACCEPTED item forever. "Not relevant" is
      // an imprecise fit for "deleted" (no disposition value means exactly
      // that), but it is the closest of the four available.
      try {
        const workKey = resolveMaintenanceTaskWorkKey(task, task.propertyId);
        const existing = await findWorkItemByWorkKey(task.propertyId, workKey);
        if (existing && existing.state !== 'CLOSED') {
          await transitionWorkItem({
            workItemId: existing.id,
            to: 'CLOSED',
            disposition: 'NOT_RELEVANT',
            actorType: 'USER',
            actorUserId: userId,
            idempotencyKey: `maintenance-task-deleted:${taskId}`,
          });
        }
      } catch (err) {
        logger.warn({ err, taskId }, 'Home Operations work item close-on-delete failed; task deletion proceeds regardless');
      }

      await prisma.propertyMaintenanceTask.delete({
        where: { id: taskId },
      });
    }
  
    /**
     * Link task to a booking.
     */
    static async linkToBooking(
      userId: string,
      taskId: string,
      bookingId: string
    ): Promise<PropertyMaintenanceTask> {
      // Verify access (CONTRIBUTOR+ required to mutate tasks)
      await this.getTask(userId, taskId, 'CONTRIBUTOR');

      // Verify booking
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          homeownerId: userId,
        },
      });
  
      if (!booking) {
        throw new Error('Booking not found or user does not have access.');
      }
  
      const updatedTask = await prisma.propertyMaintenanceTask.update({
        where: { id: taskId },
        data: { bookingId },
      });
  
      return updatedTask;
    }
  
    /**
     * Get task statistics for a property.
     */
    static async getPropertyStats(userId: string, propertyId: string) {
      // Verify property ownership
      await this.verifyPropertyOwnership(userId, propertyId);
    
      // 🔑 FIX: Fetch only non-completed/cancelled tasks for stats
      const allTasks = await prisma.propertyMaintenanceTask.findMany({
        where: { propertyId },
      });
    
      // Filter to active tasks only (exclude COMPLETED and CANCELLED)
      const tasks = allTasks.filter(
        (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
      );
  
      const total = tasks.length;
      const byStatus = {
        pending: tasks.filter((t) => t.status === 'PENDING').length,
        inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
        completed: tasks.filter((t) => t.status === 'COMPLETED').length,
        cancelled: tasks.filter((t) => t.status === 'CANCELLED').length,
        needsReview: tasks.filter((t) => t.status === 'NEEDS_REVIEW').length,
      };
  
      const byPriority = {
        urgent: tasks.filter((t) => t.priority === 'URGENT').length,
        high: tasks.filter((t) => t.priority === 'HIGH').length,
        medium: tasks.filter((t) => t.priority === 'MEDIUM').length,
        low: tasks.filter((t) => t.priority === 'LOW').length,
      };
  
      const bySource = {
        userCreated: tasks.filter((t) => t.source === 'USER_CREATED').length,
        actionCenter: tasks.filter((t) => t.source === 'ACTION_CENTER').length,
        seasonal: tasks.filter((t) => t.source === 'SEASONAL').length,
        riskAssessment: tasks.filter((t) => t.source === 'RISK_ASSESSMENT').length,
        warrantyRenewal: tasks.filter((t) => t.source === 'WARRANTY_RENEWAL').length,
        template: tasks.filter((t) => t.source === 'TEMPLATE').length,
      };
  
      const totalEstimatedCost = tasks.reduce(
        (sum, t) => sum + Number(t.estimatedCost ?? 0),
        0
      );
      const totalActualCost = tasks.reduce(
        (sum, t) => sum + Number(t.actualCost ?? 0),
        0
      );
  
      return {
        total,
        byStatus,
        byPriority,
        bySource,
        totalEstimatedCost,
        totalActualCost,
      };
    }
  
    // ===== HELPER METHODS =====
  
    /**
     * Verify that the user owns the property.
     */
    private static async verifyPropertyOwnership(
      userId: string,
      propertyId: string,
      minRole: HouseholdRole = 'VIEWER'
    ): Promise<void> {
      // Verify access: owner OR household collaborator (CONTRIBUTOR/VIEWER), not owner-only.
      const access = await resolvePropertyAccess(userId, propertyId);
      if (!access) {
        throw new Error('User does not have access to this property.');
      }
      if (ROLE_RANK[access.role] < ROLE_RANK[minRole]) {
        throw new Error('User does not have access to perform this action on this property.');
      }

      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true },
      });

      if (!property) {
        throw new Error('Property not found.');
      }

    }
  
    /**
     * Validates that a service category is enabled for property care.
     */
    private static async validateServiceCategory(
      category: ServiceCategory
    ): Promise<void> {
      const config = await prisma.serviceCategoryConfig.findUnique({
        where: { category },
      });
  
      if (!config || !config.isActive || !config.availableForExistingOwner) {
        throw new Error(
          `Service category '${category}' is not available for existing homeowners.`
        );
      }
    }
  
    /**
     * Calculate next due date based on frequency.
     */
    private static calculateNextDueDate(frequency: RecurrenceFrequency): Date {
      const now = new Date();
      switch (frequency) {
        case 'DAILY':
          return new Date(now.setDate(now.getDate() + 1));
        case 'WEEKLY':
          return new Date(now.setDate(now.getDate() + 7));
        case 'MONTHLY':
          return new Date(now.setMonth(now.getMonth() + 1));
        case 'QUARTERLY':
          return new Date(now.setMonth(now.getMonth() + 3));
        case 'SEMI_ANNUALLY':
          return new Date(now.setMonth(now.getMonth() + 6));
        case 'ANNUALLY':
          return new Date(now.setFullYear(now.getFullYear() + 1));
        default:
          return new Date(now.setMonth(now.getMonth() + 1));
      }
    }
  
    /**
     * Map seasonal TaskPriority to MaintenanceTaskPriority.
     */
    private static mapTaskPriorityToMaintenance(
      priority: any
    ): MaintenanceTaskPriority {
      switch (priority) {
        case 'CRITICAL':
          return 'URGENT';
        case 'RECOMMENDED':
          return 'MEDIUM';
        case 'OPTIONAL':
          return 'LOW';
        default:
          return 'MEDIUM';
      }
    }
  }
