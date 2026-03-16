// apps/backend/src/homeRenovationAdvisor/engine/permit/permit.evaluator.ts
//
// Evaluates permit requirements for a given renovation + jurisdiction context.

import { AdvisorConfidenceLevel, AdvisorDataSourceType } from '@prisma/client';
import {
  AssumptionEntry,
  EvaluationContext,
  InspectionStageEntry,
  PermitEvaluationResult,
  PermitTypeRequirementEntry,
} from '../../types/homeRenovationAdvisor.types';
import { getPermitRulesProvider } from './permitRules.provider';
import { scoreConfidenceFromSource } from '../confidence/confidence.service';
import { PERMIT_APPLICATION_PORTAL_NOTE } from './permitRules.data';

export async function evaluatePermit(ctx: EvaluationContext): Promise<PermitEvaluationResult> {
  const provider = getPermitRulesProvider();

  const providerResult = await provider.getPermitRules(
    ctx.renovationType,
    ctx.jurisdiction.state,
    ctx.jurisdiction.county,
    ctx.jurisdiction.city,
    ctx.jurisdiction.postalCode,
  );

  const assumptions: AssumptionEntry[] = [];

  if (!providerResult.dataAvailable || !providerResult.data) {
    return buildUnavailableResult(ctx, providerResult.sourceType, providerResult.sourceLabel);
  }

  const rule = providerResult.data;

  // Downgrade confidence if jurisdiction is only state-level or lower
  const jurisdictionPenalty = computeJurisdictionPenalty(ctx);
  const baseConfidence = scoreConfidenceFromSource(providerResult.sourceType);
  const finalConfidence = applyJurisdictionPenalty(baseConfidence, jurisdictionPenalty);
  const confidenceReason = buildPermitConfidenceReason(
    finalConfidence,
    ctx.jurisdiction.jurisdictionLevel,
    providerResult.sourceType,
  );

  if (jurisdictionPenalty > 0) {
    assumptions.push({
      assumptionKey: 'permit_jurisdiction_fallback',
      assumptionLabel: 'Permit rules use national defaults (city-level data unavailable)',
      assumptionValueText: `Jurisdiction resolved at ${ctx.jurisdiction.jurisdictionLevel} level`,
      assumptionValueNumber: null,
      assumptionUnit: null,
      sourceType: AdvisorDataSourceType.INTERNAL_RULE,
      confidenceLevel: AdvisorConfidenceLevel.LOW,
      rationale: 'Local permit requirements can differ significantly from national defaults.',
      isUserVisible: true,
      displayOrder: 0,
    });
  }

  const permitTypes: PermitTypeRequirementEntry[] = rule.permitTypes.map((pt, i) => ({
    permitType: pt.permitType,
    isRequired: pt.isRequired,
    confidenceLevel: finalConfidence,
    note: pt.note,
    displayOrder: i,
  }));

  const inspectionStages: InspectionStageEntry[] = rule.inspectionStages.map((s, i) => ({
    inspectionStageType: s.inspectionStageType,
    isLikelyRequired: s.isLikelyRequired,
    note: s.note,
    displayOrder: i,
  }));

  return {
    requirementStatus: rule.requirementStatus,
    confidenceLevel: finalConfidence,
    confidenceReason,
    permitCostMin: rule.permitCostMin,
    permitCostMax: rule.permitCostMax,
    permitTimelineMinDays: rule.timelineMinDays,
    permitTimelineMaxDays: rule.timelineMaxDays,
    applicationPortalUrl: null,
    applicationPortalLabel: PERMIT_APPLICATION_PORTAL_NOTE,
    permitSummary: rule.summary,
    permitTypes,
    inspectionStages,
    dataAvailable: true,
    sourceType: providerResult.sourceType,
    sourceLabel: providerResult.sourceLabel,
    sourceReferenceUrl: providerResult.sourceReferenceUrl,
    sourceRefreshedAt: providerResult.sourceRefreshedAt,
    notes: rule.notes,
    assumptions,
  };
}

function buildUnavailableResult(
  _ctx: EvaluationContext,
  sourceType: AdvisorDataSourceType,
  sourceLabel: string,
): PermitEvaluationResult {
  return {
    requirementStatus: 'UNKNOWN',
    confidenceLevel: AdvisorConfidenceLevel.UNAVAILABLE,
    confidenceReason: 'Permit data is not available for this renovation type.',
    permitCostMin: null,
    permitCostMax: null,
    permitTimelineMinDays: null,
    permitTimelineMaxDays: null,
    applicationPortalUrl: null,
    applicationPortalLabel: PERMIT_APPLICATION_PORTAL_NOTE,
    permitSummary: 'Permit requirement information is unavailable. Contact your local building department.',
    permitTypes: [],
    inspectionStages: [],
    dataAvailable: false,
    sourceType,
    sourceLabel,
    sourceReferenceUrl: null,
    sourceRefreshedAt: null,
    notes: null,
    assumptions: [],
  };
}

function computeJurisdictionPenalty(ctx: EvaluationContext): number {
  switch (ctx.jurisdiction.jurisdictionLevel) {
    case 'CITY': return 0;
    case 'ZIP': return 0;
    case 'COUNTY': return 1;
    case 'STATE': return 2;
    default: return 3;
  }
}

function applyJurisdictionPenalty(
  base: AdvisorConfidenceLevel,
  penalty: number,
): AdvisorConfidenceLevel {
  if (penalty === 0) return base;
  const levels: AdvisorConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE'];
  const idx = levels.indexOf(base);
  return levels[Math.min(idx + penalty, levels.length - 1)];
}

function buildPermitConfidenceReason(
  confidence: AdvisorConfidenceLevel,
  jurisdictionLevel: string,
  sourceType: AdvisorDataSourceType,
): string {
  if (sourceType === AdvisorDataSourceType.API_VERIFIED) {
    return 'High confidence: permit data verified against jurisdiction-specific rules.';
  }
  if (confidence === AdvisorConfidenceLevel.HIGH) {
    return 'High confidence based on city-level permit heuristics.';
  }
  if (confidence === AdvisorConfidenceLevel.MEDIUM) {
    return `Medium confidence: permit rules are national defaults applied at ${jurisdictionLevel.toLowerCase()} level. Local requirements may differ.`;
  }
  if (confidence === AdvisorConfidenceLevel.LOW) {
    return 'Low confidence: permit data could only be resolved at state level. City/county requirements vary widely.';
  }
  return 'Confidence unavailable: jurisdiction could not be resolved for permit rules.';
}
