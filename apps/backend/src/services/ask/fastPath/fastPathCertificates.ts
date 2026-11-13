import { ASK_OPERATION_DEFINITIONS, ruleIdOfResolution, type AskOperationId } from '../askOperationRegistry';
import { FAST_PATH_RULE_MANIFEST } from './ruleManifest.generated';
import { FAST_PATH_ADJACENCY } from './adjacencyManifest.generated';

export type FastPathStatus = 'UNCERTIFIED' | 'CERTIFIED' | 'DEMOTED';
export interface FastPathEvidence {
  readonly sealedFamilies: number; readonly incorrectHighConfidence: number; readonly incorrectUpperBound: number;
  readonly adjacentNegativeRows: number; readonly crossOperationRows: number;
  readonly adjacentNegativesPassed: boolean; readonly crossOperationNegativesPassed: boolean;
  readonly perRuleFailures: number; readonly leaveOneRuleOutPassed: boolean;
  readonly tuningSetId: string; readonly sealedSetId: string; readonly certifiedAt: string;
  /** The rules of the operation at certification time: leave-one-rule-out was run over exactly this pool, so a rule added or removed later invalidates it (FR-FAST-2). */
  readonly poolRuleIds: readonly string[];
  /** The adjacent operations the adjacent-negative rows covered (must include every operation in the adjacency manifest, FR-FAST-9). */
  readonly adjacentOperationIds: readonly string[];
}
export interface FastPathRule {
  readonly id: string; readonly version: string; readonly operationId: AskOperationId;
  readonly description: string; readonly status: FastPathStatus; readonly evidence?: FastPathEvidence;
}

// One rule = one `return resolved('OP', confidence, 'DET_OP_NN')` site in resolveAskOperation (FR-FAST-1). The id is stable; the version is the rule's own hash (its guarding condition, the operation and confidence it returns, and the
// declarations it references), so editing one pattern invalidates the certificate of the rules that use it and of no others. Both come from the generated manifest (scripts/ask-fast-path-rules.js).
const safety = (operationId: string) => ASK_OPERATION_DEFINITIONS[operationId as AskOperationId].safetyClass.endsWith('_BOUNDARY');

/** Certificates by rule id. A certificate names the rule version it was issued for; a rule whose hash has changed since is demoted until re-certified. Empty: nothing has been certified. */
export const FAST_PATH_CERTIFICATES: Readonly<Record<string, { readonly version: string; readonly evidence: FastPathEvidence }>> = Object.freeze({});

/** Safety boundaries intercept independently under FR-DEC-0; every other message-routable deterministic rule is governed here. */
export const FAST_PATH_RULES: readonly FastPathRule[] = Object.freeze(FAST_PATH_RULE_MANIFEST
  .filter((entry) => { const d = ASK_OPERATION_DEFINITIONS[entry.operationId as AskOperationId]; return d && d.messageRoutable && !safety(entry.operationId) && entry.operationId !== 'GROUNDED_GUIDANCE'; })
  .map((entry) => {
    const certificate = FAST_PATH_CERTIFICATES[entry.id];
    const current = certificate && certificate.version === entry.hash;
    return Object.freeze({ id: entry.id, version: entry.hash, operationId: entry.operationId as AskOperationId, description: entry.condition,
      status: current ? 'CERTIFIED' as const : 'DEMOTED' as const, ...(current ? { evidence: certificate.evidence } : {}) });
  }));

/** The rules of one operation: the leave-one-rule-out pool (FR-FAST-2). */
export const fastPathPoolOf = (operationId: string): readonly string[] => FAST_PATH_RULES.filter((rule) => rule.operationId === operationId).map((rule) => rule.id).sort();
/** The operation-owned adjacency (FR-FAST-9): the operations that resolve this operation's own hard negatives. */
export const fastPathAdjacentOperations = (operationId: string): readonly string[] => Object.keys(FAST_PATH_ADJACENCY[operationId] ?? {}).sort();

export const MAX_INCORRECT_HIGH_CONFIDENCE_RATE = 0.01;
export const MIN_SEALED_FAMILIES_FOR_CLAIM = 381;
export const MIN_ADJACENT_NEGATIVES_PER_RULE = 30;
export const MIN_CROSS_OPERATION_NEGATIVES_PER_RULE = 30;

export function validateFastPathRule(rule: FastPathRule): string[] {
  const issues: string[] = [];
  if (!/^DET_[A-Z][A-Z0-9_]+_\d{2,}$/.test(rule.id) || !/^[a-f0-9]{16}$/.test(rule.version)) issues.push(`${rule.id}: bad id or rule hash`);
  if (!rule.id.startsWith(`DET_${rule.operationId}_`)) issues.push(`${rule.id}: id does not match ${rule.operationId}`);
  if (rule.status !== 'CERTIFIED') { if (rule.evidence) issues.push(`${rule.id}: a ${rule.status.toLowerCase()} rule must not carry certification evidence`); return issues; }
  const e = rule.evidence;
  if (!e) return [...issues, `${rule.id}: certified without evidence`];
  if (e.sealedFamilies < MIN_SEALED_FAMILIES_FOR_CLAIM) issues.push(`${rule.id}: sealed set below ${MIN_SEALED_FAMILIES_FOR_CLAIM}`);
  if (!(e.incorrectUpperBound < MAX_INCORRECT_HIGH_CONFIDENCE_RATE)) issues.push(`${rule.id}: incorrect-high-confidence upper bound is not strictly below 1%`);
  if (e.adjacentNegativeRows < MIN_ADJACENT_NEGATIVES_PER_RULE || !e.adjacentNegativesPassed) issues.push(`${rule.id}: adjacent-negative floor failed`);
  if (e.crossOperationRows < MIN_CROSS_OPERATION_NEGATIVES_PER_RULE || !e.crossOperationNegativesPassed) issues.push(`${rule.id}: cross-operation floor failed`);
  if (e.perRuleFailures !== 0) issues.push(`${rule.id}: observed per-rule failure requires demotion`);
  if (!e.leaveOneRuleOutPassed) issues.push(`${rule.id}: leave-one-rule-out comparison failed`);
  if (JSON.stringify([...e.poolRuleIds].sort()) !== JSON.stringify(fastPathPoolOf(rule.operationId))) issues.push(`${rule.id}: leave-one-rule-out pool is not the operation's current rules`);
  const missingAdjacent = fastPathAdjacentOperations(rule.operationId).filter((op) => !e.adjacentOperationIds.includes(op));
  if (missingAdjacent.length) issues.push(`${rule.id}: adjacent negatives do not cover ${missingAdjacent.join(', ')}`);
  if (!e.tuningSetId || !e.sealedSetId || !e.certifiedAt) issues.push(`${rule.id}: certificate lacks dataset lineage or date`);
  return issues;
}

/** The rule that produced a resolution (null for a resolution no governed rule made: GROUNDED_GUIDANCE, a safety boundary, a resolution built elsewhere). */
export const fastPathRuleForResolution = (resolution: object): FastPathRule | null => { const id = ruleIdOfResolution(resolution); return id ? FAST_PATH_RULES.find((rule) => rule.id === id) ?? null : null; };
export const fastPathRulesForOperation = (operationId: string): readonly FastPathRule[] => FAST_PATH_RULES.filter((rule) => rule.operationId === operationId);
export const isFastPathCertified = (ruleIdToCheck: string): boolean => { const rule = FAST_PATH_RULES.find((entry) => entry.id === ruleIdToCheck); return !!rule && rule.status === 'CERTIFIED' && validateFastPathRule(rule).length === 0; };

export interface FastPathAggregateEvidence { readonly sealedFamilies: number; readonly failures: number; readonly incorrectUpperBound: number; readonly sealedSetId: string }
export const validateFastPathAggregate = (e: FastPathAggregateEvidence): string[] => [
  ...(e.sealedFamilies < MIN_SEALED_FAMILIES_FOR_CLAIM ? [`aggregate sealed set below ${MIN_SEALED_FAMILIES_FOR_CLAIM}`] : []),
  ...(!(e.incorrectUpperBound < MAX_INCORRECT_HIGH_CONFIDENCE_RATE) ? ['aggregate incorrect-high-confidence upper bound is not strictly below 1%'] : []),
  ...(!e.sealedSetId ? ['aggregate certificate lacks sealed-set lineage'] : []),
];
