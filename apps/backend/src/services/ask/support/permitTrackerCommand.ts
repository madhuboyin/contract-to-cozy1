// Adding, changing and removing a permit record inside Ask (register P0 "Permits", slice PM-B; FRD v1.315). Pure: the declared messages and action
// ids, the form's fields and validation, the field-by-field changes, and the inputs the canonical permit service takes.
//
// Declared-action only. What a homeowner can say about a permit is the REPORTED status (the household's or contractor's word); the OFFICIAL status is the
// authority's and is recorded only with evidence, which is a separate step and is not offered here. A permit imported from open data can have only its
// reported status and notes changed, as the service enforces, so the change form shows only those.
import { z } from 'zod';

export const PERMIT_PROPERTY_ENTITY_TYPE = 'PERMIT_TRACKER_PROPERTY';
export const PERMIT_ENTITY_TYPE = 'PERMIT_RECORD';
export const PERMIT_COMMAND_MESSAGES = {
  ADD: 'Add a permit to the permit tracker.',
  EDIT: 'Change the details of this permit.',
  REMOVE: 'Remove this permit from the permit tracker.',
} as const;
export type PermitCommandKind = keyof typeof PERMIT_COMMAND_MESSAGES;
export const PERMIT_COMMAND_ACTION_IDS = { ADD: 'permit-tracker-add', EDIT: 'permit-tracker-edit', REMOVE: 'permit-tracker-remove' } as const;
export const permitCommandKindFromMessage = (message: string): PermitCommandKind | null =>
  ((Object.entries(PERMIT_COMMAND_MESSAGES) as Array<[PermitCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const permitCommandTargetsProperty = (kind: PermitCommandKind) => kind === 'ADD';

export const PERMIT_FORM_CAPTURE_KEYS = { ADD: 'PERMIT_TRACKER_ADD', EDIT: 'PERMIT_TRACKER_EDIT' } as const;
export type PermitFormKind = keyof typeof PERMIT_FORM_CAPTURE_KEYS;
export const permitFormKindFromCaptureKey = (key: string): PermitFormKind | null =>
  ((Object.entries(PERMIT_FORM_CAPTURE_KEYS) as Array<[PermitFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const PERMIT_CATEGORIES = ['BUILDING', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'STRUCTURAL', 'ROOFING', 'ZONING', 'DEMOLITION', 'GRADING', 'FIRE', 'OTHER'] as const;
export const PERMIT_WORK_TYPES = [
  'HVAC_NEW', 'HVAC_REPLACEMENT', 'ELECTRICAL_PANEL', 'ELECTRICAL_WIRING', 'PLUMBING_NEW', 'PLUMBING_REPAIR', 'ROOF_REPLACEMENT', 'ROOF_REPAIR', 'ROOM_ADDITION',
  'GARAGE_CONVERSION', 'ADU', 'BASEMENT_FINISH', 'DECK_PATIO', 'FENCE', 'SWIMMING_POOL', 'SOLAR', 'WINDOWS_DOORS', 'FIREPLACE', 'SEWER_WATER_LINE', 'STRUCTURAL_REPAIR',
  'INTERIOR_REMODEL', 'EXTERIOR_REMODEL', 'DEMOLITION', 'GRADING_DRAINAGE', 'OTHER',
] as const;
export const PERMIT_WORK_TYPE_OPTION_LABELS: Record<string, string> = {
  HVAC_NEW: 'New heating or cooling system', HVAC_REPLACEMENT: 'Heating or cooling replacement', ELECTRICAL_PANEL: 'Electrical panel', ELECTRICAL_WIRING: 'Electrical wiring',
  PLUMBING_NEW: 'New plumbing', PLUMBING_REPAIR: 'Plumbing repair', ROOF_REPLACEMENT: 'Roof replacement', ROOF_REPAIR: 'Roof repair', ROOM_ADDITION: 'Room addition',
  GARAGE_CONVERSION: 'Garage conversion', ADU: 'Accessory dwelling unit', BASEMENT_FINISH: 'Basement finishing', DECK_PATIO: 'Deck or patio', FENCE: 'Fence',
  SWIMMING_POOL: 'Swimming pool', SOLAR: 'Solar', WINDOWS_DOORS: 'Windows or doors', FIREPLACE: 'Fireplace', SEWER_WATER_LINE: 'Sewer or water line',
  STRUCTURAL_REPAIR: 'Structural repair', INTERIOR_REMODEL: 'Interior remodel', EXTERIOR_REMODEL: 'Exterior remodel', DEMOLITION: 'Demolition',
  GRADING_DRAINAGE: 'Grading or drainage', OTHER: 'Something else',
};
export const PERMIT_REPORTED_STATUSES = [
  'DRAFT', 'PREPARING_APPLICATION', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'ISSUED_REPORTED', 'INSPECTIONS_IN_PROGRESS',
  'CLOSEOUT_REQUESTED', 'COMPLETED_REPORTED', 'EXPIRED_REPORTED', 'WITHDRAWN',
] as const;

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const optionalDate = z.preprocess(blank, exactDate.nullable()).optional();

export const PermitAddInputSchema = z.object({
  category: z.enum(PERMIT_CATEGORIES),
  workType: z.enum(PERMIT_WORK_TYPES),
  permitNumber: text(120),
  description: text(1000),
  reportedStatus: z.preprocess(blank, z.enum(PERMIT_REPORTED_STATUSES).nullable()).optional(),
  contractorName: text(200),
  applicationDate: optionalDate,
  issueDate: optionalDate,
  expirationDate: optionalDate,
  estimatedCost: z.preprocess(blank, z.coerce.number().nonnegative().max(100_000_000).nullable()).optional(),
  notes: text(2000),
}).strict();

export interface PermitFormInput {
  category: (typeof PERMIT_CATEGORIES)[number]; workType: (typeof PERMIT_WORK_TYPES)[number]; permitNumber: string | null; description: string | null;
  reportedStatus: (typeof PERMIT_REPORTED_STATUSES)[number]; contractorName: string | null; applicationDate: string | null; issueDate: string | null;
  expirationDate: string | null; estimatedCostCents: number | null; notes: string | null;
}

/** Validates a submitted form (or a stored confirmation parameter). Dates must be in order: applied, issued, expires. */
export function parsePermitFormAnswer(answer: unknown): { success: true; data: PermitFormInput } | { success: false; reason: 'INVALID' | 'DATES' } {
  const parsed = PermitAddInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const v = parsed.data;
  const dates = { applicationDate: (v.applicationDate ?? null) as string | null, issueDate: (v.issueDate ?? null) as string | null, expirationDate: (v.expirationDate ?? null) as string | null };
  const ordered = [dates.applicationDate, dates.issueDate, dates.expirationDate].filter((d): d is string => Boolean(d));
  for (let i = 1; i < ordered.length; i += 1) if (ordered[i] < ordered[i - 1]) return { success: false, reason: 'DATES' };
  const cost = (v.estimatedCost ?? null) as number | null;
  return {
    success: true,
    data: {
      category: v.category, workType: v.workType, permitNumber: (v.permitNumber ?? null) as string | null, description: (v.description ?? null) as string | null,
      reportedStatus: (v.reportedStatus ?? 'DRAFT') as PermitFormInput['reportedStatus'], contractorName: (v.contractorName ?? null) as string | null,
      ...dates, estimatedCostCents: cost === null ? null : Math.round(cost * 100), notes: (v.notes ?? null) as string | null,
    },
  };
}

const noon = (date: string) => `${date}T12:00:00.000Z`;
/** What the canonical createManualPermit takes. */
export function permitCreateBody(input: PermitFormInput) {
  return {
    category: input.category, workTypes: [input.workType], reportedStatus: input.reportedStatus,
    ...(input.permitNumber ? { permitNumber: input.permitNumber } : {}), ...(input.description ? { description: input.description } : {}),
    ...(input.contractorName ? { contractorName: input.contractorName } : {}),
    ...(input.applicationDate ? { applicationDate: noon(input.applicationDate) } : {}), ...(input.issueDate ? { issueDate: noon(input.issueDate) } : {}),
    ...(input.expirationDate ? { expirationDate: noon(input.expirationDate) } : {}),
    ...(input.estimatedCostCents !== null ? { estimatedCostCents: input.estimatedCostCents } : {}), ...(input.notes ? { notes: input.notes } : {}),
    documentIds: [] as string[],
  };
}

export interface PermitCurrentValues {
  category: string; workType: string | null; permitNumber: string | null; description: string | null; reportedStatus: string; contractorName: string | null;
  applicationDate: string | null; issueDate: string | null; expirationDate: string | null; estimatedCostCents: number | null; notes: string | null;
}
const FIELD_LABELS: Record<keyof PermitCurrentValues, string> = {
  category: 'Category', workType: 'Work', permitNumber: 'Permit number', description: 'Description', reportedStatus: 'Reported status', contractorName: 'Contractor',
  applicationDate: 'Applied', issueDate: 'Issued', expirationDate: 'Expires', estimatedCostCents: 'Estimated cost', notes: 'Notes',
};
/** Fields an API-sourced (open data) permit may change; the service ignores the rest. */
export const PERMIT_API_SOURCED_FIELDS: ReadonlyArray<keyof PermitCurrentValues> = ['reportedStatus', 'notes'];
export interface PermitChange { field: keyof PermitCurrentValues; label: string; before: string | null; after: string | null }

/** Field-by-field changes against what is recorded. A blank leaves a field as it is (the canonical update cannot clear a date), so only set values count. */
export function permitEditChanges(current: PermitCurrentValues, next: PermitFormInput, apiSourced: boolean): PermitChange[] {
  const proposed: PermitCurrentValues = {
    category: next.category, workType: next.workType, permitNumber: next.permitNumber, description: next.description, reportedStatus: next.reportedStatus,
    contractorName: next.contractorName, applicationDate: next.applicationDate, issueDate: next.issueDate, expirationDate: next.expirationDate,
    estimatedCostCents: next.estimatedCostCents, notes: next.notes,
  };
  const out: PermitChange[] = [];
  for (const field of Object.keys(FIELD_LABELS) as Array<keyof PermitCurrentValues>) {
    if (apiSourced && !PERMIT_API_SOURCED_FIELDS.includes(field)) continue;
    const after = proposed[field];
    if (after === null || after === undefined) continue; // blank = unchanged
    const before = current[field] ?? null;
    if (before !== after) out.push({ field, label: FIELD_LABELS[field], before: before === null ? null : String(before), after: String(after) });
  }
  return out;
}

/** The partial update the canonical updatePermit takes, from the changes. */
export function permitUpdateBody(changes: readonly PermitChange[], next: PermitFormInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const change of changes) {
    if (change.field === 'workType') body.workTypes = [next.workType];
    else if (change.field === 'estimatedCostCents') body.estimatedCostCents = next.estimatedCostCents;
    else if (change.field === 'applicationDate' || change.field === 'issueDate' || change.field === 'expirationDate') body[change.field] = noon(String(change.after));
    else body[change.field] = change.after;
  }
  return body;
}
