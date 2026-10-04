// Plan §5: an internal candidate is the target action contract plus the evaluation inputs. Producers nominate candidates;
// they never declare final visibility, state, score, id, or expiry. Those are decided by the pipeline and materialized here.
import { z } from 'zod';
import {
  SUGGESTED_NEXT_ACTION_INTERACTION_TYPES, SUGGESTED_NEXT_ACTION_SOURCES, SUGGESTED_NEXT_ACTION_TIERS,
  type SuggestedNextAction,
} from '../../../productFramework/ask/ask.contract';
import { OUTCOME_TTL_OVERRIDES_MS, TIER_BASE_SCORE, SCORE_WEIGHTS } from './suggestedNextActionRegistry';
import { SUGGESTED_NEXT_ACTION_DEFAULT_TTL_MS } from './suggestedNextAction.contract';
import { deriveSuggestedNextActionId, type SuggestedNextActionIdentityFields } from './suggestedNextActionIdentity';

const TOKEN = /^[A-Z][A-Z0-9_]{2,79}$/;

export const SuggestedNextActionCandidateSchema = z.object({
  producerId: z.string().regex(/^[a-z][a-z0-9.-]{2,79}$/),
  source: z.enum(SUGGESTED_NEXT_ACTION_SOURCES),
  sourceOperationId: z.string().trim().min(1).max(120).nullable(),
  label: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(300),
  operationId: z.string().trim().min(1).max(120),
  interactionType: z.enum(SUGGESTED_NEXT_ACTION_INTERACTION_TYPES),
  outcomeKey: z.string().regex(TOKEN),
  entityContext: z.object({
    propertyId: z.string().trim().min(1).max(160).nullable(),
    entityType: z.string().trim().min(1).max(120).nullable(),
    entityId: z.string().trim().min(1).max(160).nullable(),
    contextVersion: z.string().trim().min(1).max(160).nullable(),
  }),
  tier: z.enum(SUGGESTED_NEXT_ACTION_TIERS),
  /** Missing fact keys the action needs; each must resolve through the registered fact -> capture -> operation mapping. */
  requiredFacts: z.array(z.string().regex(TOKEN)).max(8),
  reasonCodes: z.array(z.string().regex(TOKEN)).max(8),
  signals: z.object({
    exactEntityMatch: z.boolean(),
    currentResultOwnership: z.boolean(),
    activeGoalMatch: z.boolean(),
    materiality: z.number().int().min(0).max(3),
    sourceConfidence: z.number().min(0).max(1),
  }),
  traits: z.object({
    /** Retry/correct/safe-read/property-select/cancel-recovery/new-question: the only kinds allowed in SAFE_RECOVERY_ONLY. */
    recovery: z.boolean(),
    /** Discovery/promotional content: excluded under emergency/restricted boundaries and recovery mode. */
    promotional: z.boolean(),
    /** Explicitly continues (or safely cancels) the active clarification/capture/confirmation. */
    continuesPending: z.boolean(),
  }),
}).strict();

export type SuggestedNextActionCandidate = z.infer<typeof SuggestedNextActionCandidateSchema>;

export const DEFAULT_CANDIDATE_SIGNALS: SuggestedNextActionCandidate['signals'] = {
  exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0.5,
};
export const DEFAULT_CANDIDATE_TRAITS: SuggestedNextActionCandidate['traits'] = { recovery: false, promotional: false, continuesPending: false };

export function candidateIdentityFields(candidate: SuggestedNextActionCandidate): SuggestedNextActionIdentityFields {
  return {
    operationId: candidate.operationId, interactionType: candidate.interactionType, propertyId: candidate.entityContext.propertyId,
    entityType: candidate.entityContext.entityType, entityId: candidate.entityContext.entityId, outcomeKey: candidate.outcomeKey,
  };
}

/** TTL: the outcome override, else the interaction-type default; always capped at the source execution expiry (plan §4). */
export function suggestedActionExpiry(
  candidate: Pick<SuggestedNextActionCandidate, 'operationId' | 'outcomeKey' | 'interactionType'>,
  createdAt: Date,
  executionExpiresAt: Date | null,
): Date {
  const ttl = OUTCOME_TTL_OVERRIDES_MS[`${candidate.operationId}:${candidate.outcomeKey}`] ?? SUGGESTED_NEXT_ACTION_DEFAULT_TTL_MS[candidate.interactionType];
  const expiry = createdAt.getTime() + ttl;
  return new Date(executionExpiresAt ? Math.min(expiry, executionExpiresAt.getTime()) : expiry);
}

export interface MaterializeInput {
  candidate: SuggestedNextActionCandidate;
  sourceExecutionId: string;
  eligibility: SuggestedNextAction['eligibility'];
  score: number;
  /** Provenance reason codes merged from suppressed duplicates (non-sensitive tokens only). */
  mergedReasonCodes?: readonly string[];
  now: Date;
  executionExpiresAt: Date | null;
}

export function materializeSuggestedNextAction(input: MaterializeInput): SuggestedNextAction {
  const { candidate } = input;
  const reasonCodes = [...new Set([...candidate.reasonCodes, ...(input.mergedReasonCodes ?? [])])].slice(0, 8);
  return {
    id: deriveSuggestedNextActionId(input.sourceExecutionId, candidateIdentityFields(candidate)),
    outcomeKey: candidate.outcomeKey,
    label: candidate.label,
    message: candidate.message,
    operationId: candidate.operationId,
    interactionType: candidate.interactionType,
    entityContext: { ...candidate.entityContext },
    eligibility: input.eligibility,
    provenance: { source: candidate.source, sourceOperationId: candidate.sourceOperationId, sourceExecutionId: input.sourceExecutionId, reasonCodes },
    createdAt: input.now.toISOString(),
    expiresAt: suggestedActionExpiry(candidate, input.now, input.executionExpiresAt).toISOString(),
    priority: { tier: candidate.tier, score: input.score },
  };
}

export { TIER_BASE_SCORE, SCORE_WEIGHTS };
