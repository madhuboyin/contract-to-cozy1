import type { AskIntakeCandidate, AskIntakeKind, AskIntakeView } from '@/features/ask/types';
import { askFailureCode } from '../workspace/support';

export const SENSITIVITY_CHOICES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'STANDARD', label: 'Standard', hint: 'Anyone in the household can see it.' },
  { value: 'PERSONAL', label: 'Personal', hint: 'Contains personal details.' },
  { value: 'FINANCIAL', label: 'Financial', hint: 'Contains payment or account details.' },
  { value: 'INSURANCE', label: 'Insurance', hint: 'An insurance document.' },
  { value: 'LEGAL', label: 'Legal', hint: 'A legal document.' },
];

export const REPORT_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General home inspection', ROOF: 'Roof', HVAC: 'Heating and cooling', SEWER: 'Sewer line', ELECTRICAL: 'Electrical', FOUNDATION: 'Foundation',
  PRE_PURCHASE: 'Before buying', PRE_LISTING: 'Before selling', ANNUAL: 'Annual check', OTHER: 'Other',
};

export const FAILURE_COPY: Record<string, string> = {
  PROPERTY_RECORD_DUPLICATE_CONTENT: 'This exact file is already in your Home Records.',
  ASK_INTAKE_TYPE_UNSUPPORTED: 'Choose a PDF, JPEG, PNG or WEBP file.',
  ASK_INTAKE_TOO_LARGE: 'That file is larger than 10MB.',
  ASK_INTAKE_DISCLOSURE_NOT_ACKNOWLEDGED: 'Confirm that this file may be sent to an AI service to be read.',
  ASK_INTAKE_INSPECTION_DETAILS_INVALID: 'Choose the report type and the date the inspection happened.',
  ASK_INTAKE_ALREADY_USED: 'Something was already created from this file. Remove it from your Home Records instead.',
  PROPERTY_RECORD_EXTRACTION_UNREADABLE: 'This file could not be read automatically. You can choose what it is, or keep it without reading.',
  ASK_INTAKE_MALWARE_DETECTED: 'This file was blocked because it may be harmful. It was not added.',
  ASK_INTAKE_SCAN_UNAVAILABLE: 'The file could not be checked for malware right now, so it was not added. Try again in a moment.',
  INSPECTION_NO_ACCEPTED_FINDINGS: 'Accept at least one finding first.',
  ASK_INTAKE_FINDING_NOT_EDITABLE: 'A finding can be accepted or rejected here. You can edit it after it is added.',
  ASK_INTAKE_NOT_FOUND: 'That file could not be found. It may have been removed.',
};

/** What the person sees for a failure: our own plain sentence for a known code, else the server's message, else a calm default. */
export function intakeFailureMessage(caught: unknown, fallback: string): string {
  const code = askFailureCode(caught);
  if (code && FAILURE_COPY[code]) return FAILURE_COPY[code];
  return caught instanceof Error && caught.message && !/^HTTP Error/.test(caught.message) ? caught.message : fallback;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function confidenceLabel(confidence: number): { text: string; low: boolean } {
  const percent = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return { text: `${percent}% sure`, low: confidence < 0.5 };
}

export function candidateStatusLabel(candidate: AskIntakeCandidate): string {
  switch (candidate.reviewStatus) {
    case 'CONFIRMED': return 'Accepted';
    case 'CORRECTED': return 'Edited';
    case 'REJECTED': return 'Rejected';
    default: return 'Not decided yet';
  }
}

/** True once every required detail has a usable value, so adding it to the home is allowed. Optional details can stay undecided. */
export function canAddToHome(view: AskIntakeView): boolean {
  // An inspection report is created from the findings the person accepted; undecided and rejected ones are left out, so only one acceptance is needed.
  if (view.kind === 'INSPECTION_REPORT') return view.candidates.some((candidate) => candidate.reviewStatus === 'CONFIRMED');
  return view.candidates.length > 0 && view.missingRequired.length === 0 && view.candidates.filter((candidate) => candidate.required).every((candidate) => candidate.reviewStatus !== 'PENDING');
}

export const RESULT_COPY: Record<NonNullable<AskIntakeView['result']>['entityType'], { done: string; section: string }> = {
  WARRANTY: { done: 'Warranty added to your home.', section: 'warranties' },
  EXPENSE: { done: 'Expense added to your home.', section: 'documents' },
  INSURANCE_POLICY: { done: 'Insurance policy added to your home.', section: 'coverage' },
  INVENTORY_ITEM: { done: 'Item added to your inventory.', section: 'inventory' },
};

// What the homeowner asks next about what they just added: the question that opens that part of the record, in this same conversation.
const SECTION_QUESTIONS: Record<string, string> = {
  warranties: 'Show my warranties', documents: 'Show my home documents', coverage: 'Review my coverage', inventory: 'Show my home inventory', inspections: 'Show me my inspection reports.',
};

export function intakeResultQuestion(view: AskIntakeView): string | null {
  if (view.result) return SECTION_QUESTIONS[RESULT_COPY[view.result.entityType].section] ?? null;
  if (view.inspection) return SECTION_QUESTIONS.inspections;
  return null;
}

export function originalQuestion(): string {
  return SECTION_QUESTIONS.documents;
}

export function kindLabel(kind: AskIntakeKind | null): string {
  switch (kind) {
    case 'WARRANTY': return 'a warranty';
    case 'RECEIPT': return 'a receipt or invoice';
    case 'INSURANCE_POLICY': return 'an insurance policy';
    case 'APPLIANCE_LABEL': return 'an appliance label';
    case 'INSPECTION_REPORT': return 'an inspection report';
    default: return 'a file';
  }
}

/** A pasted or dropped file list reduced to the one file the dialog takes. Empty or several files are explained, not guessed at. */
export function pickSingleFile(files: ArrayLike<File> | null | undefined): { file: File | null; problem: string | null } {
  const list = files ? Array.from(files) : [];
  if (list.length === 0) return { file: null, problem: null };
  if (list.length > 1) return { file: null, problem: 'Add one file at a time.' };
  return { file: list[0], problem: null };
}

export function formatCostRange(range: { low: number | null; high: number | null }): string | null {
  const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  if (range.low !== null && range.high !== null) return `${dollars(range.low)} to ${dollars(range.high)}`;
  const only = range.low ?? range.high;
  return only !== null ? dollars(only) : null;
}

export const RECOMMENDATION_LABELS: Record<string, string> = { MONITOR: 'Keep an eye on it', REPAIR: 'Repair', REPLACE: 'Replace', FURTHER_EVALUATION: 'Have it evaluated further', SAFETY_IMMEDIATE: 'Act on this right away' };
