// apps/backend/src/sellerPrep/sellerPrep.service.ts
import { prisma } from '../lib/prisma';
import { resolveCompsProvider } from './providers/compsResolver';
import { buildSellerReadinessReport } from './reports/sellerReadiness.builder';
import { resolvePropertyAccess } from '../services/propertyAccess.service';
import { getPlanningContextEnvelope, getPlanningContextDecisions } from '../services/planningContext/context';

// The static per-property ROI checklist (generateRoiChecklist) and its
// personalization (personalizeChecklist/generatePersonalizedSummary) were
// retired — see HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_
// IMPLEMENTATION_PLAN.md Slice 8's "replace the static checklist" goal.
// SellerPrepPlan.items is never seeded anymore; PropertySaleCase's
// SaleReadinessItem projection (propertySaleCase.service.ts) is the real
// governed replacement. This shape is kept minimal purely so the plan
// record and its still-live features (agent interviews, comps, leads)
// keep working.
export interface ChecklistItem {
  id?: string;
  code: string;
  title: string;
  priority: string;
  roiRange: string;
  costBucket: string;
  status?: string;
}

export class SellerPrepService {
  static async getOverview(
    userId: string,
    propertyId: string
  ): Promise<{
    propertyId: string;
    saleIntentConfirmed: boolean;
    items: ChecklistItem[];
    completionPercent: number;
    preferences: any;
    personalizedSummary: string | null;
    interviews: any[]; // NEW: Added for agent comparison
    startDate: string | null;
    context: Awaited<ReturnType<typeof getPlanningContextEnvelope>>;
  }> {
    // Verify access: owner OR household collaborator (CONTRIBUTOR/VIEWER), not owner-only.
    const access = await resolvePropertyAccess(userId, propertyId);
    if (!access) {
      throw new Error('Property not found or unauthorized');
    }

    // Canonical dwelling/location/open-work context (single applicability policy).
    const planning = await getPlanningContextDecisions(propertyId, userId, 'SELLER_PREP');

    let plan = await prisma.sellerPrepPlan.findFirst({
      where: { userId, propertyId },
      include: {
        items: true,
        interviews: true // NEW: Include agent interviews
      },
    });

    // Require confirmed sale intent (Property.propertyUse === 'FOR_SALE')
    // before ever creating a plan — a plan silently appearing the first time
    // this page is opened, regardless of whether the homeowner is actually
    // selling, is exactly the kind of unconfirmed-intent gap
    // HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
    // Slice 8 calls out. Once a plan exists, keep serving it even if
    // propertyUse later changes — revoking an in-progress plan would be
    // more jarring than useful, and this app has no real users to worry
    // about drifting property records yet.
    if (!plan) {
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { propertyUse: true },
      });
      if (property?.propertyUse !== 'FOR_SALE') {
        return {
          propertyId,
          saleIntentConfirmed: false,
          items: [],
          completionPercent: 0,
          preferences: null,
          personalizedSummary: null,
          interviews: [],
          startDate: null,
          context: await getPlanningContextEnvelope(propertyId, userId, 'SELLER_PREP', null),
        };
      }
    }

    if (!plan) {
      // No item-seeding — the static ROI checklist is retired (Slice 8).
      // The plan row still exists to host agent interviews and comps
      // context for this property.
      plan = await prisma.sellerPrepPlan.create({
        data: {
          userId,
          propertyId,
          contextVersion: planning.contextVersion,
        },
        include: { items: true, interviews: true },
      });
    }

    const preferences = plan.preferences as any;

    const contextEnvelope = await getPlanningContextEnvelope(
      propertyId,
      userId,
      'SELLER_PREP',
      plan.contextVersion,
    );

    return {
      propertyId,
      saleIntentConfirmed: true,
      items: [],
      completionPercent: 0,
      preferences,
      personalizedSummary: null,
      interviews: plan.interviews || [], // NEW: Return saved interviews
      startDate: plan.createdAt.toISOString(),
      context: contextEnvelope,
    };
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
    consentGiven: boolean;
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
        consentGiven: input.consentGiven,
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
