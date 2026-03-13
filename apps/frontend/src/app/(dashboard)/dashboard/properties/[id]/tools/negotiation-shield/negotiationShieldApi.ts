import { api } from '@/lib/api/client';

export type NegotiationShieldCaseScenarioType =
  | 'CONTRACTOR_QUOTE_REVIEW'
  | 'INSURANCE_PREMIUM_INCREASE'
  | 'INSURANCE_CLAIM_SETTLEMENT'
  | 'BUYER_INSPECTION_NEGOTIATION'
  | 'CONTRACTOR_URGENCY_PRESSURE';

export type NegotiationShieldCaseStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'ANALYZED'
  | 'ARCHIVED';

export type NegotiationShieldSourceType =
  | 'MANUAL'
  | 'DOCUMENT_UPLOAD'
  | 'HYBRID';

export type NegotiationShieldInputType =
  | 'CONTRACTOR_QUOTE'
  | 'INSURANCE_PREMIUM'
  | 'INSURANCE_CLAIM_SETTLEMENT'
  | 'BUYER_INSPECTION'
  | 'CONTRACTOR_URGENCY';

export type NegotiationShieldDocumentType =
  | 'QUOTE'
  | 'PREMIUM_NOTICE'
  | 'CLAIM_SETTLEMENT_NOTICE'
  | 'CLAIM_ESTIMATE'
  | 'INSPECTION_REPORT'
  | 'BUYER_REQUEST'
  | 'CONTRACTOR_RECOMMENDATION'
  | 'CONTRACTOR_ESTIMATE'
  | 'SUPPORTING_DOCUMENT';

export type NegotiationShieldDraftType = 'EMAIL' | 'MESSAGE';

export type NegotiationShieldFinding = {
  key: string;
  title: string;
  detail: string;
  status?: 'INFO' | 'MISSING' | 'CAUTION' | 'POSITIVE';
};

export type NegotiationShieldLeveragePoint = {
  key: string;
  title: string;
  detail: string;
  strength?: 'HIGH' | 'MEDIUM' | 'LOW';
};

export type NegotiationShieldRecommendedAction = {
  key: string;
  title: string;
  detail: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
};

export type NegotiationShieldPricingAssessment = {
  status?: string | null;
  summary?: string | null;
  rationale?: string[];
  confidenceLabel?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  currency?: string | null;
  quoteAmount?: number | null;
  priorPremium?: number | null;
  newPremium?: number | null;
  increaseAmount?: number | null;
  increasePercentage?: number | null;
  settlementAmount?: number | null;
  estimateAmount?: number | null;
  gapAmount?: number | null;
  gapPercentage?: number | null;
  requestedConcessionAmount?: number | null;
};

export type NegotiationShieldCaseSummary = {
  id: string;
  propertyId: string;
  createdByUserId: string | null;
  scenarioType: NegotiationShieldCaseScenarioType;
  status: NegotiationShieldCaseStatus;
  title: string;
  description: string | null;
  sourceType: NegotiationShieldSourceType;
  analysisVersion: string | null;
  latestAnalysisAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NegotiationShieldInput = {
  id: string;
  caseId: string;
  inputType: NegotiationShieldInputType;
  rawText: string | null;
  structuredData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NegotiationShieldDocument = {
  id: string;
  caseId: string;
  documentId: string;
  documentType: NegotiationShieldDocumentType;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  fileUrl: string | null;
  storageKey: string | null;
  uploadedAt: string;
};

export type NegotiationShieldAnalysis = {
  id: string;
  caseId: string;
  scenarioType: NegotiationShieldCaseScenarioType;
  summary: string | null;
  findings: NegotiationShieldFinding[] | Record<string, unknown> | null;
  negotiationLeverage: NegotiationShieldLeveragePoint[] | Record<string, unknown> | null;
  recommendedActions: NegotiationShieldRecommendedAction[] | Record<string, unknown> | null;
  pricingAssessment: NegotiationShieldPricingAssessment | Record<string, unknown> | null;
  confidence: number | null;
  generatedAt: string;
  modelVersion: string | null;
  createdAt: string;
};

export type NegotiationShieldDraft = {
  id: string;
  caseId: string;
  draftType: NegotiationShieldDraftType;
  subject: string | null;
  body: string;
  tone: string | null;
  isLatest: boolean;
  createdAt: string;
};

export type NegotiationShieldCaseDetail = {
  case: NegotiationShieldCaseSummary;
  inputs: NegotiationShieldInput[];
  documents: NegotiationShieldDocument[];
  latestAnalysis: NegotiationShieldAnalysis | null;
  latestDraft: NegotiationShieldDraft | null;
};

export type CreateNegotiationShieldCasePayload = {
  scenarioType: NegotiationShieldCaseScenarioType;
  title: string;
  description?: string | null;
  sourceType: NegotiationShieldSourceType;
};

export type SaveNegotiationShieldInputPayload = {
  inputId?: string;
  inputType: NegotiationShieldInputType;
  rawText?: string | null;
  structuredData?: Record<string, unknown>;
};

export type AttachNegotiationShieldDocumentPayload = {
  documentType: NegotiationShieldDocumentType;
  documentId: string;
};

export async function listNegotiationShieldCases(
  propertyId: string
): Promise<NegotiationShieldCaseSummary[]> {
  const res = await api.get<{ cases: NegotiationShieldCaseSummary[] }>(
    `/api/properties/${propertyId}/negotiation-shield/cases`
  );
  return res.data.cases ?? [];
}

export async function getNegotiationShieldCaseDetail(
  propertyId: string,
  caseId: string
): Promise<NegotiationShieldCaseDetail> {
  const res = await api.get<NegotiationShieldCaseDetail>(
    `/api/properties/${propertyId}/negotiation-shield/cases/${caseId}`
  );
  return res.data;
}

export async function createNegotiationShieldCase(
  propertyId: string,
  payload: CreateNegotiationShieldCasePayload
): Promise<NegotiationShieldCaseDetail> {
  const res = await api.post<NegotiationShieldCaseDetail>(
    `/api/properties/${propertyId}/negotiation-shield/cases`,
    payload
  );
  return res.data;
}

export async function saveNegotiationShieldInput(
  propertyId: string,
  caseId: string,
  payload: SaveNegotiationShieldInputPayload
): Promise<NegotiationShieldCaseDetail> {
  const res = await api.put<NegotiationShieldCaseDetail>(
    `/api/properties/${propertyId}/negotiation-shield/cases/${caseId}/input`,
    payload
  );
  return res.data;
}

export async function attachNegotiationShieldDocument(
  propertyId: string,
  caseId: string,
  payload: AttachNegotiationShieldDocumentPayload
): Promise<NegotiationShieldCaseDetail> {
  const res = await api.post<NegotiationShieldCaseDetail>(
    `/api/properties/${propertyId}/negotiation-shield/cases/${caseId}/documents`,
    payload
  );
  return res.data;
}

export async function parseNegotiationShieldCaseDocument(
  propertyId: string,
  caseId: string,
  caseDocumentId: string
): Promise<NegotiationShieldCaseDetail> {
  const res = await api.post<NegotiationShieldCaseDetail>(
    `/api/properties/${propertyId}/negotiation-shield/cases/${caseId}/documents/${caseDocumentId}/parse`
  );
  return res.data;
}

export async function analyzeNegotiationShieldCase(
  propertyId: string,
  caseId: string
): Promise<NegotiationShieldCaseDetail> {
  const res = await api.post<NegotiationShieldCaseDetail>(
    `/api/properties/${propertyId}/negotiation-shield/cases/${caseId}/analyze`
  );
  return res.data;
}
