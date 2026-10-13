// Coverage Intelligence inside Ask (register P0 "Coverage Intelligence"; FRD v1.317): the policy review read, starting a comparison, and recording the
// keep / change / shop / defer decision. Pure: messages, action ids, the decision form and its validation.
//
// Owner-only, as coverage comparison and review are: both services authorize the home's primary owner, so Ask discloses that instead of offering a form
// it would refuse. A decision to CHANGE needs the option chosen, and, unless that option is equivalent, the reason the tradeoff is accepted, exactly as the
// canonical service requires. Adding a quote or another policy term to compare needs document evidence and is a separate slice.
import { z } from 'zod';

export const COVERAGE_PROPERTY_ENTITY_TYPE = 'COVERAGE_PROPERTY';
export const COVERAGE_COMPARISON_ENTITY_TYPE = 'COVERAGE_COMPARISON';
export const COVERAGE_COMMAND_MESSAGES = {
  START: 'Start a coverage comparison against my verified policy.',
  REVIEW: 'Review my coverage with the confirmed policy facts.',
  DECIDE: 'Record my coverage decision.',
} as const;
export type CoverageCommandKind = keyof typeof COVERAGE_COMMAND_MESSAGES;
export const COVERAGE_COMMAND_ACTION_IDS = { START: 'coverage-start-comparison', REVIEW: 'coverage-generate-review', DECIDE: 'coverage-record-decision' } as const;
export const coverageCommandKindFromMessage = (message: string): CoverageCommandKind | null =>
  ((Object.entries(COVERAGE_COMMAND_MESSAGES) as Array<[CoverageCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const coverageCommandTargetsProperty = (kind: CoverageCommandKind) => kind === 'START' || kind === 'REVIEW';
export const COVERAGE_DECISION_CAPTURE_KEY = 'COVERAGE_DECISION';

export const COVERAGE_DECISIONS = ['KEEP', 'CHANGE', 'SHOP', 'DEFER', 'PROFESSIONAL_REVIEW'] as const;
export const COVERAGE_DECISION_OPTION_LABELS: Record<string, string> = {
  KEEP: 'Keep my current policy', CHANGE: 'Switch to one of the compared options', SHOP: 'Keep shopping', DEFER: 'Decide later', PROFESSIONAL_REVIEW: 'Ask a licensed professional to review',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
export const CoverageDecisionInputSchema = z.object({
  decision: z.enum(COVERAGE_DECISIONS),
  selectedOptionId: z.preprocess(blank, z.string().uuid().nullable()).optional(),
  rationale: z.preprocess(blank, z.string().trim().max(2000).nullable()).optional(),
}).strict();
export interface CoverageDecisionInput { decision: (typeof COVERAGE_DECISIONS)[number]; selectedOptionId: string | null; rationale: string | null }

/** Validates a submitted form (or a stored confirmation parameter). The option and tradeoff rules are the canonical service's, checked again there. */
export function parseCoverageDecisionAnswer(answer: unknown): { success: true; data: CoverageDecisionInput } | { success: false; reason: 'INVALID' | 'OPTION_REQUIRED' } {
  const parsed = CoverageDecisionInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const selectedOptionId = (parsed.data.selectedOptionId ?? null) as string | null;
  if (parsed.data.decision === 'CHANGE' && !selectedOptionId) return { success: false, reason: 'OPTION_REQUIRED' };
  return { success: true, data: { decision: parsed.data.decision, selectedOptionId, rationale: (parsed.data.rationale ?? null) as string | null } };
}
