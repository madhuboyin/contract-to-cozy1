import {
  HomeSavingsAccountStatus,
  HomeSavingsBillingCadence,
  HomeSavingsConfidence,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  CategoryEnsureAccountParams,
  CategoryGenerateOpportunitiesParams,
  CategoryModule,
  CategoryOpportunityDraft,
} from '../types';
import { amountToAnnual, amountToMonthly, asNumber, daysUntil, pickStateValue, round2, toRecord } from '../helpers';

const DEFAULT_BASELINE_ANNUAL = 1900;
const DEFAULT_RENEWAL_WINDOW_DAYS = 45;

async function ensureAccount({
  homeownerProfileId,
  property,
  existingAccount,
}: CategoryEnsureAccountParams) {
  if (existingAccount) {
    if (!existingAccount.insurancePolicyId) {
      return existingAccount;
    }
    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: existingAccount.insurancePolicyId },
    });
    if (!policy) {
      return existingAccount;
    }
    if (
      existingAccount.providerName !== null
      || existingAccount.planName !== null
      || existingAccount.accountNumberMasked !== null
      || existingAccount.amount !== null
      || existingAccount.startDate !== null
      || existingAccount.renewalDate !== null
      || existingAccount.contractEndDate !== null
      || existingAccount.planDetailsJson !== null
    ) {
      await prisma.homeSavingsAccount.update({
        where: { id: existingAccount.id },
        data: {
          providerName: null,
          planName: null,
          accountNumberMasked: null,
          amount: null,
          startDate: null,
          renewalDate: null,
          contractEndDate: null,
          planDetailsJson: Prisma.JsonNull,
        },
      });
    }
    return {
      ...existingAccount,
      providerName: policy.carrierName,
      planName: policy.coverageType ?? 'Home insurance policy',
      accountNumberMasked:
        policy.policyNumber.length > 4
          ? `••••${policy.policyNumber.slice(-4)}`
          : policy.policyNumber,
      billingCadence: HomeSavingsBillingCadence.ANNUAL,
      amount: policy.premiumAmount,
      startDate: policy.startDate,
      renewalDate: policy.expiryDate,
      contractEndDate: null,
      planDetailsJson: {
        policyId: policy.id,
        deductibleAmount: asNumber(policy.deductibleAmount) ?? null,
        coverageType: policy.coverageType,
      },
    };
  }

  const latestPolicy = await prisma.insurancePolicy.findFirst({
    where: {
      homeownerProfileId,
      propertyId: property.id,
    },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });

  if (!latestPolicy) {
    return null;
  }

  const account = await prisma.homeSavingsAccount.create({
    data: {
      homeownerProfileId,
      propertyId: property.id,
      categoryKey: 'HOME_INSURANCE',
      status: HomeSavingsAccountStatus.ACTIVE,
      billingCadence: HomeSavingsBillingCadence.ANNUAL,
      currency: 'USD',
      insurancePolicyId: latestPolicy.id,
    },
  });
  return {
    ...account,
    providerName: latestPolicy.carrierName,
    planName: latestPolicy.coverageType ?? 'Home insurance policy',
    accountNumberMasked:
      latestPolicy.policyNumber.length > 4
        ? `••••${latestPolicy.policyNumber.slice(-4)}`
        : latestPolicy.policyNumber,
    amount: latestPolicy.premiumAmount,
    startDate: latestPolicy.startDate,
    renewalDate: latestPolicy.expiryDate,
    planDetailsJson: {
      policyId: latestPolicy.id,
      deductibleAmount: asNumber(latestPolicy.deductibleAmount) ?? null,
      coverageType: latestPolicy.coverageType,
    },
  };
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
      headline: 'Add your current premium to check savings',
      detail: 'Enter your current home insurance premium so we can estimate possible savings.',
      rationaleJson: {
        reason: 'missing_premium',
        message: 'No premium amount found for this property.',
      },
      estimatedMonthlySavings: null,
      estimatedAnnualSavings: null,
    });
    return drafts;
  }

  const metaRecord = toRecord(metadata);
  const baselineAnnualByState = toRecord(metaRecord.baselineAnnualByState);
  const renewalWindowDays = asNumber(metaRecord.renewalWindowDays) ?? DEFAULT_RENEWAL_WINDOW_DAYS;

  const annualCost = amountToAnnual(asNumber(account.amount), account.billingCadence);
  const monthlyCost = amountToMonthly(asNumber(account.amount), account.billingCadence);

  if (annualCost === undefined || monthlyCost === undefined) {
    return drafts;
  }

  const baselineAnnual = pickStateValue(baselineAnnualByState, property.state, DEFAULT_BASELINE_ANNUAL);
  const annualDelta = annualCost - baselineAnnual;

  if (annualDelta > 120) {
    const conservativeAnnualSavings = round2(Math.max(annualDelta * 0.5, 0));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: `You may be paying above typical rates in ${property.state || 'your area'}`,
      detail: `You pay about ${round2(monthlyCost)}/month. Similar homes often pay near ${round2(
        baselineAnnual / 12
      )}/month. Broad state-level estimate — not a live quote for your address.`,
      rationaleJson: {
        reason: 'above_baseline',
        annualCost,
        baselineAnnual,
      },
      estimatedMonthlySavings: round2(conservativeAnnualSavings / 12),
      estimatedAnnualSavings: conservativeAnnualSavings,
      recommendedProviderName: null,
      recommendedPlanName: 'Shop at least 2 renewal quotes',
    });
  }

  const renewalInDays = daysUntil(account.renewalDate ?? account.contractEndDate);
  if (renewalInDays !== null && renewalInDays >= 0 && renewalInDays <= renewalWindowDays) {
    const estimatedAnnualSavings = round2(Math.max(annualDelta, baselineAnnual * 0.08, 0));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: `Your renewal is in ${renewalInDays} day${renewalInDays === 1 ? '' : 's'}`,
      detail: 'Renewal window is usually the best time to compare rates and negotiate discounts. Amount shown is a broad estimate, not a quote.',
      rationaleJson: {
        reason: 'renewal_window',
        renewalInDays,
      },
      estimatedMonthlySavings: round2(estimatedAnnualSavings / 12),
      estimatedAnnualSavings,
    });
  }

  const planDetails = toRecord(account.planDetailsJson);
  const deductible = asNumber(planDetails.deductibleAmount);
  if (deductible !== undefined && deductible > 2500) {
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'Review deductible and discount options',
      detail:
        'A high deductible can lower premiums, but make sure it still fits your comfort level and emergency cash. Amount shown is a broad estimate, not a quote.',
      rationaleJson: {
        reason: 'deductible_review',
        deductible,
      },
      estimatedMonthlySavings: round2(monthlyCost * 0.05),
      estimatedAnnualSavings: round2(annualCost * 0.05),
    });
  }

  return drafts.slice(0, 3);
}

export const insuranceHomeCategory: CategoryModule = {
  categoryKey: 'HOME_INSURANCE',
  ensureAccount,
  generateOpportunities,
};
