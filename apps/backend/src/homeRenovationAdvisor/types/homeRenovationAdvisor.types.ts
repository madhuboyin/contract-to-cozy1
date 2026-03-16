// apps/backend/src/homeRenovationAdvisor/types/homeRenovationAdvisor.types.ts
//
// TypeScript interfaces for the Home Renovation Risk Advisor feature.
// These supplement the Prisma-generated types with API-layer shapes.

import {
  AdvisorConfidenceLevel,
  AdvisorDataSourceType,
  AdvisorRiskLevel,
  ContractorLicenseRequirementStatus,
  HomeRenovationType,
  PermitRequirementStatus,
  PropertyTaxReassessmentTriggerType,
  RenovationAdvisorEntryPoint,
  RenovationAdvisorFlowType,
  RenovationAdvisorSessionStatus,
  RenovationInspectionStageType,
  RenovationJurisdictionLevel,
  RenovationLicenseCategoryType,
  RenovationPermitType,
  RenovationProjectCostSource,
  TriStateChecklistStatus,
} from '@prisma/client';

// ============================================================================
// REQUEST INPUTS
// ============================================================================

export interface JurisdictionOverride {
  state?: string;
  county?: string;
  city?: string;
  postalCode?: string;
}

export interface CreateSessionInput {
  propertyId: string;
  renovationType: HomeRenovationType;
  entryPoint: RenovationAdvisorEntryPoint;
  flowType?: RenovationAdvisorFlowType;
  projectCostInput?: number;
  jurisdictionOverride?: JurisdictionOverride;
  completedModificationReported?: boolean;
  isRetroactiveCheck?: boolean;
  userConfirmedJurisdiction?: boolean;
}

export interface UpdateSessionInput {
  projectCostInput?: number | null;
  jurisdictionOverride?: JurisdictionOverride | null;
  completedModificationReported?: boolean;
  userConfirmedJurisdiction?: boolean;
}

export interface EvaluateSessionInput {
  forceRefresh?: boolean;
  evaluationMode?: 'FULL' | 'PERMIT_ONLY' | 'TAX_ONLY' | 'LICENSING_ONLY';
}

export interface ListSessionsQuery {
  propertyId: string;
  status?: RenovationAdvisorSessionStatus;
  renovationType?: HomeRenovationType;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// JURISDICTION CONTEXT
// ============================================================================

export interface JurisdictionContext {
  state: string | null;
  county: string | null;
  city: string | null;
  postalCode: string | null;
  normalizedJurisdictionKey: string | null;
  jurisdictionLevel: RenovationJurisdictionLevel;
  resolutionConfidence: AdvisorConfidenceLevel;
  source: 'property_profile' | 'user_override' | 'partial' | 'unknown';
}

// ============================================================================
// PERMIT EVALUATION
// ============================================================================

export interface PermitTypeRequirementEntry {
  permitType: RenovationPermitType;
  isRequired: boolean;
  confidenceLevel: AdvisorConfidenceLevel;
  note: string | null;
  displayOrder: number;
}

export interface InspectionStageEntry {
  inspectionStageType: RenovationInspectionStageType;
  isLikelyRequired: boolean;
  note: string | null;
  displayOrder: number;
}

export interface PermitEvaluationResult {
  requirementStatus: PermitRequirementStatus;
  confidenceLevel: AdvisorConfidenceLevel;
  confidenceReason: string;
  permitCostMin: number | null;
  permitCostMax: number | null;
  permitTimelineMinDays: number | null;
  permitTimelineMaxDays: number | null;
  applicationPortalUrl: string | null;
  applicationPortalLabel: string | null;
  permitSummary: string;
  permitTypes: PermitTypeRequirementEntry[];
  inspectionStages: InspectionStageEntry[];
  dataAvailable: boolean;
  sourceType: AdvisorDataSourceType;
  sourceLabel: string;
  sourceReferenceUrl: string | null;
  sourceRefreshedAt: Date | null;
  notes: string | null;
  assumptions: AssumptionEntry[];
}

// ============================================================================
// TAX EVALUATION
// ============================================================================

export interface TaxImpactEvaluationResult {
  confidenceLevel: AdvisorConfidenceLevel;
  confidenceReason: string;
  assessedValueIncreaseMin: number | null;
  assessedValueIncreaseMax: number | null;
  annualTaxIncreaseMin: number | null;
  annualTaxIncreaseMax: number | null;
  monthlyTaxIncreaseMin: number | null;
  monthlyTaxIncreaseMax: number | null;
  reassessmentTriggerType: PropertyTaxReassessmentTriggerType;
  reassessmentTimelineSummary: string;
  reassessmentRuleSummary: string;
  plainLanguageSummary: string;
  millageRateSnapshot: number | null;
  taxModelRegion: string | null;
  valueUpliftMethod: string;
  dataAvailable: boolean;
  sourceType: AdvisorDataSourceType;
  sourceLabel: string;
  sourceReferenceUrl: string | null;
  sourceRefreshedAt: Date | null;
  notes: string | null;
  assumptions: AssumptionEntry[];
}

// ============================================================================
// LICENSING EVALUATION
// ============================================================================

export interface LicenseCategoryEntry {
  licenseCategoryType: RenovationLicenseCategoryType;
  isApplicable: boolean;
  confidenceLevel: AdvisorConfidenceLevel;
  note: string | null;
  displayOrder: number;
}

export interface LicensingEvaluationResult {
  requirementStatus: ContractorLicenseRequirementStatus;
  confidenceLevel: AdvisorConfidenceLevel;
  confidenceReason: string;
  consequenceSummary: string;
  verificationToolUrl: string | null;
  verificationToolLabel: string | null;
  plainLanguageSummary: string;
  licenseCategories: LicenseCategoryEntry[];
  dataAvailable: boolean;
  sourceType: AdvisorDataSourceType;
  sourceLabel: string;
  sourceReferenceUrl: string | null;
  sourceRefreshedAt: Date | null;
  notes: string | null;
  assumptions: AssumptionEntry[];
}

// ============================================================================
// SHARED ASSUMPTION / WARNING / NEXT ACTION
// ============================================================================

export interface AssumptionEntry {
  assumptionKey: string;
  assumptionLabel: string;
  assumptionValueText: string | null;
  assumptionValueNumber: number | null;
  assumptionUnit: string | null;
  sourceType: AdvisorDataSourceType;
  confidenceLevel: AdvisorConfidenceLevel;
  rationale: string | null;
  isUserVisible: boolean;
  displayOrder: number;
}

export interface WarningEntry {
  code: string;
  title: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE';
  description: string;
}

export interface NextActionEntry {
  key: string;
  label: string;
  description: string;
  destinationType: 'EXTERNAL_URL' | 'INTERNAL_ROUTE' | 'MODULE_LINK' | 'INFO';
  destinationRef: string | null;
  priority: number;
}

// ============================================================================
// EVALUATION CONTEXT
// ============================================================================

export interface EvaluationContext {
  sessionId: string;
  propertyId: string;
  createdByUserId: string | null;
  renovationType: HomeRenovationType;
  jurisdiction: JurisdictionContext;
  projectCostInput: number | null;
  projectCostSource: RenovationProjectCostSource;
  projectCostAssumptionNote: string | null;
  isRetroactiveCheck: boolean;
  flowType: RenovationAdvisorFlowType;
  evaluationMode: 'FULL' | 'PERMIT_ONLY' | 'TAX_ONLY' | 'LICENSING_ONLY';
}

// ============================================================================
// EVALUATION OUTPUT
// ============================================================================

export interface EvaluationOutput {
  permit: PermitEvaluationResult;
  taxImpact: TaxImpactEvaluationResult;
  licensing: LicensingEvaluationResult;
  allAssumptions: AssumptionEntry[];
  warnings: WarningEntry[];
  nextActions: NextActionEntry[];
  overallConfidence: AdvisorConfidenceLevel;
  overallRiskLevel: AdvisorRiskLevel;
  overallSummary: string;
  warningsSummary: string;
  nextStepsSummary: string;
  calculationVersion: string;
  rulesVersion: string;
}

// ============================================================================
// NORMALIZED API RESPONSE
// ============================================================================

export interface RangeValue {
  min: number | null;
  max: number | null;
}

export interface SourceMeta {
  sourceType: AdvisorDataSourceType;
  sourceLabel: string;
  sourceReferenceUrl: string | null;
  sourceRefreshedAt: string | null; // ISO string
  freshnessLabel: string | null;
}

export interface PermitResponseModule {
  requirementStatus: PermitRequirementStatus;
  confidenceLevel: AdvisorConfidenceLevel;
  confidenceReason: string;
  costRange: RangeValue;
  timelineRangeDays: RangeValue;
  permitTypes: PermitTypeRequirementEntry[];
  inspectionStages: InspectionStageEntry[];
  applicationPortal: { url: string | null; label: string | null };
  summary: string;
  sourceMeta: SourceMeta;
  dataAvailable: boolean;
}

export interface TaxImpactResponseModule {
  confidenceLevel: AdvisorConfidenceLevel;
  confidenceReason: string;
  assessedValueIncreaseRange: RangeValue;
  annualTaxIncreaseRange: RangeValue;
  monthlyTaxIncreaseRange: RangeValue;
  reassessmentTriggerType: PropertyTaxReassessmentTriggerType;
  reassessmentTimelineSummary: string;
  reassessmentRuleSummary: string;
  plainLanguageSummary: string;
  sourceMeta: SourceMeta;
  dataAvailable: boolean;
}

export interface LicensingResponseModule {
  requirementStatus: ContractorLicenseRequirementStatus;
  confidenceLevel: AdvisorConfidenceLevel;
  confidenceReason: string;
  applicableCategories: LicenseCategoryEntry[];
  consequenceSummary: string;
  verificationTool: { url: string | null; label: string | null };
  plainLanguageSummary: string;
  sourceMeta: SourceMeta;
  dataAvailable: boolean;
}

export interface LinkedEntities {
  timelineEventId: string | null;
  riskEntityId: string | null;
  tcoEntityId: string | null;
  breakEvenEntityId: string | null;
  digitalTwinEntityId: string | null;
  chatContextId: string | null;
}

export interface UiMeta {
  displayModeHints: string[];
  unsupportedArea: boolean;
  partialCoverage: boolean;
  lowConfidenceAreas: string[];
}

export interface JurisdictionResponseShape {
  state: string | null;
  county: string | null;
  city: string | null;
  postalCode: string | null;
  jurisdictionLevel: RenovationJurisdictionLevel;
  normalizedKey: string | null;
}

export interface HomeRenovationAdvisorSessionResponse {
  id: string;
  propertyId: string;
  status: RenovationAdvisorSessionStatus;
  renovationType: HomeRenovationType;
  renovationLabel: string;
  entryPoint: RenovationAdvisorEntryPoint;
  flowType: RenovationAdvisorFlowType;
  createdAt: string;
  updatedAt: string;
  lastEvaluatedAt: string | null;
  jurisdiction: JurisdictionResponseShape;
  projectCost: {
    inputValue: number | null;
    source: RenovationProjectCostSource;
    assumptionNote: string | null;
  };
  overallConfidence: AdvisorConfidenceLevel;
  overallRiskLevel: AdvisorRiskLevel;
  overallSummary: string | null;
  warningsSummary: string | null;
  nextStepsSummary: string | null;
  disclaimerVersion: string | null;
  isRetroactiveCheck: boolean;
  completedModificationReported: boolean;
  permit: PermitResponseModule | null;
  taxImpact: TaxImpactResponseModule | null;
  licensing: LicensingResponseModule | null;
  assumptions: AssumptionEntry[];
  warnings: WarningEntry[];
  nextActions: NextActionEntry[];
  linkedEntities: LinkedEntities;
  uiMeta: UiMeta;
  complianceChecklist: ComplianceChecklistResponse | null;
}

export interface ComplianceChecklistResponse {
  permitObtainedStatus: TriStateChecklistStatus;
  licensedContractorUsedStatus: TriStateChecklistStatus;
  reassessmentReceivedStatus: TriStateChecklistStatus;
  notes: string | null;
  lastReviewedAt: string | null;
}

export interface SessionListResponse {
  sessions: SessionSummaryResponse[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SessionSummaryResponse {
  id: string;
  propertyId: string;
  status: RenovationAdvisorSessionStatus;
  renovationType: HomeRenovationType;
  renovationLabel: string;
  overallConfidence: AdvisorConfidenceLevel;
  overallRiskLevel: AdvisorRiskLevel;
  overallSummary: string | null;
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isRetroactiveCheck: boolean;
}
