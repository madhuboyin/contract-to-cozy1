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
    yoyTotalPct: number | null;
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

export async function getCostVolatility(
  propertyId: string,
  opts?: { years?: 5 | 10 }
): Promise<CostVolatilityDTO> {
  const params = new URLSearchParams();
  if (opts?.years) params.set('years', String(opts.years));

  const q = params.toString();
  const url = `/api/properties/${propertyId}/tools/cost-volatility${q ? `?${q}` : ''}`;

  const res = await api.get(url);
  // controller returns { success: true, data: { costVolatility } }
  return (res.data as any)?.costVolatility as CostVolatilityDTO;
}
