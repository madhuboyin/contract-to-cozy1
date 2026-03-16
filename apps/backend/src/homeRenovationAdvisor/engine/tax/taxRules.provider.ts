// apps/backend/src/homeRenovationAdvisor/engine/tax/taxRules.provider.ts

import { AdvisorDataSourceType, HomeRenovationType, PropertyTaxReassessmentTriggerType } from '@prisma/client';
import {
  DEFAULT_MILLAGE_RATE,
  DEFAULT_TAX_TRIGGER,
  MEDIAN_PROJECT_COST_BY_TYPE,
  STATE_TAX_TRIGGER_DEFAULTS,
  TAX_RULES_VERSION,
  VALUE_UPLIFT_MULTIPLIER_BY_TYPE,
} from './taxRules.data';

export interface TaxRulesProviderResult {
  medianProjectCost: number;
  projectCostLow: number;
  projectCostHigh: number;
  valueUpliftMin: number;   // fraction e.g. 0.5
  valueUpliftMax: number;   // fraction e.g. 0.8
  valueUpliftLabel: string;
  reassessmentTriggerType: PropertyTaxReassessmentTriggerType;
  reassessmentTimelineSummary: string;
  reassessmentRuleSummary: string;
  millageRate: number;
  millageRateIsAssumed: boolean;
  dataAvailable: boolean;
  sourceType: AdvisorDataSourceType;
  sourceLabel: string;
  sourceReferenceUrl: string | null;
  providerVersion: string;
}

export interface ITaxRulesProvider {
  getTaxRules(
    renovationType: HomeRenovationType,
    state: string | null,
    county: string | null,
    postalCode: string | null,
  ): Promise<TaxRulesProviderResult>;
}

export class FallbackTaxRulesProvider implements ITaxRulesProvider {
  async getTaxRules(
    renovationType: HomeRenovationType,
    state: string | null,
    _county: string | null,
    _postalCode: string | null,
  ): Promise<TaxRulesProviderResult> {
    const costData = MEDIAN_PROJECT_COST_BY_TYPE[renovationType];
    const upliftData = VALUE_UPLIFT_MULTIPLIER_BY_TYPE[renovationType];
    const triggerData = (state && STATE_TAX_TRIGGER_DEFAULTS[state.toUpperCase()])
      ? STATE_TAX_TRIGGER_DEFAULTS[state.toUpperCase()]
      : DEFAULT_TAX_TRIGGER;

    return {
      medianProjectCost: costData.median,
      projectCostLow: costData.low,
      projectCostHigh: costData.high,
      valueUpliftMin: upliftData.min,
      valueUpliftMax: upliftData.max,
      valueUpliftLabel: upliftData.label,
      reassessmentTriggerType: triggerData.triggerType,
      reassessmentTimelineSummary: triggerData.summary,
      reassessmentRuleSummary: triggerData.ruleSummary,
      millageRate: DEFAULT_MILLAGE_RATE,
      millageRateIsAssumed: true,
      dataAvailable: true,
      sourceType: AdvisorDataSourceType.INTERNAL_RULE,
      sourceLabel: 'Internal tax heuristics (national defaults)',
      sourceReferenceUrl: null,
      providerVersion: TAX_RULES_VERSION,
    };
  }
}

export function getTaxRulesProvider(): ITaxRulesProvider {
  // Future: return new CoreLogicTaxProvider() or similar
  return new FallbackTaxRulesProvider();
}
