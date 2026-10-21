// Shared RecordEditor contract (FRD v1.385).
//
// One schema-driven way to edit several fields of one record at once in Ask. The DOMAIN supplies the field definitions,
// the current canonical values, cross-field validation, the patch it will write and its own authorization. This
// contract owns the parts every record shares: normalising a submitted value, working out which fields actually changed
// (so the review shows only those, before -> after) and the descriptor the shared UI renders from. The UI owns dirty
// state, error display, focus and the Save/Cancel affordances; it never decides what is valid.
//
// Every value is a string. An empty string means "no value" -- the editor can clear an optional field, and a field the
// homeowner did not touch is simply absent from the changes.
import { correctionDisplay, isValidCorrectionDate, MAX_CORRECTION_MONEY_DOLLARS, type CorrectionOption } from '../askCorrectionFields';

// APPROX_DATE (FRD v1.394) is a date with the precision the person actually knows. Its string is `EXACT_DATE|2026-08-15`, `MONTH|2026-08`,
// `YEAR|2026` or `RANGE|2026-08-01|2026-08-15`; an unanswered one is ''.
export type RecordEditorFieldKind = 'TEXT' | 'TEXTAREA' | 'SELECT' | 'DATE' | 'MONEY' | 'APPROX_DATE';

export interface RecordEditorSection {
  readonly id: string;
  readonly title: string;
  /** Shown collapsed behind its title until opened (optional details); never used for a section holding a required field. */
  readonly collapsed?: boolean;
}

/** A field is shown, and read, only while another field holds one of these values (server-owned, e.g. an amount only for a purchase). */
export interface RecordEditorVisibility {
  readonly field: string;
  readonly in: string[];
}

export interface RecordEditorField {
  readonly key: string;
  /** Capitalised label the homeowner sees, e.g. "Policy number". */
  readonly label: string;
  /** A short noun for sentences such as "Add the title and date to continue" when the label is a question. */
  readonly shortLabel?: string;
  readonly kind: RecordEditorFieldKind;
  readonly section: string;
  readonly required: boolean;
  readonly maxLength?: number;
  readonly options?: readonly CorrectionOption[];
  readonly helpText?: string;
  readonly placeholder?: string;
  /** TEXT only: render the native control best suited to contact data without changing the stored string shape. */
  readonly inputType?: 'email' | 'tel';
  /** DATE only: a soft, non-blocking note shown (and repeated in the review) when the date is before today. */
  readonly pastDateNote?: string;
  /** SELECT only: label of an explicit empty option (value ''), e.g. "No room". */
  readonly emptyLabel?: string;
  /** The field appears only once another field has one of these values; while hidden its value is read as empty. */
  readonly visibleWhen?: RecordEditorVisibility;
  /** The field is shown but cannot be changed; the reason is printed under it and a submitted change is refused. */
  readonly disabledReason?: string;
}

/** What the shared UI renders from. `original` and `version` come from the freshly read canonical record. */
export interface RecordEditorDescriptor {
  readonly recordLabel: string;
  readonly sections: readonly RecordEditorSection[];
  readonly fields: readonly RecordEditorField[];
  readonly original: Readonly<Record<string, string>>;
  readonly version: string;
}

export interface RecordEditorChange {
  readonly key: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

export type RecordEditorErrors = Record<string, string>;

const NOT_RECORDED = 'Not recorded';

const isoDay = (value: string): boolean => isValidCorrectionDate(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** [precision, value, rangeEnd?] of an APPROX_DATE string; missing parts are ''. */
export function approxDateParts(text: string): [string, string, string] {
  const [precision = '', value = '', end = ''] = text.split('|');
  return [precision, value.trim(), end.trim()];
}

export function approxDateError(text: string): string | null {
  const [precision, value, end] = approxDateParts(text);
  if (precision === 'EXACT_DATE') return isoDay(value) ? null : 'Enter a valid date.';
  if (precision === 'MONTH') return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? null : 'Enter a valid month.';
  if (precision === 'YEAR') return /^\d{4}$/.test(value) ? null : 'Enter a valid year.';
  if (precision === 'RANGE') return !isoDay(value) || !isoDay(end) ? 'Enter both dates of the range.' : end < value ? 'The end date must be on or after the start date.' : null;
  return 'Choose how exactly you know when it happened.';
}

export function approxDateDisplay(text: string): string {
  const [precision, value, end] = approxDateParts(text);
  return precision === 'RANGE' ? `${value} to ${end}` : value || NOT_RECORDED;
}

/** The value as the editor holds it: trimmed text, money with two decimals, '' when empty. */
export function normalizeEditorValue(field: RecordEditorField, raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const text = String(raw).trim();
  if (!text) return '';
  if (field.kind === 'APPROX_DATE') return approxDateParts(text).filter(Boolean).length >= 2 ? text : '';
  if (field.kind === 'MONEY' && /^\d{1,8}(?:\.\d{1,2})?$/.test(text)) return Number(text).toFixed(2);
  return text;
}

/** A homeowner-facing reason one value is unusable, or null. Required-ness is checked here too. */
export function editorFieldError(field: RecordEditorField, value: string): string | null {
  if (!value) return field.required ? `${field.label} is required.` : null;
  if (field.kind === 'APPROX_DATE') return approxDateError(value);
  if (field.kind === 'DATE') return isValidCorrectionDate(value) ? null : 'Enter a valid date.';
  if (field.kind === 'SELECT') return (field.options ?? []).some((option) => option.value === value) ? null : `Choose one of the listed ${field.label.toLowerCase()} options.`;
  if (field.kind === 'MONEY') {
    if (!/^\d{1,8}(?:\.\d{2})$/.test(value)) return 'Enter an amount in dollars, such as 850 or 850.50.';
    return Number(value) > MAX_CORRECTION_MONEY_DOLLARS ? 'Enter an amount of $10,000,000 or less.' : null;
  }
  return field.maxLength !== undefined && value.length > field.maxLength ? `Use at most ${field.maxLength} characters.` : null;
}

/**
 * Normalises a submitted answer against the field list. Unknown keys are rejected (the editor is not a request body),
 * and every defined field must be present so a half-submitted form cannot silently blank the rest of the record.
 */
export function readEditorAnswer(fields: readonly RecordEditorField[], answer: unknown, original?: Readonly<Record<string, string>>): { values: Record<string, string>; errors: RecordEditorErrors } {
  const source = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer as Record<string, unknown> : {};
  const known = new Set(fields.map((field) => field.key));
  const errors: RecordEditorErrors = {};
  for (const key of Object.keys(source)) if (!known.has(key)) errors[key] = 'This field cannot be edited here.';
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (!(field.key in source)) { errors[field.key] = 'This field is missing from the form.'; continue; }
    values[field.key] = normalizeEditorValue(field, source[field.key]);
    // A hidden field is not part of this record's form for the chosen value, so whatever it held is read as empty.
    if (field.visibleWhen && !field.visibleWhen.in.includes(values[field.visibleWhen.field] ?? '')) { values[field.key] = ''; continue; }
    if (field.disabledReason && original && values[field.key] !== (original[field.key] ?? '')) { errors[field.key] = field.disabledReason; continue; }
    const problem = editorFieldError(field, values[field.key]);
    if (problem) errors[field.key] = problem;
  }
  return { values, errors };
}

export function editorValueDisplay(field: RecordEditorField, value: string): string {
  if (!value) return field.kind === 'SELECT' && field.emptyLabel ? field.emptyLabel : NOT_RECORDED;
  if (field.kind === 'APPROX_DATE') return approxDateDisplay(value);
  if (field.kind === 'MONEY' || field.kind === 'SELECT') return correctionDisplay({ label: field.label, kind: field.kind, options: field.options }, value);
  return value;
}

/** Only the fields whose value differs from the freshly read original, in field order. */
export function diffEditorValues(fields: readonly RecordEditorField[], original: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>): RecordEditorChange[] {
  return fields.flatMap((field) => {
    const before = original[field.key] ?? '';
    const after = next[field.key] ?? '';
    return before === after ? [] : [{ key: field.key, label: field.label, before: editorValueDisplay(field, before), after: editorValueDisplay(field, after) }];
  });
}

/** The capture-request inputSchema equivalent, so a client that does not know the editor still gets an honest GROUP form. */
export function editorToGroupSchema(descriptor: Pick<RecordEditorDescriptor, 'fields' | 'sections'>) {
  return {
    type: 'GROUP' as const,
    fields: descriptor.fields.map((field) => ({
      key: field.key, label: field.label, required: field.required, ...(field.helpText ? { helpText: field.helpText } : {}),
      inputSchema: field.kind === 'SELECT' ? { type: 'SINGLE_SELECT' as const, options: (field.options ?? []).map((option) => ({ label: option.label, value: option.value })) }
        : field.kind === 'TEXTAREA' ? { type: 'LONG_TEXT' as const, maxLength: field.maxLength ?? 2000 }
          : { type: 'SHORT_TEXT' as const, maxLength: field.kind === 'DATE' ? 10 : field.kind === 'APPROX_DATE' ? 40 : field.maxLength ?? 160 },
    })),
    groups: descriptor.sections.map((section) => ({ id: section.id, title: section.title, fieldKeys: descriptor.fields.filter((field) => field.section === section.id).map((field) => field.key) })),
  };
}
