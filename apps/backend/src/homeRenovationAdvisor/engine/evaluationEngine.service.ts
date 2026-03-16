// apps/backend/src/homeRenovationAdvisor/engine/evaluationEngine.service.ts
//
// Orchestrates all evaluation modules for a Home Renovation Risk Advisor session.

import { AdvisorRiskLevel, RenovationAdvisorFlowType } from '@prisma/client';
import {
  EvaluationContext,
  EvaluationOutput,
} from '../types/homeRenovationAdvisor.types';
import { evaluatePermit } from './permit/permit.evaluator';
import { evaluateTaxImpact } from './tax/taxImpact.evaluator';
import { evaluateLicensing } from './licensing/licensing.evaluator';
import { computeOverallConfidence } from './confidence/confidence.service';
import { mergeAssumptions } from './assumptions/assumptions.service';
import {
  buildNextActions,
  buildNextStepsSummary,
  buildOverallSummary,
  buildWarnings,
  buildWarningsSummary,
  computeOverallRiskLevel,
} from './summary/summaryBuilder.service';

export const CALCULATION_VERSION = '1.0.0';
export const RULES_VERSION = '1.0.0-internal';

export async function runEvaluation(ctx: EvaluationContext): Promise<EvaluationOutput> {
  const mode = ctx.evaluationMode ?? 'FULL';

  // Run module evaluations in parallel (or selectively)
  const [permit, taxImpact, licensing] = await Promise.all([
    mode === 'FULL' || mode === 'PERMIT_ONLY' ? evaluatePermit(ctx) : buildSkippedPermit(),
    mode === 'FULL' || mode === 'TAX_ONLY' ? evaluateTaxImpact(ctx) : buildSkippedTax(),
    mode === 'FULL' || mode === 'LICENSING_ONLY' ? evaluateLicensing(ctx) : buildSkippedLicensing(),
  ]);

  // Merge all assumptions
  const allAssumptions = mergeAssumptions(
    permit.assumptions,
    taxImpact.assumptions,
    licensing.assumptions,
  );

  // Compute overall confidence
  const overallConfidence = computeOverallConfidence(
    permit.confidenceLevel,
    taxImpact.confidenceLevel,
    licensing.confidenceLevel,
  );

  // Compute overall risk
  const overallRiskLevel = computeOverallRiskLevel(permit, licensing, taxImpact, ctx);

  // Build structured warnings and next actions
  const warnings = buildWarnings(ctx, permit, taxImpact, licensing);
  const nextActions = buildNextActions(ctx, permit, taxImpact, licensing, overallRiskLevel, null);

  // Build text summaries
  const overallSummary = buildOverallSummary(ctx, permit, taxImpact, licensing, overallRiskLevel, overallConfidence);
  const warningsSummary = buildWarningsSummary(warnings);
  const nextStepsSummary = buildNextStepsSummary(nextActions);

  return {
    permit,
    taxImpact,
    licensing,
    allAssumptions,
    warnings,
    nextActions,
    overallConfidence,
    overallRiskLevel,
    overallSummary,
    warningsSummary,
    nextStepsSummary,
    calculationVersion: CALCULATION_VERSION,
    rulesVersion: RULES_VERSION,
  };
}

// ============================================================================
// SKIPPED MODULE STUBS
// Used when evaluation mode excludes a module.
// ============================================================================

import {
  PermitEvaluationResult,
  TaxImpactEvaluationResult,
  LicensingEvaluationResult,
} from '../types/homeRenovationAdvisor.types';
import { AdvisorConfidenceLevel, AdvisorDataSourceType } from '@prisma/client';

function buildSkippedPermit(): PermitEvaluationResult {
  return {
    requirementStatus: 'UNKNOWN',
    confidenceLevel: AdvisorConfidenceLevel.UNAVAILABLE,
    confidenceReason: 'Permit evaluation was skipped.',
    permitCostMin: null,
    permitCostMax: null,
    permitTimelineMinDays: null,
    permitTimelineMaxDays: null,
    applicationPortalUrl: null,
    applicationPortalLabel: null,
    permitSummary: 'Permit evaluation not requested.',
    permitTypes: [],
    inspectionStages: [],
    dataAvailable: false,
    sourceType: AdvisorDataSourceType.UNKNOWN,
    sourceLabel: 'Skipped',
    sourceReferenceUrl: null,
    sourceRefreshedAt: null,
    notes: null,
    assumptions: [],
  };
}

function buildSkippedTax(): TaxImpactEvaluationResult {
  return {
    confidenceLevel: AdvisorConfidenceLevel.UNAVAILABLE,
    confidenceReason: 'Tax evaluation was skipped.',
    assessedValueIncreaseMin: null,
    assessedValueIncreaseMax: null,
    annualTaxIncreaseMin: null,
    annualTaxIncreaseMax: null,
    monthlyTaxIncreaseMin: null,
    monthlyTaxIncreaseMax: null,
    reassessmentTriggerType: 'UNKNOWN',
    reassessmentTimelineSummary: '',
    reassessmentRuleSummary: '',
    plainLanguageSummary: 'Tax impact evaluation not requested.',
    millageRateSnapshot: null,
    taxModelRegion: null,
    valueUpliftMethod: 'skipped',
    dataAvailable: false,
    sourceType: AdvisorDataSourceType.UNKNOWN,
    sourceLabel: 'Skipped',
    sourceReferenceUrl: null,
    sourceRefreshedAt: null,
    notes: null,
    assumptions: [],
  };
}

function buildSkippedLicensing(): LicensingEvaluationResult {
  return {
    requirementStatus: 'UNKNOWN',
    confidenceLevel: AdvisorConfidenceLevel.UNAVAILABLE,
    confidenceReason: 'Licensing evaluation was skipped.',
    consequenceSummary: '',
    verificationToolUrl: null,
    verificationToolLabel: null,
    plainLanguageSummary: 'Licensing evaluation not requested.',
    licenseCategories: [],
    dataAvailable: false,
    sourceType: AdvisorDataSourceType.UNKNOWN,
    sourceLabel: 'Skipped',
    sourceReferenceUrl: null,
    sourceRefreshedAt: null,
    notes: null,
    assumptions: [],
  };
}
