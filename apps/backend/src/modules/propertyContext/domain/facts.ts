import { getFactDefinition } from '../catalog/factCatalog';
import { PropertyFact, PropertyFactSource } from './contracts';

export interface FactEvidenceMetadata {
  source: PropertyFactSource;
  verified: boolean;
  confidence: number | null;
  observedAt: Date;
  validUntil: Date | null;
  observationState?: 'KNOWN' | 'UNKNOWN';
}

export function createPropertyFact<T>(
  key: string,
  value: T | null | undefined,
  evidence?: FactEvidenceMetadata,
  now: Date = new Date(),
): PropertyFact<T> {
  const definition = getFactDefinition(key);
  const normalizedValue = evidence?.observationState === 'UNKNOWN' || value === undefined ? null : value;
  const stale = evidence?.validUntil ? evidence.validUntil.getTime() <= now.getTime() : false;

  return {
    key,
    value: normalizedValue,
    state: normalizedValue === null ? 'UNKNOWN' : stale ? 'STALE' : 'KNOWN',
    source: evidence?.source ?? null,
    verified: evidence?.verified ?? false,
    confidence: evidence?.confidence ?? null,
    observedAt: evidence?.observedAt.toISOString() ?? null,
    validUntil: evidence?.validUntil?.toISOString() ?? null,
    correctionPath: definition.correctionPath,
  };
}

export function unknownPropertyFact(key: string): PropertyFact {
  return createPropertyFact(key, null);
}

export interface PropertyFactCandidate<T> {
  value: T;
  evidence: FactEvidenceMetadata;
}

const sourcePriority: Record<PropertyFactSource, number> = {
  USER_REPORTED: 5,
  INSPECTION: 4,
  DOCUMENT: 4,
  PUBLIC_RECORD: 3,
  INTEGRATION: 3,
  SYSTEM_DERIVED: 2,
};

/**
 * Resolves typed candidates without erasing disagreement. A strictly stronger
 * candidate wins; equally strong candidates with different values remain a
 * conflict for the consuming feature to handle.
 */
export function resolvePropertyFactCandidates<T>(
  key: string,
  candidates: PropertyFactCandidate<T>[],
  now: Date = new Date(),
): PropertyFact<T> {
  if (candidates.length === 0) return createPropertyFact<T>(key, null, undefined, now);
  const sorted = [...candidates].sort((a, b) => {
    const verificationDifference = Number(b.evidence.verified) - Number(a.evidence.verified);
    if (verificationDifference !== 0) return verificationDifference;
    const sourceDifference = sourcePriority[b.evidence.source] - sourcePriority[a.evidence.source];
    if (sourceDifference !== 0) return sourceDifference;
    return b.evidence.observedAt.getTime() - a.evidence.observedAt.getTime();
  });
  const winner = sorted[0];
  const winnerRank = `${Number(winner.evidence.verified)}:${sourcePriority[winner.evidence.source]}:${winner.evidence.observedAt.getTime()}`;
  const equallyStrong = sorted.filter((candidate) =>
    `${Number(candidate.evidence.verified)}:${sourcePriority[candidate.evidence.source]}:${candidate.evidence.observedAt.getTime()}` === winnerRank,
  );
  const conflict = equallyStrong.some((candidate) =>
    JSON.stringify(candidate.value) !== JSON.stringify(winner.value),
  );
  const fact = createPropertyFact(key, winner.value, winner.evidence, now);
  return conflict ? { ...fact, state: 'CONFLICTED' } : fact;
}

export interface PropertyExteriorProfileInput {
  hasPrivateOutdoorSpace?: boolean | null;
  outdoorSpaceTypes?: string[];
}

export function validateExteriorProfile(input: PropertyExteriorProfileInput): void {
  if (input.hasPrivateOutdoorSpace === false && (input.outdoorSpaceTypes?.length ?? 0) > 0) {
    throw new Error('Outdoor space types cannot be set when private outdoor space is explicitly absent.');
  }
}
