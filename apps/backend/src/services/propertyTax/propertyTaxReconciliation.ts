import type {
  PropertyTaxCanonicalState,
  PropertyTaxEvidenceConfidence,
  PropertyTaxFieldObservation,
  ReconciledPropertyTaxField,
} from './propertyTaxRecord.types';

const CONFIDENCE_RANK: Record<PropertyTaxEvidenceConfidence, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  VERIFIED: 4,
};

const SOURCE_RANK: Record<PropertyTaxFieldObservation['sourceType'], number> = {
  HOMEOWNER_REPORTED: 1,
  DOCUMENT: 2,
  OFFICIAL_SOURCE: 3,
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  if (typeof value === 'number') return Number(value.toFixed(8));
  return value;
}

function valueIdentity(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function isActive(observation: PropertyTaxFieldObservation): boolean {
  return observation.reviewStatus !== 'SUPERSEDED'
    && observation.reviewStatus !== 'REJECTED';
}

function observationCanonicalState(
  observation: PropertyTaxFieldObservation,
): PropertyTaxCanonicalState {
  if (observation.sourceType === 'OFFICIAL_SOURCE') return 'OFFICIAL';
  if (observation.sourceType === 'HOMEOWNER_REPORTED') return 'HOMEOWNER_REPORTED';
  return observation.reviewStatus === 'VERIFIED'
    || observation.reviewStatus === 'HOMEOWNER_CONFIRMED'
    ? 'DOCUMENT_CONFIRMED'
    : 'DOCUMENT_UNCONFIRMED';
}

function strongestObservation(
  observations: PropertyTaxFieldObservation[],
): PropertyTaxFieldObservation {
  return [...observations].sort((left, right) => {
    const confidence = CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
    if (confidence !== 0) return confidence;
    const source = SOURCE_RANK[right.sourceType] - SOURCE_RANK[left.sourceType];
    if (source !== 0) return source;
    return Date.parse(right.observedAt) - Date.parse(left.observedAt);
  })[0];
}

export function reconcilePropertyTaxField(
  fieldKey: string,
  observations: PropertyTaxFieldObservation[],
): ReconciledPropertyTaxField {
  const active = observations.filter(isActive);
  if (active.length === 0) {
    return {
      fieldKey,
      state: 'UNKNOWN',
      value: null,
      confidence: 'UNKNOWN',
      canonicalState: 'UNKNOWN',
      observations: [],
    };
  }

  if (active.some((observation) => observation.reviewStatus === 'CONFLICTED')) {
    return {
      fieldKey,
      state: 'CONFLICTED',
      value: null,
      confidence: 'UNKNOWN',
      canonicalState: 'CONFLICTED',
      observations: active,
    };
  }

  const distinctValues = new Set(active.map((observation) => valueIdentity(observation.value)));
  if (distinctValues.size > 1) {
    return {
      fieldKey,
      state: 'CONFLICTED',
      value: null,
      confidence: 'UNKNOWN',
      canonicalState: 'CONFLICTED',
      observations: active,
    };
  }

  const strongest = strongestObservation(active);
  return {
    fieldKey,
    state: 'KNOWN',
    value: strongest.value,
    confidence: strongest.confidence,
    canonicalState: observationCanonicalState(strongest),
    observations: active,
  };
}

export function reconcilePropertyTaxFields(
  fieldKeys: readonly string[],
  observations: PropertyTaxFieldObservation[],
): Record<string, ReconciledPropertyTaxField> {
  return Object.fromEntries(
    fieldKeys.map((fieldKey) => [
      fieldKey,
      reconcilePropertyTaxField(
        fieldKey,
        observations.filter((observation) => observation.fieldKey === fieldKey),
      ),
    ]),
  );
}

export function canonicalStateForFields(
  fields: Record<string, ReconciledPropertyTaxField>,
): PropertyTaxCanonicalState {
  const values = Object.values(fields);
  if (values.some((field) => field.state === 'CONFLICTED')) return 'CONFLICTED';

  const known = values.filter((field) => field.state === 'KNOWN');
  if (known.length === 0) return 'UNKNOWN';
  const states = new Set(known.map((field) => field.canonicalState));
  if (states.size > 1) return 'MIXED';
  return known[0].canonicalState;
}
