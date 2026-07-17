// apps/backend/src/sellerPrep/sellerPrep.service.ts
import { prisma } from '../lib/prisma';
import { generateRoiChecklist } from './engines/roiRules.engine';
import { resolveCompsProvider } from './providers/compsResolver';
import { buildSellerReadinessReport } from './reports/sellerReadiness.builder';
import { calculateBudgetAndValue } from './engines/valueCalculator.engine';
import { personalizeChecklist, generatePersonalizedSummary, ChecklistItem, UserPreferences } from './engines/personalization.engine';
import { resolvePropertyAccess, ROLE_RANK } from '../services/propertyAccess.service';
import { getPlanningContextEnvelope, getPlanningContextDecisions } from '../services/planningContext/context';
import { knownContextValue } from '../services/propertyContextDecision';

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
    context: Awaited<ReturnType<typeof getPlanningContextEnvelope>>;
  }> {
    // Verify access: owner OR household collaborator (CONTRIBUTOR/VIEWER), not owner-only.
    const access = await resolvePropertyAccess(userId, propertyId);
    if (!access) {
      throw new Error('Property not found or unauthorized');
    }

    // Canonical dwelling/location/open-work context (single applicability policy).
    const planning = await getPlanningContextDecisions(propertyId, userId, 'SELLER_PREP');
    const dwellingType = knownContextValue<string>(planning.context, 'core.dwellingType');
    const state = knownContextValue<string>(planning.context, 'location.state');
    const yearBuilt = knownContextValue<number>(planning.context, 'core.yearBuilt');

    let plan = await prisma.sellerPrepPlan.findFirst({
      where: { userId, propertyId },
      include: {
        items: true,
        interviews: true // NEW: Include agent interviews
      },
    });

    if (!plan) {
      const baseItems = generateRoiChecklist({
        propertyType: dwellingType && dwellingType !== 'UNKNOWN' ? dwellingType : undefined,
        yearBuilt: yearBuilt ?? undefined,
        state: state ?? '',
      });

      plan = await prisma.sellerPrepPlan.create({
        data: {
          userId,
          propertyId,
          contextVersion: planning.contextVersion,
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
  
    const contextEnvelope = await getPlanningContextEnvelope(
      propertyId,
      userId,
      'SELLER_PREP',
      plan.contextVersion,
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
      context: contextEnvelope,
    };
  }

  static async updateItemStatus(
    userId: string,
    itemId: string,
    status: 'PLANNED' | 'DONE' | 'SKIPPED'
  ) {
    const item = await prisma.sellerPrepPlanItem.findUnique({
      where: { id: itemId },
      include: { plan: true },
    });

    if (!item) {
      throw new Error('Item not found');
    }

    // Verify access: owner OR household collaborator (CONTRIBUTOR+), not unauthenticated/no check.
    const access = await resolvePropertyAccess(userId, item.plan.propertyId);
    if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) {
      throw new Error('Item not found or unauthorized');
    }

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
    // Verify access: owner OR household collaborator (CONTRIBUTOR/VIEWER), not owner-only.
    const access = await resolvePropertyAccess(userId, propertyId);
    if (!access) {
      throw new Error('Property not found');
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        city: true,
        state: true,
        zipCode: true,
        dwellingType: true,
      },
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const dwellingType = property.dwellingType !== 'UNKNOWN' ? String(property.dwellingType) : undefined;

    const provider = resolveCompsProvider({
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
      propertyType: dwellingType,
    });

    return provider.getComparables({
      city: property.city,
      state: property.state,
      zip: property.zipCode,
      propertyType: dwellingType,
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