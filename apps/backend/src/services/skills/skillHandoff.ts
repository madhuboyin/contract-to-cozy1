import type { AskExecutionStatus } from '../../productFramework/ask/ask.contract';
import type { AskOperationId, AskOperationResult } from '../ask/askOperationRegistry';
import type { SkillConsumer, SkillDefinition } from './skill.contract';
import { deriveSkillHealthForDefinition, type SkillHealthControls } from './skillHealth';
import { getSkillForOperation, resolveEffectiveSkillOperationPolicy, SKILL_DEFINITIONS } from './skillRegistry';

export interface SkillHandoffSuggestion {
  suggestedNextSkillId: string;
  suggestedGoal: string;
  /** Display-only button text nominated by the handler; the message sent on click stays the routable goal prompt. */
  suggestedLabel: string | null;
  reasonCodes: readonly string[];
  contextReferenceIds: readonly string[];
  continuity: SkillHandoffContinuity;
}

/**
 * A handler's own decision about what should follow the result it just produced (FRD v1.166,
 * handoff audit scope 3). It can only select a transition already allowlisted in
 * SKILL_HANDOFF_DEFINITIONS -- the registry stays the governance boundary, the handler supplies
 * the per-result relevance the static table cannot know.
 */
export interface AskFollowUpNomination {
  goal: string;
  reasonCodes?: readonly string[];
  label?: string;
}

export const FOLLOW_UP_LABEL_MAX_LENGTH = 80;

export interface SkillHandoffContinuity {
  propertyId: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourceHomeActionId: string | null;
  decisionThreadId: string | null;
  workItemId: string | null;
  journeyId: string | null;
  contextVersion: string | null;
  returnDestination: string | null;
}

export interface SkillHandoffRelevanceInput {
  result: AskOperationResult;
  parameters: Readonly<Record<string, unknown>>;
}

export interface SkillHandoffDefinition {
  sourceOperationId: AskOperationId;
  targetSkillId: string;
  targetOperationId: AskOperationId;
  suggestedGoal: string;
  eligibleStatuses: readonly AskExecutionStatus[];
  reasonCodes: readonly string[];
  contextReferenceIds: readonly string[];
  /**
   * Optional per-result relevance gate. The static table can only key on source operation and
   * status; this lets a definition decline results where its follow-up would not fit (e.g. a
   * dismissal creates no work to review).
   */
  isRelevant?: (input: SkillHandoffRelevanceInput) => boolean;
}

// These are transitions Ask may offer, not executable Skill dependencies.
// Ask remains the only component allowed to route a follow-up request.
export const SKILL_HANDOFF_DEFINITIONS: readonly SkillHandoffDefinition[] = Object.freeze([
  Object.freeze({
    sourceOperationId: 'PROPERTY_SUMMARY',
    targetSkillId: 'maintenance',
    targetOperationId: 'MAINTENANCE_STATUS',
    suggestedGoal: 'understand-maintenance-status',
    eligibleStatuses: Object.freeze(['ANSWERED', 'READY_WITH_LIMITATIONS'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['HOME_RECORD_REVIEWED'] as string[]),
    contextReferenceIds: Object.freeze([] as string[]),
  }),
  Object.freeze({
    sourceOperationId: 'BUYER_PLAN_STATUS',
    targetSkillId: 'property-record',
    targetOperationId: 'PROPERTY_SUMMARY',
    suggestedGoal: 'summarize-property-record',
    eligibleStatuses: Object.freeze(['ANSWERED', 'READY_WITH_LIMITATIONS'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['VERIFY_RECORDED_HOME_CONTEXT'] as string[]),
    contextReferenceIds: Object.freeze([] as string[]),
  }),
  Object.freeze({
    sourceOperationId: 'HOME_ACTIONS',
    targetSkillId: 'maintenance',
    targetOperationId: 'MAINTENANCE_STATUS',
    suggestedGoal: 'understand-maintenance-status',
    eligibleStatuses: Object.freeze(['ANSWERED', 'READY_WITH_LIMITATIONS'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['HOME_ACTION_REVIEWED'] as string[]),
    contextReferenceIds: Object.freeze([] as string[]),
  }),
  Object.freeze({
    sourceOperationId: 'INCIDENT_CLAIM_STATUS',
    targetSkillId: 'coverage',
    targetOperationId: 'COVERAGE_GAPS',
    suggestedGoal: 'review-coverage-gaps',
    eligibleStatuses: Object.freeze(['ANSWERED', 'READY_WITH_LIMITATIONS'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['VERIFY_COVERAGE_AFTER_CLAIM'] as string[]),
    contextReferenceIds: Object.freeze([] as string[]),
  }),
  Object.freeze({
    sourceOperationId: 'CLAIM_FILE', targetSkillId: 'home-operations', targetOperationId: 'HOME_ACTIONS',
    suggestedGoal: 'review-home-actions-feed', eligibleStatuses: Object.freeze(['COMPLETED'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['CLAIM_WORK_CREATED'] as string[]), contextReferenceIds: Object.freeze([] as string[]),
  }),
  Object.freeze({
    sourceOperationId: 'CLAIM_TRANSITION', targetSkillId: 'coverage', targetOperationId: 'COVERAGE_GAPS',
    suggestedGoal: 'review-coverage-gaps', eligibleStatuses: Object.freeze(['COMPLETED'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['VERIFY_COVERAGE_AFTER_CLAIM'] as string[]), contextReferenceIds: Object.freeze([] as string[]),
  }),
  Object.freeze({
    sourceOperationId: 'INSPECTION_FINDING_UPDATE', targetSkillId: 'home-operations', targetOperationId: 'HOME_ACTIONS',
    suggestedGoal: 'review-home-actions-feed', eligibleStatuses: Object.freeze(['COMPLETED'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['INSPECTION_WORK_RECONCILED'] as string[]), contextReferenceIds: Object.freeze([] as string[]),
    // Only accepting a finding creates/reuses Operational Work; dismiss and resolve leave nothing new to review.
    isRelevant: ({ result, parameters }: SkillHandoffRelevanceInput) => result.reasonCode === 'INSPECTION_FINDING_ACCEPTED'
      || (Array.isArray(parameters.inspectionFindingBatch)
        && (parameters.inspectionFindingBatch as Array<{ action?: unknown }>).some((entry) => entry?.action === 'ACCEPT')),
  }),
  Object.freeze({
    sourceOperationId: 'DOCUMENT_PROMOTION_CONFIRM', targetSkillId: 'property-record', targetOperationId: 'PROPERTY_SUMMARY',
    suggestedGoal: 'summarize-property-record', eligibleStatuses: Object.freeze(['COMPLETED'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['DOCUMENT_FACT_PROMOTED'] as string[]), contextReferenceIds: Object.freeze([] as string[]),
    // Only a confirmed promotion changes the property record; a rejection leaves nothing new to summarize.
    isRelevant: ({ result }: SkillHandoffRelevanceInput) => ['DOCUMENT_PROMOTION_CONFIRMED'].includes(String(result.reasonCode)),
  }),
  Object.freeze({
    sourceOperationId: 'BUYER_LIFECYCLE_UPDATE', targetSkillId: 'property-record', targetOperationId: 'PROPERTY_SUMMARY',
    suggestedGoal: 'summarize-property-record', eligibleStatuses: Object.freeze(['COMPLETED'] as AskExecutionStatus[]),
    reasonCodes: Object.freeze(['BUYER_LIFECYCLE_RECORDED'] as string[]), contextReferenceIds: Object.freeze([] as string[]),
    // A resume or date change leaves an active purchase worth re-verifying; pause and cancel do not.
    isRelevant: ({ result }: SkillHandoffRelevanceInput) => ['BUYER_JOURNEY_RESUMED', 'BUYER_LIFECYCLE_DATE_UPDATED'].includes(String(result.reasonCode)),
  }),
]);

const REASON_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,79}$/;
const CONTEXT_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ROLE_RANK = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;

export function validateSkillHandoffDefinitions(
  definitions: readonly SkillHandoffDefinition[] = SKILL_HANDOFF_DEFINITIONS,
  skills: Readonly<Record<string, SkillDefinition>> = SKILL_DEFINITIONS,
): string[] {
  const issues: string[] = [];
  const keys = new Set<string>();
  for (const handoff of definitions) {
    const key = `${handoff.sourceOperationId}:${handoff.targetSkillId}:${handoff.suggestedGoal}`;
    if (keys.has(key)) issues.push(`${key}: duplicate handoff`);
    keys.add(key);
    const source = Object.values(skills).find((skill) => skill.operations.some((operation) => operation.operationId === handoff.sourceOperationId));
    const target = skills[handoff.targetSkillId];
    if (!source) issues.push(`${key}: source operation is not owned by a registered Skill`);
    if (!target) {
      issues.push(`${key}: target Skill is not registered`);
      continue;
    }
    if (source?.id === target.id) issues.push(`${key}: same-Skill handoff is not allowed`);
    if (!target.supportedGoals.includes(handoff.suggestedGoal)) issues.push(`${key}: target goal is not registered`);
    if (!target.operations.some((operation) => operation.operationId === handoff.targetOperationId)) issues.push(`${key}: target operation is not owned by target Skill`);
    if (!target.consumerPolicy.some((policy) => policy.consumer === 'ASK' && policy.operations.includes(handoff.targetOperationId))) issues.push(`${key}: target operation is not eligible for Ask`);
    if (skills === SKILL_DEFINITIONS && source) {
      const sourcePolicy = resolveEffectiveSkillOperationPolicy(source.id, handoff.sourceOperationId, 'ASK');
      const targetPolicy = resolveEffectiveSkillOperationPolicy(target.id, handoff.targetOperationId, 'ASK');
      if (sourcePolicy?.authorizationFloor && targetPolicy?.authorizationFloor
        && ROLE_RANK[targetPolicy.authorizationFloor] > ROLE_RANK[sourcePolicy.authorizationFloor]) {
        issues.push(`${key}: target authorization exceeds the completed source operation`);
      }
    }
    if (!handoff.eligibleStatuses.length) issues.push(`${key}: no eligible result status`);
    if (!handoff.reasonCodes.length || handoff.reasonCodes.length > 8 || handoff.reasonCodes.some((code) => !REASON_CODE_PATTERN.test(code))) issues.push(`${key}: invalid reason codes`);
    if (handoff.contextReferenceIds.length > 8 || handoff.contextReferenceIds.some((reference) => !CONTEXT_REFERENCE_PATTERN.test(reference))) issues.push(`${key}: invalid context reference ids`);
  }
  return issues;
}

/**
 * Checks a handler's nomination against the allowlist and shape limits without needing a result,
 * so a handler test can assert its nominations are ones the resolver will accept.
 */
export function validateFollowUpNomination(
  sourceOperationId: AskOperationId,
  nomination: AskFollowUpNomination,
  definitions: readonly SkillHandoffDefinition[] = SKILL_HANDOFF_DEFINITIONS,
): string[] {
  const issues: string[] = [];
  if (!definitions.some((definition) => definition.sourceOperationId === sourceOperationId && definition.suggestedGoal === nomination.goal)) {
    issues.push(`${sourceOperationId}: follow-up goal "${nomination.goal}" is not allowlisted in SKILL_HANDOFF_DEFINITIONS`);
  }
  if (nomination.reasonCodes && (!nomination.reasonCodes.length || nomination.reasonCodes.length > 8 || nomination.reasonCodes.some((code) => !REASON_CODE_PATTERN.test(code)))) {
    issues.push(`${sourceOperationId}: invalid follow-up reason codes`);
  }
  if (nomination.label !== undefined && (!nomination.label.trim() || nomination.label.length > FOLLOW_UP_LABEL_MAX_LENGTH || /[\r\n]/.test(nomination.label))) {
    issues.push(`${sourceOperationId}: invalid follow-up label`);
  }
  return issues;
}

/**
 * Produces metadata only. It cannot invoke an adapter, operation, or peer Skill.
 * The next user turn must pass through Ask's normal routing and authorization.
 *
 * Three modes, keyed on `result.followUp`:
 *  - undefined: legacy static behaviour -- the first eligible, relevant definition for the source operation.
 *  - null: the handler explicitly declines any follow-up (same effect as suppressSkillHandoff).
 *  - nomination: the handler picked a goal; it must match an allowlisted definition for this source and
 *    still passes every status/policy/health/context check. A nomination that fails any check yields no
 *    handoff -- it never falls back to the static entry, which would reintroduce the irrelevant follow-up.
 */
export function resolveSkillHandoffSuggestion(input: {
  sourceOperationId: AskOperationId;
  result: AskOperationResult;
  consumer?: SkillConsumer;
  controls?: SkillHealthControls;
  availableContextReferenceIds?: readonly string[];
  continuity?: Partial<SkillHandoffContinuity>;
  parameters?: Readonly<Record<string, unknown>>;
  /** Target operations not worth suggesting right now (just answered this session, or already recommended elsewhere in the response). */
  excludeTargetOperationIds?: ReadonlySet<string>;
}): SkillHandoffSuggestion | null {
  if (input.result.suppressSkillHandoff) return null;
  if (input.result.followUp === null) return null;
  if (input.result.confirmation || input.result.clarification || (input.result.captureRequests?.length ?? 0) > 0) return null;
  const source = getSkillForOperation(input.sourceOperationId);
  if (!source) return null;
  const consumer = input.consumer ?? 'ASK';
  const nomination = input.result.followUp;
  if (nomination && validateFollowUpNomination(input.sourceOperationId, nomination).length) return null;
  for (const handoff of SKILL_HANDOFF_DEFINITIONS) {
    if (handoff.sourceOperationId !== input.sourceOperationId || !handoff.eligibleStatuses.includes(input.result.status)) continue;
    if (input.excludeTargetOperationIds?.has(handoff.targetOperationId)) continue;
    if (nomination) {
      if (handoff.suggestedGoal !== nomination.goal) continue;
    } else if (handoff.isRelevant && !handoff.isRelevant({ result: input.result, parameters: input.parameters ?? input.result.parameters ?? {} })) continue;
    const target = SKILL_DEFINITIONS[handoff.targetSkillId as keyof typeof SKILL_DEFINITIONS];
    if (!target || target.id === source.id || !target.supportedGoals.includes(handoff.suggestedGoal)) continue;
    const policy = resolveEffectiveSkillOperationPolicy(target.id, handoff.targetOperationId, consumer);
    if (!policy) continue;
    const health = deriveSkillHealthForDefinition(target, consumer, input.controls);
    const operationHealth = health.operations.find((operation) => operation.operationId === handoff.targetOperationId);
    if (!operationHealth || operationHealth.status === 'UNAVAILABLE') continue;
    const availableReferences = new Set(input.availableContextReferenceIds ?? []);
    if (handoff.contextReferenceIds.some((reference) => !availableReferences.has(reference))) continue;
    return Object.freeze({
      suggestedNextSkillId: target.id,
      suggestedGoal: handoff.suggestedGoal,
      suggestedLabel: nomination?.label?.trim() || null,
      reasonCodes: Object.freeze([...(nomination?.reasonCodes ?? handoff.reasonCodes)]),
      contextReferenceIds: Object.freeze([...handoff.contextReferenceIds]),
      continuity: Object.freeze({
        propertyId: input.continuity?.propertyId ?? null,
        sourceEntityType: input.continuity?.sourceEntityType ?? null,
        sourceEntityId: input.continuity?.sourceEntityId ?? null,
        sourceHomeActionId: input.continuity?.sourceHomeActionId ?? null,
        decisionThreadId: input.continuity?.decisionThreadId ?? null,
        workItemId: input.continuity?.workItemId ?? null,
        journeyId: input.continuity?.journeyId ?? null,
        contextVersion: input.continuity?.contextVersion ?? input.result.contextVersion ?? null,
        returnDestination: input.continuity?.returnDestination ?? null,
      }),
    });
  }
  return null;
}
