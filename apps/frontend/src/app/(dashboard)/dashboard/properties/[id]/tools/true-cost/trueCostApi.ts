// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/true-cost/trueCostApi.ts
import { api } from '@/lib/api/client';
import type { PropertyContextEnvelope } from '@/components/property-context/PropertyContextNotice';

export type TrueCostOwnershipDTO = {
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
    annualTaxNow: number;
    annualInsuranceNow: number;
    annualMaintenanceNow: number;
    annualUtilitiesNow: number;
    annualTotalNow: number;
  };
  history: Array<{
    year: number;
    annualTax: number;
    annualInsurance: number;
    annualMaintenance: number;
    annualUtilities: number;
    annualTotal: number;
  }>;
  rollup: {
    totalCost: number;
    breakdown: { taxes: number; insurance: number; maintenance: number; utilities: number };
  };
  drivers: Array<{ factor: string; impact: 'LOW' | 'MEDIUM' | 'HIGH'; explanation: string }>;
  meta: { generatedAt: string; dataSources: string[]; notes: string[]; confidence: 'HIGH'|'MEDIUM'|'LOW' };
};

export async function getTrueCostOwnership(
  propertyId: string,
  years: 5 | 10 = 5,
) {
  const query = new URLSearchParams();
  query.set('years', String(years));

  const endpoint = query.toString()
    ? `/api/properties/${propertyId}/tools/true-cost?${query.toString()}`
    : `/api/properties/${propertyId}/tools/true-cost`;

  const res = await api.get<{ trueCostOwnership: TrueCostOwnershipDTO }>(
    endpoint
  );
  return res.data.trueCostOwnership;
}
