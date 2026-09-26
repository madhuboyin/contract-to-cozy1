import type { AskCaptureRequest } from './types';
import type { ScalarCaptureInputSchema, StructuredCaptureField } from '@/components/property-context/featureContextTypes';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-004/005 (FRD v1.112): a group of capture fields asked one question at a time.
// Only the presentation and the order of asking change: the same fields are answered, validated and submitted as one request.

const STEPPABLE = new Set<ScalarCaptureInputSchema['type']>(['SINGLE_SELECT', 'BOOLEAN', 'INTEGER', 'DECIMAL', 'SHORT_TEXT', 'TIME']);
/** A capture is asked as a conversation only when it is a short set of questions; a longer group stays one form. */
export const MAX_CONVERSATIONAL_FIELDS = 3;
/** A bounded choice is offered as chips; a longer list uses a picker. */
export const QUICK_REPLY_LIMIT = 8;

/**
 * True when a capture can be asked as a conversation: a plain group of scalar fields for a workflow, holding nothing sensitive,
 * with no relational or date-precision inputs. Anything else keeps the existing form.
 */
export function canAskConversationally(request: Pick<AskCaptureRequest, 'classification' | 'sensitivity' | 'inputSchema' | 'skippable'>): boolean {
  const schema = request.inputSchema;
  return request.classification === 'WORKFLOW_INPUT'
    && request.sensitivity === 'STANDARD'
    && schema.type === 'GROUP'
    && schema.fields.length > 0
    && schema.fields.length <= MAX_CONVERSATIONAL_FIELDS
    && schema.fields.every((field) => STEPPABLE.has(field.inputSchema.type as ScalarCaptureInputSchema['type']));
}

export function isFieldActive(field: StructuredCaptureField, values: Record<string, unknown>): boolean {
  if (!field.when) return true;
  const actual = values[field.when.fieldKey];
  return field.when.operator === 'EQUALS' ? actual === field.when.value : actual !== field.when.value;
}

export function hasAnswer(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
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
