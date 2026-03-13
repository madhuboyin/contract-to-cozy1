import { api } from '@/lib/api/client';

export type NegotiationShieldCaseScenarioType =
  | 'CONTRACTOR_QUOTE_REVIEW'
  | 'INSURANCE_PREMIUM_INCREASE';

export type NegotiationShieldCaseStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'ANALYZED'
  | 'ARCHIVED';

export type NegotiationShieldCaseSummary = {
  id: string;
  propertyId: string;
  createdByUserId: string | null;
  scenarioType: NegotiationShieldCaseScenarioType;
  status: NegotiationShieldCaseStatus;
  title: string;
  description: string | null;
  sourceType: 'MANUAL' | 'DOCUMENT_UPLOAD' | 'HYBRID';
  analysisVersion: string | null;
  latestAnalysisAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listNegotiationShieldCases(
  propertyId: string
): Promise<NegotiationShieldCaseSummary[]> {
  const res = await api.get(`/api/properties/${propertyId}/negotiation-shield/cases`);
  return (((res.data as any) ?? {}).cases ?? []) as NegotiationShieldCaseSummary[];
}
