import { HomeSavingsConfidence } from '@prisma/client';
import {
  CategoryEnsureAccountParams,
  CategoryGenerateOpportunitiesParams,
  CategoryModule,
  CategoryOpportunityDraft,
} from '../types';
import { amountToMonthly, asNumber, pickStateValue, round2, toRecord } from '../helpers';

const DEFAULT_MONTHLY_BASELINE = 220;

async function ensureAccount({ existingAccount }: CategoryEnsureAccountParams) {
  return existingAccount;
}

async function generateOpportunities({
  account,
  metadata,
  property,
}: CategoryGenerateOpportunitiesParams): Promise<CategoryOpportunityDraft[]> {
  const drafts: CategoryOpportunityDraft[] = [];

  if (!account || asNumber(account.amount) === undefined) {
    drafts.push({
      confidence: HomeSavingsConfidence.LOW,
      headline: 'Add your utility bill to check savings',
      detail: 'Enter your electricity/gas amount to compare against typical nearby monthly bills.',
      rationaleJson: {
        reason: 'missing_utility_plan',
      },
      estimatedMonthlySavings: null,
      estimatedAnnualSavings: null,
    });
    return drafts;
  }

  const metaRecord = toRecord(metadata);
  const monthlyBaseline = pickStateValue(
    toRecord(metaRecord.typicalMonthlyByState),
    property.state,
    DEFAULT_MONTHLY_BASELINE
  );
  const savingsPctRange = toRecord(metaRecord.savingsPctRange);
  const pctMin = asNumber(savingsPctRange.min) ?? 5;
  const pctMax = asNumber(savingsPctRange.max) ?? 15;

  const monthlyCost = amountToMonthly(asNumber(account.amount), account.billingCadence);
  if (monthlyCost === undefined) {
    return drafts;
  }

  const monthlyDelta = monthlyCost - monthlyBaseline;
  if (monthlyDelta > 12) {
    const monthlySavings = round2(Math.max(monthlyCost * (pctMin / 100), 8));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'Your monthly utility cost looks above typical',
      detail: `You pay about ${round2(monthlyCost)}/month. Similar homes often pay near ${round2(
        monthlyBaseline
      )}/month.`,
      rationaleJson: {
        reason: 'utility_above_baseline',
        monthlyCost,
        monthlyBaseline,
      },
      estimatedMonthlySavings: monthlySavings,
      estimatedAnnualSavings: round2(monthlySavings * 12),
    });
  }

  const planDetails = toRecord(account.planDetailsJson);
  const rateType = String(planDetails.rateType || '').toUpperCase();
  if (rateType === 'VARIABLE') {
    const monthlySavings = round2(Math.max(monthlyCost * (pctMin / 100), 6));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'A fixed-rate plan could reduce bill swings',
      detail: 'Variable rates can spike seasonally. Compare fixed-rate options to stabilize monthly cost.',
      rationaleJson: {
        reason: 'variable_rate_flag',
      },
      estimatedMonthlySavings: monthlySavings,
      estimatedAnnualSavings: round2(monthlySavings * 12),
    });
  }

  const usage = toRecord(account.usageJson);
  const monthlyKwh = asNumber(usage.kwhMonthly);
  if (monthlyKwh !== undefined && monthlyKwh > 1200) {
    const monthlySavings = round2(Math.max(monthlyCost * (pctMax / 100), 10));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'High usage suggests quick efficiency wins',
      detail:
        'Simple upgrades like thermostat scheduling and weather sealing can lower bills without changing comfort.',
      rationaleJson: {
        reason: 'high_usage_efficiency',
        monthlyKwh,
      },
      estimatedMonthlySavings: monthlySavings,
      estimatedAnnualSavings: round2(monthlySavings * 12),
    });
  }

  if (drafts.length === 0) {
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'Your utility spend looks reasonable right now',
      detail: 'Keep monitoring seasonal peaks and re-check if rates or usage change.',
      rationaleJson: {
        reason: 'utility_near_baseline',
      },
      estimatedMonthlySavings: 0,
      estimatedAnnualSavings: 0,
    });
  }

  return drafts.slice(0, 3);
}

export const electricityGasCategory: CategoryModule = {
  categoryKey: 'ELECTRICITY_GAS',
  ensureAccount,
  generateOpportunities,
};
