// apps/backend/src/services/seasonalChecklist.service.ts
import { PrismaClient, ClimateRegion, Season, Property } from '@prisma/client';
import { ClimateZoneService } from './climateZone.service';

const prisma = new PrismaClient();

export class SeasonalChecklistService {
  /**
   * Generate seasonal checklist for a property
   */
  static async generateSeasonalChecklist(
    propertyId: string,
    season: Season,
    year: number
  ) {
    // Check if checklist already exists
    const existing = await prisma.seasonalChecklist.findUnique({
      where: {
        propertyId_season_year: {
          propertyId,
          season,
          year,
        },
      },
    });

    if (existing) {
      return existing;
    }

    // Get property and climate settings
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        homeAssets: true,
        homeownerProfile: true,
      },
    });

    if (!property) {
      throw new Error('Property not found');
    }
    if (property.homeownerProfile?.segment !== 'EXISTING_OWNER') {
      console.log(`Skipping seasonal checklist - not an existing owner (property: ${propertyId})`);
      return null;
    }
    const climateSettings = await ClimateZoneService.getOrCreateClimateSettings(propertyId);

    if (!climateSettings.autoGenerateChecklists) {
      console.log(`Auto-generation disabled for property ${propertyId}`);
      return null;
    }

    // Get season dates
    const seasonStartDate = ClimateZoneService.getSeasonStartDate(season, year);
    const seasonEndDate = ClimateZoneService.getSeasonEndDate(season, year);

    // Get matching task templates
    const templates = await prisma.seasonalTaskTemplate.findMany({
      where: {
        season,
        isActive: true,
        climateRegions: {
          has: climateSettings.climateRegion,
        },
        taskKey: {
          notIn: climateSettings.excludedTaskKeys,
        },
      },
      orderBy: [
        { priority: 'asc' }, // CRITICAL first
        { title: 'asc' },
      ],
    });

    // Filter tasks based on property assets
    const filteredTemplates = templates.filter((template) => {
      return this.shouldIncludeTask(template, property);
    });

    // Create checklist
    const checklist = await prisma.seasonalChecklist.create({
      data: {
        propertyId,
        season,
        year,
        climateRegion: climateSettings.climateRegion,
        seasonStartDate,
        seasonEndDate,
        status: 'PENDING',
        totalTasks: filteredTemplates.length,
        tasksAdded: 0,
        tasksCompleted: 0,
      },
    });

    // Create checklist items
    const itemsData = filteredTemplates.map((template) => {
      const recommendedDate = new Date(seasonStartDate);
      recommendedDate.setDate(recommendedDate.getDate() + 7); // Recommend completion 1 week into season

      return {
        seasonalChecklistId: checklist.id,
        seasonalTaskTemplateId: template.id,
        propertyId,
        taskKey: template.taskKey,
        title: template.title,
        description: template.description,
        priority: template.priority,
        status: 'RECOMMENDED' as const,
        recommendedDate,
      };
    });

    await prisma.seasonalChecklistItem.createMany({
      data: itemsData,
    });

    return checklist;
  }

  /**
   * Check if task should be included based on property assets
   */
  private static shouldIncludeTask(template: any, property: any): boolean {
    // If no asset requirement, include task
    if (!template.requiredAssetCheck) {
      return true;
    }

    // Check property fields
    const assetCheck = template.requiredAssetCheck;
    
    // Direct property field checks
    if (assetCheck === 'has_pool' && property.hasPool) return true;
    if (assetCheck === 'has_deck' && property.hasDeck) return true;
    if (assetCheck === 'has_fireplace' && property.hasFireplace) return true;
    if (assetCheck === 'has_sprinkler_system' && property.hasIrrigation) return true;
    if (assetCheck === 'has_lawn' && property.lotSize && property.lotSize > 0) return true;
    if (assetCheck === 'has_driveway' && property.hasDriveway) return true;
    if (assetCheck === 'has_ac' && (property.coolingType || property.homeAssets?.some((a: any) => a.assetType === 'HVAC_AC'))) return true;
    if (assetCheck === 'is_coastal' && property.isCoastal) return true;

    // Check homeAssets array
    if (template.requiredAssetType && property.homeAssets) {
      const hasAsset = property.homeAssets.some(
        (asset: any) => asset.assetType === template.requiredAssetType
      );
      if (hasAsset) return true;
    }

    return false;
  }

  /**
   * Get seasonal checklist with items
   */
  static async getSeasonalChecklist(checklistId: string) {
    const checklist = await prisma.seasonalChecklist.findUnique({
      where: { id: checklistId },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
          },
        },
        items: {
          include: {
            seasonalTaskTemplate: true,
            maintenanceTask: true,
            checklistItem: true,
          },
          orderBy: [
            { priority: 'asc' },
            { title: 'asc' },
          ],
        },
      },
    });

    if (!checklist) {
      throw new Error('Seasonal checklist not found');
    }

    // Group items by priority
    const critical = checklist.items.filter((item) => item.priority === 'CRITICAL');
    const recommended = checklist.items.filter((item) => item.priority === 'RECOMMENDED');
    const optional = checklist.items.filter((item) => item.priority === 'OPTIONAL');

    return {
      checklist: {
        ...checklist,
        items: undefined, // Remove items from checklist object
      },
      tasks: {
        critical,
        recommended,
        optional,
      },
    };
  }

  /**
   * Get all seasonal checklists for a property
   */
  static async getPropertySeasonalChecklists(
    propertyId: string,
    filters?: {
      year?: number;
      season?: Season;
      status?: string;
    }
  ) {
    const where: any = { propertyId };

    if (filters?.year) where.year = filters.year;
    if (filters?.season) where.season = filters.season;
    if (filters?.status) where.status = filters.status;

    const checklists = await prisma.seasonalChecklist.findMany({
      where,
      include: {
        items: {
          select: {
            id: true,
            status: true,
            priority: true,
          },
        },
      },
      orderBy: [
        { year: 'desc' },
        { seasonStartDate: 'desc' },
      ],
    });

    // Calculate days remaining for each checklist
    const now = new Date();
    const enrichedChecklists = checklists.map((checklist) => {
      const daysRemaining = Math.ceil(
        (new Date(checklist.seasonEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        ...checklist,
        daysRemaining: Math.max(0, daysRemaining),
      };
    });

    return enrichedChecklists;
  }

  /**
   * Add seasonal task to user's regular checklist
   */
  static async addTaskToChecklist(
    seasonalItemId: string,
    options?: {
      nextDueDate?: Date;
      isRecurring?: boolean;
      frequency?: string;
      notes?: string;
    }
  ) {
    const seasonalItem = await prisma.seasonalChecklistItem.findUnique({
      where: { id: seasonalItemId },
      include: {
        seasonalChecklist: true,
        seasonalTaskTemplate: true,
      },
    });

    if (!seasonalItem) {
      throw new Error('Seasonal task not found');
    }

    // Get homeowner profile for this property
    const property = await prisma.property.findUnique({
      where: { id: seasonalItem.propertyId },
      include: {
        homeownerProfile: {
          include: {
            checklist: true,
          },
        },
      },
    });

    if (!property || !property.homeownerProfile) {
      throw new Error('Property or homeowner profile not found');
    }

    // Get or create checklist
    let checklist = property.homeownerProfile.checklist;
    if (!checklist) {
      checklist = await prisma.checklist.create({
        data: {
          homeownerProfileId: property.homeownerProfile.id,
        },
      });
    }

    // Create checklist item
    const checklistItem = await prisma.checklistItem.create({
      data: {
        checklistId: checklist.id,
        propertyId: seasonalItem.propertyId,
        title: seasonalItem.title,
        description: seasonalItem.description || undefined,
        serviceCategory: seasonalItem.seasonalTaskTemplate.serviceCategory || undefined,
        status: 'PENDING',
        isSeasonal: true,
        season: seasonalItem.seasonalChecklist.season,
        seasonalChecklistItemId: seasonalItem.id,
        isRecurring: options?.isRecurring || false,
        frequency: options?.frequency as any,
        nextDueDate: options?.nextDueDate || seasonalItem.recommendedDate || undefined,
      },
    });

    // Update seasonal item status
    await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItemId },
      data: {
        status: 'ADDED',
        addedAt: new Date(),
        checklistItemId: checklistItem.id,
      },
    });

    // Update checklist tasks_added count
    await prisma.seasonalChecklist.update({
      where: { id: seasonalItem.seasonalChecklistId },
      data: {
        tasksAdded: { increment: 1 },
        status: 'IN_PROGRESS',
      },
    });

    return checklistItem;
  }

  /**
   * Dismiss individual seasonal task
   */
  static async dismissTask(seasonalItemId: string) {
    const updated = await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItemId },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Dismiss entire seasonal checklist
   */
  static async dismissChecklist(checklistId: string) {
    // Update checklist status
    await prisma.seasonalChecklist.update({
      where: { id: checklistId },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
      },
    });

    // Update all items to dismissed
    await prisma.seasonalChecklistItem.updateMany({
      where: {
        seasonalChecklistId: checklistId,
        status: 'RECOMMENDED',
      },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Snooze seasonal task
   */
  static async snoozeTask(seasonalItemId: string, days: number = 7) {
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + days);

    const updated = await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItemId },
      data: {
        status: 'SNOOZED',
        snoozedUntil,
      },
    });

    return updated;
  }

  /**
   * Add all critical tasks to checklist
   */
  static async addAllCriticalTasks(checklistId: string) {
    const checklist = await prisma.seasonalChecklist.findUnique({
      where: { id: checklistId },
      include: {
        items: {
          where: {
            priority: 'CRITICAL',
            status: 'RECOMMENDED',
          },
        },
      },
    });

    if (!checklist) {
      throw new Error('Seasonal checklist not found');
    }

    const addedTasks = [];

    for (const item of checklist.items) {
      try {
        const checklistItem = await this.addTaskToChecklist(item.id);
        addedTasks.push(checklistItem);
      } catch (error) {
        console.error(`Failed to add task ${item.id}:`, error);
      }
    }

    return {
      success: true,
      tasksAdded: addedTasks.length,
      checklistItems: addedTasks,
    };
  }

  /**
   * Mark seasonal task as completed (if completed via regular checklist)
   */
  static async markTaskCompleted(seasonalItemId: string) {
    const updated = await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItemId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      include: {
        seasonalChecklist: true,
      },
    });

    // Update checklist completed count
    await prisma.seasonalChecklist.update({
      where: { id: updated.seasonalChecklistId },
      data: {
        tasksCompleted: { increment: 1 },
      },
    });

    // Check if all tasks completed
    const checklist = await prisma.seasonalChecklist.findUnique({
      where: { id: updated.seasonalChecklistId },
    });

    if (checklist && checklist.tasksCompleted >= checklist.totalTasks) {
      await prisma.seasonalChecklist.update({
        where: { id: updated.seasonalChecklistId },
        data: { status: 'COMPLETED' },
      });
    }

    return updated;
  }
    /**
   * Mark seasonal task as uncompleted (reverses completion)
   * Called when user uncompletes a task in Action Center
   */
  static async markTaskUncompleted(seasonalItemId: string) {
    const seasonalItem = await prisma.seasonalChecklistItem.findUnique({
      where: { id: seasonalItemId },
      include: {
        seasonalChecklist: true,
      },
    });

    if (!seasonalItem) {
      throw new Error('Seasonal checklist item not found');
    }

    // Only allow uncompleting if it was previously completed
    if (seasonalItem.status !== 'COMPLETED') {
      console.log(`⚠️ Seasonal item ${seasonalItemId} is not completed (status: ${seasonalItem.status}), skipping uncomplete`);
      return seasonalItem;
    }

    // Update the seasonal item back to ADDED status
    const updated = await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItemId },
      data: {
        status: 'ADDED', // Back to ADDED since it was added to Action Center
        completedAt: null, // Clear completion timestamp
      },
      include: {
        seasonalChecklist: true,
      },
    });

    // Decrement the checklist completed count
    const currentChecklist = await prisma.seasonalChecklist.findUnique({
      where: { id: updated.seasonalChecklistId },
    });

    if (currentChecklist && currentChecklist.tasksCompleted > 0) {
      await prisma.seasonalChecklist.update({
        where: { id: updated.seasonalChecklistId },
        data: {
          tasksCompleted: { decrement: 1 },
          // If it was marked COMPLETED due to 100%, change back to IN_PROGRESS
          status: currentChecklist.status === 'COMPLETED' ? 'IN_PROGRESS' : currentChecklist.status,
        },
      });
    }

    console.log(`🔄 Uncompleted seasonal task: ${seasonalItem.title}`);
    
    return updated;
  }
}

export default SeasonalChecklistService;