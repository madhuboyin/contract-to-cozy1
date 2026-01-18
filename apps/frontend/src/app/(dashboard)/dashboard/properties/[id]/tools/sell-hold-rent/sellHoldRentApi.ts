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

type SellHoldRentParams = {
  years?: 5 | 10;
  homeValueNow?: number;
  appreciationRate?: number;
  sellingCostRate?: number;
  monthlyRentNow?: number;
  rentGrowthRate?: number;
  vacancyRate?: number;
  managementRate?: number;
};

export async function getSellHoldRent(
  propertyId: string,
  params?: SellHoldRentParams
): Promise<SellHoldRentDTO> {
  const res = await api.get<{ sellHoldRent: SellHoldRentDTO }>(
    `/properties/${propertyId}/tools/sell-hold-rent`,
    { params }
  );

  const payload = res.data?.sellHoldRent;

  if (!payload) {
    // eslint-disable-next-line no-console
    console.error('[sellHoldRentApi] Unexpected response shape', {
      url: `/properties/${propertyId}/tools/sell-hold-rent`,
      res,
    });
    throw new Error('Malformed response: missing sellHoldRent payload');
  }

  return payload;
}

