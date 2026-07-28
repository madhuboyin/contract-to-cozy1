export type PropertyTaxCanonicalState =
  | 'UNKNOWN'
  | 'OFFICIAL'
  | 'DOCUMENT_CONFIRMED'
  | 'DOCUMENT_UNCONFIRMED'
  | 'HOMEOWNER_REPORTED'
  | 'MIXED'
  | 'CONFLICTED';

export type PropertyTaxEvidenceSource =
  | 'OFFICIAL_SOURCE'
  | 'DOCUMENT'
  | 'HOMEOWNER_REPORTED';

export type PropertyTaxEvidenceConfidence =
  | 'UNKNOWN'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'VERIFIED';

export type PropertyTaxEvidenceReviewStatus =
  | 'UNREVIEWED'
  | 'HOMEOWNER_CONFIRMED'
  | 'VERIFIED'
  | 'CONFLICTED'
  | 'SUPERSEDED'
  | 'REJECTED';

export type PropertyTaxFieldObservation = {
  id: string;
  fieldKey: string;
  value: unknown;
  sourceType: PropertyTaxEvidenceSource;
  confidence: PropertyTaxEvidenceConfidence;
  reviewStatus: PropertyTaxEvidenceReviewStatus;
  observedAt: string;
  effectiveAt: string | null;
  sourceDocumentId: string | null;
  sourceDataSourceId: string | null;
  sourceExternalId: string | null;
  sourceUrl: string | null;
};

export type ReconciledPropertyTaxField = {
  fieldKey: string;
  state: 'UNKNOWN' | 'KNOWN' | 'CONFLICTED';
  value: unknown | null;
  confidence: PropertyTaxEvidenceConfidence;
  canonicalState: PropertyTaxCanonicalState;
  observations: PropertyTaxFieldObservation[];
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
