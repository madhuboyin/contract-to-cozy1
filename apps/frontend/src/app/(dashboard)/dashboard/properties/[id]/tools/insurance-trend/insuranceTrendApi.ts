// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/insuranceTrendApi.ts
import { api } from '@/lib/api/client';

export type InsuranceCostTrendDTO = {
  input: {
    propertyId: string;
    years: 5 | 10;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: Record<string, number | undefined>;
  };

  current: {
    insuranceAnnualNow: number;
    insuranceGrowthRate: number;
    stateAvgAnnualNow: number;
    deltaVsStateNow: number;
  };

  history: Array<{
    year: number;
    annualPremium: number;
    stateAvgAnnual: number;
    deltaVsState: number;
    climatePressureIndex: number;
  }>;

  rollup: {
    totalPremiumPaid: number;
    totalStateAvgPaid: number;
    totalDeltaVsState: number;
    cagrPremium: number;
    cagrStateAvg: number;
  };

  drivers: Array<{
    factor: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }>;

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
};

export async function getInsuranceTrend(
  propertyId: string,
  opts?: { years?: 5 | 10; homeValueNow?: number; insuranceAnnualNow?: number; inflationRate?: number }
): Promise<InsuranceCostTrendDTO> {
  const params = new URLSearchParams();
  if (opts?.years !== undefined) params.set('years', String(opts.years));
  if (opts?.homeValueNow !== undefined) params.set('homeValueNow', String(opts.homeValueNow));
  if (opts?.insuranceAnnualNow !== undefined) params.set('insuranceAnnualNow', String(opts.insuranceAnnualNow));
  if (opts?.inflationRate !== undefined) params.set('inflationRate', String(opts.inflationRate));

  const q = params.toString();
  const url = `/api/properties/${propertyId}/tools/insurance-trend${q ? `?${q}` : ''}`;

  const res = await api.get(url);
  return res.data?.insuranceTrend as InsuranceCostTrendDTO;
}
