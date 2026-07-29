import { api } from './client';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';

export type HomeSavingsCategoryKey =
  | 'HOME_INSURANCE'
  | 'HOME_WARRANTY'
  | 'INTERNET'
  | 'ELECTRICITY_GAS';

export type HomeSavingsCategoryStatus = 'NOT_SET_UP' | 'CONNECTED' | 'FOUND_SAVINGS';

export type HomeSavingsAccountStatus = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
export type HomeSavingsBillingCadence = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
export type HomeSavingsOpportunityStatus =
  | 'NEW'
  | 'VIEWED'
  | 'DISMISSED'
  | 'SAVED'
  | 'APPLIED'
  | 'SWITCHED'
  | 'EXPIRED';
export type HomeSavingsConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

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
  usageJson: Record<string, unknown> | null;
  planDetailsJson: Record<string, unknown> | null;
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
  /** Modeled, category-level assumption — never a real per-provider quote. */
  estimatedSwitchingCost: number | null;
  /** estimatedAnnualSavings net of estimatedSwitchingCost (first year only). */
  netAnnualSavings: number | null;
  /** Months for gross monthly savings to recover modeled switching friction. */
  estimatedPaybackMonths: number | null;
  /** EQUIVALENT only when the comparison controlled for a real matching attribute — never assumed. */
  equivalenceState: 'EQUIVALENT' | 'NOT_EQUIVALENT' | 'UNKNOWN';
  /** What backs the dollar figure — always BENCHMARK_ESTIMATE today; no address-qualified connector exists yet. */
  offerSourceKind: 'BENCHMARK_ESTIMATE' | 'ADDRESS_QUALIFIED';
  currency: string;
  recommendedProviderName: string | null;
  recommendedPlanName: string | null;
  offerJson: Record<string, unknown> | null;
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
  propertyContextVersion?: string | null;
  propertyContext?: PropertyContextEnvelope;
};

export type HomeSavingsCategoryDetailDTO = {
  category: HomeSavingsCategoryDTO;
  account: HomeSavingsAccountDTO | null;
  opportunities: HomeSavingsOpportunityDTO[];
  propertyContext?: PropertyContextEnvelope;
};

export type HomeSavingsAccountUpsertPayload = {
  providerName?: string | null;
  planName?: string | null;
  accountNumberMasked?: string | null;
  billingCadence?: HomeSavingsBillingCadence;
  amount?: number | null;
  currency?: string;
  startDate?: string | null;
  renewalDate?: string | null;
  contractEndDate?: string | null;
  usageJson?: Record<string, unknown>;
  planDetailsJson?: Record<string, unknown>;
  status?: HomeSavingsAccountStatus;
};

export async function getHomeSavingsCategories(): Promise<HomeSavingsCategoryDTO[]> {
  const res = await api.get<{ categories: HomeSavingsCategoryDTO[] }>('/api/home-savings/categories');
  return res.data.categories;
}

export async function getHomeSavingsSummary(propertyId: string): Promise<HomeSavingsSummaryDTO> {
  const res = await api.get<HomeSavingsSummaryDTO>(`/api/properties/${propertyId}/home-savings/summary`);
  return res.data;
}

export async function getHomeSavingsCategory(
  propertyId: string,
  categoryKey: HomeSavingsCategoryKey
): Promise<HomeSavingsCategoryDetailDTO> {
  const res = await api.get<HomeSavingsCategoryDetailDTO>(
    `/api/properties/${propertyId}/home-savings/${categoryKey}`
  );
  return res.data;
}

export async function upsertHomeSavingsAccount(
  propertyId: string,
  categoryKey: HomeSavingsCategoryKey,
  payload: HomeSavingsAccountUpsertPayload
): Promise<{ account: HomeSavingsAccountDTO }> {
  const res = await api.post<{ account: HomeSavingsAccountDTO }>(
    `/api/properties/${propertyId}/home-savings/${categoryKey}/account`,
    payload
  );
  return res.data;
}

export async function runHomeSavings(
  propertyId: string,
  categoryKey?: HomeSavingsCategoryKey,
): Promise<{ runId: string; summary: HomeSavingsSummaryDTO }> {
  const res = await api.post<{ runId: string; summary: HomeSavingsSummaryDTO }>(
    `/api/properties/${propertyId}/home-savings/run`,
    categoryKey ? { categoryKey } : {}
  );
  return res.data;
}

export async function setHomeSavingsOpportunityStatus(
  opportunityId: string,
  status: HomeSavingsOpportunityStatus
): Promise<{ opportunity: HomeSavingsOpportunityDTO }> {
  const res = await api.post<{ opportunity: HomeSavingsOpportunityDTO }>(
    `/api/home-savings/opportunities/${opportunityId}/status`,
    { status }
  );
  return res.data;
}
