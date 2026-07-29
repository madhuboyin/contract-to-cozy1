import {
  HomeSavingsAccount,
  HomeSavingsAccountStatus,
  HomeSavingsBillingCadence,
  HomeSavingsConfidence,
  HomeSavingsOpportunity,
  HomeSavingsResultKind,
  HomeSavingsOpportunityStatus,
  HomeSavingsRunTrigger,
  InsurancePolicy,
  Prisma,
  Warranty,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ALL_HOME_SAVINGS_CATEGORY_MODULES, getCategoryModule } from './homeSavings/homeSavings.categories';
import {
  AccountUpsertPayload,
  CategoryModule,
  HOME_SAVINGS_CATEGORY_KEYS,
  HOME_SAVINGS_CATEGORY_SEEDS,
  HomeSavingsCategoryKey,
  OpportunityStatusInput,
  RunComparisonInput,
} from './homeSavings/types';
import {
  amountToAnnual,
  amountToMonthly,
  asNumber,
  calculateEstimatedPaybackMonths,
  highestSingleAnnualSavings,
  round2,
  toRecord,
} from './homeSavings/helpers';
import { signalService } from './signal.service';
import { logger } from '../lib/logger';
import { getFinancialContextDecisions } from './financialContext/context';

export type HomeSavingsCategoryStatus = 'NOT_SET_UP' | 'CONNECTED' | 'FOUND_SAVINGS';

export type HomeSavingsCategoryDTO = {
  key: HomeSavingsCategoryKey;
  label: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
  metadata: Record<string, unknown>;
};

export type HomeSavingsAccountDTO = {
  id: string;
  categoryKey: HomeSavingsCategoryKey;
  status: HomeSavingsAccountStatus;
  providerName: string | null;
  planName: string | null;
  accountNumberMasked: string | null;
  billingCadence: HomeSavingsBillingCadence;
  amount: number | null;
  monthlyAmount: number | null;
  annualAmount: number | null;
  currency: string;
  startDate: string | null;
  renewalDate: string | null;
  contractEndDate: string | null;
  usageJson: Prisma.JsonValue | null;
  planDetailsJson: Prisma.JsonValue | null;
};

export type HomeSavingsOpportunityDTO = {
  id: string;
  categoryKey: HomeSavingsCategoryKey;
  accountId: string | null;
  status: HomeSavingsOpportunityStatus;
  confidence: HomeSavingsConfidence;
  resultKind: HomeSavingsResultKind;
  headline: string;
  detail: string | null;
  estimatedMonthlySavings: number | null;
  estimatedAnnualSavings: number | null;
  /** Modeled, category-level assumption — never a real per-provider quote. See ASSUMED_SWITCHING_COST. */
  estimatedSwitchingCost: number | null;
  /** estimatedAnnualSavings net of estimatedSwitchingCost (first year only). Null when there's no gross estimate to net against. */
  netAnnualSavings: number | null;
  /** Months for gross monthly savings to recover modeled switching friction. */
  estimatedPaybackMonths: number | null;
  /** EQUIVALENT only when the comparison controlled for a real matching attribute (e.g. same speed tier) — never assumed. */
  equivalenceState: 'EQUIVALENT' | 'NOT_EQUIVALENT' | 'UNKNOWN';
  /** What backs the dollar figure — always BENCHMARK_ESTIMATE today; no address-qualified connector exists yet (HSB-021). */
  offerSourceKind: 'BENCHMARK_ESTIMATE' | 'ADDRESS_QUALIFIED';
  currency: string;
  recommendedProviderName: string | null;
  recommendedPlanName: string | null;
  offerJson: Prisma.JsonValue | null;
  actionUrl: string | null;
  expiresAt: string | null;
  generatedAt: string;
};

export type HomeSavingsSummaryCategoryDTO = {
  category: HomeSavingsCategoryDTO;
  status: HomeSavingsCategoryStatus;
  account: HomeSavingsAccountDTO | null;
  topOpportunity: HomeSavingsOpportunityDTO | null;
};

export type HomeSavingsSummaryDTO = {
  homeownerProfileId: string;
  propertyId: string;
  potentialMonthlySavings: number;
  potentialAnnualSavings: number;
  potentialSavingsAggregation: 'HIGHEST_SINGLE_NET_ANNUAL';
  categories: HomeSavingsSummaryCategoryDTO[];
  updatedAt: string;
  propertyContextVersion: string | null;
};

function readContextVersion(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const version = (value as Record<string, unknown>).propertyContextVersion;
  return typeof version === 'string' ? version : null;
}

export type HomeSavingsCategoryDetailDTO = {
  category: HomeSavingsCategoryDTO;
  account: HomeSavingsAccountDTO | null;
  opportunities: HomeSavingsOpportunityDTO[];
};

const ACTIVE_POTENTIAL_STATUSES: HomeSavingsOpportunityStatus[] = [
  HomeSavingsOpportunityStatus.NEW,
  HomeSavingsOpportunityStatus.VIEWED,
  HomeSavingsOpportunityStatus.SAVED,
];

const EXPIRABLE_STATUSES: HomeSavingsOpportunityStatus[] = [
  HomeSavingsOpportunityStatus.NEW,
  HomeSavingsOpportunityStatus.VIEWED,
  HomeSavingsOpportunityStatus.SAVED,
];

function normalizeCategoryKey(categoryKey: string): HomeSavingsCategoryKey {
  if ((HOME_SAVINGS_CATEGORY_KEYS as readonly string[]).includes(categoryKey)) {
    return categoryKey as HomeSavingsCategoryKey;
  }

  throw new Error(`Unsupported home savings category: ${categoryKey}`);
}

function parseDateInput(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date format supplied.');
  }
  return parsed;
}

function serializeCategory(category: {
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isEnabled: boolean;
  metadata: Prisma.JsonValue | null;
}): HomeSavingsCategoryDTO {
  return {
    key: normalizeCategoryKey(category.key),
    label: category.label,
    description: category.description ?? '',
    sortOrder: category.sortOrder,
    enabled: category.isEnabled,
    metadata: toRecord(category.metadata),
  };
}

type HomeSavingsAccountWithCanonical = HomeSavingsAccount & {
  insurancePolicy?: InsurancePolicy | null;
  warranty?: Warranty | null;
};

function effectiveAccountFacts(account: HomeSavingsAccountWithCanonical) {
  if (account.insurancePolicyId && account.insurancePolicy) {
    const policy = account.insurancePolicy;
    return {
      providerName: policy.carrierName,
      planName: policy.coverageType ?? 'Home insurance policy',
      accountNumberMasked:
        policy.policyNumber.length > 4 ? `••••${policy.policyNumber.slice(-4)}` : policy.policyNumber,
      billingCadence: HomeSavingsBillingCadence.ANNUAL,
      amount: asNumber(policy.premiumAmount) ?? null,
      startDate: policy.startDate,
      renewalDate: policy.expiryDate,
      contractEndDate: null,
      planDetailsJson: {
        policyId: policy.id,
        deductibleAmount: asNumber(policy.deductibleAmount) ?? null,
        coverageType: policy.coverageType,
      } as Prisma.JsonValue,
    };
  }
  if (account.warrantyId && account.warranty) {
    const warranty = account.warranty;
    return {
      providerName: warranty.providerName,
      planName: warranty.category,
      accountNumberMasked: null,
      billingCadence: HomeSavingsBillingCadence.ANNUAL,
      amount: asNumber(warranty.cost) ?? null,
      startDate: warranty.startDate,
      renewalDate: warranty.expiryDate,
      contractEndDate: warranty.expiryDate,
      planDetailsJson: null,
    };
  }
  return {
    providerName: account.providerName,
    planName: account.planName,
    accountNumberMasked: account.accountNumberMasked,
    billingCadence: account.billingCadence,
    amount: asNumber(account.amount) ?? null,
    startDate: account.startDate,
    renewalDate: account.renewalDate,
    contractEndDate: account.contractEndDate,
    planDetailsJson: account.planDetailsJson,
  };
}

function serializeAccount(account: HomeSavingsAccountWithCanonical): HomeSavingsAccountDTO {
  const facts = effectiveAccountFacts(account);
  const amount = facts.amount;
  const monthlyAmount = amount !== null ? amountToMonthly(amount, facts.billingCadence) ?? null : null;
  const annualAmount = amount !== null ? amountToAnnual(amount, facts.billingCadence) ?? null : null;

  return {
    id: account.id,
    categoryKey: normalizeCategoryKey(account.categoryKey),
    status: account.status,
    providerName: facts.providerName ?? null,
    planName: facts.planName ?? null,
    accountNumberMasked: facts.accountNumberMasked ?? null,
    billingCadence: facts.billingCadence,
    amount,
    monthlyAmount,
    annualAmount,
    currency: account.currency,
    startDate: facts.startDate ? facts.startDate.toISOString() : null,
    renewalDate: facts.renewalDate ? facts.renewalDate.toISOString() : null,
    contractEndDate: facts.contractEndDate ? facts.contractEndDate.toISOString() : null,
    usageJson: account.usageJson ?? null,
    planDetailsJson: facts.planDetailsJson ?? null,
  };
}

function serializeOpportunity(opportunity: HomeSavingsOpportunity): HomeSavingsOpportunityDTO {
  const estimatedMonthlySavings = asNumber(opportunity.estimatedMonthlySavings) ?? null;
  const estimatedAnnualSavings = asNumber(opportunity.estimatedAnnualSavings) ?? null;
  const estimatedSwitchingCost = asNumber(opportunity.estimatedSwitchingCost) ?? null;
  const estimatedPaybackMonths = calculateEstimatedPaybackMonths(
    estimatedMonthlySavings,
    estimatedAnnualSavings,
    estimatedSwitchingCost,
  );
  return {
    id: opportunity.id,
    categoryKey: normalizeCategoryKey(opportunity.categoryKey),
    accountId: opportunity.accountId ?? null,
    status: opportunity.status,
    confidence: opportunity.confidence,
    resultKind: opportunity.resultKind,
    headline: opportunity.headline,
    detail: opportunity.detail ?? null,
    estimatedMonthlySavings,
    estimatedAnnualSavings,
    estimatedSwitchingCost,
    netAnnualSavings: asNumber(opportunity.netAnnualSavings) ?? null,
    estimatedPaybackMonths,
    equivalenceState: opportunity.equivalenceState,
    offerSourceKind: opportunity.offerSourceKind,
    currency: opportunity.currency,
    recommendedProviderName: opportunity.recommendedProviderName ?? null,
    recommendedPlanName: opportunity.recommendedPlanName ?? null,
    offerJson: opportunity.offerJson ?? null,
    actionUrl: opportunity.actionUrl ?? null,
    expiresAt: opportunity.expiresAt ? opportunity.expiresAt.toISOString() : null,
    generatedAt: opportunity.generatedAt.toISOString(),
  };
}

function computeCategoryStatus(
  account: HomeSavingsAccountWithCanonical | null,
  opportunities: HomeSavingsOpportunity[]
): HomeSavingsCategoryStatus {
  const hasAccountAmount = account && effectiveAccountFacts(account).amount !== null;
  if (!hasAccountAmount) {
    return 'NOT_SET_UP';
  }

  const hasSavings = opportunities.some((opportunity) => {
    const monthly = asNumber(opportunity.estimatedMonthlySavings) ?? 0;
    const annual = asNumber(opportunity.estimatedAnnualSavings) ?? 0;
    return monthly > 0 || annual > 0;
  });

  return hasSavings ? 'FOUND_SAVINGS' : 'CONNECTED';
}

export function classifyHomeSavingsResultKind(
  draft: import('./homeSavings/types').CategoryOpportunityDraft,
): HomeSavingsResultKind {
  const rationale = toRecord(draft.rationaleJson ?? null);
  const reason = typeof rationale.reason === 'string' ? rationale.reason : '';
  if (reason.startsWith('missing_') || reason.startsWith('needs_')) {
    return HomeSavingsResultKind.READINESS;
  }
  const monthly = draft.estimatedMonthlySavings ?? 0;
  const annual = draft.estimatedAnnualSavings ?? 0;
  return monthly > 0 || annual > 0
    ? HomeSavingsResultKind.BENCHMARK_OPPORTUNITY
    : HomeSavingsResultKind.OBSERVATION;
}

async function assertPropertyForUser(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: {
      id: true,
      homeownerProfileId: true,
      state: true,
      zipCode: true,
    },
  });

  if (!property?.homeownerProfileId) {
    throw new Error('Property not found or access denied.');
  }

  return property;
}

async function ensureCategoriesSeeded() {
  for (const seed of HOME_SAVINGS_CATEGORY_SEEDS) {
    await prisma.homeSavingsCategory.upsert({
      where: { key: seed.key },
      update: {
        label: seed.label,
        description: seed.description,
        sortOrder: seed.sortOrder,
        isEnabled: true,
        metadata: seed.metadata,
      },
      create: {
        key: seed.key,
        label: seed.label,
        description: seed.description,
        sortOrder: seed.sortOrder,
        isEnabled: true,
        metadata: seed.metadata,
      },
    });
  }
}

async function getEnabledCategories() {
  await ensureCategoriesSeeded();
  return prisma.homeSavingsCategory.findMany({
    where: {
      key: { in: [...HOME_SAVINGS_CATEGORY_KEYS] },
      isEnabled: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
  });
}

async function getLatestAccountByCategory(homeownerProfileId: string, propertyId: string, categoryKey: HomeSavingsCategoryKey) {
  return prisma.homeSavingsAccount.findFirst({
    where: {
      homeownerProfileId,
      propertyId,
      categoryKey,
    },
    include: { insurancePolicy: true, warranty: true },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

async function getPotentialOpportunitiesByCategory(homeownerProfileId: string, propertyId: string) {
  const opportunities = await prisma.homeSavingsOpportunity.findMany({
    where: {
      homeownerProfileId,
      propertyId,
      categoryKey: { in: [...HOME_SAVINGS_CATEGORY_KEYS] },
      status: { in: ACTIVE_POTENTIAL_STATUSES },
    },
    orderBy: [{ generatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  const grouped = new Map<HomeSavingsCategoryKey, HomeSavingsOpportunity[]>();
  for (const opportunity of opportunities) {
    const key = normalizeCategoryKey(opportunity.categoryKey);
    const list = grouped.get(key) ?? [];
    list.push(opportunity);
    grouped.set(key, list);
  }

  for (const [key, list] of grouped.entries()) {
    grouped.set(
      key,
      [...list].sort((a, b) => {
        const annualDiff = (asNumber(b.estimatedAnnualSavings) ?? 0) - (asNumber(a.estimatedAnnualSavings) ?? 0);
        if (annualDiff !== 0) return annualDiff;
        return b.generatedAt.getTime() - a.generatedAt.getTime();
      })
    );
  }

  return grouped;
}

function mapCategoryModule(modules: CategoryModule[]) {
  const map = new Map<HomeSavingsCategoryKey, CategoryModule>();
  modules.forEach((module) => map.set(module.categoryKey, module));
  return map;
}

// Modeled, category-level assumption about the one-time friction cost of
// actually switching (HSB-023) — never a real per-provider quote, since no
// category module has access to real fee data. Kept modest and always
// surfaced to the homeowner as an assumption, never presented as a firm fee.
const ASSUMED_SWITCHING_COST: Record<HomeSavingsCategoryKey, number> = {
  HOME_INSURANCE: 25, // admin/hassle cost; carriers rarely charge to switch
  HOME_WARRANTY: 50, // typical cancellation/transfer admin fee
  INTERNET: 75, // equipment return / self-install, when not under an ETF
  ELECTRICITY_GAS: 0, // deregulated supplier switches are typically free
};

/**
 * netAnnualSavings = estimatedAnnualSavings - the category's assumed
 * one-time switching cost (first-year only — the cost doesn't recur).
 * Null when there's no positive gross estimate to net against.
 */
function computeNetAnnualSavings(
  categoryKey: HomeSavingsCategoryKey,
  estimatedAnnualSavings: number | null | undefined,
): { switchingCost: number; netAnnualSavings: number | null } {
  const switchingCost = ASSUMED_SWITCHING_COST[categoryKey] ?? 0;
  if (estimatedAnnualSavings == null) return { switchingCost, netAnnualSavings: null };
  return { switchingCost, netAnnualSavings: round2(estimatedAnnualSavings - switchingCost) };
}

/**
 * EQUIVALENT only when the draft itself recorded a real controlled-for
 * comparison attribute (e.g. internet comparing the same speed tier) —
 * never defaults to EQUIVALENT for a bare state-average benchmark
 * (HSB-022). Conservative by design: UNKNOWN is always safe; EQUIVALENT
 * must be earned by the draft's own rationale.
 */
function inferEquivalenceState(rationaleJson: Prisma.JsonValue | null | undefined): 'EQUIVALENT' | 'UNKNOWN' {
  const rationale = toRecord(rationaleJson);
  const hasControlledAttribute = typeof rationale.speedTier === 'string' && rationale.speedTier.trim().length > 0;
  return hasControlledAttribute ? 'EQUIVALENT' : 'UNKNOWN';
}

export class HomeSavingsService {
  async listCategories(): Promise<{ categories: HomeSavingsCategoryDTO[] }> {
    const categories = await getEnabledCategories();
    return {
      categories: categories.map(serializeCategory),
    };
  }

  async getSummary(propertyId: string, userId: string): Promise<HomeSavingsSummaryDTO> {
    const property = await assertPropertyForUser(propertyId, userId);
    const categories = await getEnabledCategories();
    const opportunitiesByCategory = await getPotentialOpportunitiesByCategory(
      property.homeownerProfileId,
      property.id
    );

    const categorySummaries: HomeSavingsSummaryCategoryDTO[] = [];
    const latestRun = await prisma.homeSavingsRun.findFirst({
      where: { propertyId: property.id, homeownerProfileId: property.homeownerProfileId },
      orderBy: [{ ranAt: 'desc' }, { createdAt: 'desc' }],
      select: { inputsJson: true },
    });

    for (const category of categories) {
      const categoryKey = normalizeCategoryKey(category.key);
      const account = await getLatestAccountByCategory(property.homeownerProfileId, property.id, categoryKey);
      const categoryOpportunities = opportunitiesByCategory.get(categoryKey) ?? [];
      const topOpportunity = categoryOpportunities[0] ?? null;

      categorySummaries.push({
        category: serializeCategory(category),
        status: computeCategoryStatus(account, categoryOpportunities),
        account: account ? serializeAccount(account) : null,
        topOpportunity: topOpportunity ? serializeOpportunity(topOpportunity) : null,
      });
    }
    const highestSingleNetAnnualSavings = highestSingleAnnualSavings(
      categorySummaries.flatMap(({ topOpportunity }) =>
        topOpportunity
          ? [{
              netAnnualSavings: topOpportunity.netAnnualSavings,
              estimatedAnnualSavings: topOpportunity.estimatedAnnualSavings,
            }]
          : []),
    );

    return {
      homeownerProfileId: property.homeownerProfileId,
      propertyId: property.id,
      potentialMonthlySavings: round2(highestSingleNetAnnualSavings / 12),
      potentialAnnualSavings: round2(highestSingleNetAnnualSavings),
      potentialSavingsAggregation: 'HIGHEST_SINGLE_NET_ANNUAL',
      categories: categorySummaries,
      updatedAt: new Date().toISOString(),
      propertyContextVersion: readContextVersion(latestRun?.inputsJson ?? null),
    };
  }

  async getCategoryDetail(
    propertyId: string,
    categoryKeyInput: string,
    userId: string
  ): Promise<HomeSavingsCategoryDetailDTO> {
    const property = await assertPropertyForUser(propertyId, userId);
    const categoryKey = normalizeCategoryKey(categoryKeyInput);

    const categories = await getEnabledCategories();
    const category = categories.find((entry) => entry.key === categoryKey);
    if (!category) {
      throw new Error('Home savings category is not enabled.');
    }

    const account = await getLatestAccountByCategory(property.homeownerProfileId, property.id, categoryKey);

    const module = getCategoryModule(categoryKey);
    const ensuredAccount = await module.ensureAccount({
      homeownerProfileId: property.homeownerProfileId,
      property,
      existingAccount: account,
      metadata: toRecord(category.metadata),
    });

    const opportunities = await prisma.homeSavingsOpportunity.findMany({
      where: {
        homeownerProfileId: property.homeownerProfileId,
        propertyId: property.id,
        categoryKey,
        status: { not: HomeSavingsOpportunityStatus.EXPIRED },
      },
      orderBy: [{ generatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });

    return {
      category: serializeCategory(category),
      account: ensuredAccount ? serializeAccount(ensuredAccount) : null,
      opportunities: opportunities.map(serializeOpportunity),
    };
  }

  async upsertAccount(
    propertyId: string,
    categoryKeyInput: string,
    userId: string,
    payload: AccountUpsertPayload
  ): Promise<{ account: HomeSavingsAccountDTO }> {
    const property = await assertPropertyForUser(propertyId, userId);
    const categoryKey = normalizeCategoryKey(categoryKeyInput);

    const existingAccount = await getLatestAccountByCategory(property.homeownerProfileId, property.id, categoryKey);

    const baseData: Prisma.HomeSavingsAccountUncheckedCreateInput = {
      homeownerProfileId: property.homeownerProfileId,
      propertyId: property.id,
      categoryKey,
      status: payload.status ? (payload.status as HomeSavingsAccountStatus) : HomeSavingsAccountStatus.ACTIVE,
      providerName: payload.providerName ?? null,
      planName: payload.planName ?? null,
      accountNumberMasked: payload.accountNumberMasked ?? null,
      billingCadence: payload.billingCadence ?? HomeSavingsBillingCadence.MONTHLY,
      amount: payload.amount ?? null,
      currency: payload.currency ?? 'USD',
      startDate: parseDateInput(payload.startDate),
      renewalDate: parseDateInput(payload.renewalDate),
      contractEndDate: parseDateInput(payload.contractEndDate),
      usageJson: payload.usageJson ?? Prisma.JsonNull,
      planDetailsJson: payload.planDetailsJson ?? Prisma.JsonNull,
    };

    if (existingAccount) {
      const updateData: Prisma.HomeSavingsAccountUpdateInput = {};

      if (payload.status !== undefined) updateData.status = payload.status as HomeSavingsAccountStatus;
      if (payload.providerName !== undefined) updateData.providerName = payload.providerName;
      if (payload.planName !== undefined) updateData.planName = payload.planName;
      if (payload.accountNumberMasked !== undefined) updateData.accountNumberMasked = payload.accountNumberMasked;
      if (payload.billingCadence !== undefined) updateData.billingCadence = payload.billingCadence;
      if (payload.amount !== undefined) updateData.amount = payload.amount;
      if (payload.currency !== undefined && payload.currency !== null) {
        updateData.currency = payload.currency;
      }
      if (payload.startDate !== undefined) updateData.startDate = parseDateInput(payload.startDate);
      if (payload.renewalDate !== undefined) updateData.renewalDate = parseDateInput(payload.renewalDate);
      if (payload.contractEndDate !== undefined) updateData.contractEndDate = parseDateInput(payload.contractEndDate);
      if (payload.usageJson !== undefined) {
        updateData.usageJson =
          payload.usageJson === null
            ? Prisma.JsonNull
            : (payload.usageJson as Prisma.InputJsonValue);
      }
      if (payload.planDetailsJson !== undefined) {
        updateData.planDetailsJson =
          payload.planDetailsJson === null
            ? Prisma.JsonNull
            : (payload.planDetailsJson as Prisma.InputJsonValue);
      }

      const account = await prisma.homeSavingsAccount.update({
        where: { id: existingAccount.id },
        data: updateData,
      });
      try {
        await this.runComparison(
          propertyId,
          userId,
          { categoryKey },
          HomeSavingsRunTrigger.EVENT_DRIVEN,
        );
      } catch (err) {
        logger.error(
          { err, propertyId, categoryKey },
          '[HOME-SAVINGS] Account saved but event-driven comparison failed; manual retry remains available',
        );
      }
      return { account: serializeAccount(account) };
    }

    const account = existingAccount
      ? existingAccount
      : await prisma.homeSavingsAccount.create({
          data: baseData,
        });

    try {
      await this.runComparison(
        propertyId,
        userId,
        { categoryKey },
        HomeSavingsRunTrigger.EVENT_DRIVEN,
      );
    } catch (err) {
      logger.error(
        { err, propertyId, categoryKey },
        '[HOME-SAVINGS] Account saved but event-driven comparison failed; manual retry remains available',
      );
    }
    return { account: serializeAccount(account) };
  }

  async runComparison(
    propertyId: string,
    userId: string,
    input: RunComparisonInput,
    trigger: HomeSavingsRunTrigger = HomeSavingsRunTrigger.MANUAL,
  ): Promise<{ runId: string; summary: HomeSavingsSummaryDTO }> {
    const property = await assertPropertyForUser(propertyId, userId);
    const financialContext = await getFinancialContextDecisions(propertyId, userId, 'HOME_SAVINGS');
    const categories = await getEnabledCategories();
    const moduleMap = mapCategoryModule(ALL_HOME_SAVINGS_CATEGORY_MODULES);

    const requestedCategoryKey = input.categoryKey ? normalizeCategoryKey(input.categoryKey) : undefined;
    const categoriesToRun = requestedCategoryKey
      ? categories.filter((category) => category.key === requestedCategoryKey)
      : categories;

    if (categoriesToRun.length === 0) {
      throw new Error('No enabled savings categories found to run.');
    }

    const generatedByCategory: Record<string, number> = {};

    for (const category of categoriesToRun) {
      const categoryKey = normalizeCategoryKey(category.key);
      const module = moduleMap.get(categoryKey);
      if (!module) {
        continue;
      }

      const existingAccount = await getLatestAccountByCategory(
        property.homeownerProfileId,
        property.id,
        categoryKey
      );

      const account = await module.ensureAccount({
        homeownerProfileId: property.homeownerProfileId,
        property,
        existingAccount,
        metadata: toRecord(category.metadata),
      });

      const drafts = await module.generateOpportunities({
        homeownerProfileId: property.homeownerProfileId,
        property,
        existingAccount: account,
        account,
        metadata: toRecord(category.metadata),
      });

      await prisma.homeSavingsOpportunity.updateMany({
        where: {
          homeownerProfileId: property.homeownerProfileId,
          propertyId: property.id,
          categoryKey,
          status: { in: EXPIRABLE_STATUSES },
        },
        data: {
          status: HomeSavingsOpportunityStatus.EXPIRED,
        },
      });

      let createdCount = 0;
      for (const draft of drafts) {
        const { switchingCost, netAnnualSavings } = computeNetAnnualSavings(categoryKey, draft.estimatedAnnualSavings);
        await prisma.homeSavingsOpportunity.create({
          data: {
            homeownerProfileId: property.homeownerProfileId,
            propertyId: property.id,
            categoryKey,
            accountId: account?.id ?? null,
            status: HomeSavingsOpportunityStatus.NEW,
            confidence: draft.confidence,
            resultKind: classifyHomeSavingsResultKind(draft),
            headline: draft.headline,
            detail: draft.detail,
            rationaleJson:
              draft.rationaleJson === null
                ? Prisma.JsonNull
                : (draft.rationaleJson as Prisma.InputJsonValue | undefined),
            estimatedMonthlySavings: draft.estimatedMonthlySavings ?? null,
            estimatedAnnualSavings: draft.estimatedAnnualSavings ?? null,
            estimatedSwitchingCost: switchingCost,
            netAnnualSavings,
            equivalenceState: inferEquivalenceState(draft.rationaleJson),
            // Explicit, not just the schema default — every category module
            // today only ever produces a benchmark comparison, never a real
            // address-qualified quote (HSB-021, no such connector exists yet).
            offerSourceKind: 'BENCHMARK_ESTIMATE',
            currency: 'USD',
            recommendedProviderName: draft.recommendedProviderName,
            recommendedPlanName: draft.recommendedPlanName,
            offerJson:
              draft.offerJson === null
                ? Prisma.JsonNull
                : (draft.offerJson as Prisma.InputJsonValue | undefined),
            actionUrl: draft.actionUrl,
            expiresAt: draft.expiresAt ?? null,
          },
        });
        createdCount += 1;
      }

      generatedByCategory[categoryKey] = createdCount;
    }

    const summary = await this.getSummary(property.id, userId);

    const run = await prisma.homeSavingsRun.create({
      data: {
        homeownerProfileId: property.homeownerProfileId,
        propertyId: property.id,
        trigger,
        inputsJson: {
          version: 1,
          propertyContextVersion: financialContext.contextVersion,
          canonicalContext: { feature: 'HOME_SAVINGS', scopes: financialContext.scopes },
          scenarioOverridesPresent: Boolean(requestedCategoryKey),
          categoryKey: requestedCategoryKey ?? null,
          generatedByCategory,
        },
        summaryJson: {
          potentialMonthlySavings: summary.potentialMonthlySavings,
          potentialAnnualSavings: summary.potentialAnnualSavings,
          categoriesWithSavings: summary.categories.filter((category) => category.status === 'FOUND_SAVINGS').length,
        },
      },
    });

    return {
      runId: run.id,
      summary: { ...summary, propertyContextVersion: financialContext.contextVersion },
    };
  }

  async setOpportunityStatus(
    opportunityId: string,
    status: OpportunityStatusInput,
    userId: string
  ): Promise<{ opportunity: HomeSavingsOpportunityDTO }> {
    const existing = await prisma.homeSavingsOpportunity.findFirst({
      where: {
        id: opportunityId,
        homeownerProfile: {
          userId,
        },
      },
    });

    if (!existing) {
      throw new Error('Opportunity not found or access denied.');
    }
    if (
      existing.resultKind !== HomeSavingsResultKind.BENCHMARK_OPPORTUNITY
      && existing.resultKind !== HomeSavingsResultKind.ADDRESS_QUALIFIED_OPPORTUNITY
    ) {
      throw new Error('Readiness prompts and observations cannot be acted on as savings opportunities.');
    }

    const opportunity = await prisma.homeSavingsOpportunity.update({
      where: { id: opportunityId },
      data: {
        status,
      },
    });

    // Marking APPLIED/SWITCHED reflects application/switching intent, not
    // confirmed savings — it no longer publishes a SAVINGS_REALIZATION
    // signal (see signal.service.ts). It still refreshes FINANCIAL_DISCIPLINE,
    // a distinct pattern about savings-action behavior that holds regardless
    // of whether this specific claim later turns out to be realized. Actual
    // realization now flows only through savingsOutcome.service.ts recording
    // a RECEIVED outcome.
    if (
      opportunity.propertyId &&
      (status === HomeSavingsOpportunityStatus.APPLIED ||
        status === HomeSavingsOpportunityStatus.SWITCHED)
    ) {
      try {
        await signalService.refreshFinancialDisciplinePatternSignal(opportunity.propertyId);
      } catch (signalError) {
        logger.warn({ signalError }, 'Financial discipline signal refresh failed');
      }
    }

    return {
      opportunity: serializeOpportunity(opportunity),
    };
  }
}
