// apps/backend/src/sellerPrep/sellerPrep.service.ts
import { prisma } from '../lib/prisma';
import { generateRoiChecklist } from './engines/roiRules.engine';
import { resolveCompsProvider } from './providers/compsResolver';
import { buildSellerReadinessReport } from './reports/sellerReadiness.builder';
import { calculateBudgetAndValue } from './engines/valueCalculator.engine';
import { personalizeChecklist, generatePersonalizedSummary, ChecklistItem, UserPreferences } from './engines/personalization.engine';

export class SellerPrepService {
  static async getOverview(
    userId: string,
    propertyId: string
  ): Promise<{
    propertyId: string;
    items: ChecklistItem[];
    completionPercent: number;
    preferences: UserPreferences | null;
    personalizedSummary: string | null;
    budget: any;
    value: any;
    startDate: string; // ADDED for timeline
  }> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      select: { id: true, state: true, yearBuilt: true, propertyType: true },
    });
  
    if (!property) {
      throw new Error('Property not found or unauthorized');
    }
  
    let plan = await prisma.sellerPrepPlan.findFirst({
      where: { userId, propertyId },
      include: { items: true },
    });
  
    if (!plan) {
      const baseItems = generateRoiChecklist({
        propertyType: property.propertyType ? String(property.propertyType) : undefined,
        yearBuilt: property.yearBuilt ?? undefined,
        state: property.state,
      });
  
      plan = await prisma.sellerPrepPlan.create({
        data: {
          userId,
          propertyId,
          items: {
            create: baseItems.map((i) => ({
              code: i.code,
              title: i.title,
              priority: i.priority,
              roiRange: i.roiRange,
              costBucket: i.costBucket,
              status: 'PLANNED',
            })),
          },
        },
        include: { items: true },
      });
    }
  
    const total = plan.items.length;
    const done = plan.items.filter((i: any) => i.status === 'DONE').length;
    const completionPercent = total ? Math.round((done / total) * 100) : 0;
  
    // UPDATED: Map items to include timeline fields
    const itemsWithTimestamps = plan.items.map((item: any) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      priority: item.priority,
      roiRange: item.roiRange,
      costBucket: item.costBucket,
      status: item.status,
      completedAt: item.completedAt,  // ADDED
      skippedAt: item.skippedAt,      // ADDED
      createdAt: item.createdAt,      // ADDED
    }));

    // Apply personalization if preferences exist
    const preferences = plan.preferences as any;
    const personalizedItems: ChecklistItem[] = preferences
      ? personalizeChecklist(itemsWithTimestamps as ChecklistItem[], preferences)
      : (itemsWithTimestamps as ChecklistItem[]);
  
    // Generate personalized summary
    const personalizedSummary = preferences
      ? generatePersonalizedSummary(preferences, completionPercent)
      : null;
  
    // Calculate budget and value estimates
    const budgetAndValue = calculateBudgetAndValue(
      plan.items as any[],
      preferences?.budget
    );
  
    return {
      propertyId,
      items: personalizedItems,
      completionPercent,
      preferences,
      personalizedSummary,
      budget: budgetAndValue.budget,
      value: budgetAndValue.value,
      startDate: plan.createdAt.toISOString(), // ADDED for timeline
    };
  }

  static async updateItemStatus(
    userId: string,
    itemId: string,
    status: 'PLANNED' | 'DONE' | 'SKIPPED'
  ) {
    // UPDATED: Set timestamps based on status
    const updateData: any = { status };
    
    if (status === 'DONE') {
      updateData.completedAt = new Date();
      updateData.skippedAt = null;
    } else if (status === 'SKIPPED') {
      updateData.skippedAt = new Date();
      updateData.completedAt = null;
    } else if (status === 'PLANNED') {
      updateData.completedAt = null;
      updateData.skippedAt = null;
    }

    return prisma.sellerPrepPlanItem.update({
      where: { id: itemId },
      data: updateData,
    });
  }

  static async getComparables(userId: string, propertyId: string) {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      select: {
        city: true,
        state: true,
        zipCode: true,
        propertyType: true,
      },
    });
  
    if (!property) {
      throw new Error('Property not found');
    }
  
    const provider = resolveCompsProvider({
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
      propertyType: property.propertyType ? String(property.propertyType) : undefined,
    });
  
    return provider.getComparables({
      city: property.city,
      state: property.state,
      zip: property.zipCode,
      propertyType: property.propertyType ? String(property.propertyType) : undefined,
    });
  } 

  static async getSellerReadinessReport(
    userId: string,
    propertyId: string
  ) {
    return buildSellerReadinessReport(userId, propertyId);
  }  
}

export class SellerPrepLeadService {
  static async createLead(input: {
    userId: string;
    propertyId: string;
    leadType: string;
    context: string;
    fullName?: string;
    email?: string;
    phone?: string;
    contactMethod?: string;
  }) {
    return prisma.sellerPrepLead.create({
      data: {
        userId: input.userId,
        propertyId: input.propertyId,
        leadType: input.leadType,
        context: input.context,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        contactMethod: input.contactMethod,
      },
    });
  }

  // Optional: Add method to retrieve leads for admin dashboard
  static async getLeadsByProperty(propertyId: string) {
    return prisma.sellerPrepLead.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getAllLeads(filters?: {
    leadType?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    return prisma.sellerPrepLead.findMany({
      where: {
        ...(filters?.leadType && { leadType: filters.leadType }),
        ...(filters?.startDate && {
          createdAt: { gte: filters.startDate },
        }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}