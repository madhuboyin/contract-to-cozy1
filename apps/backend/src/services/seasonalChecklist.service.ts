// apps/backend/src/services/seasonalChecklist.service.ts
import { ClimateRegion, Season, Property } from '@prisma/client';
import { ClimateZoneService } from './climateZone.service';
import { addSeasonalTaskToMaintenance } from './seasonalChecklistIntegration.service';
import { syncSeasonalChecklistStatus } from './seasonalChecklistStatus.service';
import { deriveChecklistProgress, isDismissibleSeasonalPriority } from '../utils/seasonalProgress';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluateSeasonalTemplateApplicability } from './seasonal/applicabilityPolicy';
import { supportsOwnershipCare } from './entryContextPolicy';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import { findWorkItemsLinkedToMaintenanceTaskExecution } from '../modules/homeOperations/infrastructure/workItemRepository';
import { snoozeWorkItem } from '../modules/homeOperations/application/snoozeWorkItem.usecase';

export class SeasonalChecklistService {
  private static async assertPropertyOwnership(propertyId: string, userId: string) {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: {
          userId,
        },
      },
      include: {
        inventoryItems: true,
        homeownerProfile: true,
        onboarding: true,
      },
    });

    if (!property) {
      throw new Error('Property not found');
    }

    return property;
  }

  private static async assertChecklistOwnership(checklistId: string, userId: string) {
    const checklist = await prisma.seasonalChecklist.findFirst({
      where: {
        id: checklistId,
        property: {
          homeownerProfile: {
            userId,
          },
        },
      },
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

    return checklist;
  }

  /**
   * Generate seasonal checklist for a property
   */
  static async generateSeasonalChecklist(
    propertyId: string,
    season: Season,
    year: number,
    userId: string
  ) {
    // Existing checklists are reconciled instead of returned immediately.
    // This lets a newly completed Property Context add tasks that were
    // intentionally withheld while applicability was unknown.
    const existing = await prisma.seasonalChecklist.findUnique({
      where: {
        propertyId_season_year: {
          propertyId,
          season,
          year,
        },
      },
      include: {
        items: {
          select: {
            seasonalTaskTemplateId: true,
          },
        },
      },
    });

    // Get property and climate settings
    const property = await this.assertPropertyOwnership(propertyId, userId);
    if (!supportsOwnershipCare({
      entryPath: property.onboarding?.entryPath,
      ownershipState: property.onboarding?.ownershipState,
    })) {
      logger.info(`Skipping seasonal checklist - not an existing owner (property: ${propertyId})`);
      return null;
    }
    const climateSettings = await ClimateZoneService.getOrCreateClimateSettings(propertyId);

    if (!climateSettings.autoGenerateChecklists) {
      logger.info(`Auto-generation disabled for property ${propertyId}`);
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

    const propertyContext = await getPropertyContext(
      propertyId,
      { userId },
      { scopes: ['LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'MAINTENANCE'] },
    );
    const decisions = templates.map((template) => ({
      template,
      decision: evaluateSeasonalTemplateApplicability(propertyContext, template),
    }));
    const filteredTemplates = decisions
      .filter(({ decision }) => decision.status === 'APPLICABLE')
      .map(({ template }) => template);
    const skippedByStatus = decisions.reduce<Record<string, number>>((counts, { decision }) => {
      counts[decision.status] = (counts[decision.status] ?? 0) + 1;
      return counts;
    }, {});
    logger.info(
      { propertyId, season, year, templateCount: templates.length, includedCount: filteredTemplates.length, skippedByStatus },
      'Seasonal templates evaluated against Property Context',
    );

    // Do not manufacture an empty checklist. UNKNOWN context remains a
    // setup opportunity on Home until enough facts exist to evaluate tasks.
    if (filteredTemplates.length === 0) {
      return existing;
    }

    const checklist = existing ?? await prisma.seasonalChecklist.create({
        data: {
          propertyId,
          season,
          year,
          climateRegion: climateSettings.climateRegion,
          seasonStartDate,
          seasonEndDate,
          status: 'PENDING',
          totalTasks: 0,
          tasksAdded: 0,
          tasksCompleted: 0,
        },
      });

    const existingTemplateIds = new Set(existing?.items.map((item) => item.seasonalTaskTemplateId) ?? []);
    const missingTemplates = filteredTemplates.filter((template) => !existingTemplateIds.has(template.id));
    const itemsData = missingTemplates.map((template) => {
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

    if (itemsData.length > 0) {
      await prisma.seasonalChecklistItem.createMany({ data: itemsData });
    }

    const applicableItems = await prisma.seasonalChecklistItem.findMany({
      where: {
        seasonalChecklistId: checklist.id,
        seasonalTaskTemplateId: { in: filteredTemplates.map((template) => template.id) },
      },
      include: {
        maintenanceTask: true,
      },
    });

    for (const item of applicableItems) {
      if (item.maintenanceTask || item.autoPromotionSkipped) continue;
      try {
        await addSeasonalTaskToMaintenance(userId, item.id);
      } catch (error) {
        logger.warn(
          { err: error, itemId: item.id, propertyId },
          'Seasonal maintenance-task promotion skipped during checklist generation',
        );
      }
    }

    const [totalTasks, tasksAdded] = await Promise.all([
      prisma.seasonalChecklistItem.count({ where: { seasonalChecklistId: checklist.id } }),
      prisma.seasonalChecklistItem.count({
        where: {
          seasonalChecklistId: checklist.id,
          maintenanceTask: { isNot: null },
        },
      }),
    ]);

    return prisma.seasonalChecklist.update({
      where: { id: checklist.id },
      data: { totalTasks, tasksAdded },
    });
  }

  /**
   * Get seasonal checklist with items
   */
  static async getSeasonalChecklist(checklistId: string, userId: string) {
    const fetchChecklist = () =>
      prisma.seasonalChecklist.findFirst({
        where: {
          id: checklistId,
          property: {
            homeownerProfile: {
              userId,
            },
          },
        },
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

    let checklist = await fetchChecklist();

    if (!checklist) {
      throw new Error('Seasonal checklist not found');
    }

    // Backfill: (a) items added before bulk-add used the maintenance path
    // are ADDED without a linked PropertyMaintenanceTask, so "View in
    // Maintenance" never renders for them; (b) checklists generated before
    // W3 auto-promotion shipped have RECOMMENDED items that were never
    // promoted at all. Materialize the missing task on read either way —
    // every generated seasonal item is a canonical task by default now.
    // autoPromotionSkipped excludes items a homeowner explicitly removed —
    // RECOMMENDED is also the default state for "never promoted", so status
    // alone can't distinguish the two.
    const legacyAddedItems = checklist.items.filter(
      (item) =>
        !item.maintenanceTask &&
        (item.status === 'ADDED' || (item.status === 'RECOMMENDED' && !item.autoPromotionSkipped)),
    );
    if (legacyAddedItems.length > 0) {
      let healedAny = false;
      for (const item of legacyAddedItems) {
        try {
          await addSeasonalTaskToMaintenance(userId, item.id);
          healedAny = true;
        } catch (error) {
          logger.warn({ err: error, itemId: item.id }, 'Seasonal maintenance-task backfill skipped');
          // Segment restriction applies to every item on this checklist; stop early.
          if (error instanceof Error && error.message.includes('only available')) break;
        }
      }
      if (healedAny) {
        checklist = (await fetchChecklist())!;
      }
    }

    // Group items by priority
    const critical = checklist.items.filter((item) => item.priority === 'CRITICAL');
    const recommended = checklist.items.filter((item) => item.priority === 'RECOMMENDED');
    const optional = checklist.items.filter((item) => item.priority === 'OPTIONAL');

    // Progress is derived from item statuses: dismissed items leave the
    // denominator, and the stored running counter (which drifts) is not used
    // for display.
    const progress = deriveChecklistProgress(checklist.items);

    // Self-heal stale status written before derived-status sync existed.
    let status = checklist.status;
    if (status !== 'DISMISSED' && progress.isFullyCompleted !== (status === 'COMPLETED')) {
      await syncSeasonalChecklistStatus(checklist.id);
      status = progress.isFullyCompleted ? 'COMPLETED' : 'IN_PROGRESS';
    }

    return {
      checklist: {
        ...checklist,
        items: undefined, // Remove items from checklist object
        status,
        tasksCompleted: progress.completedTasks,
        totalTasks: progress.activeTotalTasks,
        dismissedTasks: progress.dismissedTasks,
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
    userId: string,
    filters?: {
      year?: number;
      season?: Season;
      status?: string;
    }
  ) {
    await this.assertPropertyOwnership(propertyId, userId);

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
    const enrichedChecklists = [];
    for (const checklist of checklists) {
      const daysRemaining = Math.ceil(
        (new Date(checklist.seasonEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const progress = deriveChecklistProgress(checklist.items);

      // Self-heal stale status: data written before derived-status sync can
      // sit at 100% while still marked IN_PROGRESS (or vice versa).
      let status = checklist.status;
      if (status !== 'DISMISSED' && progress.isFullyCompleted !== (status === 'COMPLETED')) {
        await syncSeasonalChecklistStatus(checklist.id);
        status = progress.isFullyCompleted ? 'COMPLETED' : 'IN_PROGRESS';
      }

      enrichedChecklists.push({
        ...checklist,
        status,
        daysRemaining: Math.max(0, daysRemaining),
        tasksCompleted: progress.completedTasks,
        totalTasks: progress.activeTotalTasks,
        dismissedTasks: progress.dismissedTasks,
      });
    }

    return enrichedChecklists;
  }

  /**
   * Add seasonal task to user's regular checklist
   */
  static async addTaskToChecklist(
    seasonalItemId: string,
    userId: string,
    options?: {
      nextDueDate?: Date;
      isRecurring?: boolean;
      frequency?: string;
      notes?: string;
    }
  ) {
    const seasonalItem = await prisma.seasonalChecklistItem.findFirst({
      where: {
        id: seasonalItemId,
        property: {
          homeownerProfile: {
            userId,
          },
        },
      },
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
  static async dismissTask(seasonalItemId: string, userId: string) {
    const item = await prisma.seasonalChecklistItem.findFirst({
      where: {
        id: seasonalItemId,
        property: {
          homeownerProfile: {
            userId,
          },
        },
      },
      select: { id: true, priority: true, seasonalChecklistId: true, maintenanceTask: { select: { id: true } } },
    });

    if (!item) {
      throw new Error('Seasonal task not found');
    }

    if (!isDismissibleSeasonalPriority(item.priority)) {
      throw new Error('Critical tasks cannot be dismissed');
    }

    if (item.maintenanceTask) {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, item.maintenanceTask.id, 'CANCELLED');
    }

    const updated = await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItemId },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
      },
    });

    // Dismissal shrinks the checklist's scope: if everything remaining is
    // already complete, the season is done.
    await syncSeasonalChecklistStatus(item.seasonalChecklistId);

    return updated;
  }

  /**
   * Restore (un-dismiss) an individual seasonal task
   */
  static async restoreTask(seasonalItemId: string, userId: string) {
    const item = await prisma.seasonalChecklistItem.findFirst({
      where: {
        id: seasonalItemId,
        property: {
          homeownerProfile: {
            userId,
          },
        },
      },
      select: { id: true, status: true, seasonalChecklistId: true, maintenanceTask: { select: { id: true, status: true } } },
    });

    if (!item) {
      throw new Error('Seasonal task not found');
    }

    if (item.status !== 'DISMISSED') {
      return prisma.seasonalChecklistItem.findUnique({ where: { id: seasonalItemId } });
    }

    const updated = await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItemId },
      data: {
        status: 'RECOMMENDED',
        dismissedAt: null,
      },
    });

    if (item.maintenanceTask?.status === 'CANCELLED') {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, item.maintenanceTask.id, 'PENDING');
    }

    // Reactivating re-enters the item into the checklist's scope; a season
    // that was fully completed reopens.
    await syncSeasonalChecklistStatus(item.seasonalChecklistId);

    return updated;
  }

  /**
   * Dismiss entire seasonal checklist
   */
  static async dismissChecklist(checklistId: string, userId: string) {
    await this.assertChecklistOwnership(checklistId, userId);

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
  static async snoozeTask(seasonalItemId: string, userId: string, days: number = 7) {
    const item = await prisma.seasonalChecklistItem.findFirst({
      where: {
        id: seasonalItemId,
        property: {
          homeownerProfile: {
            userId,
          },
        },
      },
      select: { id: true, maintenanceTask: { select: { id: true } } },
    });

    if (!item) {
      throw new Error('Seasonal task not found');
    }

    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + days);

    const updated = await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItemId },
      data: {
        status: 'SNOOZED',
        snoozedUntil,
      },
    });

    if (item.maintenanceTask) {
      const linked = await findWorkItemsLinkedToMaintenanceTaskExecution(item.maintenanceTask.id);
      for (const entry of linked) {
        await snoozeWorkItem({
          workItemId: entry.workItemId,
          snoozedUntil,
          actorUserId: userId,
          idempotencyKey: `seasonal-snooze:${seasonalItemId}:${snoozedUntil.toISOString()}`,
        });
      }
    }

    return updated;
  }

  /**
   * Add all critical tasks to checklist
   */
  static async addAllCriticalTasks(checklistId: string, userId: string) {
    const checklist = await this.assertChecklistOwnership(checklistId, userId);

    // EXISTING_OWNER adds go through the maintenance path so bulk-added tasks
    // get a linked PropertyMaintenanceTask, matching the individual add button.
    const property = await prisma.property.findUnique({
      where: { id: checklist.propertyId },
      select: {
        onboarding: { select: { entryPath: true, ownershipState: true } },
      },
    });
    const usesMaintenance = property ? supportsOwnershipCare({
      entryPath: property.onboarding?.entryPath,
      ownershipState: property.onboarding?.ownershipState,
    }) : false;

    const addedTasks = [];

    for (const item of checklist.items) {
      try {
        if (usesMaintenance) {
          const result = await addSeasonalTaskToMaintenance(userId, item.id);
          addedTasks.push(result.task);
        } else {
          const checklistItem = await this.addTaskToChecklist(item.id, userId);
          addedTasks.push(checklistItem);
        }
      } catch (error) {
        logger.error({ err: error }, `Failed to add task ${item.id}`);
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

    // Update checklist completed count (legacy counter; display uses derived progress)
    await prisma.seasonalChecklist.update({
      where: { id: updated.seasonalChecklistId },
      data: {
        tasksCompleted: { increment: 1 },
      },
    });

    // Completion status is derived from item statuses so dismissed items
    // (out of scope) don't block a season from completing.
    await syncSeasonalChecklistStatus(updated.seasonalChecklistId);

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
      logger.info(`⚠️ Seasonal item ${seasonalItemId} is not completed (status: ${seasonalItem.status}), skipping uncomplete`);
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

    await syncSeasonalChecklistStatus(updated.seasonalChecklistId);

    logger.info(`🔄 Uncompleted seasonal task: ${seasonalItem.title}`);

    return updated;
  }
}

export default SeasonalChecklistService;
