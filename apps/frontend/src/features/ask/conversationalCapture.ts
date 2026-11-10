import type { AskCaptureRequest } from './types';
import type { ScalarCaptureInputSchema, StructuredCaptureField } from '@/components/property-context/featureContextTypes';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-004/005 (FRD v1.112): a group of capture fields asked one question at a time.
// Only the presentation and the order of asking change: the same fields are answered, validated and submitted as one request.

// UX-04 (consolidated plan 3A): approximate dates and bounded multi-selects can now be asked one at a time; long text, relational pickers and
// anything sensitive or financial still keep the full form.
const LEGACY_STEPPABLE = new Set<ScalarCaptureInputSchema['type']>(['SINGLE_SELECT', 'BOOLEAN', 'INTEGER', 'DECIMAL', 'SHORT_TEXT', 'TIME']);
const STEPPABLE = new Set<ScalarCaptureInputSchema['type']>([...LEGACY_STEPPABLE, 'APPROXIMATE_DATE', 'MULTI_SELECT']);
const FORM_FIRST_CAPTURE_KEYS: ReadonlySet<string> = new Set(['ROOM_CREATE_INPUTS', 'INVENTORY_ITEM_CREATE_INPUTS']);
/**
 * Captures with a purpose-built layout in CaptureCards keep the original rules (three fields, no date or multi-select steps) until each is
 * reviewed for the stepped flow; the extended limits apply to every other plain workflow group.
 */
const DESIGNED_LAYOUT_CAPTURE_KEYS: ReadonlySet<string> = new Set(['CAPTURE_EVENT_ADD', 'FINANCING_PROFILE_UPDATE', 'HOME_DIGITAL_WILL_EDITOR_INPUTS', 'HOME_DIGITAL_WILL_METADATA_INPUTS', 'INVENTORY_ITEM_COMPLETE_DETAILS', 'INVENTORY_ITEM_CREATE_INPUTS', 'MAINTENANCE_TASK_INPUTS', 'MATERIAL_SPEC_INPUTS', 'OWNERSHIP_COST_SCENARIO_INPUTS', 'PROJECT_TRACKER_COMMAND_INPUTS', 'PROJECT_TRACKER_CREATE_INPUTS', 'REFINANCE_ALERT_SETTINGS_INPUTS', 'REFINANCE_SCENARIO_INPUTS', 'ROOM_PLANT_RECOMMENDATION_INPUTS', 'SERVICE_PRICE_CHECK_INPUTS', 'WORK_ITEM_RESCHEDULE', 'sell-hold-rent-assumptions']);
export const LEGACY_MAX_CONVERSATIONAL_FIELDS = 3;
/** A capture is asked as a conversation only when it is a short set of questions; a longer group stays one form. */
export const MAX_CONVERSATIONAL_FIELDS = 5;
/** A multi-select is asked as toggle chips only while its option list is as short as a quick reply. */
const fieldIsSteppable = (field: StructuredCaptureField, designed: boolean, formFirst: boolean): boolean => {
  const schema = field.inputSchema as ScalarCaptureInputSchema;
  if (formFirst && schema.type === 'LONG_TEXT') return true;
  if (!(formFirst ? STEPPABLE : designed ? LEGACY_STEPPABLE : STEPPABLE).has(schema.type)) return false;
  return schema.type === 'MULTI_SELECT' ? schema.options.length > 0 && schema.options.length <= QUICK_REPLY_LIMIT : true;
};
/** A bounded choice is offered as chips; a longer list uses a picker. */
export const QUICK_REPLY_LIMIT = 8;

/**
 * True when a capture can be asked as a conversation: a plain group of scalar fields for a workflow, holding nothing sensitive,
 * with no relational or date-precision inputs. Anything else keeps the existing form.
 */
export function canAskConversationally(request: Pick<AskCaptureRequest, 'classification' | 'sensitivity' | 'inputSchema' | 'skippable'> & { captureKey?: string }): boolean {
  const schema = request.inputSchema;
  const designed = DESIGNED_LAYOUT_CAPTURE_KEYS.has(request.captureKey ?? '');
  const formFirst = FORM_FIRST_CAPTURE_KEYS.has(request.captureKey ?? '');
  return request.classification === 'WORKFLOW_INPUT'
    && request.sensitivity === 'STANDARD'
    && schema.type === 'GROUP'
    && schema.fields.length > 0
    && schema.fields.length <= (formFirst ? 12 : designed ? LEGACY_MAX_CONVERSATIONAL_FIELDS : MAX_CONVERSATIONAL_FIELDS)
    && schema.fields.every((field) => fieldIsSteppable(field, designed, formFirst));
}

export function isFieldActive(field: StructuredCaptureField, values: Record<string, unknown>): boolean {
  if (!field.when) return true;
  const actual = values[field.when.fieldKey];
  return field.when.operator === 'EQUALS' ? actual === field.when.value : actual !== field.when.value;
}

export function hasAnswer(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  // An approximate date is answered once it has a value for its precision, or says outright that it is not known.
  if (typeof value === 'object') {
    const date = value as { precision?: unknown; value?: unknown; rangeEnd?: unknown };
    if (date.precision === 'UNKNOWN') return true;
    if (date.precision === 'RANGE') return Boolean(date.value) && Boolean(date.rangeEnd);
    return Boolean(date.value);
  }
  return true;
}

const PRECISION_WORDS: Record<string, string> = { EXACT_DATE: '', MONTH: '', YEAR: '', RANGE: '', UNKNOWN: 'Not sure' };
const monthYear = (iso: string) => new Date(`${iso}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** A read-back of an approximate-date answer that never claims more precision than was given. */
export function approximateDateLabel(value: { precision?: string; value?: string; rangeEnd?: string }): string {
  if (value.precision === 'UNKNOWN') return PRECISION_WORDS.UNKNOWN;
  if (value.precision === 'YEAR') return String(value.value ?? '');
  if (value.precision === 'MONTH' && value.value) return monthYear(value.value);
  if (value.precision === 'RANGE') return `${value.value ?? ''} to ${value.rangeEnd ?? ''}`;
  return String(value.value ?? '');
}

export interface DateShortcut { id: string; label: string; value: { precision: 'YEAR' | 'RANGE' | 'UNKNOWN'; value?: string; rangeEnd?: string } }

/**
 * Bounded date shortcuts, offered only when the field's own schema permits the precision they produce. "This year" and the "years ago" range are
 * approximations and are stored as exactly that (a year, or a range), never as an invented exact date; a future date is never produced.
 */
export function dateShortcuts(schema: { allowedPrecisions?: string[]; allowFuture?: boolean }, allowNotSure: boolean, now: Date = new Date()): DateShortcut[] {
  const allowed = (precision: string) => !schema.allowedPrecisions || schema.allowedPrecisions.includes(precision);
  const year = now.getFullYear();
  const shortcuts: DateShortcut[] = [];
  if (allowed('YEAR')) shortcuts.push({ id: 'this-year', label: 'This year', value: { precision: 'YEAR', value: String(year) } });
  if (allowed('RANGE')) shortcuts.push({ id: 'years-3-5', label: '3–5 years ago', value: { precision: 'RANGE', value: `${year - 5}-01-01`, rangeEnd: `${year - 3}-12-31` } });
  if (allowNotSure && allowed('UNKNOWN')) shortcuts.push({ id: 'not-sure', label: 'Not sure', value: { precision: 'UNKNOWN' } });
  return shortcuts;
}

/** The question Cozy asks for a step: the field's own prompt, else the request's question for the first step, else the label. */
export function stepQuestion(field: StructuredCaptureField, index: number, requestQuestion: string): string {
  return field.prompt?.trim() || (index === 0 ? requestQuestion : field.label);
}

/** A short read-back of an answer for the "so far" line. */
export function answerLabel(field: StructuredCaptureField, value: unknown): string | null {
  if (!hasAnswer(value)) return null;
  const schema = field.inputSchema;
  if (schema.type === 'SINGLE_SELECT') return schema.options.find((option) => option.value === value)?.label ?? String(value);
  if (schema.type === 'BOOLEAN') return value === true ? schema.trueLabel : schema.falseLabel;
  if (schema.type === 'DECIMAL' || schema.type === 'INTEGER') {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return String(value);
    return schema.unit === 'USD' ? `$${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `${number}${schema.unit ? ` ${schema.unit}` : ''}`;
  }
  if (schema.type === 'MULTI_SELECT' && Array.isArray(value)) return value.map((item) => schema.options.find((option) => option.value === item)?.label ?? String(item)).join(', ');
  if (schema.type === 'APPROXIMATE_DATE' && typeof value === 'object') return approximateDateLabel(value as { precision?: string; value?: string; rangeEnd?: string });
  return String(value);
}

/**
 * The step to show: the first active field that is still unanswered and was not skipped, unless the homeowner went back to change
 * one. Returns null when every active field is answered or skipped, meaning the group is ready to submit.
 */
export function nextStepIndex(fields: StructuredCaptureField[], values: Record<string, unknown>, skipped: ReadonlySet<string>, editing: string | null): number | null {
  if (editing) {
    const at = fields.findIndex((field) => field.key === editing);
    if (at >= 0) return at;
  }
  const at = fields.findIndex((field) => !hasAnswer(values[field.key]) && !skipped.has(field.key));
  return at >= 0 ? at : null;
}
