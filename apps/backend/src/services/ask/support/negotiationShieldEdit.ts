// Editing a Negotiation Shield review's saved details inside Ask (ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md, slice 2c). Pure: the edit form's answer
// validation and the diff between what is saved and what was submitted. Shares the scenario field specs with starting a review, so one definition of what
// each scenario asks for serves both.
//
// Only the specs' own keys are ever read back or written by the form. Anything else the saved input holds (a field only the page builds, or any
// other key) is carried through untouched by the canonical merge, and raw text is never loaded or sent.
import { z } from 'zod';
import {
  NEGOTIATION_START_SCENARIO_SPECS, negotiationFieldSchema, type NegotiationFieldSpec, type NegotiationStartScenario,
} from './negotiationShieldStart';

export const NEGOTIATION_SHIELD_EDIT_MESSAGE = 'Edit the details of this negotiation review.';
export const NEGOTIATION_SHIELD_EDIT_CAPTURE_KEY = 'NEGOTIATION_SHIELD_EDIT_INPUTS';
/** The "Edit details" / "Add details" action on a review. */
export const NEGOTIATION_SHIELD_EDIT_ACTION_ID = 'negotiation-shield-edit';

export type NegotiationEditValue = string | number | boolean;
export type NegotiationEditValues = Record<string, NegotiationEditValue | null>;

export function negotiationEditAnswerSchema(scenario: NegotiationStartScenario) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of NEGOTIATION_START_SCENARIO_SPECS[scenario].fields) shape[field.key] = negotiationFieldSchema(field);
  return z.object(shape).strict();
}

/**
 * Validates a submitted edit form (or a stored confirmation parameter) into the value of every spec field, null meaning "no value". "Not sure" and a blank
 * both mean no value; yes and no become booleans, as the page stores them.
 */
export function parseNegotiationEditAnswer(scenario: NegotiationStartScenario, answer: unknown): { success: true; values: NegotiationEditValues } | { success: false } {
  const parsed = negotiationEditAnswerSchema(scenario).safeParse(answer);
  if (!parsed.success) return { success: false };
  const data = parsed.data as Record<string, unknown>;
  const values: NegotiationEditValues = {};
  for (const field of NEGOTIATION_START_SCENARIO_SPECS[scenario].fields) {
    const value = data[field.key];
    if (value === undefined || value === null) { values[field.key] = null; continue; }
    if (field.kind === 'YES_NO') { values[field.key] = value === 'yes' ? true : value === 'no' ? false : null; continue; }
    if (typeof value === 'string') { const trimmed = value.trim(); values[field.key] = trimmed ? trimmed : null; continue; }
    values[field.key] = value as NegotiationEditValue;
  }
  return { success: true, values };
}

export interface NegotiationEditChange { field: NegotiationFieldSpec; before: NegotiationEditValue | null; after: NegotiationEditValue | null }

/** What would change if `submitted` replaced `current` for the spec's fields. `set` and `remove` are exactly what the canonical merge applies. */
export function diffNegotiationEdit(scenario: NegotiationStartScenario, current: Record<string, unknown>, submitted: NegotiationEditValues):
  { set: Record<string, NegotiationEditValue>; remove: string[]; changes: NegotiationEditChange[] } {
  const set: Record<string, NegotiationEditValue> = {};
  const remove: string[] = [];
  const changes: NegotiationEditChange[] = [];
  for (const field of NEGOTIATION_START_SCENARIO_SPECS[scenario].fields) {
    const before = current[field.key] === undefined ? null : (current[field.key] as NegotiationEditValue | null);
    const after = submitted[field.key] === undefined ? null : submitted[field.key];
    if (before === after) continue;
    changes.push({ field, before, after });
    if (after === null) remove.push(field.key); else set[field.key] = after;
  }
  return { set, remove, changes };
}
