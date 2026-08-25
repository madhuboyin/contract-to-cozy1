import type { AskExecutionStatus } from '../../productFramework/ask/ask.contract';
import type { AskOperationId, AskOperationResult } from '../ask/askOperationRegistry';
import type { SkillConsumer, SkillDefinition } from './skill.contract';
import { deriveSkillHealthForDefinition, type SkillHealthControls } from './skillHealth';
import { getSkillForOperation, resolveEffectiveSkillOperationPolicy, SKILL_DEFINITIONS } from './skillRegistry';

export interface SkillHandoffSuggestion {
  suggestedNextSkillId: string;
  suggestedGoal: string;
  reasonCodes: readonly string[];
  contextReferenceIds: readonly string[];
}

export interface SkillHandoffDefinition {
  sourceOperationId: AskOperationId;
  targetSkillId: string;
  targetOperationId: AskOperationId;
  suggestedGoal: string;
  eligibleStatuses: readonly AskExecutionStatus[];
  reasonCodes: readonly string[];
  contextReferenceIds: readonly string[];
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
 * Produces metadata only. It cannot invoke an adapter, operation, or peer Skill.
 * The next user turn must pass through Ask's normal routing and authorization.
 */
export function resolveSkillHandoffSuggestion(input: {
  sourceOperationId: AskOperationId;
  result: AskOperationResult;
  consumer?: SkillConsumer;
  controls?: SkillHealthControls;
  availableContextReferenceIds?: readonly string[];
}): SkillHandoffSuggestion | null {
  if (input.result.confirmation || input.result.clarification || (input.result.captureRequests?.length ?? 0) > 0) return null;
  const source = getSkillForOperation(input.sourceOperationId);
  if (!source) return null;
  const consumer = input.consumer ?? 'ASK';
  for (const handoff of SKILL_HANDOFF_DEFINITIONS) {
    if (handoff.sourceOperationId !== input.sourceOperationId || !handoff.eligibleStatuses.includes(input.result.status)) continue;
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
      reasonCodes: Object.freeze([...handoff.reasonCodes]),
      contextReferenceIds: Object.freeze([...handoff.contextReferenceIds]),
    });
  }
  return null;
}
