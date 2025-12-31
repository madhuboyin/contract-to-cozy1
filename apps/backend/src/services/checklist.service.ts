// apps/backend/src/services/checklist.service.ts

/**
 * @deprecated This service is being phased out in favor of segment-specific services.
 * 
 * Migration Guide:
 * ================
 * 
 * For HOME_BUYER segment:
 * - Use HomeBuyerTaskService instead
 * - 8 default tasks automatically created
 * - Simple task management focused on home buying process
 * 
 * For EXISTING_OWNER segment:
 * - Use PropertyMaintenanceTaskService instead
 * - Advanced maintenance tracking with multiple sources
 * - Risk assessment integration
 * - Seasonal maintenance integration
 * 
 * Timeline:
 * ---------
 * - Phase 2: New services created (CURRENT)
 * - Phase 3-7: Gradual migration of features
 * - Phase 8: Complete removal of ChecklistService
 * 
 * Backward Compatibility:
 * ----------------------
 * This service remains functional until Phase 8 for:
 * - Existing API consumers
 * - Legacy frontend components
 * - Gradual migration period
 * 
 * See: HomeBuyerTaskService, PropertyMaintenanceTaskService
 */

import {
  PrismaClient,
  Checklist,
  ChecklistItem,
  ChecklistItemStatus,
  ServiceCategory,
  RecurrenceFrequency,
  Prisma,
  TaskPriority,
} from '@prisma/client';

const prisma = new PrismaClient();

// Helper functions for renewal task generation
const syncRenewalTasks = async (userId: string, checklistId: string) => {
  // ... existing implementation (keep as is)
};

interface ChecklistItemTemplate {
  title: string;
  description?: string | null;
  serviceCategory: ServiceCategory | null;
  sortOrder: number;
}

/**
 * @deprecated Use HomeBuyerTaskService or PropertyMaintenanceTaskService
 * 
 * ChecklistService - Legacy service for task management
 * Maintained for backward compatibility until Phase 8
 */
export class ChecklistService {
  /**
   * Get or create a checklist for a user.
   * 
   * @deprecated Use HomeBuyerTaskService.getOrCreateChecklist() for HOME_BUYER segment
   *             or PropertyMaintenanceTaskService for EXISTING_OWNER segment.
   */
  static async getOrCreateChecklist(userId: string): Promise<Checklist & { items: ChecklistItem[] } | null> {
    console.warn('⚠️  DEPRECATED: ChecklistService.getOrCreateChecklist() - Use HomeBuyerTaskService or PropertyMaintenanceTaskService');
    
    let checklist = await prisma.checklist.findFirst({
      where: {
        homeownerProfile: {
          userId: userId,
        },
      },
      include: {
        items: {
          orderBy: [
            { nextDueDate: "asc" },
            { sortOrder: "asc" }
          ]
        },
      },
    });

    if (!checklist) {
      checklist = await this.createChecklist(userId);
    }
    
    if (checklist) {
        try {
            await syncRenewalTasks(userId, checklist.id);
        } catch (syncError) {
            console.error('WARNING: Failed to synchronize renewal tasks.', syncError);
        }

        const finalChecklist = await prisma.checklist.findFirst({
             where: { id: checklist.id },
             include: {
                items: {
                  orderBy: [
                    { nextDueDate: "asc" },
                    { sortOrder: "asc" }
                  ]
                },
             }
        });
        
        return finalChecklist as (Checklist & { items: ChecklistItem[] }) | null;
    }

    return null;
  }

  /**
   * Create a new checklist for a user based on their segment.
   * @deprecated Use segment-specific services
   */
  static async createChecklist(userId: string): Promise<Checklist & { items: ChecklistItem[] } | null> {
    console.warn('⚠️  DEPRECATED: ChecklistService.createChecklist()');
    
    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId },
      select: { id: true, segment: true },
    });

    if (!homeownerProfile) {
      throw new Error('Homeowner profile not found for this user.');
    }

    const segment = homeownerProfile.segment;
    let itemsToCreate: ChecklistItemTemplate[] = [];

    if (segment === 'HOME_BUYER') {
      itemsToCreate = [
        { title: 'Schedule a Home Inspection', description: 'Hire a certified inspector.', serviceCategory: ServiceCategory.INSPECTION, sortOrder: 1 },
        { title: 'Secure Financing', description: 'Finalize your mortgage.', serviceCategory: null, sortOrder: 2 },
        { title: 'Get a Home Appraisal', description: 'Ensure property value.', serviceCategory: null, sortOrder: 3 },
        { title: 'Obtain Homeowners Insurance', description: 'Get quotes and secure coverage.', serviceCategory: ServiceCategory.INSURANCE, sortOrder: 4 },
        { title: 'Conduct Final Walk-Through', description: 'Verify repairs completed.', serviceCategory: null, sortOrder: 5 },
        { title: 'Review Closing Documents', description: 'Carefully review paperwork.', serviceCategory: ServiceCategory.ATTORNEY, sortOrder: 6 },
        { title: 'Schedule Move-In Services', description: 'Book movers and cleaners.', serviceCategory: ServiceCategory.MOVING, sortOrder: 7 },
        { title: 'Change Locks', description: 'Ensure home security.', serviceCategory: ServiceCategory.LOCKSMITH, sortOrder: 8 },
      ];
    }

    const checklist = await prisma.checklist.create({
      data: {
        homeownerProfileId: homeownerProfile.id,
        items: {
          create: itemsToCreate.map(item => ({
            ...item,
            status: ChecklistItemStatus.PENDING,
          })),
        },
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return checklist;
  }

  /**
   * Update the status of a specific checklist item.
   * @deprecated Use segment-specific services
   */
  static async updateChecklistItemStatus(
    userId: string,
    itemId: string,
    status: ChecklistItemStatus
  ): Promise<ChecklistItem> {
    console.warn('⚠️  DEPRECATED: ChecklistService.updateChecklistItemStatus()');
    
    const item = await prisma.checklistItem.findFirst({
      where: {
        id: itemId,
        checklist: {
          homeownerProfile: {
            userId: userId,
          },
        },
      },
      include: {
        seasonalChecklistItem: true,
      },
    });

    if (!item) {
      throw new Error('Checklist item not found or user does not have access.');
    }

    const updatedItem = await prisma.checklistItem.update({
      where: { id: itemId },
      data: { status },
    });

    if (item.seasonalChecklistItem) {
      const newSeasonalStatus = status === ChecklistItemStatus.COMPLETED ? 'COMPLETED' : 'ADDED';
      await prisma.seasonalChecklistItem.update({
        where: { id: item.seasonalChecklistItem.id },
        data: { status: newSeasonalStatus },
      });
    }

    return updatedItem;
  }

  /**
   * Update checklist item configuration.
   * @deprecated Use segment-specific services
   */
  static async updateChecklistItemConfig(
    userId: string,
    itemId: string,
    data: {
      title?: string;
      description?: string;
      isRecurring?: boolean;
      frequency?: RecurrenceFrequency | null;
      nextDueDate?: string | null;
      serviceCategory?: string | null;
    }
  ): Promise<ChecklistItem> {
    console.warn('⚠️  DEPRECATED: ChecklistService.updateChecklistItemConfig()');
    
    const item = await prisma.checklistItem.findFirst({
      where: {
        id: itemId,
        checklist: {
          homeownerProfile: {
            userId: userId,
          },
        },
      },
    });

    if (!item) {
      throw new Error('Checklist item not found or user does not have access.');
    }

    const updatedItem = await prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isRecurring !== undefined && { isRecurring: data.isRecurring }),
        ...(data.frequency !== undefined && { frequency: data.frequency }),
        ...(data.nextDueDate !== undefined && { 
          nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : null 
        }),
        ...(data.serviceCategory !== undefined && { 
          serviceCategory: data.serviceCategory as ServiceCategory | null 
        }),
      },
    });

    return updatedItem;
  }

  /**
   * Creates a single checklist item directly.
   * @deprecated Use PropertyMaintenanceTaskService.createFromActionCenter() for EXISTING_OWNER
   *             or HomeBuyerTaskService.createTask() for HOME_BUYER.
   */
  static async createDirectChecklistItem(
    userId: string,
    itemData: {
      title: string;
      description?: string | null;
      serviceCategory?: string | null;
      propertyId: string;
      isRecurring: boolean;
      frequency?: string | null;
      nextDueDate: string;
      actionKey: string;
    }
  ): Promise<{ item: ChecklistItem; deduped: boolean }> {
    console.warn('⚠️  DEPRECATED: ChecklistService.createDirectChecklistItem() - Use PropertyMaintenanceTaskService.createFromActionCenter()');

    if (!itemData.actionKey) {
      throw new Error('actionKey is required for Action Center checklist items');
    }

    const checklist = await this.getOrCreateChecklist(userId);
    if (!checklist) {
      throw new Error('Could not find or create checklist for user');
    }

    const existing = await prisma.checklistItem.findFirst({
      where: {
        propertyId: itemData.propertyId,
        actionKey: itemData.actionKey,
      },
    });

    if (existing) {
      return { item: existing, deduped: true };
    }

    try {
      const created = await prisma.checklistItem.create({
        data: {
          checklistId: checklist.id,
          title: itemData.title,
          description: itemData.description ?? null,
          serviceCategory: itemData.serviceCategory as any,
          status: ChecklistItemStatus.PENDING,
          isRecurring: itemData.isRecurring,
          frequency: itemData.isRecurring ? (itemData.frequency as RecurrenceFrequency | null) : null,
          nextDueDate: new Date(itemData.nextDueDate),
          propertyId: itemData.propertyId,
          actionKey: itemData.actionKey,
          sortOrder: 999,
        },
      });

      return { item: created, deduped: false };
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const fallback = await prisma.checklistItem.findFirst({
          where: {
            propertyId: itemData.propertyId,
            actionKey: itemData.actionKey,
          },
        });

        if (fallback) {
          return { item: fallback, deduped: true };
        }
      }
      throw err;
    }
  }

  /**
   * Deletes a specific checklist item.
   * @deprecated Use segment-specific services
   */
  static async deleteChecklistItem(userId: string, itemId: string): Promise<void> {
    console.warn('⚠️  DEPRECATED: ChecklistService.deleteChecklistItem()');
    
    const item = await prisma.checklistItem.findFirst({
      where: {
        id: itemId,
        checklist: {
          homeownerProfile: {
            userId: userId,
          },
        },
      },
    });

    if (!item) {
      throw new Error('Checklist item not found or user does not have access.');
    }

    await prisma.checklistItem.delete({
      where: { id: itemId },
    });
  }

  /**
   * Add maintenance items from templates.
   * @deprecated Use PropertyMaintenanceTaskService.createFromTemplates()
   */
  static async addMaintenanceItemsToChecklist(
    userId: string,
    templateIds: string[],
    propertyId?: string
  ): Promise<{ count: number }> {
    console.warn('⚠️  DEPRECATED: ChecklistService.addMaintenanceItemsToChecklist() - Use PropertyMaintenanceTaskService.createFromTemplates()');
    
    const checklist = await this.getOrCreateChecklist(userId);
    if (!checklist) {
      throw new Error('Could not find or create a checklist for the user.');
    }

    const templates = await prisma.maintenanceTaskTemplate.findMany({
      where: {
        id: {
          in: templateIds,
        },
        isActive: true,
      },
    });

    if (templates.length === 0) {
      throw new Error('No valid templates found.');
    }

    const calculateNextDueDate = (frequency: RecurrenceFrequency | null): Date | null => {
      if (!frequency) return null;
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
          return null;
      }
    };

    const newItemsData = templates.map((template) => ({
      checklistId: checklist.id,
      title: template.title,
      description: template.description,
      serviceCategory: template.serviceCategory,
      status: ChecklistItemStatus.PENDING,
      isRecurring: true,
      frequency: template.defaultFrequency,
      nextDueDate: calculateNextDueDate(template.defaultFrequency),
      sortOrder: template.sortOrder || 0,
      propertyId: propertyId || null,
    }));

    const result = await prisma.checklistItem.createMany({
      data: newItemsData,
      skipDuplicates: true,
    });

    return { count: result.count };
  }

  /**
   * Create custom maintenance items.
   * @deprecated Use PropertyMaintenanceTaskService.createUserTask()
   */
  static async createCustomMaintenanceItems(
    userId: string,
    tasks: any[]
  ): Promise<{ count: number }> {
    console.warn('⚠️  DEPRECATED: ChecklistService.createCustomMaintenanceItems() - Use PropertyMaintenanceTaskService.createUserTask()');
    
    const checklist = await this.getOrCreateChecklist(userId);
    if (!checklist) {
      throw new Error('Could not find or create a checklist for the user.');
    }

    const newItemsData: Prisma.ChecklistItemCreateManyInput[] = tasks.map((task, index) => ({
      checklistId: checklist.id,
      title: task.title,
      description: task.description,
      serviceCategory: task.serviceCategory,
      status: ChecklistItemStatus.PENDING,
      isRecurring: task.isRecurring,
      frequency: task.isRecurring ? task.frequency : null,
      nextDueDate: task.isRecurring ? task.nextDueDate : null,
      propertyId: task.propertyId || null,
      sortOrder: index,
    }));

    const result = await prisma.checklistItem.createMany({
      data: newItemsData,
    });

    return { count: result.count };
  }
}