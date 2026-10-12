// Starting a renovation case inside Ask (register section 3, "Start a renovation case"). Pure: the form's fields, their validation, the input the
// canonical createRenovationCase takes, and the detection of a typed "start a renovation case". The handler, the capture path and the routing registry
// share it.
//
// Parity reading (checked against the traditional tool, 2026-10-12): the page reaches a renovation case through an exploration (goals, spaces, budget,
// timing, then "create plan" from an option) or a retroactive review of a timeline event. The canonical create the exploration itself calls,
// createRenovationCase, also accepts a direct start (name, type, objective, responsibility, spaces, budget, target dates) and is idempotency-keyed with a
// contributor floor, so Ask starts through that same create. Exploration (option generation) is a separate, larger slice and is not duplicated here.
//
// The governance tier is not asked: the exploration's own conversion defaults it to LOW_CONSEQUENCE and so does this. Historical research cases come from
// the retroactive review, so that case type is not offered.
import { z } from 'zod';

export const RENOVATION_CASE_START_MESSAGE = 'Start a renovation case.';
export const RENOVATION_CASE_START_CAPTURE_KEY = 'RENOVATION_CASE_START_INPUTS';
/** The "Start a renovation case" action on the readiness answer's empty state. */
export const RENOVATION_CASE_START_ACTION_ID = 'renovation-case-start';
/** Where an Ask-started case's provenance points (the canonical create stores these as entryPoint / sourceType). */
export const RENOVATION_CASE_ENTRY_POINT = 'ASK_COZY';
export const RENOVATION_CASE_SOURCE_TYPE = 'ASK_EXECUTION';

export const RENOVATION_CASE_TYPES = ['REMODEL', 'ADDITION', 'CONVERSION', 'REPAIR', 'REPLACEMENT', 'ENERGY_UPGRADE', 'ACCESSIBILITY', 'LANDSCAPING', 'OTHER'] as const;
export const RENOVATION_CASE_TYPE_LABELS: Record<string, string> = {
  REMODEL: 'Remodel', ADDITION: 'Addition', CONVERSION: 'Conversion', REPAIR: 'Repair', REPLACEMENT: 'Replacement',
  ENERGY_UPGRADE: 'Energy upgrade', ACCESSIBILITY: 'Accessibility', LANDSCAPING: 'Landscaping', OTHER: 'Something else',
};
export const RENOVATION_RESPONSIBILITIES = ['UNKNOWN', 'HOMEOWNER', 'ASSOCIATION', 'SHARED', 'LANDLORD', 'OTHER'] as const;
export const RENOVATION_RESPONSIBILITY_LABELS: Record<string, string> = {
  UNKNOWN: 'Not sure', HOMEOWNER: 'I am responsible', ASSOCIATION: 'My HOA or association', SHARED: 'Shared', LANDLORD: 'My landlord', OTHER: 'Someone else',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);

export const RenovationCaseStartInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  caseType: z.enum(RENOVATION_CASE_TYPES),
  objective: z.preprocess(blank, z.string().trim().max(1000).nullable()).optional(),
  responsibilityContext: z.preprocess(blank, z.enum(RENOVATION_RESPONSIBILITIES).nullable()).optional(),
  spaces: z.preprocess(blank, z.string().trim().max(400).nullable()).optional(),
  targetBudget: z.preprocess(blank, z.coerce.number().positive().max(100_000_000).nullable()).optional(),
  targetStartDate: z.preprocess(blank, exactDate.nullable()).optional(),
  targetEndDate: z.preprocess(blank, exactDate.nullable()).optional(),
}).strict();

export interface RenovationCaseStartInput {
  name: string;
  caseType: (typeof RENOVATION_CASE_TYPES)[number];
  objective: string | null;
  responsibilityContext: (typeof RENOVATION_RESPONSIBILITIES)[number];
  spacesAffected: string[];
  targetBudgetDollars: number | null;
  targetStartDate: string | null;
  targetEndDate: string | null;
}

/** Validates a submitted form (or a stored confirmation parameter). "End before start" is a validation failure, as the canonical schema has it. */
export function parseRenovationCaseStartAnswer(answer: unknown): { success: true; data: RenovationCaseStartInput } | { success: false; reason: 'INVALID' | 'DATES' } {
  const parsed = RenovationCaseStartInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const value = parsed.data;
  const start = (value.targetStartDate ?? null) as string | null;
  const end = (value.targetEndDate ?? null) as string | null;
  if (start && end && end < start) return { success: false, reason: 'DATES' };
  const spacesAffected = String(value.spaces ?? '').split(',').map((part) => part.trim()).filter(Boolean).slice(0, 20).map((part) => part.slice(0, 160));
  return {
    success: true,
    data: {
      name: value.name, caseType: value.caseType,
      objective: (value.objective ?? null) as string | null,
      responsibilityContext: (value.responsibilityContext ?? 'UNKNOWN') as RenovationCaseStartInput['responsibilityContext'],
      spacesAffected,
      targetBudgetDollars: (value.targetBudget ?? null) as number | null,
      targetStartDate: start, targetEndDate: end,
    },
  };
}

/** What the canonical createRenovationCase takes. Cents, and the provenance of an Ask start; the idempotency key is added by the caller. */
export function renovationCaseCreatePayload(input: RenovationCaseStartInput, idempotencyKey: string, sourceId: string) {
  return {
    name: input.name,
    ...(input.objective ? { objective: input.objective } : {}),
    caseType: input.caseType,
    governanceTier: 'LOW_CONSEQUENCE' as const,
    responsibilityContext: input.responsibilityContext,
    spacesAffected: input.spacesAffected,
    systemsAffected: [] as string[],
    ...(input.targetBudgetDollars !== null ? { targetBudgetCents: Math.round(input.targetBudgetDollars * 100) } : {}),
    ...(input.targetStartDate ? { targetStartDate: input.targetStartDate } : {}),
    ...(input.targetEndDate ? { targetEndDate: input.targetEndDate } : {}),
    entryPoint: RENOVATION_CASE_ENTRY_POINT,
    sourceType: RENOVATION_CASE_SOURCE_TYPE,
    sourceId,
    idempotencyKey,
  };
}

// "start a renovation case", "create a new renovation plan", "set up a renovation case". Narrow on purpose: "start a renovation project" belongs to the
// Project Tracker, and "can I start my renovation" is the readiness question, which has its own route.
const startPattern = /\b(?:start|begin|create|open|set up|make)\b.{0,30}\brenovation (?:case|plan)\b|\bnew renovation (?:case|plan)\b/i;
export const isRenovationCaseStartRequest = (message: string): boolean => startPattern.test(message);
