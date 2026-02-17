import {
  HomeSavingsAccount,
  HomeSavingsAccountStatus,
  HomeSavingsBillingCadence,
  HomeSavingsConfidence,
  HomeSavingsOpportunity,
  HomeSavingsOpportunityStatus,
  HomeSavingsRunTrigger,
  Prisma,
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
import { amountToAnnual, amountToMonthly, asNumber, round2, toRecord } from './homeSavings/helpers';

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
  headline: string;
  detail: string | null;
  estimatedMonthlySavings: number | null;
  estimatedAnnualSavings: number | null;
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
  categories: HomeSavingsSummaryCategoryDTO[];
  updatedAt: string;
};

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

function serializeAccount(account: HomeSavingsAccount): HomeSavingsAccountDTO {
  const amount = asNumber(account.amount) ?? null;
  const monthlyAmount = amount !== null ? amountToMonthly(amount, account.billingCadence) ?? null : null;
  const annualAmount = amount !== null ? amountToAnnual(amount, account.billingCadence) ?? null : null;

  return {
    id: account.id,
    categoryKey: normalizeCategoryKey(account.categoryKey),
    status: account.status,
    providerName: account.providerName ?? null,
    planName: account.planName ?? null,
    accountNumberMasked: account.accountNumberMasked ?? null,
    billingCadence: account.billingCadence,
    amount,
    monthlyAmount,
    annualAmount,
    currency: account.currency,
    startDate: account.startDate ? account.startDate.toISOString() : null,
    renewalDate: account.renewalDate ? account.renewalDate.toISOString() : null,
    contractEndDate: account.contractEndDate ? account.contractEndDate.toISOString() : null,
    usageJson: account.usageJson ?? null,
    planDetailsJson: account.planDetailsJson ?? null,
  };
}

function serializeOpportunity(opportunity: HomeSavingsOpportunity): HomeSavingsOpportunityDTO {
  return {
    id: opportunity.id,
    categoryKey: normalizeCategoryKey(opportunity.categoryKey),
    accountId: opportunity.accountId ?? null,
    status: opportunity.status,
    confidence: opportunity.confidence,
    headline: opportunity.headline,
    detail: opportunity.detail ?? null,
    estimatedMonthlySavings: asNumber(opportunity.estimatedMonthlySavings) ?? null,
    estimatedAnnualSavings: asNumber(opportunity.estimatedAnnualSavings) ?? null,
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
  account: HomeSavingsAccount | null,
  opportunities: HomeSavingsOpportunity[]
): HomeSavingsCategoryStatus {
  const hasAccountAmount = account && asNumber(account.amount) !== undefined;
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
    let potentialMonthlySavings = 0;
    let potentialAnnualSavings = 0;

    for (const category of categories) {
      const categoryKey = normalizeCategoryKey(category.key);
      const account = await getLatestAccountByCategory(property.homeownerProfileId, property.id, categoryKey);
      const categoryOpportunities = opportunitiesByCategory.get(categoryKey) ?? [];
      const topOpportunity = categoryOpportunities[0] ?? null;

      if (topOpportunity) {
        potentialMonthlySavings += asNumber(topOpportunity.estimatedMonthlySavings) ?? 0;
        potentialAnnualSavings += asNumber(topOpportunity.estimatedAnnualSavings) ?? 0;
      }

      categorySummaries.push({
        category: serializeCategory(category),
        status: computeCategoryStatus(account, categoryOpportunities),
        account: account ? serializeAccount(account) : null,
        topOpportunity: topOpportunity ? serializeOpportunity(topOpportunity) : null,
      });
    }

    return {
      homeownerProfileId: property.homeownerProfileId,
      propertyId: property.id,
      potentialMonthlySavings: round2(potentialMonthlySavings),
      potentialAnnualSavings: round2(potentialAnnualSavings),
      categories: categorySummaries,
      updatedAt: new Date().toISOString(),
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

      return { account: serializeAccount(account) };
    }

    const account = existingAccount
      ? existingAccount
      : await prisma.homeSavingsAccount.create({
          data: baseData,
        });

    return { account: serializeAccount(account) };
  }

  async runComparison(
    propertyId: string,
    userId: string,
    input: RunComparisonInput
  ): Promise<{ runId: string; summary: HomeSavingsSummaryDTO }> {
    const property = await assertPropertyForUser(propertyId, userId);
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
        await prisma.homeSavingsOpportunity.create({
          data: {
            homeownerProfileId: property.homeownerProfileId,
            propertyId: property.id,
            categoryKey,
            accountId: account?.id ?? null,
            status: HomeSavingsOpportunityStatus.NEW,
            confidence: draft.confidence,
            headline: draft.headline,
            detail: draft.detail,
            rationaleJson:
              draft.rationaleJson === null
                ? Prisma.JsonNull
                : (draft.rationaleJson as Prisma.InputJsonValue | undefined),
            estimatedMonthlySavings: draft.estimatedMonthlySavings ?? null,
            estimatedAnnualSavings: draft.estimatedAnnualSavings ?? null,
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
        trigger: HomeSavingsRunTrigger.MANUAL,
        inputsJson: {
          version: 1,
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
      summary,
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

    const opportunity = await prisma.homeSavingsOpportunity.update({
      where: { id: opportunityId },
      data: {
        status,
      },
    });

    return {
      opportunity: serializeOpportunity(opportunity),
    };
  }
}
