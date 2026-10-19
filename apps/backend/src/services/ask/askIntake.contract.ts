// Sole Homeowner Interface Phase 7 (FR-INPUT-001..005): one file intake in front of the candidate pipelines that already exist.
// A file is kept as a Home Record (the original), read only after the person has seen the disclosure, and turned into CANDIDATES that
// write nothing until the person confirms them. Nothing here is a second store: every state below is derived from the Home Record,
// its extraction candidates, the inventory draft, or the inspection report that the existing pipelines own.

export const ASK_INTAKE_CONTRACT_VERSION = 'ask-intake-v1' as const;
export const ASK_INTAKE_MAX_BYTES = 10 * 1024 * 1024;
export const ASK_INTAKE_ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
/** Below this the reading is not trusted to pick a kind on its own: the person is asked. */
export const ASK_INTAKE_CLASSIFICATION_FLOOR = 0.6;

export type AskIntakeKind = 'WARRANTY' | 'RECEIPT' | 'INSURANCE_POLICY' | 'APPLIANCE_LABEL' | 'INSPECTION_REPORT';

export const ASK_INTAKE_KIND_OPTIONS: ReadonlyArray<{ kind: AskIntakeKind; label: string; description: string; acceptsImages: boolean; readsWith: 'MODEL' | 'LOCAL_OCR' }> = Object.freeze([
  { kind: 'WARRANTY', label: 'A warranty', description: 'Provider, start and end dates, and what is covered.', acceptsImages: true, readsWith: 'MODEL' },
  { kind: 'RECEIPT', label: 'A receipt or invoice', description: 'What was paid for, how much, and when. Saved as an expense once you confirm.', acceptsImages: true, readsWith: 'MODEL' },
  { kind: 'INSURANCE_POLICY', label: 'An insurance policy', description: 'Carrier, policy number, limits and dates from a declarations page.', acceptsImages: true, readsWith: 'MODEL' },
  { kind: 'APPLIANCE_LABEL', label: 'An appliance or product label', description: 'Brand, model and serial number, read on this server. Becomes an inventory item once you confirm.', acceptsImages: true, readsWith: 'LOCAL_OCR' },
  { kind: 'INSPECTION_REPORT', label: 'An inspection report', description: 'Each finding is proposed for you to accept or reject. Only the ones you accept become an inspection report for you to go through.', acceptsImages: false, readsWith: 'MODEL' },
]);

export const ASK_INTAKE_INSPECTION_REPORT_TYPES = ['GENERAL', 'ROOF', 'HVAC', 'SEWER', 'ELECTRICAL', 'FOUNDATION', 'PRE_PURCHASE', 'PRE_LISTING', 'ANNUAL', 'OTHER'] as const;
export type AskIntakeInspectionReportType = (typeof ASK_INTAKE_INSPECTION_REPORT_TYPES)[number];
/** Sensitivity a person can choose when they add a file; the stricter ones narrow who in the household can see it. */
export const ASK_INTAKE_SENSITIVITIES = ['STANDARD', 'PERSONAL', 'FINANCIAL', 'INSURANCE', 'LEGAL'] as const;
export type AskIntakeSensitivity = (typeof ASK_INTAKE_SENSITIVITIES)[number];

/** FR-INPUT-004: what is said before anything is read. Plain statements of what the code does. */
export const ASK_INTAKE_DISCLOSURES = Object.freeze({
  retention: 'The original file is kept in your Home Records until you remove it. Removing it moves it to the trash for 30 days, then it is deleted unless a retention rule or legal hold keeps it.',
  sharing: 'Household members can see the file according to the sensitivity you choose. It is not shared outside your household.',
  modelProcessing: 'To read a warranty, receipt, insurance policy or inspection report, the file is sent to Google Gemini, an AI service, to extract the details. Nothing is sent until you choose to read it.',
  localProcessing: 'An appliance label photo is read on our server with text recognition. It is not sent to an AI service. The photo is kept as the original; the text it contains is kept for 7 days to build the draft.',
  confirmation: 'Reading a file only proposes details. Nothing is added to your home until you accept it. Anything you reject, or leave undecided, is never added.',
});

export type AskIntakeState = 'UPLOADED' | 'REVIEW' | 'COMPLETED' | 'DISCARDED';

/** An inspection finding as proposed from the report. Present only on inspection candidates. */
export interface AskIntakeFindingDetail {
  homeSystem: string;
  severity: string;
  conditionRating: string;
  recommendation: string;
  interpretation: string;
  location: string | null;
  costRangeCents: { low: number | null; high: number | null };
}

export interface AskIntakeEvidence {
  page: number | null;
  /** [ymin, xmin, ymax, xmax] on a 0-1000 page scale, when the reader located it. */
  box: number[] | null;
  excerpt: string | null;
  /** TEXT_MATCH: found in the file's own text. MODEL_REPORTED: the AI reader's claim, not checked. */
  basis: 'TEXT_MATCH' | 'MODEL_REPORTED';
  /** "Page 2, upper left" */
  description: string;
}

export interface AskIntakeCandidate {
  id: string;
  fieldKey: string;
  label: string;
  proposedValue: string | null;
  reviewedValue: string | null;
  /** The value that will be used: the person's correction, else the proposal. */
  effectiveValue: string | null;
  confidence: number;
  required: boolean;
  reviewStatus: 'PENDING' | 'CONFIRMED' | 'CORRECTED' | 'REJECTED';
  /** Where the proposal came from, in words ("AI extraction from receipt.pdf"). */
  citation: string | null;
  promoted: boolean;
  /** Where in the original this came from, or why that is not known. */
  evidence: AskIntakeFacet<AskIntakeEvidence>;
  finding?: AskIntakeFindingDetail;
}

/** The provenance facet pattern used by Record detail: a fact is recorded, or the reason it is not is stated. */
export type AskIntakeFacet<T> = { status: 'AVAILABLE'; value: T } | { status: 'NOT_RECORDED'; reason: string };

export interface AskIntakeProvenance {
  original: { recordId: string; versionId: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; uploadedAt: string; scanStatus: string; contentChecks: string };
  reader: AskIntakeFacet<{ kind: 'MODEL' | 'LOCAL_OCR'; name: string }>;
  /** How many proposed details have a recorded page or place. A detail the reader did not locate says so; nothing is guessed. */
  pageAndRegion: AskIntakeFacet<{ located: number; total: number }>;
}

export interface AskIntakeView {
  contractVersion: typeof ASK_INTAKE_CONTRACT_VERSION;
  generatedAt: string;
  propertyId: string;
  recordId: string;
  versionId: string;
  title: string;
  state: AskIntakeState;
  kind: AskIntakeKind | null;
  /** Present when the file could not be placed with enough confidence: the only question that is asked. */
  choice: { reason: string; options: ReadonlyArray<{ kind: AskIntakeKind; label: string; description: string }> } | null;
  /** Present when a kind needs facts only the person has before it can be read (an inspection's type and date). */
  needsDetails: { kind: 'INSPECTION_REPORT'; reportTypes: readonly AskIntakeInspectionReportType[] } | null;
  classification: { kind: AskIntakeKind | null; modelLabel: string | null; confidence: number } | null;
  candidates: AskIntakeCandidate[];
  /** Required details that are missing or rejected, so confirming is blocked and the person can see why. */
  missingRequired: string[];
  /** The draft inventory item when the file is a label. Not an inventory item until confirmed. */
  labelDraft: { id: string; status: 'DRAFT' | 'CONFIRMED' | 'DISMISSED'; fields: Array<{ key: string; label: string; value: string | null; confidence: number | null }>; itemId: string | null } | null;
  /** The inspection report created from the file. Its findings are reviewed in Ask; none is added to the home before that. */
  inspection: { reportId: string; status: string; findingCount: number } | null;
  /** What was created from this file, once confirmed. */
  result: { entityType: 'WARRANTY' | 'EXPENSE' | 'INSURANCE_POLICY' | 'INVENTORY_ITEM'; entityId: string } | null;
  provenance: AskIntakeProvenance;
  disclosures: typeof ASK_INTAKE_DISCLOSURES;
}
