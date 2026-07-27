import { api } from './client';

export type MarketObservationDTO = {
  value: number;
  currency: string;
  geography: { type: 'STATE'; code: string };
  period: { start: string; end: string };
  coverageBasis: {
    label: string;
    policyForms: string[];
    dwellingTypes: string[];
    limitations: string[];
  };
  sampleSize: number | null;
  notes: string | null;
  retrievedAt: string;
  releaseVersion: string;
  source: {
    key: string;
    name: string;
    ownerName: string;
    url: string;
  };
  methodologySummary: string;
};

type MarketContextBase = {
  contractVersion: 'insurance-market-context-v1';
  classification: 'OBSERVED_MARKET_CONTEXT_NOT_A_QUOTE';
  jurisdictionCode: string;
  message: string;
};

export type InsuranceMarketContextDTO =
  | (MarketContextBase & {
      state:
        | 'DISABLED'
        | 'SOURCE_UNAVAILABLE'
        | 'UNSUPPORTED_GEOGRAPHY'
        | 'UNSUPPORTED_COVERAGE_BASIS';
    })
  | (MarketContextBase & {
      state: 'STALE';
      lastRetrievedAt: string;
      expiredAt: string;
      source: MarketObservationDTO['source'];
    })
  | (MarketContextBase & {
      state: 'READY';
      current: MarketObservationDTO;
      previous: MarketObservationDTO | null;
      change: { absolute: number; percent: number | null } | null;
    });

export async function getInsuranceMarketContext(propertyId: string) {
  const response = await api.get<{ success: true; data: InsuranceMarketContextDTO }>(
    `/api/properties/${propertyId}/insurance-market-context`
  );
  return response.data.data;
}
