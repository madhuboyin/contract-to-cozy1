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
    interviews: any[]; // NEW: Added for agent comparison
    startDate: string; 
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
      include: { 
        items: true,
        interviews: true // NEW: Include agent interviews
      },
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
        include: { items: true, interviews: true },
      });
    }
  
    const total = plan.items.length;
    const done = plan.items.filter((i: any) => i.status === 'DONE').length;
    const completionPercent = total ? Math.round((done / total) * 100) : 0;
  
    const itemsWithTimestamps = plan.items.map((item: any) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      priority: item.priority,
      roiRange: item.roiRange,
      costBucket: item.costBucket,
      status: item.status,
      completedAt: item.completedAt,
      skippedAt: item.skippedAt,
      createdAt: item.createdAt,
    }));

    const preferences = plan.preferences as any;
    const personalizedItems: ChecklistItem[] = preferences
      ? personalizeChecklist(itemsWithTimestamps as ChecklistItem[], preferences)
      : (itemsWithTimestamps as ChecklistItem[]);
  
    const personalizedSummary = preferences
      ? generatePersonalizedSummary(preferences, completionPercent)
      : null;
  
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
      interviews: plan.interviews || [], // NEW: Return saved interviews
      startDate: plan.createdAt.toISOString(),
    };
  }

  static async updateItemStatus(
    userId: string,
    itemId: string,
    status: 'PLANNED' | 'DONE' | 'SKIPPED'
  ) {
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

  /**
   * NEW: Persistence for Agent Interviews
   * Limits to 3 agents per plan
   */
  static async upsertAgentInterview(
    userId: string,
    planId: string,
    interviewData: {
      id?: string;
      agentName: string;
      notes?: any;
      totalScore?: number;
    }
  ) {
    // Verify plan ownership
    const plan = await prisma.sellerPrepPlan.findFirst({
      where: { id: planId, userId }
    });
    if (!plan) throw new Error('Plan not found or unauthorized');

    // Enforce max 3 agents constraint
    if (!interviewData.id) {
      const count = await prisma.agentInterview.count({ where: { planId } });
      if (count >= 3) throw new Error('Maximum of 3 agent comparisons allowed');
    }

    return prisma.agentInterview.upsert({
      where: { id: interviewData.id || 'placeholder-id' },
      create: {
        planId,
        agentName: interviewData.agentName,
        notes: interviewData.notes || {},
        totalScore: interviewData.totalScore || 0,
      },
      update: {
        agentName: interviewData.agentName,
        notes: interviewData.notes,
        totalScore: interviewData.totalScore,
      },
    });
  }

  /**
   * NEW: Remove an agent from the comparison matrix
   */
  static async deleteAgentInterview(userId: string, interviewId: string) {
    const interview = await prisma.agentInterview.findFirst({
      where: { 
        id: interviewId,
        plan: { userId } 
      }
    });

    if (!interview) throw new Error('Interview record not found');

    return prisma.agentInterview.delete({
      where: { id: interviewId }
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
    leadType: string; // Supports 'AGENT' for interview guide routing
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