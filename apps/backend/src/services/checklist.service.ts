// apps/backend/src/services/checklist.service.ts
// Complete working version - copy this entire file

import {
  PrismaClient,
  Checklist,
  ChecklistItemStatus, // --- FIX: Import the enum ---
  ServiceCategory,
} from '@prisma/client';
import { ChecklistItem } from '@prisma/client';

const prisma = new PrismaClient();

// --- NEW HELPER FUNCTION ---
/**
 * Calculates the next due date based on a frequency string.
 * @param frequency - e.g., "annually", "semi-annually", "monthly"
 * @returns A Date object for the next due date.
 */
const calculateNextDueDate = (
  frequency: string | null,
  startDate: Date = new Date()
): Date => {
  const nextDate = new Date(startDate);
  switch (frequency) {
    case 'annually':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    case 'semi-annually':
      nextDate.setMonth(nextDate.getMonth() + 6);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    default:
      // Default to one year if frequency is null or unknown
      nextDate.setFullYear(nextDate.getFullYear() + 1);
  }
  return nextDate;
};
// --- END HELPER FUNCTION ---

// Define type for the itemsToCreate array
interface ChecklistItemTemplate {
  title: string;
  description?: string | null;
  serviceCategory: ServiceCategory | null;
  sortOrder: number;
}

export class ChecklistService {
  /**
   * Get or create a checklist for a user.
   * If a checklist doesn't exist, one is created based on the user's segment.
   */
  static async getOrCreateChecklist(userId: string): Promise<Checklist | null> {
    const existingChecklist = await prisma.checklist.findFirst({
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

    if (existingChecklist) {
      return existingChecklist;
    }

    // No checklist found, create one
    return this.createChecklist(userId);
  }

  /**
   * Create a new checklist for a user based on their segment.
   */
  static async createChecklist(userId: string): Promise<Checklist | null> {
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
      // Items will be added by the new maintenance setup flow.
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
            // --- FIX: Use the enum ---
            status: ChecklistItemStatus.PENDING,
            // --- END FIX ---
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

    return newChecklist;
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
      // --- FIX: Use the enum ---
      status: ChecklistItemStatus.PENDING,
      // --- END FIX ---
      isRecurring: true,
      frequency: template.defaultFrequency,
      nextDueDate: calculateNextDueDate(template.defaultFrequency),
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
        // --- FIX: Use the enum ---
        status: ChecklistItemStatus.PENDING,
        // --- END FIX ---
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