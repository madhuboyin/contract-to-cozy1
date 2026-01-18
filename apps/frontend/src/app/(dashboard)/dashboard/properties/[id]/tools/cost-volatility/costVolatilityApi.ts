// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-volatility/costVolatilityApi.ts
import { api } from '@/lib/api/client';

export type CostVolatilityDTO = {
  input: {
    propertyId: string;
    years: 5 | 10;
    addressLabel: string;
    state: string;
    zipCode: string;
  };
  index: {
    volatilityIndex: number;
    band: 'LOW' | 'MEDIUM' | 'HIGH';
    insuranceVolatility: number;
    taxVolatility: number;
    zipVolatility: number;
  };
  history: Array<{
    year: number;
    annualTax: number;
    annualInsurance: number;
    annualTotal: number;
    yoyTotalPct: number | null; // percent points
    yoyInsurancePct: number | null;
    yoyTaxPct: number | null;
  }>;
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

export async function getCostVolatility(propertyId: string, opts: { years: 5 | 10 }): Promise<CostVolatilityDTO> {
  const r = await api.get(`/properties/${propertyId}/tools/cost-volatility?years=${opts.years}`);

  // Robust unwrap across your patterns
  const payload: any = (r as any)?.data ?? r;
  const dto: any =
    payload?.data?.costVolatility ??
    payload?.costVolatility ??
    payload?.data?.data?.costVolatility;

  if (!dto) throw new Error('Failed to load cost volatility');

  return dto as CostVolatilityDTO;
}
