// apps/backend/src/services/HomeBuyerTask.service.ts
import { PrismaClient, HomeBuyerTask, HomeBuyerTaskStatus, ServiceCategory } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Service for managing HOME_BUYER tasks.
 * Handles the 8 default tasks and user-created tasks for home buyers.
 */
export class HomeBuyerTaskService {
  /**
   * Get or create a HomeBuyerChecklist for a user.
   * Automatically creates 8 default tasks if this is a new checklist.
   */
  static async getOrCreateChecklist(userId: string) {
    // 1. Get homeowner profile
    const profile = await prisma.homeownerProfile.findUnique({
      where: { userId },
      include: {
        homeBuyerChecklist: {
          include: {
            tasks: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new Error('Homeowner profile not found for this user.');
    }

    // 2. Verify user is HOME_BUYER segment
    if (profile.segment !== 'HOME_BUYER') {
      throw new Error('This feature is only available for home buyers.');
    }

    // 3. Return existing checklist if found
    if (profile.homeBuyerChecklist) {
      return profile.homeBuyerChecklist;
    }

    // 4. Create new checklist with 8 default tasks
    return await this.createChecklistWithDefaults(profile.id);
  }

  /**
   * Creates a new HomeBuyerChecklist with 8 default tasks.
   */
  private static async createChecklistWithDefaults(homeownerProfileId: string) {
    const defaultTasks = [
      {
        title: 'Schedule a Home Inspection',
        description: 'Hire a certified inspector to identify any issues before closing.',
        serviceCategory: ServiceCategory.INSPECTION,
        sortOrder: 1,
      },
      {
        title: 'Secure Financing',
        description: 'Finalize your mortgage pre-approval and lock in your interest rate.',
        serviceCategory: null,
        sortOrder: 2,
      },
      {
        title: 'Get a Home Appraisal',
        description: 'Ensure the property value meets lender requirements.',
        serviceCategory: null,
        sortOrder: 3,
      },
      {
        title: 'Obtain Homeowners Insurance',
        description: 'Get quotes and secure coverage before your closing date.',
        serviceCategory: ServiceCategory.INSURANCE,
        sortOrder: 4,
      },
      {
        title: 'Conduct Final Walk-Through',
        description: 'Verify all agreed-upon repairs have been completed.',
        serviceCategory: null,
        sortOrder: 5,
      },
      {
        title: 'Review Closing Documents',
        description: 'Carefully review all paperwork before signing.',
        serviceCategory: ServiceCategory.ATTORNEY,
        sortOrder: 6,
      },
      {
        title: 'Schedule Move-In Services',
        description: 'Book movers, cleaners, and any other services needed.',
        serviceCategory: ServiceCategory.MOVING,
        sortOrder: 7,
      },
      {
        title: 'Change Locks',
        description: 'Ensure your new home is secure by replacing or rekeying locks.',
        serviceCategory: ServiceCategory.LOCKSMITH,
        sortOrder: 8,
      },
    ];

    // Create checklist and tasks in a transaction
    const checklist = await prisma.homeBuyerChecklist.create({
      data: {
        homeownerProfileId,
        tasks: {
          create: defaultTasks,
        },
      },
      include: {
        tasks: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return checklist;
  }

  /**
   * Get all tasks for a user's checklist.
   */
  static async getTasks(userId: string) {
    const checklist = await this.getOrCreateChecklist(userId);
    return checklist.tasks;
  }

  /**
   * Get a single task by ID (with ownership verification).
   */
  static async getTask(userId: string, taskId: string) {
    const task = await prisma.homeBuyerTask.findFirst({
      where: {
        id: taskId,
        checklist: {
          homeownerProfile: {
            userId,
          },
        },
      },
      include: {
        booking: true,
      },
    });

    if (!task) {
      throw new Error('Task not found or user does not have access.');
    }

    return task;
  }

  /**
   * Update task status.
   */
  static async updateTaskStatus(
    userId: string,
    taskId: string,
    status: HomeBuyerTaskStatus
  ): Promise<HomeBuyerTask> {
    // Verify ownership
    await this.getTask(userId, taskId);

    const updatedTask = await prisma.homeBuyerTask.update({
      where: { id: taskId },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
    });

    return updatedTask;
  }

  /**
   * Update task details (title, description, etc.).
   */
  static async updateTask(
    userId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      status?: HomeBuyerTaskStatus;
      serviceCategory?: ServiceCategory | null;
    }
  ): Promise<HomeBuyerTask> {
    // Verify ownership
    await this.getTask(userId, taskId);

    // Validate serviceCategory if provided
    if (data.serviceCategory) {
      await this.validateServiceCategory(data.serviceCategory);
    }

    const updatedTask = await prisma.homeBuyerTask.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && {
          status: data.status,
          completedAt: data.status === 'COMPLETED' ? new Date() : null,
        }),
        ...(data.serviceCategory !== undefined && {
          serviceCategory: data.serviceCategory,
        }),
      },
    });

    return updatedTask;
  }

  /**
   * Create a custom task.
   */
  static async createTask(
    userId: string,
    data: {
      title: string;
      description?: string;
      serviceCategory?: ServiceCategory;
    }
  ): Promise<HomeBuyerTask> {
    const checklist = await this.getOrCreateChecklist(userId);

    // Validate serviceCategory if provided
    if (data.serviceCategory) {
      await this.validateServiceCategory(data.serviceCategory);
    }

    // Get next sortOrder
    const maxTask = await prisma.homeBuyerTask.findFirst({
      where: { checklistId: checklist.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextSortOrder = (maxTask?.sortOrder ?? 0) + 1;

    const task = await prisma.homeBuyerTask.create({
      data: {
        checklistId: checklist.id,
        title: data.title,
        description: data.description ?? null,
        serviceCategory: data.serviceCategory ?? null,
        sortOrder: nextSortOrder,
      },
    });

    return task;
  }

  /**
   * Delete a task.
   */
  static async deleteTask(userId: string, taskId: string): Promise<void> {
    // Verify ownership
    await this.getTask(userId, taskId);

    await prisma.homeBuyerTask.delete({
      where: { id: taskId },
    });
  }

  /**
   * Link a task to a booking.
   */
  static async linkToBooking(
    userId: string,
    taskId: string,
    bookingId: string
  ): Promise<HomeBuyerTask> {
    // Verify ownership
    await this.getTask(userId, taskId);

    // Verify booking exists and belongs to user
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        homeownerId: userId,
      },
    });

    if (!booking) {
      throw new Error('Booking not found or user does not have access.');
    }

    const updatedTask = await prisma.homeBuyerTask.update({
      where: { id: taskId },
      data: { bookingId },
    });

    return updatedTask;
  }

  /**
   * Validates that a serviceCategory is available for HOME_BUYER segment.
   */
  private static async validateServiceCategory(
    category: ServiceCategory
  ): Promise<void> {
    const config = await prisma.serviceCategoryConfig.findUnique({
      where: { category },
    });

    if (!config || !config.isActive || !config.availableForHomeBuyer) {
      throw new Error(
        `Service category '${category}' is not available for home buyers.`
      );
    }
  }

  /**
   * Get task statistics for a user.
   */
  static async getTaskStats(userId: string) {
    const checklist = await this.getOrCreateChecklist(userId);

    const stats = await prisma.homeBuyerTask.groupBy({
      by: ['status'],
      where: { checklistId: checklist.id },
      _count: true,
    });

    const total = checklist.tasks.length;
    const completed = stats.find((s) => s.status === 'COMPLETED')?._count ?? 0;
    const pending = stats.find((s) => s.status === 'PENDING')?._count ?? 0;
    const inProgress = stats.find((s) => s.status === 'IN_PROGRESS')?._count ?? 0;
    const notNeeded = stats.find((s) => s.status === 'NOT_NEEDED')?._count ?? 0;

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      inProgress,
      notNeeded,
      progress,
    };
  }
}