import { createHash } from 'node:crypto';
import { ASK_OPERATION_DEFINITIONS, resolveAskOperation, type AskOperationId } from '../askOperationRegistry';

export type FastPathStatus = 'UNCERTIFIED' | 'CERTIFIED' | 'DEMOTED';
export interface FastPathEvidence {
  readonly sealedFamilies: number; readonly incorrectHighConfidence: number; readonly incorrectUpperBound: number;
  readonly adjacentNegativeRows: number; readonly crossOperationRows: number;
  readonly adjacentNegativesPassed: boolean; readonly crossOperationNegativesPassed: boolean;
  readonly perRuleFailures: number; readonly leaveOneRuleOutPassed: boolean;
  readonly tuningSetId: string; readonly sealedSetId: string; readonly certifiedAt: string;
}
export interface FastPathRule {
  readonly id: string; readonly version: string; readonly operationId: AskOperationId;
  readonly description: string; readonly status: FastPathStatus; readonly evidence?: FastPathEvidence;
}

// A rule group is one declared operation. Its version hashes the complete
// resolver, so changing any pattern or guard invalidates every group. This is
// conservative, but it cannot hide a changed member in a pooled certificate.
const resolverHash = createHash('sha256').update(resolveAskOperation.toString()).digest('hex').slice(0, 16);
const ruleId = (operationId: AskOperationId) => `DET_${operationId}`;
const safety = (operationId: AskOperationId) => ASK_OPERATION_DEFINITIONS[operationId].safetyClass.endsWith('_BOUNDARY');

/** Safety boundaries intercept independently under FR-DEC-0; every other message-routable operation is governed here. */
export const FAST_PATH_RULES: readonly FastPathRule[] = Object.freeze(Object.values(ASK_OPERATION_DEFINITIONS)
  .filter((definition) => definition.messageRoutable && !safety(definition.operationId) && definition.operationId !== 'GROUNDED_GUIDANCE')
  .map((definition) => Object.freeze({ id: ruleId(definition.operationId), version: resolverHash, operationId: definition.operationId,
    description: definition.semantic.intentDescription, status: 'DEMOTED' as const })));

export const MAX_INCORRECT_HIGH_CONFIDENCE_RATE = 0.01;
export const MIN_SEALED_FAMILIES_FOR_CLAIM = 381;
export const MIN_ADJACENT_NEGATIVES_PER_RULE = 30;
export const MIN_CROSS_OPERATION_NEGATIVES_PER_RULE = 30;

export function validateFastPathRule(rule: FastPathRule): string[] {
  const issues: string[] = [];
  if (!/^DET_[A-Z][A-Z0-9_]+$/.test(rule.id) || !/^[a-f0-9]{16}$/.test(rule.version)) issues.push(`${rule.id}: bad id or resolver hash`);
  if (rule.id !== ruleId(rule.operationId)) issues.push(`${rule.id}: id does not match ${rule.operationId}`);
  if (rule.status !== 'CERTIFIED') { if (rule.evidence) issues.push(`${rule.id}: a ${rule.status.toLowerCase()} rule must not carry certification evidence`); return issues; }
  const e = rule.evidence;
  if (!e) return [...issues, `${rule.id}: certified without evidence`];
  if (e.sealedFamilies < MIN_SEALED_FAMILIES_FOR_CLAIM) issues.push(`${rule.id}: sealed set below ${MIN_SEALED_FAMILIES_FOR_CLAIM}`);
  if (!(e.incorrectUpperBound < MAX_INCORRECT_HIGH_CONFIDENCE_RATE)) issues.push(`${rule.id}: incorrect-high-confidence upper bound is not strictly below 1%`);
  if (e.adjacentNegativeRows < MIN_ADJACENT_NEGATIVES_PER_RULE || !e.adjacentNegativesPassed) issues.push(`${rule.id}: adjacent-negative floor failed`);
  if (e.crossOperationRows < MIN_CROSS_OPERATION_NEGATIVES_PER_RULE || !e.crossOperationNegativesPassed) issues.push(`${rule.id}: cross-operation floor failed`);
  if (e.perRuleFailures !== 0) issues.push(`${rule.id}: observed per-rule failure requires demotion`);
  if (!e.leaveOneRuleOutPassed) issues.push(`${rule.id}: leave-one-rule-out comparison failed`);
  if (!e.tuningSetId || !e.sealedSetId || !e.certifiedAt) issues.push(`${rule.id}: certificate lacks dataset lineage or date`);
  return issues;
}

export const fastPathRuleForOperation = (operationId: AskOperationId): FastPathRule | null => FAST_PATH_RULES.find((rule) => rule.operationId === operationId) ?? null;
export const isFastPathCertified = (ruleIdToCheck: string): boolean => { const rule = FAST_PATH_RULES.find((entry) => entry.id === ruleIdToCheck); return !!rule && rule.status === 'CERTIFIED' && validateFastPathRule(rule).length === 0; };

export interface FastPathAggregateEvidence { readonly sealedFamilies: number; readonly failures: number; readonly incorrectUpperBound: number; readonly sealedSetId: string }
export const validateFastPathAggregate = (e: FastPathAggregateEvidence): string[] => [
  ...(e.sealedFamilies < MIN_SEALED_FAMILIES_FOR_CLAIM ? [`aggregate sealed set below ${MIN_SEALED_FAMILIES_FOR_CLAIM}`] : []),
  ...(!(e.incorrectUpperBound < MAX_INCORRECT_HIGH_CONFIDENCE_RATE) ? ['aggregate incorrect-high-confidence upper bound is not strictly below 1%'] : []),
  ...(!e.sealedSetId ? ['aggregate certificate lacks sealed-set lineage'] : []),
];
