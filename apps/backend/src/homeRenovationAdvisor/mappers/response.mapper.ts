// apps/backend/src/homeRenovationAdvisor/mappers/response.mapper.ts
//
// Maps DB records + evaluation engine output to the normalized API response shape.
// All Decimal fields are converted to numbers here to avoid JSON serialization issues.

import {
  AssumptionEntry,
  ComplianceChecklistResponse,
  HomeRenovationAdvisorSessionResponse,
  LicensingResponseModule,
  LinkedEntities,
  PermitResponseModule,
  SessionSummaryResponse,
  SourceMeta,
  TaxImpactResponseModule,
  UiMeta,
  WarningEntry,
  NextActionEntry,
} from '../types/homeRenovationAdvisor.types';
import { SessionWithIncludes } from '../repository/advisorSession.repository';
import { AdvisorConfidenceLevel } from '@prisma/client';
import { getRenovationLabel } from '../engine/summary/summaryBuilder.service';
import {
  getDisclaimerText,
  selectDisclaimerVariant,
} from '../engine/disclaimer/disclaimerText';

// ============================================================================
// DECIMAL CONVERSION HELPER
// ============================================================================

function toNum(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  // Prisma Decimal has .toNumber()
  if (typeof val.toNumber === 'function') return val.toNumber();
  return Number(val);
}

// ============================================================================
// SOURCE META BUILDER
// ============================================================================

function buildSourceMeta(
  sourceType: any,
  sourceLabel: string | null,
  sourceReferenceUrl: string | null,
  sourceRefreshedAt: Date | null,
): SourceMeta {
  return {
    sourceType,
    sourceLabel: sourceLabel ?? 'Internal heuristics',
    sourceReferenceUrl,
    sourceRefreshedAt: sourceRefreshedAt ? sourceRefreshedAt.toISOString() : null,
    freshnessLabel: sourceRefreshedAt
      ? formatFreshnessLabel(sourceRefreshedAt)
      : 'National defaults (static)',
  };
}

function formatFreshnessLabel(date: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `Updated ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// ============================================================================
// FULL SESSION RESPONSE MAPPER
// ============================================================================

export function mapSessionToResponse(
  session: SessionWithIncludes,
  warnings: WarningEntry[] = [],
  nextActions: NextActionEntry[] = [],
): HomeRenovationAdvisorSessionResponse {
  const permit = session.permitOutput
    ? mapPermitOutput(session.permitOutput)
    : null;

  const taxImpact = session.taxImpactOutput
    ? mapTaxOutput(session.taxImpactOutput)
    : null;

  const licensing = session.licensingOutput
    ? mapLicensingOutput(session.licensingOutput)
    : null;

  const assumptions: AssumptionEntry[] = session.assumptions.map((a) => ({
    assumptionKey: a.assumptionKey,
    assumptionLabel: a.assumptionLabel,
    assumptionValueText: a.assumptionValueText,
    assumptionValueNumber: toNum(a.assumptionValueNumber),
    assumptionUnit: a.assumptionUnit,
    sourceType: a.sourceType,
    confidenceLevel: a.confidenceLevel,
    rationale: a.rationale,
    isUserVisible: a.isUserVisible,
    displayOrder: a.displayOrder,
  }));

  const complianceChecklist = session.complianceChecklist
    ? mapComplianceChecklist(session.complianceChecklist)
    : null;

  const uiMeta = buildUiMeta(session, permit, taxImpact, licensing);

  // Compute disclaimer text from session context (derived at response time, not persisted)
  const isLowConf =
    session.overallConfidence === 'LOW' || session.overallConfidence === 'UNAVAILABLE';
  const disclaimerVariant = selectDisclaimerVariant(
    session.isRetroactiveCheck,
    session.overallConfidence === 'UNAVAILABLE',
    isLowConf,
  );
  const disclaimerText = getDisclaimerText(disclaimerVariant);

  return {
    id: session.id,
    propertyId: session.propertyId,
    status: session.status,
    renovationType: session.renovationType,
    renovationLabel: getRenovationLabel(session.renovationType),
    entryPoint: session.entryPoint,
    flowType: session.flowType,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    lastEvaluatedAt: session.lastEvaluatedAt ? session.lastEvaluatedAt.toISOString() : null,
    jurisdiction: {
      state: session.jurisdictionState,
      county: session.jurisdictionCounty,
      city: session.jurisdictionCity,
      postalCode: session.postalCode,
      jurisdictionLevel: session.jurisdictionLevel,
      normalizedKey: session.normalizedJurisdictionKey,
    },
    projectCost: {
      inputValue: toNum(session.projectCostInput),
      source: session.projectCostSource,
      assumptionNote: session.projectCostAssumptionNote,
    },
    overallConfidence: session.overallConfidence,
    overallRiskLevel: session.overallRiskLevel,
    overallSummary: session.overallSummary,
    warningsSummary: session.warningsSummary,
    nextStepsSummary: session.nextStepsSummary,
    disclaimerVersion: session.disclaimerVersion,
    disclaimerText,
    isRetroactiveCheck: session.isRetroactiveCheck,
    completedModificationReported: session.completedModificationReported,
    permit,
    taxImpact,
    licensing,
    assumptions,
    warnings,
    nextActions,
    linkedEntities: buildLinkedEntities(session),
    uiMeta,
    complianceChecklist,
  };
}

function mapPermitOutput(output: NonNullable<SessionWithIncludes['permitOutput']>): PermitResponseModule {
  return {
    requirementStatus: output.requirementStatus,
    confidenceLevel: output.confidenceLevel,
    confidenceReason: output.confidenceReason ?? '',
    costRange: {
      min: toNum(output.permitCostMin),
      max: toNum(output.permitCostMax),
    },
    timelineRangeDays: {
      min: output.permitTimelineMinDays,
      max: output.permitTimelineMaxDays,
    },
    permitTypes: output.permitTypes.map((pt) => ({
      permitType: pt.permitType,
      isRequired: pt.isRequired,
      confidenceLevel: pt.confidenceLevel,
      note: pt.note,
      displayOrder: pt.displayOrder,
    })),
    inspectionStages: output.inspectionStages.map((s) => ({
      inspectionStageType: s.inspectionStageType,
      isLikelyRequired: s.isLikelyRequired,
      note: s.note,
      displayOrder: s.displayOrder,
    })),
    applicationPortal: {
      url: output.applicationPortalUrl,
      label: output.applicationPortalLabel,
    },
    summary: output.permitSummary ?? '',
    sourceMeta: buildSourceMeta(
      output.sourceType,
      output.sourceLabel,
      output.sourceReferenceUrl,
      output.sourceRefreshedAt,
    ),
    dataAvailable: output.dataAvailable,
  };
}

function mapTaxOutput(output: NonNullable<SessionWithIncludes['taxImpactOutput']>): TaxImpactResponseModule {
  return {
    confidenceLevel: output.confidenceLevel,
    confidenceReason: output.confidenceReason ?? '',
    assessedValueIncreaseRange: {
      min: toNum(output.assessedValueIncreaseMin),
      max: toNum(output.assessedValueIncreaseMax),
    },
    annualTaxIncreaseRange: {
      min: toNum(output.annualTaxIncreaseMin),
      max: toNum(output.annualTaxIncreaseMax),
    },
    monthlyTaxIncreaseRange: {
      min: toNum(output.monthlyTaxIncreaseMin),
      max: toNum(output.monthlyTaxIncreaseMax),
    },
    reassessmentTriggerType: output.reassessmentTriggerType,
    reassessmentTimelineSummary: output.reassessmentTimelineSummary ?? '',
    reassessmentRuleSummary: output.reassessmentRuleSummary ?? '',
    plainLanguageSummary: output.plainLanguageSummary ?? '',
    sourceMeta: buildSourceMeta(
      output.sourceType,
      output.sourceLabel,
      output.sourceReferenceUrl,
      output.sourceRefreshedAt,
    ),
    dataAvailable: output.dataAvailable,
  };
}

function mapLicensingOutput(
  output: NonNullable<SessionWithIncludes['licensingOutput']>,
): LicensingResponseModule {
  return {
    requirementStatus: output.requirementStatus,
    confidenceLevel: output.confidenceLevel,
    confidenceReason: output.confidenceReason ?? '',
    applicableCategories: output.licenseCategories.map((c) => ({
      licenseCategoryType: c.licenseCategoryType,
      isApplicable: c.isApplicable,
      confidenceLevel: c.confidenceLevel,
      note: c.note,
      displayOrder: c.displayOrder,
    })),
    consequenceSummary: output.consequenceSummary ?? '',
    verificationTool: {
      url: output.verificationToolUrl,
      label: output.verificationToolLabel,
    },
    plainLanguageSummary: output.plainLanguageSummary ?? '',
    sourceMeta: buildSourceMeta(
      output.sourceType,
      output.sourceLabel,
      output.sourceReferenceUrl,
      output.sourceRefreshedAt,
    ),
    dataAvailable: output.dataAvailable,
  };
}

function mapComplianceChecklist(
  checklist: NonNullable<SessionWithIncludes['complianceChecklist']>,
): ComplianceChecklistResponse {
  return {
    permitObtainedStatus: checklist.permitObtainedStatus,
    licensedContractorUsedStatus: checklist.licensedContractorUsedStatus,
    reassessmentReceivedStatus: checklist.reassessmentReceivedStatus,
    notes: checklist.notes,
    lastReviewedAt: checklist.lastReviewedAt ? checklist.lastReviewedAt.toISOString() : null,
  };
}

function buildLinkedEntities(session: SessionWithIncludes): LinkedEntities {
  return {
    timelineEventId: session.linkedTimelineItemId,
    riskEntityId: session.linkedRiskEntityId,
    tcoEntityId: session.linkedTcoEntityId,
    breakEvenEntityId: session.linkedBreakEvenEntityId,
    digitalTwinEntityId: session.linkedDigitalTwinScenarioId,
    chatContextId: null,
  };
}

function buildUiMeta(
  session: SessionWithIncludes,
  permit: PermitResponseModule | null,
  tax: TaxImpactResponseModule | null,
  licensing: LicensingResponseModule | null,
): UiMeta {
  const lowConfidenceAreas: string[] = [];
  const LOW_CONFIDENCE_LEVELS: string[] = ['LOW', 'UNAVAILABLE'];

  if (permit && LOW_CONFIDENCE_LEVELS.includes(permit.confidenceLevel)) {
    lowConfidenceAreas.push('permit');
  }
  if (tax && LOW_CONFIDENCE_LEVELS.includes(tax.confidenceLevel)) {
    lowConfidenceAreas.push('tax');
  }
  if (licensing && LOW_CONFIDENCE_LEVELS.includes(licensing.confidenceLevel)) {
    lowConfidenceAreas.push('licensing');
  }

  const unsupportedArea =
    session.overallConfidence === AdvisorConfidenceLevel.UNAVAILABLE;

  const partialCoverage =
    (permit !== null && !permit.dataAvailable) ||
    (tax !== null && !tax.dataAvailable) ||
    (licensing !== null && !licensing.dataAvailable);

  return {
    displayModeHints: ['desktop_full', 'mobile_card'],
    unsupportedArea,
    partialCoverage,
    lowConfidenceAreas,
  };
}

// ============================================================================
// SESSION SUMMARY MAPPER (for list endpoint)
// ============================================================================

export function mapSessionToSummary(session: {
  id: string;
  propertyId: string;
  status: any;
  renovationType: any;
  overallConfidence: any;
  overallRiskLevel: any;
  overallSummary: string | null;
  lastEvaluatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isRetroactiveCheck: boolean;
}): SessionSummaryResponse {
  return {
    id: session.id,
    propertyId: session.propertyId,
    status: session.status,
    renovationType: session.renovationType,
    renovationLabel: getRenovationLabel(session.renovationType),
    overallConfidence: session.overallConfidence,
    overallRiskLevel: session.overallRiskLevel,
    overallSummary: session.overallSummary,
    lastEvaluatedAt: session.lastEvaluatedAt ? session.lastEvaluatedAt.toISOString() : null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    isRetroactiveCheck: session.isRetroactiveCheck,
  };
}
