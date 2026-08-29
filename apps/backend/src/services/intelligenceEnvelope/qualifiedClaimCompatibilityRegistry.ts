import type { QualifiedClaim, QualifiedClaimPropositionType } from '../../productFramework/intelligence';

export type QualifiedClaimRelationship = 'COMPATIBLE' | 'CONFLICTED' | 'UNKNOWN';

const HVAC_INCOMPATIBLE_VERDICT_PAIRS = new Set([
  'MONITOR|REPAIR',
  'MONITOR|REPLACE',
  'REPAIR|REPLACE',
]);

// C2C Intelligence & Agentic Evolution Phase 4A: the non-HVAC repair/
// replace family projects only REPAIR / REPLACE (see
// applianceDecisionFamilyAdapter.ts's verdict table) — the two are a
// direct contradiction when the full claim key otherwise matches.
const APPLIANCE_REPAIR_REPLACE_INCOMPATIBLE_VERDICT_PAIRS = new Set([
  'REPAIR|REPLACE',
]);

const INCOMPATIBLE_VERDICT_PAIRS_BY_PROPOSITION: Partial<Record<QualifiedClaimPropositionType, ReadonlySet<string>>> = {
  HVAC_REPAIR_REPLACE_VERDICT: HVAC_INCOMPATIBLE_VERDICT_PAIRS,
  APPLIANCE_REPAIR_REPLACE_VERDICT: APPLIANCE_REPAIR_REPLACE_INCOMPATIBLE_VERDICT_PAIRS,
};

function pair(left: string, right: string): string {
  return [left.toUpperCase(), right.toUpperCase()].sort().join('|');
}

export function evaluateQualifiedClaimVerdicts(input: {
  propositionType: QualifiedClaimPropositionType;
  leftVerdict: string;
  rightVerdict: string;
}): QualifiedClaimRelationship {
  const left = input.leftVerdict.toUpperCase();
  const right = input.rightVerdict.toUpperCase();
  if (left === right) return 'COMPATIBLE';
  const incompatiblePairs = INCOMPATIBLE_VERDICT_PAIRS_BY_PROPOSITION[input.propositionType];
  if (incompatiblePairs?.has(pair(left, right))) return 'CONFLICTED';
  return 'UNKNOWN';
}

export function evaluateQualifiedClaimRelationship(
  left: QualifiedClaim | undefined,
  right: QualifiedClaim | undefined,
): QualifiedClaimRelationship {
  if (!left || !right) return 'UNKNOWN';
  const leftKey = left.claimKey;
  const rightKey = right.claimKey;
  if (
    leftKey.propertyId !== rightKey.propertyId
    || leftKey.entityRef !== rightKey.entityRef
    || leftKey.propositionType !== rightKey.propositionType
    || leftKey.assessmentHorizonVersion !== rightKey.assessmentHorizonVersion
  ) return 'UNKNOWN';
  return evaluateQualifiedClaimVerdicts({
    propositionType: leftKey.propositionType,
    leftVerdict: left.verdict,
    rightVerdict: right.verdict,
  });
}
