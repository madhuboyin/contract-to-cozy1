// Fast-path certification scaffold (reliability FRD FR-FAST-1..9). A deterministic rule that answers WITHOUT the model path is a "fast-path claim"; the FRD says no claim
// ships as certified until the sealed incorrect-high-confidence gate passes for it. This file defines the record a rule must carry and the check that refuses an
// uncertified claim. NO rule is certified today: every entry is `UNCERTIFIED`, and `isFastPathCertified` is false for all of them. It measures nothing by itself.
export type FastPathStatus = 'UNCERTIFIED' | 'CERTIFIED' | 'DEMOTED';
export interface FastPathEvidence {
  /** Sealed-set size and failures behind the claim (family level, FR-EVAL-14). */
  readonly sealedFamilies: number;
  readonly incorrectHighConfidence: number;
  /** Upper bound on the incorrect-high-confidence rate, computed by scripts/lib/askGateStats.js. */
  readonly incorrectUpperBound: number;
  readonly adjacentNegativesPassed: boolean;
  readonly sealedSetId: string;
  readonly certifiedAt: string;
}
export interface FastPathRule {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly status: FastPathStatus;
  readonly evidence?: FastPathEvidence;
}

/** The deterministic rules this programme added. Existing deterministic rules in askOperationRegistry.ts are not enumerated here yet (FR-FAST rule ids for them are open). */
export const FAST_PATH_RULES: readonly FastPathRule[] = Object.freeze([
  { id: 'ROUTING_NORMALISATION', version: 1, description: 'Framing strip and safe one-edit spelling correction before routing (support/routingNormalization.ts).', status: 'UNCERTIFIED' },
  { id: 'DATA_POINT_TYPED_READ', version: 1, description: 'Question frame plus a unique reviewed data-point alias routes to DATA_POINT_READ (askOperationRegistry.ts dataPointQuestionPattern).', status: 'UNCERTIFIED' },
]);

export const MAX_INCORRECT_HIGH_CONFIDENCE_RATE = 0.01;
export const MIN_SEALED_FAMILIES_FOR_CLAIM = 381;

/** Problems that make a rule's record invalid. A CERTIFIED rule needs complete evidence under the thresholds; an UNCERTIFIED one must not carry a certificate. */
export function validateFastPathRule(rule: FastPathRule): string[] {
  const issues: string[] = [];
  if (!/^[A-Z][A-Z0-9_]+$/.test(rule.id) || !Number.isInteger(rule.version) || rule.version < 1) issues.push(`${rule.id}: bad id or version`);
  if (rule.status !== 'CERTIFIED') { if (rule.evidence && rule.status === 'UNCERTIFIED') issues.push(`${rule.id}: an uncertified rule must not carry a certificate`); return issues; }
  const e = rule.evidence;
  if (!e) return [...issues, `${rule.id}: certified without evidence`];
  if (e.sealedFamilies < MIN_SEALED_FAMILIES_FOR_CLAIM) issues.push(`${rule.id}: sealed set of ${e.sealedFamilies} families is below ${MIN_SEALED_FAMILIES_FOR_CLAIM}`);
  if (e.incorrectUpperBound > MAX_INCORRECT_HIGH_CONFIDENCE_RATE) issues.push(`${rule.id}: incorrect-high-confidence upper bound ${e.incorrectUpperBound} exceeds ${MAX_INCORRECT_HIGH_CONFIDENCE_RATE}`);
  if (!e.adjacentNegativesPassed) issues.push(`${rule.id}: adjacent-data-point negatives did not pass`);
  if (!e.sealedSetId || !e.certifiedAt) issues.push(`${rule.id}: certificate lacks its sealed set id or date`);
  return issues;
}

export const isFastPathCertified = (ruleId: string): boolean => {
  const rule = FAST_PATH_RULES.find((r) => r.id === ruleId);
  return !!rule && rule.status === 'CERTIFIED' && validateFastPathRule(rule).length === 0;
};
