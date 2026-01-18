// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/sellHoldRentApi.ts
import { api } from '@/lib/api/client';

export type SellHoldRentDTO = {
  input: {
    propertyId: string;
    years: 5 | 10;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: Record<string, number | undefined>;
  };
  current: {
    homeValueNow: number;
    appreciationRate: number;
    monthlyRentNow: number;
    sellingCostRate: number;
  };
  scenarios: {
    sell: { projectedSalePrice: number; sellingCosts: number; netProceeds: number; notes: string[] };
    hold: { totalOwnershipCosts: number; appreciationGain: number; net: number; notes: string[] };
    rent: {
      totalRentalIncome: number;
      rentalOverheads: { vacancyLoss: number; managementFees: number };
      totalOwnershipCosts: number;
      appreciationGain: number;
      net: number;
      notes: string[];
    };
  };
  history: Array<{
    year: number;
    homeValue: number;
    ownershipCosts: number;
    holdNetDelta: number;
    rentNetDelta: number;
  }>;
  recommendation: { winner: 'SELL'|'HOLD'|'RENT'; rationale: string[]; confidence: 'HIGH'|'MEDIUM'|'LOW' };
  drivers: Array<{ factor: string; impact: 'LOW'|'MEDIUM'|'HIGH'; explanation: string }>;
  meta: { generatedAt: string; dataSources: string[]; notes: string[]; confidence: 'HIGH'|'MEDIUM'|'LOW' };
};

export async function getSellHoldRent(
  propertyId: string,
  opts?: {
    years?: 5 | 10;
    homeValueNow?: number;
    appreciationRate?: number;
    sellingCostRate?: number;
    monthlyRentNow?: number;
    rentGrowthRate?: number;
    vacancyRate?: number;
    managementRate?: number;
  }
): Promise<SellHoldRentDTO> {
  const params = new URLSearchParams();
  if (opts?.years) params.set('years', String(opts.years));
  if (opts?.homeValueNow !== undefined) params.set('homeValueNow', String(opts.homeValueNow));
  if (opts?.appreciationRate !== undefined) params.set('appreciationRate', String(opts.appreciationRate));
  if (opts?.sellingCostRate !== undefined) params.set('sellingCostRate', String(opts.sellingCostRate));
  if (opts?.monthlyRentNow !== undefined) params.set('monthlyRentNow', String(opts.monthlyRentNow));
  if (opts?.rentGrowthRate !== undefined) params.set('rentGrowthRate', String(opts.rentGrowthRate));
  if (opts?.vacancyRate !== undefined) params.set('vacancyRate', String(opts.vacancyRate));
  if (opts?.managementRate !== undefined) params.set('managementRate', String(opts.managementRate));

  const q = params.toString();
  const url = `/api/properties/${propertyId}/tools/sell-hold-rent${q ? `?${q}` : ''}`;

  const res = await api.get(url);
  return res.data.sellHoldRent as SellHoldRentDTO;
}
