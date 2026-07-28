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
  stage: string | null;
  effectiveDate: string | null;
  radarProviderEventId: string | null;
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

export type PropertyTaxCoverageDTO = {
  status: 'COVERED' | 'DEGRADED' | 'UNAVAILABLE' | 'UNCONFIGURED';
  freshness: 'FRESH' | 'STALE' | 'NEVER_FETCHED' | 'DEGRADED';
  coverageKeys: string[];
  source: {
    id: string;
    name: string;
    slug: string;
    status: string;
    coverageType: string;
    normalizedCoverageKey: string;
    officialUrl: string;
    lastFetchAt: string | null;
    lastFetchError: string | null;
    totalAssessmentsFetched: number;
    assessmentStage: string | null;
    pilotConstraints: {
      borough: string | null;
      recordType: string | null;
      taxClass: string | null;
    };
    appealInformation: {
      officialUrl: string | null;
      disclaimer: string | null;
    };
  } | null;
  lastGoodAssessment: {
    id: string;
    taxYear: number;
    stage: string;
    observedAt: string;
    effectiveDate: string | null;
    sourceExternalId: string | null;
    sourceUrl: string | null;
    radarProviderEventId: string | null;
    parcelId: string | null;
    matchMethod: string | null;
    matchConfidence: number | null;
  } | null;
};

export type PropertyTaxRulesDTO = {
  coverage: 'REVIEWED' | 'UNAVAILABLE' | 'DISABLED' | 'EXPIRED';
  reason: string | null;
  profile: {
    id: string;
    slug: string;
    version: number;
    title: string;
    summary: string | null;
    propertyClass: string | null;
    taxYearLabel: string | null;
    timezone: string;
    assessmentRatio: number | null;
    caps: unknown;
    exemptions: unknown;
    correctionGrounds: unknown;
    appealGrounds: unknown;
    forms: unknown;
    fees: unknown;
    officialLinks: unknown;
    effectiveFrom: string;
    effectiveTo: string | null;
    reviewedAt: string;
    reviewerName: string;
    expiresAt: string;
    citations: Array<{
      title: string;
      publisher: string;
      officialUrl: string;
      retrievedAt: string;
      effectiveAt: string | null;
      notes: string | null;
    }>;
  } | null;
  deadlines: Array<{
    id: string;
    code: string;
    type: string;
    label: string;
    availability:
      | 'AVAILABLE'
      | 'NEEDS_NOTICE_DATE'
      | 'NEEDS_QUALIFICATION_CONFIRMATION';
    status: 'PAST_DUE' | 'DUE_SOON' | 'OPEN' | 'INPUT_REQUIRED';
    dueAt: string | null;
    dueLocalDate: string | null;
    remainingDays: number | null;
    timezone: string;
    cutoffLocalTime: string;
    submissionRequirement: string | null;
    officialUrl: string;
    formCode: string | null;
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

export async function getPropertyTaxCoverage(
  propertyId: string,
): Promise<PropertyTaxCoverageDTO> {
  const res = await api.get(`/api/properties/${propertyId}/property-tax/coverage`);
  return res.data?.coverage as PropertyTaxCoverageDTO;
}

export async function getPropertyTaxRules(
  propertyId: string,
): Promise<PropertyTaxRulesDTO> {
  const res = await api.get(`/api/properties/${propertyId}/property-tax/rules`);
  return res.data?.rules as PropertyTaxRulesDTO;
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
