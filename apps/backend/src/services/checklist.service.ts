// apps/backend/src/services/checklist.service.ts
// Complete working version - copy this entire file

import {
  PrismaClient,
  Checklist,
  ChecklistItemStatus, 
  ServiceCategory,
  Prisma,
  ChecklistItem,
} from '@prisma/client';
import { MaintenanceTaskConfig } from '../types/maintenance.types';

const prisma = new PrismaClient();

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

    console.log(`DEBUG: syncRenewalTasks running for checklist ID: ${checklistId}`); // DEBUG A

    // 1. Fetch all active renewals and existing renewal tasks concurrently.
    // NOTE: These queries are minimalist and should not trigger Decimal conversion errors.
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

    console.log(`DEBUG: Renewals fetched. Warranties: ${warranties.length}, Policies: ${policies.length}, Existing Items: ${existingRenewalItems.length}`); // DEBUG B

    // 2. Process Warranties
    warranties.forEach(w => {
        // FIX: Ensure expiryDate is a valid Date object before comparison
        if (w.expiryDate && w.expiryDate instanceof Date && w.expiryDate > now) {
            const title = `Renew Warranty: ${w.providerName}`;
            // Use policyNumber for a unique description/identifier
            const description = `Policy ${w.policyNumber} expires on ${w.expiryDate.toISOString().split('T')[0]}.`;
            
            // Check for duplicate pending task
            const isDuplicate = existingRenewalItems.some(item => {
                // Defensive check against null nextDueDate
                const existingDueDateMs = item.nextDueDate?.getTime();
                const renewalDueDateMs = w.expiryDate.getTime();
                
                return item.serviceCategory === ServiceCategory.WARRANTY && 
                       item.title === title &&
                       existingDueDateMs === renewalDueDateMs;
            });

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
        // FIX: Ensure expiryDate is a valid Date object before comparison
        if (p.expiryDate && p.expiryDate instanceof Date && p.expiryDate > now) {
            const title = `Renew Insurance: ${p.carrierName}`;
            const description = `Policy ${p.policyNumber} expires on ${p.expiryDate.toISOString().split('T')[0]}.`;

            const isDuplicate = existingRenewalItems.some(item => {
                // Defensive check against null nextDueDate
                const existingDueDateMs = item.nextDueDate?.getTime();
                const renewalDueDateMs = p.expiryDate.getTime();

                return item.serviceCategory === ServiceCategory.INSURANCE && 
                       item.title === title &&
                       existingDueDateMs === renewalDueDateMs;
            });

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

    console.log(`DEBUG: Renewal items ready to create: ${renewalItemsToCreate.length}`); // DEBUG C

    // 4. Create new items
    if (renewalItemsToCreate.length > 0) {
        await prisma.checklistItem.createMany({
            data: renewalItemsToCreate,
            skipDuplicates: true,
        });
        console.log(`DEBUG: Created ${renewalItemsToCreate.length} new renewal tasks.`); // DEBUG D
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
    try {
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
        console.log(`DEBUG: Checklist not found for user ${userId}. Creating new one.`); // DEBUG E
        checklist = await this.createChecklist(userId);
        }
        
        if (checklist) {
            // 1. Synchronize renewal tasks after fetching or creating
            await syncRenewalTasks(userId, checklist.id);

            // 2. Refetch the checklist WITH the items include clause (FIXED TYPE ERROR)
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
    } catch (error) {
        console.error('CRITICAL ERROR in getOrCreateChecklist (Checklist API):', error); // DEBUG F
        throw error;
    }
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
   */
  static async addMaintenanceItemsToChecklist(
    userId: string,
    templateIds: string[]
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
      
      // Use the custom values from the user
      isRecurring: true,
      frequency: template.defaultFrequency,
      nextDueDate: calculateNextDueDate(template.defaultFrequency),
      
      // Set sort order based on the array order
      sortOrder: template.sortOrder || 0,
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
    });

    return updatedItem;
  }
}