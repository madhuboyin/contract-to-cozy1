// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/true-cost/trueCostApi.ts
import { api } from '@/lib/api/client';

export type TrueCostOwnershipDTO = {
  input: {
    propertyId: string;
    years: 5;
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
    total5y: number;
    breakdown5y: { taxes: number; insurance: number; maintenance: number; utilities: number };
  };
  drivers: Array<{ factor: string; impact: 'LOW' | 'MEDIUM' | 'HIGH'; explanation: string }>;
  meta: { generatedAt: string; dataSources: string[]; notes: string[]; confidence: 'HIGH'|'MEDIUM'|'LOW' };
};

export async function getTrueCostOwnership(propertyId: string) {
  const res = await api.get(`/api/properties/${propertyId}/tools/true-cost`);
  // api wrapper returns { data: { success, data: { trueCostOwnership } } }
  return res.data?.data?.trueCostOwnership as TrueCostOwnershipDTO;
}
