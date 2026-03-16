// apps/backend/src/homeRenovationAdvisor/repository/advisorSession.repository.ts
//
// Prisma access helpers for Home Renovation Advisor sessions and child records.
// All DB mutations go through this module for consistency.

import { Prisma, RenovationAdvisorSessionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  EvaluationOutput,
  JurisdictionContext,
} from '../types/homeRenovationAdvisor.types';
import {
  CreateSessionInput,
  UpdateSessionInput,
} from '../types/homeRenovationAdvisor.types';

// ============================================================================
// SESSION INCLUDES (reusable for consistent shape)
// ============================================================================

const SESSION_FULL_INCLUDE = {
  permitOutput: {
    include: {
      permitTypes: { orderBy: { displayOrder: 'asc' as const } },
      inspectionStages: { orderBy: { displayOrder: 'asc' as const } },
    },
  },
  taxImpactOutput: true,
  licensingOutput: {
    include: {
      licenseCategories: { orderBy: { displayOrder: 'asc' as const } },
    },
  },
  assumptions: {
    where: { isUserVisible: true },
    orderBy: { displayOrder: 'asc' as const },
  },
  dataPoints: {
    where: { isUserVisible: true },
    orderBy: { displayOrder: 'asc' as const },
  },
  complianceChecklist: true,
} satisfies Prisma.HomeRenovationAdvisorSessionInclude;

export type SessionWithIncludes = Prisma.HomeRenovationAdvisorSessionGetPayload<{
  include: typeof SESSION_FULL_INCLUDE;
}>;

// ============================================================================
// CREATE SESSION
// ============================================================================

export async function createAdvisorSession(
  userId: string,
  input: CreateSessionInput,
  jurisdiction: JurisdictionContext,
  projectCostInput: number | null,
  projectCostSource: string,
  projectCostAssumptionNote: string | null,
): Promise<SessionWithIncludes> {
  return prisma.homeRenovationAdvisorSession.create({
    data: {
      propertyId: input.propertyId,
      createdByUserId: userId,
      status: RenovationAdvisorSessionStatus.DRAFT,
      renovationType: input.renovationType,
      entryPoint: input.entryPoint,
      flowType: input.flowType ?? 'EXPLICIT_PRE_PROJECT',
      jurisdictionLevel: jurisdiction.jurisdictionLevel,
      jurisdictionState: jurisdiction.state,
      jurisdictionCounty: jurisdiction.county,
      jurisdictionCity: jurisdiction.city,
      postalCode: jurisdiction.postalCode,
      normalizedJurisdictionKey: jurisdiction.normalizedJurisdictionKey,
      projectCostInput: projectCostInput
        ? new Prisma.Decimal(projectCostInput)
        : null,
      projectCostSource: projectCostSource as any,
      projectCostAssumptionNote,
      isRetroactiveCheck: input.isRetroactiveCheck ?? false,
      completedModificationReported: input.completedModificationReported ?? false,
      userConfirmedJurisdiction: input.userConfirmedJurisdiction ?? false,
      overallConfidence: 'UNAVAILABLE',
      overallRiskLevel: 'UNKNOWN',
    },
    include: SESSION_FULL_INCLUDE,
  });
}

// ============================================================================
// UPDATE SESSION INPUTS
// ============================================================================

export async function updateAdvisorSessionInputs(
  sessionId: string,
  updates: UpdateSessionInput,
  jurisdiction: JurisdictionContext | null,
): Promise<SessionWithIncludes> {
  const data: Prisma.HomeRenovationAdvisorSessionUpdateInput = {};

  if (updates.projectCostInput !== undefined) {
    data.projectCostInput = updates.projectCostInput !== null
      ? new Prisma.Decimal(updates.projectCostInput)
      : null;
    data.projectCostSource = updates.projectCostInput !== null ? 'USER_INPUT' : 'UNKNOWN';
  }

  if (updates.completedModificationReported !== undefined) {
    data.completedModificationReported = updates.completedModificationReported;
  }
  if (updates.userConfirmedJurisdiction !== undefined) {
    data.userConfirmedJurisdiction = updates.userConfirmedJurisdiction;
  }

  if (jurisdiction) {
    data.jurisdictionLevel = jurisdiction.jurisdictionLevel;
    data.jurisdictionState = jurisdiction.state;
    data.jurisdictionCounty = jurisdiction.county;
    data.jurisdictionCity = jurisdiction.city;
    data.postalCode = jurisdiction.postalCode;
    data.normalizedJurisdictionKey = jurisdiction.normalizedJurisdictionKey;
  }

  return prisma.homeRenovationAdvisorSession.update({
    where: { id: sessionId },
    data,
    include: SESSION_FULL_INCLUDE,
  });
}

// ============================================================================
// SAVE EVALUATION OUTPUTS (upsert pattern for re-runs)
// ============================================================================

export async function saveEvaluationOutputs(
  sessionId: string,
  output: EvaluationOutput,
): Promise<SessionWithIncludes> {
  await prisma.$transaction(async (tx) => {
    const { permit, taxImpact, licensing } = output;

    // --- Permit output (upsert 1:1) ---
    const permitRecord = await tx.homeRenovationPermitOutput.upsert({
      where: { advisorSessionId: sessionId },
      update: {
        requirementStatus: permit.requirementStatus,
        confidenceLevel: permit.confidenceLevel,
        confidenceReason: permit.confidenceReason,
        permitCostMin: permit.permitCostMin !== null ? new Prisma.Decimal(permit.permitCostMin) : null,
        permitCostMax: permit.permitCostMax !== null ? new Prisma.Decimal(permit.permitCostMax) : null,
        permitTimelineMinDays: permit.permitTimelineMinDays,
        permitTimelineMaxDays: permit.permitTimelineMaxDays,
        applicationPortalUrl: permit.applicationPortalUrl,
        applicationPortalLabel: permit.applicationPortalLabel,
        permitSummary: permit.permitSummary,
        dataAvailable: permit.dataAvailable,
        sourceType: permit.sourceType,
        sourceLabel: permit.sourceLabel,
        sourceReferenceUrl: permit.sourceReferenceUrl,
        sourceRefreshedAt: permit.sourceRefreshedAt,
        notes: permit.notes,
      },
      create: {
        advisorSessionId: sessionId,
        requirementStatus: permit.requirementStatus,
        confidenceLevel: permit.confidenceLevel,
        confidenceReason: permit.confidenceReason,
        permitCostMin: permit.permitCostMin !== null ? new Prisma.Decimal(permit.permitCostMin) : null,
        permitCostMax: permit.permitCostMax !== null ? new Prisma.Decimal(permit.permitCostMax) : null,
        permitTimelineMinDays: permit.permitTimelineMinDays,
        permitTimelineMaxDays: permit.permitTimelineMaxDays,
        applicationPortalUrl: permit.applicationPortalUrl,
        applicationPortalLabel: permit.applicationPortalLabel,
        permitSummary: permit.permitSummary,
        dataAvailable: permit.dataAvailable,
        sourceType: permit.sourceType,
        sourceLabel: permit.sourceLabel,
        sourceReferenceUrl: permit.sourceReferenceUrl,
        sourceRefreshedAt: permit.sourceRefreshedAt,
        notes: permit.notes,
      },
    });

    // Replace child permit type records
    await tx.homeRenovationPermitTypeRequirement.deleteMany({
      where: { permitOutputId: permitRecord.id },
    });
    if (permit.permitTypes.length > 0) {
      await tx.homeRenovationPermitTypeRequirement.createMany({
        data: permit.permitTypes.map((pt) => ({
          permitOutputId: permitRecord.id,
          permitType: pt.permitType,
          isRequired: pt.isRequired,
          confidenceLevel: pt.confidenceLevel,
          note: pt.note,
          displayOrder: pt.displayOrder,
        })),
      });
    }

    // Replace child inspection stage records
    await tx.homeRenovationInspectionStage.deleteMany({
      where: { permitOutputId: permitRecord.id },
    });
    if (permit.inspectionStages.length > 0) {
      await tx.homeRenovationInspectionStage.createMany({
        data: permit.inspectionStages.map((s) => ({
          permitOutputId: permitRecord.id,
          inspectionStageType: s.inspectionStageType,
          isLikelyRequired: s.isLikelyRequired,
          note: s.note,
          displayOrder: s.displayOrder,
        })),
      });
    }

    // --- Tax impact output (upsert 1:1) ---
    await tx.homeRenovationTaxImpactOutput.upsert({
      where: { advisorSessionId: sessionId },
      update: {
        confidenceLevel: taxImpact.confidenceLevel,
        confidenceReason: taxImpact.confidenceReason,
        assessedValueIncreaseMin: taxImpact.assessedValueIncreaseMin !== null ? new Prisma.Decimal(taxImpact.assessedValueIncreaseMin) : null,
        assessedValueIncreaseMax: taxImpact.assessedValueIncreaseMax !== null ? new Prisma.Decimal(taxImpact.assessedValueIncreaseMax) : null,
        annualTaxIncreaseMin: taxImpact.annualTaxIncreaseMin !== null ? new Prisma.Decimal(taxImpact.annualTaxIncreaseMin) : null,
        annualTaxIncreaseMax: taxImpact.annualTaxIncreaseMax !== null ? new Prisma.Decimal(taxImpact.annualTaxIncreaseMax) : null,
        monthlyTaxIncreaseMin: taxImpact.monthlyTaxIncreaseMin !== null ? new Prisma.Decimal(taxImpact.monthlyTaxIncreaseMin) : null,
        monthlyTaxIncreaseMax: taxImpact.monthlyTaxIncreaseMax !== null ? new Prisma.Decimal(taxImpact.monthlyTaxIncreaseMax) : null,
        reassessmentTriggerType: taxImpact.reassessmentTriggerType,
        reassessmentTimelineSummary: taxImpact.reassessmentTimelineSummary,
        reassessmentRuleSummary: taxImpact.reassessmentRuleSummary,
        plainLanguageSummary: taxImpact.plainLanguageSummary,
        millageRateSnapshot: taxImpact.millageRateSnapshot !== null ? new Prisma.Decimal(taxImpact.millageRateSnapshot) : null,
        taxModelRegion: taxImpact.taxModelRegion,
        valueUpliftMethod: taxImpact.valueUpliftMethod,
        dataAvailable: taxImpact.dataAvailable,
        sourceType: taxImpact.sourceType,
        sourceLabel: taxImpact.sourceLabel,
        sourceReferenceUrl: taxImpact.sourceReferenceUrl,
        notes: taxImpact.notes,
      },
      create: {
        advisorSessionId: sessionId,
        confidenceLevel: taxImpact.confidenceLevel,
        confidenceReason: taxImpact.confidenceReason,
        assessedValueIncreaseMin: taxImpact.assessedValueIncreaseMin !== null ? new Prisma.Decimal(taxImpact.assessedValueIncreaseMin) : null,
        assessedValueIncreaseMax: taxImpact.assessedValueIncreaseMax !== null ? new Prisma.Decimal(taxImpact.assessedValueIncreaseMax) : null,
        annualTaxIncreaseMin: taxImpact.annualTaxIncreaseMin !== null ? new Prisma.Decimal(taxImpact.annualTaxIncreaseMin) : null,
        annualTaxIncreaseMax: taxImpact.annualTaxIncreaseMax !== null ? new Prisma.Decimal(taxImpact.annualTaxIncreaseMax) : null,
        monthlyTaxIncreaseMin: taxImpact.monthlyTaxIncreaseMin !== null ? new Prisma.Decimal(taxImpact.monthlyTaxIncreaseMin) : null,
        monthlyTaxIncreaseMax: taxImpact.monthlyTaxIncreaseMax !== null ? new Prisma.Decimal(taxImpact.monthlyTaxIncreaseMax) : null,
        reassessmentTriggerType: taxImpact.reassessmentTriggerType,
        reassessmentTimelineSummary: taxImpact.reassessmentTimelineSummary,
        reassessmentRuleSummary: taxImpact.reassessmentRuleSummary,
        plainLanguageSummary: taxImpact.plainLanguageSummary,
        millageRateSnapshot: taxImpact.millageRateSnapshot !== null ? new Prisma.Decimal(taxImpact.millageRateSnapshot) : null,
        taxModelRegion: taxImpact.taxModelRegion,
        valueUpliftMethod: taxImpact.valueUpliftMethod,
        dataAvailable: taxImpact.dataAvailable,
        sourceType: taxImpact.sourceType,
        sourceLabel: taxImpact.sourceLabel,
        sourceReferenceUrl: taxImpact.sourceReferenceUrl,
        notes: taxImpact.notes,
      },
    });

    // --- Licensing output (upsert 1:1) ---
    const licensingRecord = await tx.homeRenovationLicensingOutput.upsert({
      where: { advisorSessionId: sessionId },
      update: {
        requirementStatus: licensing.requirementStatus,
        confidenceLevel: licensing.confidenceLevel,
        confidenceReason: licensing.confidenceReason,
        consequenceSummary: licensing.consequenceSummary,
        verificationToolUrl: licensing.verificationToolUrl,
        verificationToolLabel: licensing.verificationToolLabel,
        plainLanguageSummary: licensing.plainLanguageSummary,
        dataAvailable: licensing.dataAvailable,
        sourceType: licensing.sourceType,
        sourceLabel: licensing.sourceLabel,
        sourceReferenceUrl: licensing.sourceReferenceUrl,
        notes: licensing.notes,
      },
      create: {
        advisorSessionId: sessionId,
        requirementStatus: licensing.requirementStatus,
        confidenceLevel: licensing.confidenceLevel,
        confidenceReason: licensing.confidenceReason,
        consequenceSummary: licensing.consequenceSummary,
        verificationToolUrl: licensing.verificationToolUrl,
        verificationToolLabel: licensing.verificationToolLabel,
        plainLanguageSummary: licensing.plainLanguageSummary,
        dataAvailable: licensing.dataAvailable,
        sourceType: licensing.sourceType,
        sourceLabel: licensing.sourceLabel,
        sourceReferenceUrl: licensing.sourceReferenceUrl,
        notes: licensing.notes,
      },
    });

    // Replace child license category records
    await tx.homeRenovationLicenseCategoryRequirement.deleteMany({
      where: { licensingOutputId: licensingRecord.id },
    });
    if (licensing.licenseCategories.length > 0) {
      await tx.homeRenovationLicenseCategoryRequirement.createMany({
        data: licensing.licenseCategories.map((c) => ({
          licensingOutputId: licensingRecord.id,
          licenseCategoryType: c.licenseCategoryType,
          isApplicable: c.isApplicable,
          confidenceLevel: c.confidenceLevel,
          note: c.note,
          displayOrder: c.displayOrder,
        })),
      });
    }

    // --- Assumptions (delete + recreate for clean re-runs) ---
    await tx.homeRenovationAdvisorAssumption.deleteMany({
      where: { advisorSessionId: sessionId },
    });
    if (output.allAssumptions.length > 0) {
      await tx.homeRenovationAdvisorAssumption.createMany({
        data: output.allAssumptions.map((a) => ({
          advisorSessionId: sessionId,
          assumptionKey: a.assumptionKey,
          assumptionLabel: a.assumptionLabel,
          assumptionValueText: a.assumptionValueText,
          assumptionValueNumber: a.assumptionValueNumber !== null
            ? new Prisma.Decimal(a.assumptionValueNumber)
            : null,
          assumptionUnit: a.assumptionUnit,
          sourceType: a.sourceType,
          confidenceLevel: a.confidenceLevel,
          rationale: a.rationale,
          isUserVisible: a.isUserVisible,
          displayOrder: a.displayOrder,
        })),
      });
    }

    // --- Update session overall fields ---
    await tx.homeRenovationAdvisorSession.update({
      where: { id: sessionId },
      data: {
        status: RenovationAdvisorSessionStatus.COMPLETED,
        overallConfidence: output.overallConfidence,
        overallRiskLevel: output.overallRiskLevel,
        overallSummary: output.overallSummary,
        warningsSummary: output.warningsSummary,
        nextStepsSummary: output.nextStepsSummary,
        calculationVersion: output.calculationVersion,
        rulesVersion: output.rulesVersion,
        disclaimerVersion: output.disclaimerVersion,
        lastEvaluatedAt: new Date(),
      },
    });
  });

  // Return fully populated session
  return getSessionById(sessionId) as Promise<SessionWithIncludes>;
}

// ============================================================================
// GET SESSION
// ============================================================================

export async function getSessionById(sessionId: string): Promise<SessionWithIncludes | null> {
  return prisma.homeRenovationAdvisorSession.findUnique({
    where: { id: sessionId },
    include: SESSION_FULL_INCLUDE,
  });
}

// ============================================================================
// LIST SESSIONS FOR PROPERTY
// ============================================================================

export async function listSessionsForProperty(
  propertyId: string,
  options: {
    status?: RenovationAdvisorSessionStatus;
    renovationType?: string;
    limit: number;
    cursor?: string;
  },
) {
  const where: Prisma.HomeRenovationAdvisorSessionWhereInput = {
    propertyId,
    archivedAt: null,
  };
  if (options.status) where.status = options.status;
  if (options.renovationType) where.renovationType = options.renovationType as any;

  const sessions = await prisma.homeRenovationAdvisorSession.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      propertyId: true,
      status: true,
      renovationType: true,
      overallConfidence: true,
      overallRiskLevel: true,
      overallSummary: true,
      lastEvaluatedAt: true,
      createdAt: true,
      updatedAt: true,
      isRetroactiveCheck: true,
    },
  });

  const hasMore = sessions.length > options.limit;
  const items = hasMore ? sessions.slice(0, -1) : sessions;

  return {
    sessions: items,
    total: items.length,
    hasMore,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}

// ============================================================================
// ARCHIVE SESSION
// ============================================================================

export async function archiveSession(sessionId: string): Promise<void> {
  await prisma.homeRenovationAdvisorSession.update({
    where: { id: sessionId },
    data: {
      archivedAt: new Date(),
      status: RenovationAdvisorSessionStatus.ARCHIVED,
    },
  });
}

// ============================================================================
// VERIFY PROPERTY OWNERSHIP
// ============================================================================

export async function verifyPropertyOwnership(
  propertyId: string,
  userId: string,
): Promise<boolean> {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: { id: true },
  });
  return property !== null;
}

// ============================================================================
// GET PROPERTY ADDRESS CONTEXT
// ============================================================================

export async function getPropertyAddressContext(propertyId: string) {
  return prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
    },
  });
}

// ============================================================================
// UPDATE COMPLIANCE CHECKLIST
// ============================================================================

export async function upsertComplianceChecklist(
  sessionId: string,
  data: {
    permitObtainedStatus?: string;
    licensedContractorUsedStatus?: string;
    reassessmentReceivedStatus?: string;
    notes?: string | null;
  },
) {
  return prisma.homeRenovationComplianceChecklist.upsert({
    where: { advisorSessionId: sessionId },
    update: {
      ...data as any,
      lastReviewedAt: new Date(),
    },
    create: {
      advisorSessionId: sessionId,
      ...data as any,
      lastReviewedAt: new Date(),
    },
  });
}
