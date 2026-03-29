import { api } from '@/lib/api/client';

export type BreakEvenDTO = {
  input: {
    propertyId: string;
    years: 5 | 10 | 20 | 30;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: Record<string, number | undefined>;
  };

  current: {
    homeValueNow: number;
    appreciationRate: number;
    annualExpensesNow: number;
    debtMode: 'ON' | 'OFF';
    mortgageBalanceNow?: number | null;
    mortgageAnnualRate?: number | null;
    remainingTermMonths?: number | null;
    monthlyPayment?: number | null;
  };

  history: Array<{
    year: number;
    annualExpenses: number;
    annualAppreciationGain: number;
    cumulativeExpenses: number;
    cumulativeAppreciationGain: number;
    netCumulative: number;
  }>;

  breakEven: {
    status: 'ALREADY_BREAKEVEN' | 'PROJECTED' | 'NOT_REACHED';
    reached: boolean;
    breakEvenYearIndex: number | null;
    breakEvenCalendarYear: number | null;
    netAtBreakEven: number | null;
  };

  sensitivity: {
    conservative: { breakEvenYearIndex: number | null; netAtHorizon: number };
    base: { breakEvenYearIndex: number | null; netAtHorizon: number };
    optimistic: { breakEvenYearIndex: number | null; netAtHorizon: number };
    rangeLabel: string;
  };

  events: Array<{
    year: number;
    type:
      | 'TAX_STEP'
      | 'INSURANCE_SHOCK'
      | 'MAINTENANCE_PRESSURE'
      | 'APPRECIATION_ACCEL'
      | 'APPRECIATION_SLOWDOWN';
    description: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;

  rollup: {
    netAtHorizon: number;
    cumulativeExpensesAtHorizon: number;
    cumulativeAppreciationAtHorizon: number;
  };

  drivers: Array<{
    factor: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }>;

  nextAction?: {
    toolKey: 'sell-hold-rent' | 'capital-timeline';
    label: string;
    href: string;
    reason: string;
  };

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
};

export async function getBreakEven(
  propertyId: string,
  opts?: {
    years?: 5 | 10 | 20 | 30;
    homeValueNow?: number;
    appreciationRate?: number;
    expenseGrowthRate?: number;
    mortgageBalance?: number;
    mortgageAnnualRate?: number;
    remainingTermMonths?: number;
    monthlyPayment?: number;
    assumptionSetId?: string;
  }
): Promise<BreakEvenDTO> {
  const params = new URLSearchParams();
  if (opts?.years !== undefined) params.set('years', String(opts.years));
  if (opts?.homeValueNow !== undefined) params.set('homeValueNow', String(opts.homeValueNow));
  if (opts?.appreciationRate !== undefined) params.set('appreciationRate', String(opts.appreciationRate));
  if (opts?.expenseGrowthRate !== undefined) params.set('expenseGrowthRate', String(opts.expenseGrowthRate));
  if (opts?.mortgageBalance !== undefined) params.set('mortgageBalance', String(opts.mortgageBalance));
  if (opts?.mortgageAnnualRate !== undefined) params.set('mortgageAnnualRate', String(opts.mortgageAnnualRate));
  if (opts?.remainingTermMonths !== undefined) params.set('remainingTermMonths', String(opts.remainingTermMonths));
  if (opts?.monthlyPayment !== undefined) params.set('monthlyPayment', String(opts.monthlyPayment));
  if (opts?.assumptionSetId) params.set('assumptionSetId', opts.assumptionSetId);

  const q = params.toString();
  const url = `/api/properties/${propertyId}/tools/break-even${q ? `?${q}` : ''}`;

  const res = await api.get(url);
  return res.data?.breakEven as BreakEvenDTO;
}
