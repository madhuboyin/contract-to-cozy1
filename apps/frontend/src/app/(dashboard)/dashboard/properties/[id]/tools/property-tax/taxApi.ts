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

export type PropertyTaxDocumentFieldDTO = {
  id: string;
  fieldKey: string;
  proposedValueJson: unknown;
  correctedValueJson: unknown | null;
  confidence: number | string;
  status: 'PROPOSED' | 'CONFIRMED' | 'CORRECTED' | 'REJECTED';
  pageNumber: number | null;
  boundingBoxJson: unknown | null;
  sourceText: string | null;
};

export type PropertyTaxDocumentIntakeDTO = {
  id: string;
  propertyId: string;
  documentId: string;
  kind: 'ASSESSMENT_NOTICE' | 'TAX_BILL' | 'EXEMPTION_NOTICE' | 'CORRECTION_NOTICE' | 'OTHER';
  status: 'UPLOADED' | 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED' | 'EXTRACTION_FAILED';
  storageMode: 'VAULT';
  extractionMethod: 'MANUAL' | 'OCR' | 'AI';
  privacyConsentVersion: string;
  confirmedAt: string | null;
  createdAt: string;
  document: {
    id: string;
    name: string;
    mimeType: string;
    fileSize: number;
    verificationStatus: string;
    createdAt: string;
  };
  fields: PropertyTaxDocumentFieldDTO[];
};

export type PropertyTaxActionsDTO = {
  coverage: 'REVIEWED' | 'UNAVAILABLE' | 'DISABLED' | 'EXPIRED';
  reason: string | null;
  conflicts: PropertyTaxCenterRecordDTO['conflicts'];
  actions: Array<{
    id: string;
    type: 'EXEMPTION_REVIEW' | 'FACTUAL_CORRECTION' | 'INFORMAL_REVIEW';
    status:
      | 'ELIGIBILITY_REVIEW'
      | 'READY_FOR_EXTERNAL_ACTION'
      | 'COMPLETED'
      | 'NOT_APPLICABLE'
      | 'DISMISSED';
    title: string;
    explanation: string;
    officialUrl: string;
    checklist: unknown[];
    decidedAt: string | null;
    completedAt: string | null;
  }>;
};

export type PropertyTaxAppealGround =
  | 'ASSESSED_VALUE'
  | 'TAX_CLASS'
  | 'EXEMPTION';

export type PropertyTaxAppealReadinessDTO = {
  selectedGround: PropertyTaxAppealGround;
  status: 'READY' | 'NOT_READY' | 'NOT_COVERED' | 'NO_SUPPORTED_GROUND';
  reason: string | null;
  reviewedGrounds: Array<{
    code: string;
    label: string;
    formCode: string | null;
  }>;
  ground?: {
    code: PropertyTaxAppealGround;
    label: string;
    formCode: string | null;
    requirements: Record<string, unknown>;
  };
  ruleProfile: {
    id: string;
    title: string;
    version: number;
    reviewedAt: string;
    expiresAt: string;
  } | null;
  evaluatedAt?: string;
  canonical?: {
    valuationDate: string | null;
    classification: unknown;
    totalAssessedValue: number | null;
    taxableValue: number | null;
    assessmentRatio: number | null;
    effectiveTaxRate: number | null;
  };
  gaps: string[];
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence: Array<{
    id: string;
    evidenceKey: string;
    ground: PropertyTaxAppealGround;
    type:
      | 'FACTUAL_ERROR'
      | 'CONDITION'
      | 'EXEMPTION_DECISION'
      | 'SUPPORTING_DOCUMENT';
    title: string;
    description: string | null;
    facts: Record<string, unknown>;
    sourceUrl: string | null;
    supportingDocumentId: string | null;
    confirmedAt: string;
  }>;
  comparables: Array<{
    id: string;
    comparableKey: string;
    address: string;
    saleDate: string;
    salePrice: number;
    propertyClass: string;
    sourceUrl: string | null;
    sourceDocumentId: string | null;
    adjustments: {
      time: number;
      condition: number;
      size: number;
      other: number;
    };
    adjustmentRationale: string | null;
    adjustedSalePrice: number;
    qualification: 'QUALIFIED' | 'NOT_QUALIFIED';
    reasons: string[];
  }>;
  taxAtStake: {
    low: number;
    high: number;
    currency: 'USD';
    method: string;
    effectiveTaxRate: number;
    assessmentRatio: number;
    indicatedMarketValueRange: { low: number; high: number };
    indicatedAssessedValueRange: { low: number; high: number };
  } | null;
  professionalBoundary: string;
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

export async function getPropertyTaxDocumentIntakes(
  propertyId: string,
): Promise<PropertyTaxDocumentIntakeDTO[]> {
  const res = await api.get(`/api/properties/${propertyId}/property-tax/intakes`);
  return (res.data?.intakes ?? []) as PropertyTaxDocumentIntakeDTO[];
}

export async function uploadPropertyTaxDocument(
  propertyId: string,
  file: File,
  kind: PropertyTaxDocumentIntakeDTO['kind'],
): Promise<PropertyTaxDocumentIntakeDTO> {
  const body = new FormData();
  body.append('file', file);
  body.append('kind', kind);
  body.append('privacyConsent', 'true');
  const res = await api.postFormData<{ intake: PropertyTaxDocumentIntakeDTO }>(
    `/api/properties/${propertyId}/property-tax/intakes`,
    body,
  );
  if (!res.success) throw new Error(res.message ?? 'Tax document upload failed');
  return res.data.intake;
}

export async function stagePropertyTaxDocumentFields(
  propertyId: string,
  intakeId: string,
  fields: Array<{ fieldKey: string; value: unknown }>,
): Promise<PropertyTaxDocumentIntakeDTO> {
  const res = await api.put(
    `/api/properties/${propertyId}/property-tax/intakes/${intakeId}/fields`,
    { fields },
  );
  return res.data?.intake as PropertyTaxDocumentIntakeDTO;
}

export async function confirmPropertyTaxDocument(
  propertyId: string,
  intakeId: string,
  decisions: Array<{
    fieldKey: string;
    status: 'CONFIRMED' | 'CORRECTED' | 'REJECTED';
    correctedValue?: unknown;
  }>,
): Promise<{
  intake: PropertyTaxDocumentIntakeDTO;
  record: PropertyTaxCenterRecordDTO;
}> {
  const res = await api.post(
    `/api/properties/${propertyId}/property-tax/intakes/${intakeId}/confirm`,
    { decisions },
  );
  return res.data as {
    intake: PropertyTaxDocumentIntakeDTO;
    record: PropertyTaxCenterRecordDTO;
  };
}

export async function getPropertyTaxActions(
  propertyId: string,
): Promise<PropertyTaxActionsDTO> {
  const res = await api.post(`/api/properties/${propertyId}/property-tax/actions/refresh`);
  return res.data as PropertyTaxActionsDTO;
}

export async function decidePropertyTaxAction(
  propertyId: string,
  actionId: string,
  input: {
    status: PropertyTaxActionsDTO['actions'][number]['status'];
    note: string;
    externalReference?: string;
  },
) {
  const res = await api.put(
    `/api/properties/${propertyId}/property-tax/actions/${actionId}`,
    input,
  );
  return res.data?.action;
}

export async function getPropertyTaxAppealReadiness(
  propertyId: string,
  ground: PropertyTaxAppealGround,
  options: {
    revisedNoticeDate?: string;
    revisedNoticeQualifies?: boolean;
  } = {},
): Promise<PropertyTaxAppealReadinessDTO> {
  const query = new URLSearchParams({ ground });
  if (options.revisedNoticeDate) {
    query.set('revisedNoticeDate', options.revisedNoticeDate);
  }
  if (options.revisedNoticeQualifies === true) {
    query.set('revisedNoticeQualifies', 'true');
  }
  const res = await api.get(
    `/api/properties/${propertyId}/property-tax/appeal/readiness?${query}`,
  );
  return res.data?.readiness as PropertyTaxAppealReadinessDTO;
}

export async function savePropertyTaxAppealEvidence(
  propertyId: string,
  input: {
    evidenceKey: string;
    ground: PropertyTaxAppealGround;
    type:
      | 'FACTUAL_ERROR'
      | 'CONDITION'
      | 'EXEMPTION_DECISION'
      | 'SUPPORTING_DOCUMENT';
    title: string;
    description?: string;
    facts: Record<string, unknown>;
    sourceUrl?: string;
    supportingDocumentId?: string;
  },
) {
  const res = await api.put(
    `/api/properties/${propertyId}/property-tax/appeal/evidence`,
    input,
  );
  return res.data?.evidence;
}

export async function savePropertyTaxAppealComparable(
  propertyId: string,
  input: {
    comparableKey: string;
    address: string;
    saleDate: string;
    salePrice: number;
    propertyClass: string;
    sourceUrl?: string;
    adjustments?: {
      time?: number;
      condition?: number;
      size?: number;
      other?: number;
      rationale?: string;
    };
  },
) {
  const res = await api.put(
    `/api/properties/${propertyId}/property-tax/appeal/comparables`,
    input,
  );
  return res.data?.comparable;
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
