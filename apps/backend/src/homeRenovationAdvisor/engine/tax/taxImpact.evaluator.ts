// apps/backend/src/homeRenovationAdvisor/engine/tax/taxImpact.evaluator.ts

import { AdvisorConfidenceLevel, AdvisorDataSourceType, RenovationProjectCostSource } from '@prisma/client';
import {
  AssumptionEntry,
  EvaluationContext,
  TaxImpactEvaluationResult,
} from '../../types/homeRenovationAdvisor.types';
import { getTaxRulesProvider } from './taxRules.provider';
import { scoreConfidenceFromSource } from '../confidence/confidence.service';

export async function evaluateTaxImpact(ctx: EvaluationContext): Promise<TaxImpactEvaluationResult> {
  const provider = getTaxRulesProvider();
  const rules = await provider.getTaxRules(
    ctx.renovationType,
    ctx.jurisdiction.state,
    ctx.jurisdiction.county,
    ctx.jurisdiction.postalCode,
  );

  const assumptions: AssumptionEntry[] = [];

  // Resolve project cost
  let projectCost = ctx.projectCostInput;
  let costIsAssumed = false;

  if (!projectCost || projectCost <= 0) {
    projectCost = rules.medianProjectCost;
    costIsAssumed = true;
    assumptions.push({
      assumptionKey: 'median_project_cost',
      assumptionLabel: `Median project cost used for ${ctx.renovationType.replace(/_/g, ' ')}`,
      assumptionValueText: `$${rules.medianProjectCost.toLocaleString()}`,
      assumptionValueNumber: rules.medianProjectCost,
      assumptionUnit: 'USD',
      sourceType: AdvisorDataSourceType.INTERNAL_RULE,
      confidenceLevel: AdvisorConfidenceLevel.MEDIUM,
      rationale: 'No project cost was provided. National median estimate used.',
      isUserVisible: true,
      displayOrder: 0,
    });
  }

  // Compute assessed value increase range
  const valueIncMin = Math.round(projectCost * rules.valueUpliftMin);
  const valueIncMax = Math.round(projectCost * rules.valueUpliftMax);

  assumptions.push({
    assumptionKey: 'value_uplift_multiplier',
    assumptionLabel: 'Value uplift multiplier applied',
    assumptionValueText: `${Math.round(rules.valueUpliftMin * 100)}%–${Math.round(rules.valueUpliftMax * 100)}% of project cost`,
    assumptionValueNumber: rules.valueUpliftMin,
    assumptionUnit: 'fraction',
    sourceType: AdvisorDataSourceType.INTERNAL_RULE,
    confidenceLevel: AdvisorConfidenceLevel.MEDIUM,
    rationale: rules.valueUpliftLabel,
    isUserVisible: true,
    displayOrder: 1,
  });

  // Millage rate
  if (rules.millageRateIsAssumed) {
    assumptions.push({
      assumptionKey: 'millage_rate_assumed',
      assumptionLabel: 'Property tax rate (national average assumed)',
      assumptionValueText: `${(rules.millageRate * 100).toFixed(2)}% of assessed value per year`,
      assumptionValueNumber: rules.millageRate,
      assumptionUnit: 'annual_rate',
      sourceType: AdvisorDataSourceType.INTERNAL_RULE,
      confidenceLevel: AdvisorConfidenceLevel.LOW,
      rationale: 'Local millage rate was not available. National average used (~1.1%).',
      isUserVisible: true,
      displayOrder: 2,
    });
  }

  // Annual and monthly tax increase
  const annualMin = Math.round(valueIncMin * rules.millageRate);
  const annualMax = Math.round(valueIncMax * rules.millageRate);
  const monthlyMin = Math.round(annualMin / 12);
  const monthlyMax = Math.round(annualMax / 12);

  // Confidence scoring
  const baseConfidence = scoreConfidenceFromSource(rules.sourceType);
  const jurisdictionPenalty = ctx.jurisdiction.state ? 0 : 1;
  const costPenalty = costIsAssumed ? 1 : 0;
  const finalConfidence = penalizeConfidence(baseConfidence, jurisdictionPenalty + costPenalty);

  const confidenceReason = buildTaxConfidenceReason(finalConfidence, costIsAssumed, ctx.jurisdiction.jurisdictionLevel);

  // Plain language summary
  const plainLanguageSummary = buildTaxSummary(
    ctx.renovationType,
    valueIncMin,
    valueIncMax,
    annualMin,
    annualMax,
    monthlyMin,
    monthlyMax,
    rules.reassessmentTimelineSummary,
    costIsAssumed,
  );

  return {
    confidenceLevel: finalConfidence,
    confidenceReason,
    assessedValueIncreaseMin: valueIncMin,
    assessedValueIncreaseMax: valueIncMax,
    annualTaxIncreaseMin: annualMin,
    annualTaxIncreaseMax: annualMax,
    monthlyTaxIncreaseMin: monthlyMin,
    monthlyTaxIncreaseMax: monthlyMax,
    reassessmentTriggerType: rules.reassessmentTriggerType,
    reassessmentTimelineSummary: rules.reassessmentTimelineSummary,
    reassessmentRuleSummary: rules.reassessmentRuleSummary,
    plainLanguageSummary,
    millageRateSnapshot: rules.millageRate,
    taxModelRegion: ctx.jurisdiction.state ?? 'national',
    valueUpliftMethod: 'internal_heuristic_by_renovation_type',
    dataAvailable: true,
    sourceType: rules.sourceType,
    sourceLabel: rules.sourceLabel,
    sourceReferenceUrl: rules.sourceReferenceUrl,
    sourceRefreshedAt: null,
    notes: null,
    assumptions,
  };
}

function penalizeConfidence(base: AdvisorConfidenceLevel, penalty: number): AdvisorConfidenceLevel {
  const levels: AdvisorConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE'];
  const idx = levels.indexOf(base);
  return levels[Math.min(idx + penalty, levels.length - 1)];
}

function buildTaxConfidenceReason(
  confidence: AdvisorConfidenceLevel,
  costIsAssumed: boolean,
  jurisdictionLevel: string,
): string {
  const reasons: string[] = [];
  if (costIsAssumed) reasons.push('project cost was estimated from national median');
  if (jurisdictionLevel !== 'CITY' && jurisdictionLevel !== 'ZIP') {
    reasons.push('tax rate is a national average');
  }
  if (reasons.length === 0) {
    return confidence === 'HIGH'
      ? 'High confidence: project cost and tax rate both provided or verified.'
      : 'Medium confidence based on available inputs.';
  }
  return `Medium confidence because ${reasons.join(' and ')}.`;
}

function buildTaxSummary(
  _renovationType: string,
  valueIncMin: number,
  valueIncMax: number,
  annualMin: number,
  annualMax: number,
  monthlyMin: number,
  monthlyMax: number,
  triggerSummary: string,
  costIsAssumed: boolean,
): string {
  const costNote = costIsAssumed ? ' (based on a national median estimate)' : '';
  return (
    `This renovation may increase your home's assessed value by approximately $${valueIncMin.toLocaleString()}–$${valueIncMax.toLocaleString()}${costNote}. ` +
    `Estimated annual property tax increase: $${annualMin.toLocaleString()}–$${annualMax.toLocaleString()} (~$${monthlyMin}–$${monthlyMax}/month). ` +
    triggerSummary
  );
}
