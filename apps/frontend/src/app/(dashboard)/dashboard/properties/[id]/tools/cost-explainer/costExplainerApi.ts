// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-explainer/costExplainerApi.ts
import { api } from '@/lib/api/client';

export type CostExplainerDTO = {
  input: { propertyId: string; years: 5 | 10; addressLabel: string; state: string; zipCode: string };
  snapshot: {
    annualTaxNow: number;
    annualInsuranceNow: number;
    annualMaintenanceNow: number;
    annualTotalNow: number;
    deltaVsPriorYear: { tax: number; insurance: number; maintenance: number; total: number };
  };
  explanations: Array<{
    category: 'TAXES' | 'INSURANCE' | 'MAINTENANCE' | 'TOTAL';
    headline: string;
    bullets: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  meta: { generatedAt: string; notes: string[]; dataSources: string[] };
  history: Array<{
    year: number;
    annualTax: number;
    annualInsurance: number;
    annualMaintenance: number;
    annualTotal: number;
  }>;
};

export async function getCostExplainer(propertyId: string, opts: { years: 5 | 10 }) {
  const res = await api.get(`/api/properties/${propertyId}/tools/cost-explainer`, {
    params: opts,
  });

  // Backend returns: { success: true, data: { costExplainer } }
  // api wrapper returns: { data: <that payload> }
  return res.data?.costExplainer as CostExplainerDTO;
}
