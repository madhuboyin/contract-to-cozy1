// Converts an already-governed Skill handoff into a ledger-backed Suggested Next Action. The handoff resolver
// has already applied definition, policy, health, history and context checks; this adapter never infers a target
// from the label or message.
import type { AskOperationId, AskOperationResult } from '../askOperationRegistry';
import { SKILL_HANDOFF_DEFINITIONS } from '../../skills/skillHandoff';
import {
  DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, SuggestedNextActionCandidateSchema,
  type SuggestedNextActionCandidate,
} from './suggestedNextActionCandidate';

export const SKILL_HANDOFF_PRODUCER_ID = 'handoff.skill';

const OUTCOME_BY_TARGET: Readonly<Record<string, string>> = {
  MAINTENANCE_STATUS: 'HANDOFF_REVIEW_MAINTENANCE',
  PROPERTY_SUMMARY: 'HANDOFF_REVIEW_PROPERTY',
  COVERAGE_GAPS: 'HANDOFF_REVIEW_COVERAGE',
  HOME_ACTIONS: 'HANDOFF_REVIEW_HOME_ACTIONS',
};

const promptForGoal = (goal: string) => goal.replace(/[-_]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());

export function skillHandoffCandidates(input: {
  result: AskOperationResult;
  sourceOperationId: string | null;
  propertyId: string | null;
}): SuggestedNextActionCandidate[] {
  const handoff = input.result.skillHandoff;
  if (!handoff || !input.sourceOperationId) return [];
  const definition = SKILL_HANDOFF_DEFINITIONS.find((item) => item.sourceOperationId === input.sourceOperationId
    && item.targetSkillId === handoff.suggestedNextSkillId && item.suggestedGoal === handoff.suggestedGoal);
  if (!definition) return [];
  const outcomeKey = OUTCOME_BY_TARGET[definition.targetOperationId];
  if (!outcomeKey) return [];
  const message = promptForGoal(handoff.suggestedGoal);
  return [SuggestedNextActionCandidateSchema.parse({
    source: 'SKILL_HANDOFF',
    sourceOperationId: input.sourceOperationId,
    label: handoff.suggestedLabel?.trim() || message,
    message,
    operationId: definition.targetOperationId as AskOperationId,
    interactionType: 'CONVERSATION_CONTINUE',
    outcomeKey,
    entityContext: {
      propertyId: handoff.continuity.propertyId ?? input.propertyId,
      // These handoffs target property-scoped reads. Source-entity continuity is not target identity and must
      // not be presented to entity validation as though the target operation owned that record.
      entityType: null,
      entityId: null,
      contextVersion: handoff.continuity.contextVersion,
    },
    tier: 'RELATED',
    slotClass: 'GOVERNED_CAPABILITY',
    requiredFacts: [],
    reasonCodes: [...handoff.reasonCodes],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, sourceConfidence: 1 },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  })];
}
