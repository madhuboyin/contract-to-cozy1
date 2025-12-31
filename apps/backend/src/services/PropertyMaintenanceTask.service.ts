// apps/backend/src/services/PropertyMaintenanceTask.service.ts
import {
    PrismaClient,
    PropertyMaintenanceTask,
    MaintenanceTaskStatus,
    MaintenanceTaskSource,
    MaintenanceTaskPriority,
    RiskLevel,
    ServiceCategory,
    RecurrenceFrequency,
    Season,
  } from '@prisma/client';
  
  const prisma = new PrismaClient();
  
  /**
   * Service for managing property maintenance tasks.
   * Handles tasks for EXISTING_OWNER segment from multiple sources:
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
          homeAsset: true,
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
    static async getTask(userId: string, taskId: string) {
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
          homeAsset: true,
          seasonalChecklistItem: true,
        },
      });
  
      if (!task) {
        throw new Error('Task not found.');
      }
  
      // Verify ownership
      if (task.property.homeownerProfile.userId !== userId) {
        throw new Error('User does not have access to this task.');
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
      }
    ): Promise<PropertyMaintenanceTask> {
      // Verify property ownership
      await this.verifyPropertyOwnership(userId, propertyId);
  
      // Validate serviceCategory if provided
      if (data.serviceCategory) {
        await this.validateServiceCategory(data.serviceCategory);
      }
  
      const task = await prisma.propertyMaintenanceTask.create({
        data: {
          propertyId,
          title: data.title,
          description: data.description ?? null,
          status: 'PENDING',
          source: 'USER_CREATED',
          priority: data.priority ?? 'MEDIUM',
          serviceCategory: data.serviceCategory ?? null,
          estimatedCost: data.estimatedCost ?? null,
          isRecurring: data.isRecurring ?? false,
          frequency: data.isRecurring ? data.frequency ?? null : null,
          nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : null,
        },
      });
  
      return task;
    }
  
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
      }
    ): Promise<{ task: PropertyMaintenanceTask; deduped: boolean }> {
      // Verify property ownership
      await this.verifyPropertyOwnership(userId, propertyId);
  
      // Generate actionKey for idempotency
      const actionKey = `${propertyId}:ACTION_CENTER:${data.assetType}`;
  
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
            actionKey,
            assetType: data.assetType,
            priority: data.priority,
            riskLevel: data.riskLevel ?? null,
            serviceCategory: data.serviceCategory ?? null,
            estimatedCost: data.estimatedCost ?? null,
            nextDueDate: new Date(data.nextDueDate),
          },
        });
  
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
     * Create tasks from seasonal checklist items.
     */
    static async createFromSeasonalItem(
      userId: string,
      propertyId: string,
      seasonalItemId: string
    ): Promise<PropertyMaintenanceTask> {
      // Verify property ownership
      await this.verifyPropertyOwnership(userId, propertyId);
  
      // Get seasonal item
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
          nextDueDate: seasonalItem.recommendedDate,
          serviceCategory: seasonalItem.seasonalTaskTemplate.serviceCategory as ServiceCategory | null,
        },
      });
  
      // Update seasonal item to mark as added
      await prisma.seasonalChecklistItem.update({
        where: { id: seasonalItemId },
        data: {
          status: 'ADDED',
          addedAt: new Date(),
        },
      });
  
      return task;
    }
  
    /**
     * Create tasks from templates.
     */
    static async createFromTemplates(
      userId: string,
      propertyId: string,
      templateIds: string[]
    ): Promise<{ count: number; tasks: PropertyMaintenanceTask[] }> {
      // Verify property ownership
      await this.verifyPropertyOwnership(userId, propertyId);
  
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
  
        const task = await prisma.propertyMaintenanceTask.create({
          data: {
            propertyId,
            title: template.title,
            description: template.description ?? null,
            status: 'PENDING',
            source: 'TEMPLATE',
            priority: 'MEDIUM',
            serviceCategory: template.serviceCategory as ServiceCategory | null,
            isRecurring: true,
            frequency: template.defaultFrequency,
            nextDueDate: this.calculateNextDueDate(template.defaultFrequency),
          },
        });
  
        tasks.push(task);
      }
  
      return { count: tasks.length, tasks };
    }
  
    /**
     * Update task status.
     */
    static async updateTaskStatus(
      userId: string,
      taskId: string,
      status: MaintenanceTaskStatus,
      actualCost?: number
    ): Promise<PropertyMaintenanceTask> {
      // Verify ownership
      await this.getTask(userId, taskId);
  
      const updateData: any = {
        status,
      };
  
      if (status === 'COMPLETED') {
        updateData.lastCompletedDate = new Date();
  
        if (actualCost !== undefined) {
          updateData.actualCost = actualCost;
        }
  
        // If recurring, calculate next due date
        const task = await prisma.propertyMaintenanceTask.findUnique({
          where: { id: taskId },
        });
  
        if (task?.isRecurring && task.frequency) {
          updateData.nextDueDate = this.calculateNextDueDate(task.frequency);
        }
      }
  
      const updatedTask = await prisma.propertyMaintenanceTask.update({
        where: { id: taskId },
        data: updateData,
      });
  
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
        nextDueDate?: string;
        serviceCategory?: ServiceCategory | null;
      }
    ): Promise<PropertyMaintenanceTask> {
      // Verify ownership
      await this.getTask(userId, taskId);
  
      // Validate serviceCategory if provided
      if (data.serviceCategory) {
        await this.validateServiceCategory(data.serviceCategory);
      }
  
      const updatedTask = await prisma.propertyMaintenanceTask.update({
        where: { id: taskId },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.priority !== undefined && { priority: data.priority }),
          ...(data.status !== undefined && {
            status: data.status,
            ...(data.status === 'COMPLETED' && {
              lastCompletedDate: new Date(),
            }),
          }),
          ...(data.estimatedCost !== undefined && { estimatedCost: data.estimatedCost }),
          ...(data.actualCost !== undefined && { actualCost: data.actualCost }),
          ...(data.nextDueDate !== undefined && {
            nextDueDate: new Date(data.nextDueDate),
          }),
          ...(data.serviceCategory !== undefined && {
            serviceCategory: data.serviceCategory,
          }),
        },
      });
  
      return updatedTask;
    }
  
    /**
     * Delete a task.
     */
    static async deleteTask(userId: string, taskId: string): Promise<void> {
      // Verify ownership
      const task = await this.getTask(userId, taskId);
  
      // Prevent deletion of ACTION_CENTER tasks (can only be cancelled)
      if (task.source === 'ACTION_CENTER') {
        throw new Error(
          'Action Center tasks cannot be deleted. Use status CANCELLED instead.'
        );
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
      // Verify ownership
      await this.getTask(userId, taskId);
  
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
  
      const tasks = await prisma.propertyMaintenanceTask.findMany({
        where: { propertyId },
      });
  
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
      propertyId: string
    ): Promise<void> {
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: {
          homeownerProfile: true,
        },
      });
  
      if (!property) {
        throw new Error('Property not found.');
      }
  
      if (property.homeownerProfile.userId !== userId) {
        throw new Error('User does not have access to this property.');
      }
  
      // Verify user is EXISTING_OWNER segment
      if (property.homeownerProfile.segment !== 'EXISTING_OWNER') {
        throw new Error(
          'Property maintenance tasks are only available for existing homeowners.'
        );
      }
    }
  
    /**
     * Validates that a serviceCategory is available for EXISTING_OWNER segment.
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