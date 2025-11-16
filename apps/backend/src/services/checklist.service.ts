// apps/backend/src/services/checklist.service.ts
// Complete working version - copy this entire file

import { PrismaClient, Checklist, ChecklistItemStatus } from '@prisma/client';
import { ChecklistItem } from '@prisma/client';

const prisma = new PrismaClient();

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
          orderBy: {
            sortOrder: 'asc',
          },
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

    // Define items
    let itemsToCreate = [];

    if (segment === 'HOME_BUYER') {
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
      // (EXISTING_OWNER) - Define a default checklist for existing owners
      itemsToCreate = [
        {
          title: 'Bi-Annual HVAC Maintenance',
          description: 'Schedule a check-up for your furnace and A/C.',
          serviceCategory: 'HVAC',
          sortOrder: 1,
        },
        {
          title: 'Gutter Cleaning',
          description: 'Clean gutters in the fall and spring.',
          serviceCategory: 'LANDSCAPING', // or HANDYMAN
          sortOrder: 2,
        },
        {
          title: 'Pest Control Inspection',
          description: 'Get an annual check for termites and other pests.',
          serviceCategory: 'PEST_CONTROL',
          sortOrder: 3,
        },
      ];
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
            status: 'PENDING',
            sortOrder: item.sortOrder,
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

    // Update the item
    const updatedItem = await prisma.checklistItem.update({
      where: {
        id: itemId,
      },
      data: {
        status: status,
      },
    });

    return updatedItem;
  }
}