// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tax/property-tax/taxApi.ts
import { api } from '@/lib/api/client';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';

export type PropertyTaxEstimateDTO = {
  propertyContext?: PropertyContextEnvelope;
  calculationContext?: { mode: 'CANONICAL' | 'SCENARIO'; overrideFields: string[] };
  input: {
    propertyId: string;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: { assessedValue?: number; taxRate?: number };
  };
  current: {
    assessedValue: number;
    taxRate: number;
    annualTax: number;
    monthlyTax: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    source: 'HOMEOWNER_REPORTED' | 'PLANNING_ESTIMATE';
  };
  projection: { years: 5 | 10 | 20; estimatedAnnualTax: number; assumptions: string[] }[];
  drivers: { factor: string; impact: 'LOW' | 'MEDIUM' | 'HIGH'; explanation: string }[];
  meta: { generatedAt: string; dataSources: string[]; notes: string[] };
};

export async function getPropertyTaxEstimate(
  propertyId: string,
  opts?: { assessedValue?: number; taxRate?: number }
): Promise<PropertyTaxEstimateDTO> {
  const params = new URLSearchParams();
  if (opts?.assessedValue !== undefined) params.set('assessedValue', String(opts.assessedValue));
  if (opts?.taxRate !== undefined) params.set('taxRate', String(opts.taxRate));

  const q = params.toString();
  const url = `/api/properties/${propertyId}/property-tax/estimate${q ? `?${q}` : ''}`;

  const res = await api.get(url);
  return res.data?.estimate as PropertyTaxEstimateDTO;
}
