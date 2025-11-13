import {
    PrismaClient,
    ChecklistItemStatus,
    HomeownerSegment,
  } from '@prisma/client';
  
  const prisma = new PrismaClient();
  
  /**
   * Defines the default checklist items for a new home buyer.
   * The `serviceCategory` is a string that will be used by the frontend
   * to pre-filter the provider search (e.g., "INSPECTION", "ATTORNEY", "MOVERS").
   */
  const DEFAULT_CHECKLIST_ITEMS = [
    {
      title: 'Secure Pre-Approval / Mortgage',
      description:
        "Get your finances in order. This is a crucial first step, unless you're a cash buyer.",
      serviceCategory: null,
    },
    {
      title: 'Hire Real Estate Attorney',
      description:
        'Find a legal expert to review contracts and guide the closing.',
      serviceCategory: 'ATTORNEY', // Custom string for FE filtering
    },
    {
      title: 'Schedule Home Inspection',
      description:
        'Essential for identifying potential issues with the property.',
      serviceCategory: 'INSPECTION', // Matches the ServiceCategory enum, but as a string
    },
    {
      title: 'Obtain Homeowners Insurance',
      description:
        'Get quotes and select a policy to be active by closing day.',
      serviceCategory: 'INSURANCE', // Custom string for FE filtering
    },
    {
      title: 'Schedule Appraisal',
      description:
        "Your lender will typically coordinate this to assess the home's value.",
      serviceCategory: null,
    },
    {
      title: 'Coordinate Moving Services',
      description: 'Book movers well in advance of your closing date.',
      serviceCategory: 'MOVERS', // Custom string for FE filtering
    },
    {
      title: 'Setup Utilities',
      description:
        'Schedule activation for electric, water, gas, and internet for your move-in date.',
      serviceCategory: null,
    },
    {
      title: 'Final Walkthrough',
      description: 'A final check of the property 24-48 hours before closing.',
      serviceCategory: null,
    },
    {
      title: 'Closing Day!',
      description: 'Sign all the final paperwork and get your keys!',
      serviceCategory: null,
    },
  ];
  
  /**
   * Finds the user's checklist. If the user is a HOME_BUYER and doesn't
   * have one, a new checklist is created and populated with default items.
   */
  const findOrCreateChecklistForUser = async (userId: string) => {
    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId },
    });
  
    if (!homeownerProfile) {
      throw new Error('Homeowner profile not found.');
    }
  
    // Only create checklists for home buyers
    if (homeownerProfile.segment !== HomeownerSegment.HOME_BUYER) {
      return null;
    }
  
    // Try to find an existing checklist
    const existingChecklist = await prisma.checklist.findUnique({
      where: {
        homeownerProfileId: homeownerProfile.id,
      },
      include: {
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  
    if (existingChecklist) {
      return existingChecklist;
    }
  
    // No checklist exists, so create one with default items
    const newChecklist = await prisma.checklist.create({
      data: {
        homeownerProfileId: homeownerProfile.id,
        items: {
          create: DEFAULT_CHECKLIST_ITEMS,
        },
      },
      include: {
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  
    return newChecklist;
  };
  
  /**
   * Fetches a user's checklist by their user ID.
   * This function assumes the checklist might already exist.
   */
  const getChecklistByUserId = async (userId: string) => {
    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId },
    });
  
    if (!homeownerProfile) {
      throw new Error('Homeowner profile not found.');
    }
  
    const checklist = await prisma.checklist.findUnique({
      where: {
        homeownerProfileId: homeownerProfile.id,
      },
      include: {
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  
    return checklist;
  };
  
  /**
   * Updates the status of a specific checklist item.
   * Critically, it verifies that the item belongs to the user making the request.
   */
  const updateChecklistItemStatus = async (
    userId: string,
    itemId: string,
    status: ChecklistItemStatus
  ) => {
    // First, verify the user owns this item
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
      // This is a 404 or 403 error.
      // The item doesn't exist OR the user doesn't own it.
      throw new Error('Checklist item not found or access denied.');
    }
  
    // If ownership is confirmed, update the item
    const updatedItem = await prisma.checklistItem.update({
      where: {
        id: itemId,
      },
      data: {
        status: status,
      },
    });
  
    return updatedItem;
  };
  
  export const checklistService = {
    findOrCreateChecklistForUser,
    getChecklistByUserId,
    updateChecklistItemStatus,
  };