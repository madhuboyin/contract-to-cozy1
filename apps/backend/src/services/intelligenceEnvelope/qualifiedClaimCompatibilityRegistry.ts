import type { QualifiedClaim, QualifiedClaimPropositionType } from '../../productFramework/intelligence';

export type QualifiedClaimRelationship = 'COMPATIBLE' | 'CONFLICTED' | 'UNKNOWN';

const HVAC_INCOMPATIBLE_VERDICT_PAIRS = new Set([
  'MONITOR|REPAIR',
  'MONITOR|REPLACE',
  'REPAIR|REPLACE',
]);

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
  if (
    input.propositionType === 'HVAC_REPAIR_REPLACE_VERDICT'
    && HVAC_INCOMPATIBLE_VERDICT_PAIRS.has(pair(left, right))
  ) return 'CONFLICTED';
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
