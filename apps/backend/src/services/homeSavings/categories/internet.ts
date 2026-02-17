import { HomeSavingsConfidence } from '@prisma/client';
import {
  CategoryEnsureAccountParams,
  CategoryGenerateOpportunitiesParams,
  CategoryModule,
  CategoryOpportunityDraft,
} from '../types';
import { amountToMonthly, asNumber, daysUntil, pickStateValue, round2, toRecord } from '../helpers';

const DEFAULT_MONTHLY_BASELINE = 75;

async function ensureAccount({ existingAccount }: CategoryEnsureAccountParams) {
  return existingAccount;
}

function readAlternatives(metadata: Record<string, unknown>, state: string | null | undefined): string[] {
  const alternativesByState = toRecord(metadata.alternativesByState);
  const normalizedState = (state || '').toUpperCase();

  const stateValue = alternativesByState[normalizedState];
  if (Array.isArray(stateValue)) {
    return stateValue.map((entry) => String(entry)).filter(Boolean);
  }

  const defaultValue = alternativesByState.default;
  if (Array.isArray(defaultValue)) {
    return defaultValue.map((entry) => String(entry)).filter(Boolean);
  }

  return [];
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
      headline: 'Add your internet bill to check savings',
      detail: 'Enter your monthly internet price so we can compare it with typical local rates.',
      rationaleJson: {
        reason: 'missing_internet_plan',
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

  const monthlyCost = amountToMonthly(asNumber(account.amount), account.billingCadence);
  if (monthlyCost === undefined) {
    return drafts;
  }

  const monthlyDelta = monthlyCost - monthlyBaseline;
  const alternatives = readAlternatives(metaRecord, property.state);
  const speedTier = String(toRecord(account.usageJson).speedTier || '').trim();

  if (monthlyDelta > 8) {
    const monthlySavings = round2(Math.max(monthlyDelta * 0.65, 0));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'You may be paying above typical internet rates',
      detail: `Current estimate is ${round2(monthlyCost)}/month vs local typical ${round2(
        monthlyBaseline
      )}/month.`,
      rationaleJson: {
        reason: 'internet_above_baseline',
        monthlyCost,
        monthlyBaseline,
        speedTier,
      },
      estimatedMonthlySavings: monthlySavings,
      estimatedAnnualSavings: round2(monthlySavings * 12),
      recommendedProviderName: alternatives[0] ?? null,
      recommendedPlanName: speedTier ? `${speedTier} plan comparison` : 'Compare similar-speed plans',
      offerJson: alternatives.length
        ? {
            providersToCheck: alternatives,
          }
        : undefined,
    });
  }

  const contractInDays = daysUntil(account.contractEndDate);
  if (contractInDays !== null && contractInDays >= 0 && contractInDays <= 45) {
    const monthlySavings = round2(Math.max(monthlyCost * 0.12, 5));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: `Contract ends in ${contractInDays} day${contractInDays === 1 ? '' : 's'}`,
      detail: 'This is usually the easiest time to switch or negotiate a lower promo rate.',
      rationaleJson: {
        reason: 'internet_contract_window',
        contractInDays,
      },
      estimatedMonthlySavings: monthlySavings,
      estimatedAnnualSavings: round2(monthlySavings * 12),
      recommendedProviderName: alternatives[0] ?? null,
    });
  }

  if (drafts.length === 0) {
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'Your internet plan looks close to local pricing',
      detail: 'Re-check every few months because provider promotions change frequently.',
      rationaleJson: {
        reason: 'internet_near_baseline',
      },
      estimatedMonthlySavings: 0,
      estimatedAnnualSavings: 0,
    });
  }

  return drafts.slice(0, 3);
}

export const internetCategory: CategoryModule = {
  categoryKey: 'INTERNET',
  ensureAccount,
  generateOpportunities,
};
