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

export type RecordEditorFieldKind = 'TEXT' | 'TEXTAREA' | 'SELECT' | 'DATE' | 'MONEY';

export interface RecordEditorSection {
  readonly id: string;
  readonly title: string;
}

export interface RecordEditorField {
  readonly key: string;
  /** Capitalised label the homeowner sees, e.g. "Policy number". */
  readonly label: string;
  readonly kind: RecordEditorFieldKind;
  readonly section: string;
  readonly required: boolean;
  readonly maxLength?: number;
  readonly options?: readonly CorrectionOption[];
  readonly helpText?: string;
  readonly placeholder?: string;
  /** DATE only: a soft, non-blocking note shown (and repeated in the review) when the date is before today. */
  readonly pastDateNote?: string;
  /** SELECT only: label of an explicit empty option (value ''), e.g. "No room". */
  readonly emptyLabel?: string;
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

/** The value as the editor holds it: trimmed text, money with two decimals, '' when empty. */
export function normalizeEditorValue(field: RecordEditorField, raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const text = String(raw).trim();
  if (!text) return '';
  if (field.kind === 'MONEY' && /^\d{1,8}(?:\.\d{1,2})?$/.test(text)) return Number(text).toFixed(2);
  return text;
}

/** A homeowner-facing reason one value is unusable, or null. Required-ness is checked here too. */
export function editorFieldError(field: RecordEditorField, value: string): string | null {
  if (!value) return field.required ? `${field.label} is required.` : null;
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
    if (field.disabledReason && original && values[field.key] !== (original[field.key] ?? '')) { errors[field.key] = field.disabledReason; continue; }
    const problem = editorFieldError(field, values[field.key]);
    if (problem) errors[field.key] = problem;
  }
  return { values, errors };
}

export function editorValueDisplay(field: RecordEditorField, value: string): string {
  if (!value) return NOT_RECORDED;
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
          : { type: 'SHORT_TEXT' as const, maxLength: field.kind === 'DATE' ? 10 : field.maxLength ?? 160 },
    })),
    groups: descriptor.sections.map((section) => ({ id: section.id, title: section.title, fieldKeys: descriptor.fields.filter((field) => field.section === section.id).map((field) => field.key) })),
  };
}
