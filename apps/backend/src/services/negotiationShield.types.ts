export const NEGOTIATION_SHIELD_SCENARIO_TYPES = [
  'CONTRACTOR_QUOTE_REVIEW',
  'INSURANCE_PREMIUM_INCREASE',
] as const;

export const NEGOTIATION_SHIELD_CASE_STATUSES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'ANALYZED',
  'ARCHIVED',
] as const;

export const NEGOTIATION_SHIELD_SOURCE_TYPES = [
  'MANUAL',
  'DOCUMENT_UPLOAD',
  'HYBRID',
] as const;

export const NEGOTIATION_SHIELD_INPUT_TYPES = [
  'CONTRACTOR_QUOTE',
  'INSURANCE_PREMIUM',
] as const;

export const NEGOTIATION_SHIELD_DOCUMENT_TYPES = [
  'QUOTE',
  'PREMIUM_NOTICE',
  'SUPPORTING_DOCUMENT',
] as const;

export const NEGOTIATION_SHIELD_DRAFT_TYPES = [
  'EMAIL',
  'MESSAGE',
] as const;

export type NegotiationShieldScenarioType =
  (typeof NEGOTIATION_SHIELD_SCENARIO_TYPES)[number];

export type NegotiationShieldCaseStatus =
  (typeof NEGOTIATION_SHIELD_CASE_STATUSES)[number];

export type NegotiationShieldSourceType =
  (typeof NEGOTIATION_SHIELD_SOURCE_TYPES)[number];

export type NegotiationShieldInputType =
  (typeof NEGOTIATION_SHIELD_INPUT_TYPES)[number];

export type NegotiationShieldDocumentType =
  (typeof NEGOTIATION_SHIELD_DOCUMENT_TYPES)[number];

export type NegotiationShieldDraftType =
  (typeof NEGOTIATION_SHIELD_DRAFT_TYPES)[number];

export type NegotiationShieldCaseSummaryDTO = {
  id: string;
  propertyId: string;
  createdByUserId: string | null;
  scenarioType: NegotiationShieldScenarioType;
  status: NegotiationShieldCaseStatus;
  title: string;
  description: string | null;
  sourceType: NegotiationShieldSourceType;
  analysisVersion: string | null;
  latestAnalysisAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NegotiationShieldInputDTO = {
  id: string;
  caseId: string;
  inputType: NegotiationShieldInputType;
  rawText: string | null;
  structuredData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NegotiationShieldDocumentDTO = {
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

export type NegotiationShieldAnalysisDTO = {
  id: string;
  caseId: string;
  scenarioType: NegotiationShieldScenarioType;
  summary: string | null;
  findings: unknown;
  negotiationLeverage: unknown;
  recommendedActions: unknown;
  pricingAssessment: unknown;
  confidence: number | null;
  generatedAt: string;
  modelVersion: string | null;
  createdAt: string;
};

export type NegotiationShieldDraftDTO = {
  id: string;
  caseId: string;
  draftType: NegotiationShieldDraftType;
  subject: string | null;
  body: string;
  tone: string | null;
  isLatest: boolean;
  createdAt: string;
};

export type NegotiationShieldCaseDetailDTO = {
  case: NegotiationShieldCaseSummaryDTO;
  inputs: NegotiationShieldInputDTO[];
  documents: NegotiationShieldDocumentDTO[];
  latestAnalysis: NegotiationShieldAnalysisDTO | null;
  latestDraft: NegotiationShieldDraftDTO | null;
};

export type CreateNegotiationShieldCaseInput = {
  scenarioType: NegotiationShieldScenarioType;
  title: string;
  description?: string | null;
  sourceType: NegotiationShieldSourceType;
  initialInput?: {
    inputType: NegotiationShieldInputType;
    rawText?: string | null;
    structuredData?: Record<string, unknown>;
  };
};

export type SaveNegotiationShieldInputPayload = {
  inputId?: string;
  inputType: NegotiationShieldInputType;
  rawText?: string | null;
  structuredData?: Record<string, unknown>;
};

export type AttachNegotiationShieldDocumentPayload = {
  documentType: NegotiationShieldDocumentType;
  documentId?: string;
  fileName?: string;
  mimeType?: string | null;
  fileUrl?: string | null;
  storageKey?: string | null;
  fileSizeBytes?: number | null;
};
