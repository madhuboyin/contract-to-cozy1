// apps/backend/src/services/checklist.service.ts

import {
  PrismaClient,
  Checklist,
  ChecklistItemStatus, 
  ServiceCategory,
  Prisma,
  ChecklistItem,
  RecurrenceFrequency,
} from '@prisma/client';
import { MaintenanceTaskConfig } from '../types/maintenance.types';
import { prisma } from '../lib/prisma';
import SeasonalChecklistService from './seasonalChecklist.service';

// --- START HELPER FUNCTIONS ---

/**
 * Calculates the next due date based on a frequency string.
 * @param frequency - e.g., "ANNUALLY", "SEMI_ANNUALLY", "MONTHLY"
 * @returns A Date object for the next due date.
 */
const calculateNextDueDate = (
  frequency: string | null,
  startDate: Date = new Date()
): Date => {
  const nextDate = new Date(startDate);
  switch (frequency) {
    case 'ANNUALLY':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    case 'SEMI_ANNUALLY':
      nextDate.setMonth(nextDate.getMonth() + 6);
      break;
    case 'QUARTERLY':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    default:
      // Default to one year if frequency is null or unknown
      nextDate.setFullYear(nextDate.getFullYear() + 1);
  }
  return nextDate;
};


/**
 * Synchronizes renewal tasks (Warranties, Insurance Policies) with the user's checklist.
 * Ensures an active, pending checklist item exists for every unexpired renewal.
 * @param userId The ID of the user.
 * @param checklistId The ID of the user's checklist.
 */
const syncRenewalTasks = async (userId: string, checklistId: string): Promise<void> => {
    const renewalItemsToCreate: Prisma.ChecklistItemCreateManyInput[] = [];
    const now = new Date();

    // 1. Fetch all active renewals and existing renewal tasks concurrently.
    const [warranties, policies, existingRenewalItems] = await Promise.all([
        prisma.warranty.findMany({
            where: { homeownerProfile: { userId } },
            select: { id: true, providerName: true, policyNumber: true, expiryDate: true },
        }),
        prisma.insurancePolicy.findMany({
            where: { homeownerProfile: { userId } },
            select: { id: true, carrierName: true, policyNumber: true, expiryDate: true },
        }),
        prisma.checklistItem.findMany({
            where: {
                checklistId,
                serviceCategory: { in: [ServiceCategory.WARRANTY, ServiceCategory.INSURANCE] },
                status: ChecklistItemStatus.PENDING,
            }
        })
    ]);

    // 2. Process Warranties
    warranties.forEach(w => {
        // Only generate tasks for items not yet expired
        if (w.expiryDate > now) {
            const title = `Renew Warranty: ${w.providerName}`;
            // Use policyNumber for a unique description/identifier
            const description = `Policy ${w.policyNumber} expires on ${w.expiryDate.toISOString().split('T')[0]}.`;
            
            // Avoid creating a duplicate pending task (check against existing items)
            const isDuplicate = existingRenewalItems.some(item => 
                item.serviceCategory === ServiceCategory.WARRANTY && 
                item.title === title &&
                // Compare dates by timestamp to avoid object reference issues
                item.nextDueDate?.getTime() === w.expiryDate.getTime()
            );

            if (!isDuplicate) {
                renewalItemsToCreate.push({
                    checklistId,
                    title,
                    description,
                    serviceCategory: ServiceCategory.WARRANTY,
                    status: ChecklistItemStatus.PENDING,
                    nextDueDate: w.expiryDate,
                    isRecurring: true, 
                    frequency: 'ANNUALLY', // Default frequency for renewals
                    sortOrder: 100,
                });
            }
        }
    });

    // 3. Process Insurance Policies
    policies.forEach(p => {
        if (p.expiryDate > now) {
            const title = `Renew Insurance: ${p.carrierName}`;
            const description = `Policy ${p.policyNumber} expires on ${p.expiryDate.toISOString().split('T')[0]}.`;

            const isDuplicate = existingRenewalItems.some(item => 
                item.serviceCategory === ServiceCategory.INSURANCE && 
                item.title === title &&
                item.nextDueDate?.getTime() === p.expiryDate.getTime()
            );

            if (!isDuplicate) {
                renewalItemsToCreate.push({
                    checklistId,
                    title,
                    description,
                    serviceCategory: ServiceCategory.INSURANCE,
                    status: ChecklistItemStatus.PENDING,
                    nextDueDate: p.expiryDate,
                    isRecurring: true,
                    frequency: 'ANNUALLY', // Default frequency for renewals
                    sortOrder: 110,
                });
            }
        }
    });

    // 4. Create new items
    if (renewalItemsToCreate.length > 0) {
        await prisma.checklistItem.createMany({
            data: renewalItemsToCreate,
            skipDuplicates: true,
        });
    }
};
// --- END HELPER FUNCTIONS ---


// Define type for the itemsToCreate array
interface ChecklistItemTemplate {
  title: string;
  description?: string | null;
  serviceCategory: ServiceCategory | null;
  sortOrder: number;
}

export class ChecklistService {
  /**
   * Get or create a checklist for a user. (MODIFIED)
   * If a checklist doesn't exist, one is created based on the user's segment.
   * Also performs a sync to ensure all active renewal tasks are present.
   */
  static async getOrCreateChecklist(userId: string): Promise<Checklist & { items: ChecklistItem[] } | null> {
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
      // No checklist found, create one
      checklist = await this.createChecklist(userId);
    }
    
    if (checklist) {
        // FIX: Wrap the sync call in a try-catch block to prevent a database/serialization error 
        // from crashing the entire checklist retrieval.
        try {
            await syncRenewalTasks(userId, checklist.id);
        } catch (syncError) {
            console.error('WARNING: Failed to synchronize renewal tasks. Checklist data may be incomplete.', syncError);
            // Allow the process to continue by ignoring the non-critical sync error
        }

        // 2. Refetch the checklist WITH the items include clause
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
        
        // This finalChecklist will now satisfy the return type
        return finalChecklist as (Checklist & { items: ChecklistItem[] }) | null;
    }

    return null;
  }

  /**
   * Create a new checklist for a user based on their segment.
   */
  static async createChecklist(userId: string): Promise<Checklist & { items: ChecklistItem[] } | null> {
    // Get user's segment
    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId },
      select: { id: true, segment: true },
    });

    if (!homeownerProfile) {
      throw new Error('Homeowner profile not found for this user.');
    }

    const segment = homeownerProfile?.segment || 'EXISTING_OWNER';

    let itemsToCreate: ChecklistItemTemplate[] = [];

    if (segment === 'HOME_BUYER') {
      // HOME_BUYER checklist is unaffected
      itemsToCreate = [
        {
          title: 'Schedule a Home Inspection',
          serviceCategory: 'INSPECTION',
          sortOrder: 1,
        },
        {
          title: 'Secure Financing',
          description: 'Finalize your mortgage details with your lender.',
          serviceCategory: null,
          sortOrder: 2,
        },
        {
          title: 'Get a Home Appraisal',
          description: 'Your lender will typically order this.',
          serviceCategory: null,
          sortOrder: 3,
        },
        {
          title: 'Obtain Homeowners Insurance',
          serviceCategory: 'INSURANCE',
          sortOrder: 4,
        },
        {
          title: 'Review Closing Disclosure',
          description:
            'Check all loan terms, fees, and closing costs 3 days before closing.',
          serviceCategory: null,
          sortOrder: 5,
        },
        {
          title: 'Final Walk-Through',
          description:
            'Visit the property 24 hours before closing to ensure it is in the agreed-upon condition.',
          serviceCategory: null,
          sortOrder: 6,
        },
        {
          title: 'Coordinate Moving Services',
          serviceCategory: 'MOVING',
          sortOrder: 7,
        },
        {
          title: 'Set Up Utilities',
          description:
            'Schedule activation for water, electric, gas, and internet.',
          serviceCategory: null,
          sortOrder: 8,
        },
      ];
    } else {
      // EXISTING_OWNERs now get an EMPTY checklist by default.
      itemsToCreate = [];
    }

    // Create the checklist
    const newChecklist = await prisma.checklist.create({
      data: {
        homeownerProfileId: homeownerProfile.id,
        items: {
          create: itemsToCreate.map((item) => ({
            title: item.title,
            description: item.description,
            serviceCategory: item.serviceCategory,
            status: ChecklistItemStatus.PENDING,
            sortOrder: item.sortOrder,
            isRecurring: false, // Default one-time items
          })),
        },
      },
      include: {
        items: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    return newChecklist as (Checklist & { items: ChecklistItem[] }) | null;
  }

  // --- NEW FUNCTION for Phase 3 ---
  /**
   * Adds new recurring maintenance items to a user's checklist.
   * @param userId The ID of the user.
   * @param templateIds An array of MaintenanceTaskTemplate IDs to add.
   * @param propertyId Optional property ID to associate tasks with.
   */
  static async addMaintenanceItemsToChecklist(
    userId: string,
    templateIds: string[],
    propertyId?: string
  ): Promise<{ count: number }> {
    // 1. Get the user's checklist (or create one if it doesn't exist)
    const checklist = await this.getOrCreateChecklist(userId);
    if (!checklist) {
      throw new Error('Could not find or create a checklist for the user.');
    }

    // 2. Fetch the templates the user selected
    const templates = await prisma.maintenanceTaskTemplate.findMany({
      where: {
        id: { in: templateIds },
        isActive: true,
      },
    });

    if (templates.length === 0) {
      return { count: 0 }; // Nothing to add
    }

    // 3. Transform templates into new checklist items
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
      propertyId: propertyId || null, // FIX: Include propertyId
    }));

    // 4. Create all new items in the database
    const result = await prisma.checklistItem.createMany({
      data: newItemsData,
      skipDuplicates: true, // Prevents errors if user adds the same item twice
    });

    return { count: result.count };
  }
  // --- END NEW FUNCTION ---

  // --- NEW FUNCTION FOR PHASE 1 ---
  /**
   * Creates multiple custom maintenance items from a user-defined config.
   * @param userId The ID of the user.
   * @param tasks An array of MaintenanceTaskConfig objects.
   */
  static async createCustomMaintenanceItems(
    userId: string,
    tasks: MaintenanceTaskConfig[]
  ): Promise<{ count: number }> {
    // 1. Get the user's checklist (or create one)
    const checklist = await this.getOrCreateChecklist(userId);
    if (!checklist) {
      throw new Error('Could not find or create a checklist for the user.');
    }

    // 2. Transform the user's config into new checklist items
    const newItemsData: Prisma.ChecklistItemCreateManyInput[] = tasks.map((task, index) => ({
      checklistId: checklist.id,
      title: task.title,
      description: task.description,
      serviceCategory: task.serviceCategory,
      status: ChecklistItemStatus.PENDING,
      
      // Use the custom values from the user
      isRecurring: task.isRecurring,
      frequency: task.isRecurring ? task.frequency : null,
      nextDueDate: task.isRecurring ? task.nextDueDate : null,
      
      // FIX: Include propertyId from the task config
      propertyId: task.propertyId || null,
      
      // Set sort order based on the array order
      sortOrder: index, 
    }));

    // 3. Create all new items in the database
    const result = await prisma.checklistItem.createMany({
      data: newItemsData,
    });

    return { count: result.count };
  }
  // --- END NEW FUNCTION ---

  /**
   * Update the status of a specific checklist item.
   */
/**
 * Update the status of a specific checklist item.
 * ✅ NOW WITH SEASONAL SYNC
 */
/**
 * Update the status of a specific checklist item.
 * ✅ NOW WITH SEASONAL SYNC
 */
static async updateChecklistItemStatus(
  userId: string,
  itemId: string,
  status: ChecklistItemStatus
): Promise<ChecklistItem> {
  // First, verify the checklist item belongs to the user
  const item = await prisma.checklistItem.findFirst({
    where: {
      id: itemId,
      checklist: {
        homeownerProfile: {
          userId: userId,
        },
      },
    },
    // ✅ ADD THIS: Include seasonal link
    include: {
      seasonalChecklistItem: true,
    },
  });

  if (!item) {
    throw new Error('Checklist item not found or user does not have access.');
  }

  let dataToUpdate: any = { status: status };

  if (item.isRecurring && status === 'COMPLETED') {
    // If a recurring item is "completed", reset its due date for the next cycle
    dataToUpdate = {
      status: ChecklistItemStatus.PENDING,
      lastCompletedDate: new Date(),
      nextDueDate: calculateNextDueDate(item.frequency),
    };
  }

  // Update the item
  const updatedItem = await prisma.checklistItem.update({
    where: {
      id: itemId,
    },
    data: dataToUpdate,
    // ✅ ADD THIS: Include seasonal items in response
    include: {
      seasonalChecklistItem: true,
    },
  });

  // ============================================================================
  // ✅ NEW: SYNC TO SEASONAL TABLES
  // ============================================================================
  if (updatedItem.seasonalChecklistItem) {
    console.log(`📅 Syncing seasonal status for task ${itemId}`);
    
    const seasonalItem = updatedItem.seasonalChecklistItem;
    
    try {
      if (status === 'COMPLETED') {
        // Import at top of file: import SeasonalChecklistService from './seasonalChecklist.service';
        await SeasonalChecklistService.markTaskCompleted(seasonalItem.id);
        console.log(`✅ Marked seasonal item ${seasonalItem.id} as completed`);
      } else if (status === ChecklistItemStatus.PENDING && seasonalItem.status === 'COMPLETED') {
        // Call the new uncomplete method (see Fix #2)
        await SeasonalChecklistService.markTaskUncompleted(seasonalItem.id);
        console.log(`🔄 Unmarked seasonal item ${seasonalItem.id} as completed`);
      }
    } catch (syncError) {
      // Log but don't fail the whole operation
      console.error(`❌ Failed to sync seasonal item ${seasonalItem.id}:`, syncError);
    }
  }
  // ============================================================================

  return updatedItem;
}

    /**
   * Update configuration of a checklist item (not just status).
   * @param userId The ID of the user.
   * @param itemId The ID of the checklist item to update.
   * @param data Partial data to update (title, description, isRecurring, frequency, nextDueDate, serviceCategory).
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
    // 1. Verify the checklist item belongs to the user for security
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

    // 2. Update the item with the provided data
    const updatedItem = await prisma.checklistItem.update({
      where: {
        id: itemId,
      },
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
   * Creates a single checklist item directly without using templates.
   * Used by orchestration/action center.
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
      actionKey: string; // 🔑 NEW - REQUIRED
    }
  ): Promise<{ item: ChecklistItem; deduped: boolean }> {

    // 1️⃣ Hard validation
    if (!itemData.actionKey) {
      throw new Error('actionKey is required for Action Center checklist items');
    }

    // 2️⃣ Get checklist
    const checklist = await this.getOrCreateChecklist(userId);
    if (!checklist) {
      throw new Error('Could not find or create checklist for user');
    }

    // 3️⃣ FAST PATH - check existing by actionKey
    const existing = await prisma.checklistItem.findFirst({
      where: {
        propertyId: itemData.propertyId,
        actionKey: itemData.actionKey,
      },
    });

    if (existing) {
      return { item: existing, deduped: true };
    }

    // 4️⃣ CREATE (race-safe)
    try {
      const created = await prisma.checklistItem.create({
        data: {
          checklistId: checklist.id,
          title: itemData.title,
          description: itemData.description ?? null,
          serviceCategory: itemData.serviceCategory as any,
          status: ChecklistItemStatus.PENDING,

          isRecurring: itemData.isRecurring,
          frequency: itemData.isRecurring
            ? (itemData.frequency as RecurrenceFrequency | null)
            : null,

          nextDueDate: new Date(itemData.nextDueDate),

          propertyId: itemData.propertyId,
          actionKey: itemData.actionKey, // 🔑 PRIMARY IDENTITY

          sortOrder: 999,
        },
      });

      return { item: created, deduped: false };

    } catch (err: any) {
      // 5️⃣ UNIQUE CONSTRAINT FALLBACK (P2002)
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
  
  // --- FIX: ADDED MISSING deleteChecklistItem METHOD ---
  /**
   * Deletes a specific checklist item.
   * @param userId The ID of the user.
   * @param itemId The ID of the checklist item to delete.
   */
  static async deleteChecklistItem(
    userId: string,
    itemId: string
  ): Promise<void> {
    // 1. Verify the checklist item belongs to the user for security
    const item = await prisma.checklistItem.findFirst({
      where: {
        id: itemId,
        checklist: {
          homeownerProfile: {
            userId: userId,
          },
        },
      },
      select: { id: true },
    });

    if (!item) {
      // This will throw a 404 in the controller, as designed
      throw new Error('Checklist item not found or user does not have access.');
    }

    // 2. Delete the item
    await prisma.checklistItem.delete({
      where: {
        id: itemId,
      },
    });
  }
  // --- END FIX ---
}