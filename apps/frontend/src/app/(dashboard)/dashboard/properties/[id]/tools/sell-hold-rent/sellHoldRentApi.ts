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
    sell: {
      projectedSalePrice: number;
      sellingCosts: number;
      netProceeds: number;
      notes: string[];
    };
    hold: {
      totalOwnershipCosts: number;
      appreciationGain: number;
      net: number;
      notes: string[];
    };
    rent: {
      totalRentalIncome: number;
      rentalOverheads: {
        vacancyLoss: number;
        managementFees: number;
      };
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

  recommendation: {
    winner: 'SELL' | 'HOLD' | 'RENT';
    rationale: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
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

export type SellHoldRentParams = {
  years?: 5 | 10;

  // Overrides
  homeValueNow?: number;
  appreciationRate?: number;
  sellingCostRate?: number;

  // Rent modeling
  monthlyRentNow?: number;
  rentGrowthRate?: number;
  vacancyRate?: number;
  managementRate?: number;
};

function toQuery(params?: SellHoldRentParams) {
  if (!params) return '';
  const sp = new URLSearchParams();
  (Object.entries(params) as Array<[keyof SellHoldRentParams, any]>).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(String(k), String(v));
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export async function getSellHoldRent(propertyId: string, params?: SellHoldRentParams): Promise<SellHoldRentDTO> {
  // ✅ Option B: backend returns { success, data: { sellHoldRent: dto } }
  // api.get() returns { data: <inner data object> }
  const res = await api.get<{ sellHoldRent: SellHoldRentDTO }>(
    `/api/properties/${propertyId}/tools/sell-hold-rent${toQuery(params)}`
  );
  return res.data.sellHoldRent;
}
