// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/sellHoldRentApi.ts
import { api } from '@/lib/api/client';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';

export type SellHoldRentInput = {
  years?: 5 | 10;
  assumptionSetId?: string;

  // Scenario overrides
  homeValueNow?: number;
  appreciationRate?: number; // decimal
  sellingCostRate?: number; // decimal

  // Rent modeling overrides
  monthlyRentNow?: number;
  rentGrowthRate?: number; // decimal
  vacancyRate?: number; // decimal
  managementRate?: number; // decimal
};

export type SellHoldRentDTO = {
  propertyContext?: PropertyContextEnvelope;
  calculationContext?: { mode: 'CANONICAL' | 'SCENARIO'; overrideFields: string[] };
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

    // Phase-3: debt-aware (nullable if unknown)
    mortgage?: {
      balanceNow: number;
      interestRate: number;
      remainingTermMonths: number;
      monthlyPayment: number;
      notes?: string[];
    } | null;
  };

  scenarios: {
    sell: {
      projectedSalePrice: number;
      sellingCosts: number;

      // Phase-3: if mortgage known, payoff is deducted from net proceeds
      mortgagePayoff?: number | null;

      netProceeds: number;
      notes: string[];
    };

    hold: {
      totalOwnershipCosts: number;
      appreciationGain: number;

      // Phase-3: debt-aware (optional)
      mortgageInterestCost?: number | null;
      principalToEquity?: number | null;

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

      // Phase-3: debt-aware (optional)
      mortgageInterestCost?: number | null;
      principalToEquity?: number | null;

      net: number;
      notes: string[];
    };
  };

  history: Array<{
    year: number;
    homeValue: number;
    ownershipCosts: number;

    // Phase-2/3 chart lines
    holdNetDelta: number;
    rentNetDelta: number;

    // (Optional future fields ok)
    [k: string]: unknown;
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

// ---------------------------
// Phase-3: Overrides + canonical financing profile projection
// ---------------------------

export type ToolOverrideRow = { key: string; value: number };

export type FinancingProfileProjection = {
  propertyId: string;
  mortgageBalance: number | null;
  interestRate: number | null; // decimal
  remainingTermMonths: number | null;
  monthlyPayment: number | null;
  lastVerifiedAt: string | null;
};

const TOOL_KEY = 'SELL_HOLD_RENT';

// Keep this consistent with backend override keys (Phase-3)
// (If your backend uses slightly different keys, just map here.)
export type SellHoldRentOverridePatch = Partial<{
  HOME_VALUE_NOW: number;
  APPRECIATION_RATE: number;
  SELLING_COST_RATE: number;
  MONTHLY_RENT_NOW: number;
  RENT_GROWTH_RATE: number;
  VACANCY_RATE: number;
  MANAGEMENT_RATE: number;
}>;

// ---------------------------
// Helpers
// ---------------------------

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL || // in case you used a different env var name elsewhere
  '';

async function authedFetchJson<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const text = await res.text();

  // If backend returns HTML (404 / not-found page), surface it as an error (avoid dumping HTML into UI).
  if (!res.ok) {
    const snippet = text.slice(0, 220);
    throw new Error(`Sell/Hold/Rent request failed (${res.status}): ${snippet}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 220);
    throw new Error(`Sell/Hold/Rent response not JSON: ${snippet}`);
  }
}

// ---------------------------
// API
// ---------------------------

export async function getSellHoldRent(propertyId: string, input: SellHoldRentInput = {}) {
  const years = input.years ?? 5;

  const params = new URLSearchParams();
  params.set('years', String(years));

  // Only send overrides if defined
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    params.set(k, String(v));
  };

  add('homeValueNow', input.homeValueNow);
  add('appreciationRate', input.appreciationRate);
  add('sellingCostRate', input.sellingCostRate);
  add('monthlyRentNow', input.monthlyRentNow);
  add('rentGrowthRate', input.rentGrowthRate);
  add('vacancyRate', input.vacancyRate);
  add('managementRate', input.managementRate);
  add('assumptionSetId', input.assumptionSetId);

  // IMPORTANT:
  // This controller returns a keyed payload: { sellHoldRent: dto }
  // NOT { success, data: { sellHoldRent: dto } }
  type RawResponse = {
    sellHoldRent?: SellHoldRentDTO;
    data?: { sellHoldRent?: SellHoldRentDTO; sell_hold_rent?: SellHoldRentDTO };
  };

  const json = await authedFetchJson<RawResponse>(
    `/api/properties/${propertyId}/tools/sell-hold-rent?${params.toString()}`
  );

  // Support both shapes defensively (in case backend changes later)
  const dto: SellHoldRentDTO | undefined =
    json?.sellHoldRent ?? json?.data?.sellHoldRent ?? json?.data?.sell_hold_rent;

  if (!dto) {
    // eslint-disable-next-line no-console
    console.warn('[sellHoldRentApi] Unexpected response shape', { url: `/api/properties/${propertyId}/tools/sell-hold-rent?${params.toString()}`, res: json });
    throw new Error('Malformed response: missing sellHoldRent payload');
  }

  return dto;
}

export async function getSellHoldRentOverrides(propertyId: string) {
  const res = await api.get<{ overrides: ToolOverrideRow[] }>(
    `/api/properties/${propertyId}/tool-overrides`,
    { params: { toolKey: TOOL_KEY } }
  );

  const rows = res.data?.overrides ?? [];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function saveSellHoldRentOverrides(propertyId: string, patch: SellHoldRentOverridePatch) {
  const overrides: ToolOverrideRow[] = Object.entries(patch)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    .map(([key, value]) => ({ key, value: value as number }));

  const res = await api.put<{ ok: true }>(
    `/api/properties/${propertyId}/tool-overrides`,
    { toolKey: TOOL_KEY, overrides }
  );

  return res.data;
}

export async function getFinancingProfile(propertyId: string) {
  const res = await api.get<{ profile: any | null }>(
    `/api/properties/${propertyId}/financing/profile`
  );
  const profile = res.data.profile;
  if (!profile) return null;
  return {
    propertyId,
    mortgageBalance: profile.currentMortgageBalanceCents == null ? null : profile.currentMortgageBalanceCents / 100,
    interestRate: profile.interestRateBps == null ? null : profile.interestRateBps / 10_000,
    remainingTermMonths: profile.remainingTermMonths ?? null,
    monthlyPayment: profile.monthlyPaymentCents == null ? null : profile.monthlyPaymentCents / 100,
    lastVerifiedAt: profile.mortgageBalanceAsOfDate ?? profile.updatedAt ?? null,
  } satisfies FinancingProfileProjection;
}

export async function saveFinancingProfile(propertyId: string, patch: Partial<FinancingProfileProjection>) {
  await api.put(
    `/api/properties/${propertyId}/financing/profile`,
    {
      ...(patch.mortgageBalance != null ? { currentMortgageBalanceCents: Math.round(patch.mortgageBalance * 100) } : {}),
      ...(patch.interestRate != null ? { interestRateBps: Math.round(patch.interestRate * 10_000) } : {}),
      ...(patch.remainingTermMonths != null ? { remainingTermMonths: patch.remainingTermMonths } : {}),
      ...(patch.monthlyPayment != null ? { monthlyPaymentCents: Math.round(patch.monthlyPayment * 100) } : {}),
      mortgageBalanceAsOfDate: patch.lastVerifiedAt ?? new Date().toISOString(),
    }
  );
  return getFinancingProfile(propertyId) as Promise<FinancingProfileProjection>;
}
