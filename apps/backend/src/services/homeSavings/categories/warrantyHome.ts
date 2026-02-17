import { HomeSavingsAccountStatus, HomeSavingsBillingCadence, HomeSavingsConfidence } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  CategoryEnsureAccountParams,
  CategoryGenerateOpportunitiesParams,
  CategoryModule,
  CategoryOpportunityDraft,
} from '../types';
import { amountToAnnual, amountToMonthly, asNumber, daysUntil, round2, toRecord } from '../helpers';

const DEFAULT_BASELINE_ANNUAL = 720;
const DEFAULT_RENEWAL_WINDOW_DAYS = 45;

async function ensureAccount({
  homeownerProfileId,
  property,
  existingAccount,
}: CategoryEnsureAccountParams) {
  if (existingAccount) {
    return existingAccount;
  }

  const activeWarranty = await prisma.warranty.findFirst({
    where: {
      homeownerProfileId,
      propertyId: property.id,
    },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
  });

  if (!activeWarranty) {
    return null;
  }

  return prisma.homeSavingsAccount.create({
    data: {
      homeownerProfileId,
      propertyId: property.id,
      categoryKey: 'HOME_WARRANTY',
      status: HomeSavingsAccountStatus.ACTIVE,
      providerName: activeWarranty.providerName,
      planName: activeWarranty.category,
      billingCadence: HomeSavingsBillingCadence.ANNUAL,
      amount: activeWarranty.cost,
      currency: 'USD',
      startDate: activeWarranty.startDate,
      renewalDate: activeWarranty.expiryDate,
      contractEndDate: activeWarranty.expiryDate,
      warrantyId: activeWarranty.id,
    },
  });
}

async function generateOpportunities({
  account,
  metadata,
}: CategoryGenerateOpportunitiesParams): Promise<CategoryOpportunityDraft[]> {
  const drafts: CategoryOpportunityDraft[] = [];

  if (!account || asNumber(account.amount) === undefined) {
    drafts.push({
      confidence: HomeSavingsConfidence.LOW,
      headline: 'Add your warranty cost to compare plans',
      detail: 'Enter your current monthly or annual warranty cost to estimate possible savings.',
      rationaleJson: {
        reason: 'missing_warranty_cost',
      },
      estimatedMonthlySavings: null,
      estimatedAnnualSavings: null,
    });
    return drafts;
  }

  const metaRecord = toRecord(metadata);
  const baselineAnnual = asNumber(metaRecord.baselineAnnual) ?? DEFAULT_BASELINE_ANNUAL;
  const renewalWindowDays = asNumber(metaRecord.renewalWindowDays) ?? DEFAULT_RENEWAL_WINDOW_DAYS;

  const annualCost = amountToAnnual(asNumber(account.amount), account.billingCadence);
  const monthlyCost = amountToMonthly(asNumber(account.amount), account.billingCadence);

  if (annualCost === undefined || monthlyCost === undefined) {
    return drafts;
  }

  const annualDelta = annualCost - baselineAnnual;
  if (annualDelta > 60) {
    const annualSavings = round2(Math.max(annualDelta * 0.55, 0));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'Your warranty cost looks above typical plans',
      detail: `Current estimate is ${round2(monthlyCost)}/month. Similar plans are often around ${round2(
        baselineAnnual / 12
      )}/month.`,
      rationaleJson: {
        reason: 'warranty_above_baseline',
        annualCost,
        baselineAnnual,
      },
      estimatedMonthlySavings: round2(annualSavings / 12),
      estimatedAnnualSavings: annualSavings,
      recommendedPlanName: 'Compare 2-3 warranty providers before renewal',
    });
  }

  const renewalInDays = daysUntil(account.renewalDate ?? account.contractEndDate);
  if (renewalInDays !== null && renewalInDays >= 0 && renewalInDays <= renewalWindowDays) {
    const annualSavings = round2(Math.max(annualDelta, annualCost * 0.1, 0));
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: `Warranty renewal is in ${renewalInDays} day${renewalInDays === 1 ? '' : 's'}`,
      detail: 'Compare plan limits and service fees now before auto-renewal pricing kicks in.',
      rationaleJson: {
        reason: 'warranty_renewal_window',
        renewalInDays,
      },
      estimatedMonthlySavings: round2(annualSavings / 12),
      estimatedAnnualSavings: annualSavings,
    });
  }

  if (drafts.length === 0) {
    drafts.push({
      confidence: HomeSavingsConfidence.MEDIUM,
      headline: 'Your current warranty spend looks close to typical',
      detail: 'Keep this plan if service quality is good. Re-check at renewal time.',
      rationaleJson: {
        reason: 'warranty_looks_reasonable',
      },
      estimatedMonthlySavings: 0,
      estimatedAnnualSavings: 0,
    });
  }

  return drafts.slice(0, 3);
}

export const warrantyHomeCategory: CategoryModule = {
  categoryKey: 'HOME_WARRANTY',
  ensureAccount,
  generateOpportunities,
};
