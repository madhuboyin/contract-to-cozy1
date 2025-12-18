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
  
    // Apply personalization if preferences exist
    const preferences = plan.preferences as any;
    const personalizedItems: ChecklistItem[] = preferences
      ? personalizeChecklist(plan.items as ChecklistItem[], preferences)
      : (plan.items as ChecklistItem[]);
  
    // Generate personalized summary
    const personalizedSummary = preferences
      ? generatePersonalizedSummary(preferences, completionPercent)
      : null;
  
    // NEW: Calculate budget and value estimates
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
      budget: budgetAndValue.budget, // NEW
      value: budgetAndValue.value,   // NEW
    };
  }

  static async updateItemStatus(
    userId: string,
    itemId: string,
    status: 'PLANNED' | 'DONE' | 'SKIPPED'
  ) {
    return prisma.sellerPrepPlanItem.update({
      where: { id: itemId },
      data: { status },
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