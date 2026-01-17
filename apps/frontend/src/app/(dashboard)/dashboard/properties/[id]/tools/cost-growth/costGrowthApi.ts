// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-growth/costGrowthApi.ts
import { api } from '@/lib/api/client';

export type HomeCostGrowthDTO = {
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
    annualTaxNow: number;
    annualInsuranceNow: number;
    annualMaintenanceNow: number;
    annualExpensesNow: number;
  };

  history: Array<{
    year: number;
    homeValue: number;
    annualTax: number;
    annualInsurance: number;
    annualMaintenance: number;
    annualExpenses: number;
    appreciationGain: number;
    netDelta: number;
  }>;

  rollup: {
    totalAppreciationGain: number;
    totalExpenses: number;
    totalNet: number;
    expenseBreakdown: {
      taxes: number;
      insurance: number;
      maintenance: number;
    };
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

export async function getHomeCostGrowth(
  propertyId: string,
  opts?: {
    years?: 5 | 10;
    assessedValue?: number;
    taxRate?: number;
    homeValueNow?: number;
    appreciationRate?: number;
    insuranceAnnualNow?: number;
    maintenanceAnnualNow?: number;
  }
): Promise<HomeCostGrowthDTO> {
  const params = new URLSearchParams();

  if (opts?.years !== undefined) params.set('years', String(opts.years));
  if (opts?.assessedValue !== undefined) params.set('assessedValue', String(opts.assessedValue));
  if (opts?.taxRate !== undefined) params.set('taxRate', String(opts.taxRate));
  if (opts?.homeValueNow !== undefined) params.set('homeValueNow', String(opts.homeValueNow));
  if (opts?.appreciationRate !== undefined) params.set('appreciationRate', String(opts.appreciationRate));
  if (opts?.insuranceAnnualNow !== undefined) params.set('insuranceAnnualNow', String(opts.insuranceAnnualNow));
  if (opts?.maintenanceAnnualNow !== undefined) params.set('maintenanceAnnualNow', String(opts.maintenanceAnnualNow));

  const q = params.toString();
  const url = `/api/properties/${propertyId}/tools/cost-growth${q ? `?${q}` : ''}`;

  const res = await api.get(url);
  return res.data?.costGrowth as HomeCostGrowthDTO;
}
