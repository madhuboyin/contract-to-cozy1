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

export type PropertyTaxFieldObservationDTO = {
  id: string;
  fieldKey: string;
  value: unknown;
  sourceType: 'OFFICIAL_SOURCE' | 'DOCUMENT' | 'HOMEOWNER_REPORTED';
  confidence: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
  reviewStatus: 'UNREVIEWED' | 'HOMEOWNER_CONFIRMED' | 'VERIFIED' | 'CONFLICTED' | 'SUPERSEDED' | 'REJECTED';
  observedAt: string;
  effectiveAt: string | null;
  sourceDocumentId: string | null;
  sourceDataSourceId: string | null;
  sourceExternalId: string | null;
  sourceUrl: string | null;
};

export type PropertyTaxFieldDTO = {
  fieldKey: string;
  state: 'UNKNOWN' | 'KNOWN' | 'CONFLICTED';
  value: unknown | null;
  confidence: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
  canonicalState:
    | 'UNKNOWN'
    | 'OFFICIAL'
    | 'DOCUMENT_CONFIRMED'
    | 'DOCUMENT_UNCONFIRMED'
    | 'HOMEOWNER_REPORTED'
    | 'MIXED'
    | 'CONFLICTED';
  observations: PropertyTaxFieldObservationDTO[];
};

export type PropertyTaxCenterRecordDTO = {
  property: { id: string; addressLabel: string };
  state:
    | 'UNKNOWN'
    | 'OFFICIAL'
    | 'DOCUMENT_CONFIRMED'
    | 'DOCUMENT_UNCONFIRMED'
    | 'HOMEOWNER_REPORTED'
    | 'MIXED'
    | 'CONFLICTED';
  latestTaxYear: number | null;
  parcel: {
    matchStatus: string;
    matchMethod: string | null;
    confidence: number | null;
    jurisdiction: {
      id: string;
      normalizedKey: string;
      stateCode: string;
      countyName: string | null;
      municipality: string | null;
      status: string;
    } | null;
    fields: Record<string, PropertyTaxFieldDTO>;
  };
  assessment: {
    fields: Record<string, PropertyTaxFieldDTO>;
    sourceRecords: PropertyTaxSourceRecordDTO[];
  };
  bill: {
    fields: Record<string, PropertyTaxFieldDTO>;
    sourceRecords: PropertyTaxSourceRecordDTO[];
  };
  conflicts: Array<{
    fieldKey: string;
    observations: PropertyTaxFieldObservationDTO[];
  }>;
  provenanceComplete: boolean;
};

export type PropertyTaxSourceRecordDTO = {
  id: string;
  taxYear: number;
  sourceType: string;
  confidence: string;
  status: string;
  observedAt: string;
  sourceExternalId: string | null;
  sourceUrl: string | null;
  dataSource: { id: string; name: string } | null;
  documents: Array<{
    role: string;
    id: string;
    name: string;
    verificationStatus: string;
  }>;
};

export type HomeownerPropertyTaxRecordInput = {
  taxYear: number;
  parcelId?: string;
  stage?: 'UNKNOWN' | 'PRELIMINARY' | 'TENTATIVE' | 'CURRENT_ROLL' | 'FINAL' | 'CORRECTED';
  valuationDate?: string;
  classification?: string;
  landValue?: number;
  improvementValue?: number;
  totalAssessedValue?: number;
  taxableValue?: number;
  assessmentRatio?: number;
  billAmount?: number;
  effectiveTaxRate?: number;
  billNumber?: string;
  issueDate?: string;
  dueDates?: string[];
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

export async function getPropertyTaxCenterRecord(
  propertyId: string,
): Promise<PropertyTaxCenterRecordDTO> {
  const res = await api.get(`/api/properties/${propertyId}/property-tax/record`);
  return res.data?.record as PropertyTaxCenterRecordDTO;
}

export async function saveHomeownerPropertyTaxRecord(
  propertyId: string,
  input: HomeownerPropertyTaxRecordInput,
): Promise<PropertyTaxCenterRecordDTO> {
  const res = await api.post(
    `/api/properties/${propertyId}/property-tax/record/homeowner`,
    input,
  );
  return res.data?.record as PropertyTaxCenterRecordDTO;
}
