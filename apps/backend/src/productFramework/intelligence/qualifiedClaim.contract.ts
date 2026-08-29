import { z } from 'zod';

export const QUALIFIED_CLAIM_PROPOSITION_TYPES = [
  'HVAC_REPAIR_REPLACE_VERDICT',
  'REFINANCE_OPPORTUNITY_VERDICT',
  'HOME_CAPITAL_TIMELINE_WINDOW_VERDICT',
  'OWNERSHIP_COST_CHANGE_VERDICT',
  'SAVINGS_BENEFIT_MATCH_VERDICT',
  'COVERAGE_QUESTION_VERDICT',
  'SELL_HOLD_RENT_VERDICT',
  // C2C Intelligence & Agentic Evolution Phase 4A: non-HVAC repair/replace
  // (APPLIANCE_REPAIR_REPLACE decision family). Distinct from
  // HVAC_REPAIR_REPLACE_VERDICT — the two families are never compared.
  'APPLIANCE_REPAIR_REPLACE_VERDICT',
] as const;

export const QualifiedClaimPropositionTypeSchema = z.enum(QUALIFIED_CLAIM_PROPOSITION_TYPES);
export type QualifiedClaimPropositionType = z.infer<typeof QualifiedClaimPropositionTypeSchema>;

export const QualifiedClaimSchema = z.object({
  claimKey: z.object({
    propertyId: z.string().trim().min(1),
    entityRef: z.string().trim().min(1).nullable(),
    propositionType: QualifiedClaimPropositionTypeSchema,
    assessmentHorizonVersion: z.string().trim().min(1).max(160),
  }).strict(),
  verdict: z.string().trim().min(1).max(160),
}).strict();

export type QualifiedClaim = z.infer<typeof QualifiedClaimSchema>;
