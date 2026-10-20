// Warranty domain definition for the shared RecordEditor (FRD v1.385): the fields, the canonical values read from a row,
// the cross-field rule, and the patch written on confirm. Authorization (owner-only) and freshness stay in the handlers.
import { WarrantyCategory } from '@prisma/client';
import { correctionDateString, correctionMoneyFromDollars } from '../askCorrectionFields';
import { diffEditorValues, readEditorAnswer, type RecordEditorDescriptor, type RecordEditorErrors, type RecordEditorField } from '../recordEditor/recordEditor.contract';
import { warrantyContextVersion } from '../suggestedActions/domainVersions';

const CATEGORY_LABELS: Record<WarrantyCategory, string> = {
  APPLIANCE: 'Appliance', HVAC: 'HVAC', ROOFING: 'Roofing', PLUMBING: 'Plumbing', ELECTRICAL: 'Electrical',
  STRUCTURAL: 'Structural', HOME_WARRANTY_PLAN: 'Home warranty plan', OTHER: 'Other',
};

export const WARRANTY_CATEGORY_OPTIONS = (Object.values(WarrantyCategory) as WarrantyCategory[]).map((value) => ({ label: CATEGORY_LABELS[value], value }));

export const WARRANTY_EDITOR_SECTIONS = [
  { id: 'warranty', title: 'Warranty' },
  { id: 'coverage', title: 'Coverage' },
  { id: 'dates-cost', title: 'Dates and cost' },
] as const;

export const WARRANTY_EDITOR_FIELDS: readonly RecordEditorField[] = [
  { key: 'providerName', label: 'Provider', kind: 'TEXT', section: 'warranty', required: true, maxLength: 120 },
  { key: 'category', label: 'Coverage type', kind: 'SELECT', section: 'warranty', required: true, options: WARRANTY_CATEGORY_OPTIONS },
  { key: 'policyNumber', label: 'Policy number', kind: 'TEXT', section: 'coverage', required: false, maxLength: 160 },
  { key: 'coverageDetails', label: 'Coverage details', kind: 'TEXTAREA', section: 'coverage', required: false, maxLength: 2000, helpText: 'What is and is not covered, claim limits, deductibles.' },
  { key: 'startDate', label: 'Start date', kind: 'DATE', section: 'dates-cost', required: true },
  { key: 'expiryDate', label: 'Expiration date', kind: 'DATE', section: 'dates-cost', required: true, pastDateNote: 'This date has already passed, so the warranty will show as expired.' },
  { key: 'cost', label: 'Cost (USD)', kind: 'MONEY', section: 'dates-cost', required: false, helpText: 'Optional. What you paid for the warranty.' },
];

export interface WarrantyEditorRow {
  id: string;
  providerName: string;
  category: WarrantyCategory;
  policyNumber: string | null;
  coverageDetails: string | null;
  startDate: Date;
  expiryDate: Date;
  cost: unknown;
  updatedAt: Date;
}

export const warrantyEditorValues = (row: WarrantyEditorRow): Record<string, string> => ({
  providerName: row.providerName,
  category: row.category,
  policyNumber: row.policyNumber ?? '',
  coverageDetails: row.coverageDetails ?? '',
  startDate: correctionDateString(row.startDate) ?? '',
  expiryDate: correctionDateString(row.expiryDate) ?? '',
  cost: correctionMoneyFromDollars(row.cost) ?? '',
});

export const warrantyEditorDescriptor = (row: WarrantyEditorRow): RecordEditorDescriptor => ({
  recordLabel: `${row.providerName} warranty`,
  sections: WARRANTY_EDITOR_SECTIONS,
  fields: WARRANTY_EDITOR_FIELDS,
  original: warrantyEditorValues(row),
  version: warrantyContextVersion(row),
});

/** Field validation plus the one cross-field rule (the start date must be before the expiry date). */
export function validateWarrantyEditorAnswer(answer: unknown): { values: Record<string, string>; errors: RecordEditorErrors } {
  const { values, errors } = readEditorAnswer(WARRANTY_EDITOR_FIELDS, answer);
  if (!errors.startDate && !errors.expiryDate && values.startDate && values.expiryDate && values.expiryDate <= values.startDate) {
    errors.expiryDate = 'The expiration date must be after the start date.';
  }
  return { values, errors };
}

export const warrantyEditorChanges = (original: Record<string, string>, values: Record<string, string>) => diffEditorValues(WARRANTY_EDITOR_FIELDS, original, values);

/** Soft, non-blocking notes shown on the review: an expiry date that is already past is allowed. */
export function warrantyEditorNotes(values: Record<string, string>, today: Date): string[] {
  return values.expiryDate && values.expiryDate < today.toISOString().slice(0, 10)
    ? [WARRANTY_EDITOR_FIELDS.find((field) => field.key === 'expiryDate')!.pastDateNote!]
    : [];
}

/** The narrowed scalar patch for ONLY the changed keys; never a request body. */
export function warrantyEditorPatch(changedKeys: readonly string[], values: Record<string, string>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of changedKeys) {
    const value = values[key];
    if (key === 'startDate' || key === 'expiryDate') patch[key] = new Date(`${value}T00:00:00Z`);
    else if (key === 'cost') patch[key] = value ? Number(value) : null;
    else if (key === 'policyNumber' || key === 'coverageDetails') patch[key] = value || null;
    else patch[key] = value;
  }
  return patch;
}
