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

export type GuidanceToolContext = {
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
};

export async function getTrueCostOwnership(propertyId: string, guidanceContext?: GuidanceToolContext) {
  // NOTE: api.get() returns { data: APISuccess<T>["data"] }
  // Your controller returns { success, data: { trueCostOwnership: dto } }
  // So res.data is { trueCostOwnership: dto }
  const query = new URLSearchParams();
  if (guidanceContext?.guidanceJourneyId) {
    query.set('guidanceJourneyId', guidanceContext.guidanceJourneyId);
  }
  if (guidanceContext?.guidanceStepKey) {
    query.set('guidanceStepKey', guidanceContext.guidanceStepKey);
  }
  if (guidanceContext?.guidanceSignalIntentFamily) {
    query.set('guidanceSignalIntentFamily', guidanceContext.guidanceSignalIntentFamily);
  }

  const endpoint = query.toString()
    ? `/api/properties/${propertyId}/tools/true-cost?${query.toString()}`
    : `/api/properties/${propertyId}/tools/true-cost`;

  const res = await api.get<{ trueCostOwnership: TrueCostOwnershipDTO }>(
    endpoint
  );
  return res.data.trueCostOwnership;
}
