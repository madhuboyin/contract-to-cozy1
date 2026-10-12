// Starting a Negotiation Shield review inside Ask (ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md, slice 2a). Pure: scenario field specs, the validation of
// a submitted form, the structured data the canonical case input stores, and the detection of a typed "start a negotiation review". The handler, the
// capture path and the routing registry share it, so there is one definition of what each scenario asks for.
//
// The fields are exactly the ones the page's own scenario forms build (NegotiationShieldToolClient build*Payload) and the rules engines read
// (the Normalized*Context types), so a review started here is analysed the same way. Four scenarios only (owner decision D3): the buyer inspection
// scenario starts from selected findings (2d). No free-text "paste the quote" field (D4): `notes` is bounded.
import { z } from 'zod';

export const NEGOTIATION_SHIELD_START_MESSAGE = 'Start a negotiation review.';
export const NEGOTIATION_SHIELD_START_CAPTURE_KEY = 'NEGOTIATION_SHIELD_START_INPUTS';
/** The "Start a review" action on the list and the empty state. */
export const NEGOTIATION_SHIELD_START_ACTION_ID = 'negotiation-shield-start';
/** The scenario choice rows launch with this entity type; the row id is the scenario. */
export const NEGOTIATION_SHIELD_SCENARIO_ENTITY = 'NEGOTIATION_SHIELD_SCENARIO';
export const NEGOTIATION_SHIELD_SCENARIO_ACTION_ID = 'negotiation-shield-choose-scenario';
export const NEGOTIATION_SHIELD_CASE_ENTITY_TYPE = 'NEGOTIATION_SHIELD_CASE';

export const NEGOTIATION_START_SCENARIOS = [
  'CONTRACTOR_QUOTE_REVIEW',
  'INSURANCE_PREMIUM_INCREASE',
  'INSURANCE_CLAIM_SETTLEMENT',
  'CONTRACTOR_URGENCY_PRESSURE',
] as const;
export type NegotiationStartScenario = (typeof NEGOTIATION_START_SCENARIOS)[number];
export const isNegotiationStartScenario = (value: unknown): value is NegotiationStartScenario =>
  typeof value === 'string' && (NEGOTIATION_START_SCENARIOS as readonly string[]).includes(value);

export type NegotiationFieldKind = 'TEXT' | 'MONEY' | 'DATE' | 'YES_NO' | 'NOTES';
export interface NegotiationFieldSpec { key: string; label: string; kind: NegotiationFieldKind; max?: number; help?: string; allowFuture?: boolean }
export interface NegotiationScenarioSpec {
  label: string;
  /** The case input type the canonical service and the rules engine read. */
  inputType: 'CONTRACTOR_QUOTE' | 'INSURANCE_PREMIUM' | 'INSURANCE_CLAIM_SETTLEMENT' | 'CONTRACTOR_URGENCY';
  summary: string;
  question: string;
  fields: NegotiationFieldSpec[];
}

const NOTES: NegotiationFieldSpec = { key: 'notes', label: 'Notes', kind: 'NOTES', max: 1000, help: 'Anything else worth knowing. Please leave out account numbers and personal details.' };

export const NEGOTIATION_START_SCENARIO_SPECS: Record<NegotiationStartScenario, NegotiationScenarioSpec> = {
  CONTRACTOR_QUOTE_REVIEW: {
    label: 'Contractor quote review', inputType: 'CONTRACTOR_QUOTE',
    summary: 'Check a contractor quote before you accept it and prepare questions to ask.',
    question: 'What does the quote say?',
    fields: [
      { key: 'contractorName', label: 'Contractor', kind: 'TEXT', max: 120 },
      { key: 'quoteAmount', label: 'Quoted amount ($)', kind: 'MONEY' },
      { key: 'quoteDate', label: 'Quote date', kind: 'DATE' },
      { key: 'serviceCategory', label: 'What work is it for?', kind: 'TEXT', max: 120, help: 'For example: roof replacement' },
      { key: 'urgencyClaimed', label: 'Did they say it has to be done urgently?', kind: 'YES_NO' },
      NOTES,
    ],
  },
  INSURANCE_PREMIUM_INCREASE: {
    label: 'Insurance premium increase', inputType: 'INSURANCE_PREMIUM',
    summary: 'Look at a renewal increase and prepare what to ask your insurer.',
    question: 'What did the renewal notice say?',
    fields: [
      { key: 'insurerName', label: 'Insurer', kind: 'TEXT', max: 120 },
      { key: 'priorPremium', label: 'Previous premium ($)', kind: 'MONEY' },
      { key: 'newPremium', label: 'New premium ($)', kind: 'MONEY' },
      { key: 'renewalDate', label: 'Renewal date', kind: 'DATE', allowFuture: true },
      { key: 'reasonProvided', label: 'Reason they gave', kind: 'TEXT', max: 300 },
      NOTES,
    ],
  },
  INSURANCE_CLAIM_SETTLEMENT: {
    label: 'Insurance claim settlement', inputType: 'INSURANCE_CLAIM_SETTLEMENT',
    summary: 'Compare a settlement with your estimate and prepare your response.',
    question: 'What was the settlement?',
    fields: [
      { key: 'insurerName', label: 'Insurer', kind: 'TEXT', max: 120 },
      { key: 'claimType', label: 'Type of claim', kind: 'TEXT', max: 120, help: 'For example: water damage' },
      { key: 'settlementAmount', label: 'Settlement offered ($)', kind: 'MONEY' },
      { key: 'estimateAmount', label: 'Your repair estimate ($)', kind: 'MONEY' },
      { key: 'claimDate', label: 'Claim date', kind: 'DATE' },
      { key: 'reasonProvided', label: 'Reason they gave', kind: 'TEXT', max: 300 },
      NOTES,
    ],
  },
  CONTRACTOR_URGENCY_PRESSURE: {
    label: 'Contractor urgency pressure', inputType: 'CONTRACTOR_URGENCY',
    summary: 'Test a "do it now" recommendation and prepare questions before you decide.',
    question: 'What did the contractor recommend?',
    fields: [
      { key: 'contractorName', label: 'Contractor', kind: 'TEXT', max: 120 },
      { key: 'recommendedWork', label: 'What they recommended', kind: 'TEXT', max: 200 },
      { key: 'quoteAmount', label: 'Quoted amount ($)', kind: 'MONEY' },
      { key: 'urgencyClaimed', label: 'Did they say it is urgent?', kind: 'YES_NO' },
      { key: 'sameDayPressure', label: 'Did they want an answer the same day?', kind: 'YES_NO' },
      { key: 'repairOptionMentioned', label: 'Did they mention a repair as an option?', kind: 'YES_NO' },
      NOTES,
    ],
  },
};

const MAX_MONEY = 100_000_000;
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);

export function negotiationFieldSchema(field: NegotiationFieldSpec): z.ZodTypeAny {
  switch (field.kind) {
    case 'MONEY':
      return z.preprocess(blank, z.coerce.number().positive().max(MAX_MONEY).nullable()).optional();
    case 'DATE':
      return z.preprocess(blank, exactDate.nullable()).optional();
    case 'YES_NO':
      return z.preprocess(blank, z.enum(['yes', 'no', 'unknown']).nullable()).optional();
    case 'NOTES':
    case 'TEXT':
    default:
      return z.preprocess(blank, z.string().trim().max(field.max ?? 200).nullable()).optional();
  }
}

export function negotiationStartAnswerSchema(scenario: NegotiationStartScenario) {
  const shape: Record<string, z.ZodTypeAny> = { title: z.string().trim().min(1).max(160) };
  for (const field of NEGOTIATION_START_SCENARIO_SPECS[scenario].fields) shape[field.key] = negotiationFieldSchema(field);
  return z.object(shape).strict();
}

export interface NegotiationStartInput {
  scenarioType: NegotiationStartScenario;
  title: string;
  inputType: NegotiationScenarioSpec['inputType'];
  structuredData: Record<string, unknown>;
}

/** Validates a submitted form (or a stored confirmation parameter) and returns the title and the structured input the canonical case stores. */
export function parseNegotiationStartAnswer(scenario: NegotiationStartScenario, answer: unknown):
  | { success: true; data: NegotiationStartInput }
  | { success: false; reason: 'INVALID' | 'NO_DETAIL' } {
  const parsed = negotiationStartAnswerSchema(scenario).safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const { title, ...rest } = parsed.data as Record<string, unknown> & { title: string };
  const structuredData: Record<string, unknown> = {};
  for (const field of NEGOTIATION_START_SCENARIO_SPECS[scenario].fields) {
    const value = rest[field.key];
    if (value === null || value === undefined) continue;
    if (field.kind === 'YES_NO') {
      if (value === 'yes') structuredData[field.key] = true;
      else if (value === 'no') structuredData[field.key] = false;
      continue;
    }
    if (typeof value === 'string' && !value.trim()) continue;
    structuredData[field.key] = typeof value === 'string' ? value.trim() : value;
  }
  // A review with nothing to analyse would only report what is missing, so ask for at least one detail.
  if (Object.keys(structuredData).length === 0) return { success: false, reason: 'NO_DETAIL' };
  return { success: true, data: { scenarioType: scenario, title, inputType: NEGOTIATION_START_SCENARIO_SPECS[scenario].inputType, structuredData } };
}

/** The scenario a typed request names, or null when it names none or more than one kind (the person then chooses). */
export function inferNegotiationStartScenario(message: string): NegotiationStartScenario | null {
  const text = message.toLowerCase();
  if (/\b(?:urgen\w*|pressure\w*|same[- ]day|act now|rush\w*|right now)\b/.test(text)) return 'CONTRACTOR_URGENCY_PRESSURE';
  if (/\b(?:claim|settlement)\b/.test(text)) return 'INSURANCE_CLAIM_SETTLEMENT';
  if (/\b(?:premium|renewal|insurance (?:rate|increase|bill))\b/.test(text)) return 'INSURANCE_PREMIUM_INCREASE';
  if (/\b(?:contractor|quote|estimate|bid)\b/.test(text)) return 'CONTRACTOR_QUOTE_REVIEW';
  return null;
}

// "start a negotiation review", "create a new negotiation shield case for my roof quote". Naming the tool with a start verb used to be kept off the
// case list (so a request to start was not answered with the list); this is where it goes instead.
const startPattern = /\b(?:start|begin|create|open|set up|make)\b.{0,40}\bnegotiation (?:shield )?(?:reviews?|cases?)\b|\b(?:start|begin|create|set up)\b.{0,30}\bnegotiation shield\b|\bnew negotiation (?:shield )?(?:reviews?|cases?)\b/i;
export const isNegotiationShieldStartRequest = (message: string): boolean => startPattern.test(message);
