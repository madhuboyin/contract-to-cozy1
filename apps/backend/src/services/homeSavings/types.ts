import {
  HomeSavingsAccount,
  HomeSavingsBillingCadence,
  HomeSavingsConfidence,
  HomeSavingsOpportunityStatus,
  Property,
  Prisma,
} from '@prisma/client';

export const HOME_SAVINGS_CATEGORY_KEYS = [
  'HOME_INSURANCE',
  'HOME_WARRANTY',
  'INTERNET',
  'ELECTRICITY_GAS',
] as const;

export type HomeSavingsCategoryKey = (typeof HOME_SAVINGS_CATEGORY_KEYS)[number];

export type HomeSavingsCategorySeed = {
  key: HomeSavingsCategoryKey;
  label: string;
  description: string;
  sortOrder: number;
  metadata: Prisma.JsonObject;
};

export const HOME_SAVINGS_CATEGORY_SEEDS: HomeSavingsCategorySeed[] = [
  {
    key: 'HOME_INSURANCE',
    label: 'Home Insurance',
    description: 'Check if your premium may be higher than similar homes in your area.',
    sortOrder: 10,
    metadata: {
      baselineAnnualByState: {
        default: 1900,
        NJ: 2200,
        NY: 2100,
        CA: 2300,
        FL: 3400,
        TX: 2600,
        WA: 1850,
      },
      renewalWindowDays: 45,
      alternatives: ['Regional carrier quote check', 'Bundle review'],
    },
  },
  {
    key: 'HOME_WARRANTY',
    label: 'Home Warranty',
    description: 'Compare annual warranty cost and renewal timing against typical plans.',
    sortOrder: 20,
    metadata: {
      baselineAnnual: 720,
      renewalWindowDays: 45,
      alternatives: ['Plan tier comparison', 'Service-fee negotiation'],
    },
  },
  {
    key: 'INTERNET',
    label: 'Internet',
    description: 'Compare your monthly internet bill with common local plan ranges.',
    sortOrder: 30,
    metadata: {
      typicalMonthlyByState: {
        default: 75,
        NJ: 78,
        NY: 82,
        CA: 85,
        TX: 72,
        FL: 76,
      },
      alternativesByState: {
        default: ['Xfinity', 'Verizon Fios', 'T-Mobile 5G Home'],
        NJ: ['Verizon Fios', 'Xfinity', 'T-Mobile 5G Home'],
        NY: ['Verizon Fios', 'Spectrum', 'T-Mobile 5G Home'],
      },
    },
  },
  {
    key: 'ELECTRICITY_GAS',
    label: 'Electricity / Gas',
    description: 'See where monthly utility bills may be reduced with supplier or usage changes.',
    sortOrder: 40,
    metadata: {
      typicalMonthlyByState: {
        default: 220,
        NJ: 245,
        NY: 255,
        CA: 230,
        TX: 210,
        FL: 235,
      },
      savingsPctRange: {
        min: 5,
        max: 15,
      },
    },
  },
];

export type AccountUpsertPayload = {
  providerName?: string | null;
  planName?: string | null;
  accountNumberMasked?: string | null;
  billingCadence?: HomeSavingsBillingCadence;
  amount?: number | null;
  currency?: string | null;
  startDate?: string | null;
  renewalDate?: string | null;
  contractEndDate?: string | null;
  usageJson?: Prisma.JsonValue;
  planDetailsJson?: Prisma.JsonValue;
  status?: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
};

export type RunComparisonInput = {
  categoryKey?: HomeSavingsCategoryKey;
};

export type OpportunityStatusInput = HomeSavingsOpportunityStatus;

export type CategoryOpportunityDraft = {
  confidence: HomeSavingsConfidence;
  headline: string;
  detail?: string;
  rationaleJson?: Prisma.JsonValue;
  estimatedMonthlySavings?: number | null;
  estimatedAnnualSavings?: number | null;
  recommendedProviderName?: string | null;
  recommendedPlanName?: string | null;
  offerJson?: Prisma.JsonValue;
  actionUrl?: string | null;
  expiresAt?: Date | null;
};

export type CategoryModuleContext = {
  homeownerProfileId: string;
  property: Pick<Property, 'id' | 'state' | 'zipCode'>;
  existingAccount: HomeSavingsAccount | null;
  metadata: Record<string, unknown>;
};

export type CategoryEnsureAccountParams = CategoryModuleContext;

export type CategoryGenerateOpportunitiesParams = CategoryModuleContext & {
  account: HomeSavingsAccount | null;
};

export type CategoryModule = {
  categoryKey: HomeSavingsCategoryKey;
  ensureAccount: (params: CategoryEnsureAccountParams) => Promise<HomeSavingsAccount | null>;
  generateOpportunities: (
    params: CategoryGenerateOpportunitiesParams
  ) => Promise<CategoryOpportunityDraft[]>;
};
