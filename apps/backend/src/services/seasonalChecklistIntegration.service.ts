// apps/backend/src/services/seasonalChecklistIntegration.service.ts
/**
 * PHASE 2 INTEGRATION: Seasonal Checklist → PropertyMaintenanceTask
 * 
 * This service handles creation of maintenance tasks when users
 * "add" seasonal recommendations to their maintenance checklist.
 * 
 * Integration Points:
 * - User clicks "Add to Checklist" on seasonal item
 * - Creates PropertyMaintenanceTask with source=SEASONAL
 * - Links via seasonalChecklistItemId
 * - Updates seasonal item status to 'ADDED'
 * - Only for EXISTING_OWNER segment
 */

import { PrismaClient } from '@prisma/client';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';

const prisma = new PrismaClient();

/**
 * Creates a PropertyMaintenanceTask from a seasonal checklist item.
 * 
 * This should be called when user clicks "Add to Checklist" in the UI.
 * 
 * @param userId - User ID (for ownership verification)
 * @param seasonalItemId - SeasonalChecklistItem ID
 * @returns Created task
 */
export async function addSeasonalTaskToMaintenance(
  userId: string,
  seasonalItemId: string
): Promise<{
  success: boolean;
  task: any;
  message: string;
}> {
  // 1. Get seasonal item with full relations
  const seasonalItem = await prisma.seasonalChecklistItem.findUnique({
    where: { id: seasonalItemId },
    include: {
      seasonalChecklist: {
        include: {
          property: {
            include: {
              homeownerProfile: true,
            },
          },
        },
      },
      seasonalTaskTemplate: true,
      maintenanceTask: true, // Check if already added
    },
  });

  if (!seasonalItem) {
    throw new Error('Seasonal item not found');
  }

  // 2. Verify ownership
  if (seasonalItem.seasonalChecklist.property.homeownerProfile.userId !== userId) {
    throw new Error('User does not have access to this seasonal item');
  }

  // 3. Check segment (only EXISTING_OWNER can add to maintenance)
  const segment = seasonalItem.seasonalChecklist.property.homeownerProfile.segment;
  if (segment !== 'EXISTING_OWNER') {
    throw new Error('Seasonal maintenance tasks are only available for existing homeowners');
  }

  // 4. Check if already added
  if (seasonalItem.maintenanceTask) {
    return {
      success: false,
      task: seasonalItem.maintenanceTask,
      message: 'This task has already been added to your maintenance checklist',
    };
  }

  // 5. Create PropertyMaintenanceTask
  const task = await PropertyMaintenanceTaskService.createFromSeasonalItem(
    userId,
    seasonalItem.propertyId,
    seasonalItemId
  );

  return {
    success: true,
    task,
    message: 'Task added to your maintenance checklist',
  };
}

/**
 * Removes the link between a seasonal item and its maintenance task.
 * Does NOT delete the maintenance task (user might have modified it).
 * 
 * @param userId - User ID
 * @param seasonalItemId - SeasonalChecklistItem ID
 */
export async function removeSeasonalTaskFromMaintenance(
  userId: string,
  seasonalItemId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  // 1. Get seasonal item
  const seasonalItem = await prisma.seasonalChecklistItem.findUnique({
    where: { id: seasonalItemId },
    include: {
      seasonalChecklist: {
        include: {
          property: {
            include: {
              homeownerProfile: true,
            },
          },
        },
      },
      maintenanceTask: true,
    },
  });

  if (!seasonalItem) {
    throw new Error('Seasonal item not found');
  }

  // 2. Verify ownership
  if (seasonalItem.seasonalChecklist.property.homeownerProfile.userId !== userId) {
    throw new Error('User does not have access to this seasonal item');
  }

  // 3. Check if there's a linked task
  if (!seasonalItem.maintenanceTask) {
    return {
      success: false,
      message: 'No maintenance task is linked to this seasonal item',
    };
  }

  // 4. Update seasonal item status back to RECOMMENDED
  await prisma.seasonalChecklistItem.update({
    where: { id: seasonalItemId },
    data: {
      status: 'RECOMMENDED',
      addedAt: null,
    },
  });

  // 5. Unlink the maintenance task (don't delete it - user might have modified it)
  await prisma.propertyMaintenanceTask.update({
    where: { id: seasonalItem.maintenanceTask.id },
    data: {
      seasonalChecklistItemId: null,
    },
  });

  return {
    success: true,
    message: 'Task removed from maintenance checklist',
  };
}

/**
 * Gets all seasonal items with their maintenance task status.
 * Useful for displaying in UI with "Add" or "Added" buttons.
 * 
 * @param userId - User ID
 * @param propertyId - Property ID
 * @param season - Optional season filter
 */
export async function getSeasonalItemsWithTaskStatus(
  userId: string,
  propertyId: string,
  season?: string
): Promise<Array<{
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  recommendedDate: Date | null;
  hasMaintenanceTask: boolean;
  maintenanceTaskId: string | null;
  season: string;
}>> {
  // 1. Verify property ownership
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      homeownerProfile: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  if (property.homeownerProfile.userId !== userId) {
    throw new Error('User does not have access to this property');
  }

  // 2. Get seasonal items
  const where: any = {
    propertyId,
  };

  if (season) {
    where.seasonalChecklist = {
      season: season,
    };
  }

  const items = await prisma.seasonalChecklistItem.findMany({
    where,
    include: {
      seasonalChecklist: true,
      maintenanceTask: true,
    },
    orderBy: [
      { priority: 'desc' },
      { recommendedDate: 'asc' },
    ],
  });

  // 3. Map to UI-friendly format
  return items.map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    priority: item.priority,
    status: item.status,
    recommendedDate: item.recommendedDate,
    hasMaintenanceTask: !!item.maintenanceTask,
    maintenanceTaskId: item.maintenanceTask?.id || null,
    season: item.seasonalChecklist.season,
  }));
}

/**
 * USAGE EXAMPLE - Add to SeasonalChecklistController
 * 
 * ```typescript
 * // New endpoint: POST /api/seasonal-checklist/items/:itemId/add-to-maintenance
 * async function handleAddToMaintenance(req: AuthRequest, res: Response) {
 *   try {
 *     const { itemId } = req.params;
 *     const userId = req.user.userId;
 * 
 *     const result = await addSeasonalTaskToMaintenance(userId, itemId);
 * 
 *     return res.status(result.success ? 201 : 200).json({
 *       success: result.success,
 *       message: result.message,
 *       data: result.task,
 *     });
 *   } catch (error) {
 *     // Handle error
 *   }
 * }
 * 
 * // New endpoint: DELETE /api/seasonal-checklist/items/:itemId/remove-from-maintenance
 * async function handleRemoveFromMaintenance(req: AuthRequest, res: Response) {
 *   try {
 *     const { itemId } = req.params;
 *     const userId = req.user.userId;
 * 
 *     const result = await removeSeasonalTaskFromMaintenance(userId, itemId);
 * 
 *     return res.status(200).json(result);
 *   } catch (error) {
 *     // Handle error
 *   }
 * }
 * ```
 */

/**
 * STEP-BY-STEP INTEGRATION GUIDE
 * ==============================
 * 
 * 1. ADD NEW CONTROLLER ENDPOINTS
 *    File: apps/backend/src/controllers/seasonalChecklist.controller.ts
 * 
 *    Import:
 *    import { 
 *      addSeasonalTaskToMaintenance, 
 *      removeSeasonalTaskFromMaintenance 
 *    } from '../services/seasonalChecklistIntegration.service';
 * 
 *    Add two new handler functions (see USAGE EXAMPLE above)
 * 
 * 2. ADD NEW ROUTES
 *    File: apps/backend/src/routes/seasonalChecklist.routes.ts
 * 
 *    Add:
 *    router.post('/items/:itemId/add-to-maintenance', authenticate, handleAddToMaintenance);
 *    router.delete('/items/:itemId/remove-from-maintenance', authenticate, handleRemoveFromMaintenance);
 * 
 * 3. UPDATE FRONTEND
 *    - Add "Add to Checklist" button to seasonal items
 *    - Call POST /api/seasonal-checklist/items/:itemId/add-to-maintenance
 *    - Show "Added" state when hasMaintenanceTask is true
 *    - Allow removal with DELETE endpoint
 * 
 * 4. TEST
 *    - Create seasonal checklist for EXISTING_OWNER property
 *    - Click "Add to Checklist" on seasonal item
 *    - Verify PropertyMaintenanceTask created
 *    - Verify seasonal item status = 'ADDED'
 *    - Verify item shows "Added" in UI
 *    - Test removal functionality
 * 
 * 5. VERIFY SEGMENT RESTRICTION
 *    - Try with HOME_BUYER property
 *    - Should get error: "only available for existing homeowners"
 */