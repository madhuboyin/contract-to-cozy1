import { createHash } from 'node:crypto';
import type { AskConfidenceBand } from './askTrust.contract';

export type AskEntityEvidenceSignal = 'AUTHORIZED_PROPERTY' | 'TRUSTED_LAUNCH_ENTITY' | 'UNRESOLVED_MENTION' | 'AMBIGUOUS_REFERENCE' | 'MISSING_ENTITY';

export interface AskEntityCalibrationObservation {
  fixtureId: string;
  signal: AskEntityEvidenceSignal;
  canonicalResolutionCorrect: boolean;
  reviewedAt: string;
  reviewer: 'TRUST_ARCHITECTURE_REVIEW';
}

export const ASK_ENTITY_CALIBRATION_OBSERVATIONS: readonly AskEntityCalibrationObservation[] = Object.freeze([
  { fixtureId: 'entity-property-authorized-001', signal: 'AUTHORIZED_PROPERTY', canonicalResolutionCorrect: true, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-property-authorized-002', signal: 'AUTHORIZED_PROPERTY', canonicalResolutionCorrect: true, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-launch-trusted-001', signal: 'TRUSTED_LAUNCH_ENTITY', canonicalResolutionCorrect: true, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-launch-trusted-002', signal: 'TRUSTED_LAUNCH_ENTITY', canonicalResolutionCorrect: true, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-mention-unresolved-001', signal: 'UNRESOLVED_MENTION', canonicalResolutionCorrect: false, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-mention-unresolved-002', signal: 'UNRESOLVED_MENTION', canonicalResolutionCorrect: true, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-mention-unresolved-003', signal: 'UNRESOLVED_MENTION', canonicalResolutionCorrect: true, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-reference-ambiguous-001', signal: 'AMBIGUOUS_REFERENCE', canonicalResolutionCorrect: false, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-reference-ambiguous-002', signal: 'AMBIGUOUS_REFERENCE', canonicalResolutionCorrect: false, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-required-missing-001', signal: 'MISSING_ENTITY', canonicalResolutionCorrect: false, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
  { fixtureId: 'entity-required-missing-002', signal: 'MISSING_ENTITY', canonicalResolutionCorrect: false, reviewedAt: '2026-08-15', reviewer: 'TRUST_ARCHITECTURE_REVIEW' },
]);

export const ASK_ENTITY_CALIBRATION_VERSION = `entity-calibration-1.0-${createHash('sha256')
  .update(JSON.stringify(ASK_ENTITY_CALIBRATION_OBSERVATIONS)).digest('hex').slice(0, 12)}`;

export function calibrateAskEntityConfidence(signal: AskEntityEvidenceSignal): { confidence: number; band: AskConfidenceBand } {
  const rows = ASK_ENTITY_CALIBRATION_OBSERVATIONS.filter((row) => row.signal === signal);
  const confidence = rows.length ? rows.filter((row) => row.canonicalResolutionCorrect).length / rows.length : 0;
  return {
    confidence: Number(confidence.toFixed(4)),
    band: confidence >= .9 ? 'HIGH' : confidence >= .5 ? 'MEDIUM' : 'LOW',
  };
}
