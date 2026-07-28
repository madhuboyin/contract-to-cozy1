import { createHash } from 'node:crypto';
import {
  OWNERSHIP_COST_CATEGORIES,
  OWNERSHIP_COST_DEFINITION_VERSION,
  type OwnershipCostApplicability,
  type OwnershipCostCategory,
  type OwnershipCostEvidenceStatus,
  type OwnershipCostFreshnessStatus,
  type OwnershipCostRecurrence,
  type OwnershipCostSourceDomain,
  type OwnershipCostTemporalKind,
} from './ownershipCost.contract';

export const OWNERSHIP_COST_ADAPTER_VERSION = 'ownership-cost-adapters-v1';
export const OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION =
  'ownership-cost-categories-v1';
export const OWNERSHIP_COST_METHOD_VERSION = 'ownership-cost-normalization-v1';

export type OwnershipCostVerificationStatus =
  | 'VERIFIED'
  | 'PENDING_CONFIRMATION'
  | 'UNVERIFIED';

export type OwnershipCostSourceInput = {
  sourceDomain: OwnershipCostSourceDomain;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceDocumentId?: string | null;
  sourceUpdatedAt?: string | Date | null;
  category: OwnershipCostCategory;
  subcategory?: string | null;
  amountCents?: number | null;
  currency?: string;
  recurrence: OwnershipCostRecurrence;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  temporalKind?: OwnershipCostTemporalKind;
  evidenceStatus?: OwnershipCostEvidenceStatus | null;
  verificationStatus?: OwnershipCostVerificationStatus;
  freshnessStatus?: OwnershipCostFreshnessStatus;
  applicability?: OwnershipCostApplicability;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  assumptions?: string[];
  missingDependencies?: string[];
  dedupeKey?: string | null;
};

export type CanonicalOwnershipCostObservation = {
  adapterKey: OwnershipCostAdapterKey;
  adapterVersion: string;
  category: OwnershipCostCategory;
  subcategory: string | null;
  amountCents: number | null;
  annualizedAmountCents: number | null;
  currency: string;
  recurrence: OwnershipCostRecurrence;
  periodStart: string | null;
  periodEnd: string | null;
  temporalKind: OwnershipCostTemporalKind;
  evidenceStatus: OwnershipCostEvidenceStatus | null;
  verificationStatus: OwnershipCostVerificationStatus;
  freshnessStatus: OwnershipCostFreshnessStatus;
  applicability: OwnershipCostApplicability;
  sourceDomain: OwnershipCostSourceDomain;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceDocumentId: string | null;
  sourceFingerprint: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  assumptions: string[];
  missingDependencies: string[];
  dedupeKey: string;
};

export type OwnershipCostAdapterKey =
  | 'tax'
  | 'insurance'
  | 'financing'
  | 'expense'
  | 'utility'
  | 'hoa'
  | 'maintenance'
  | 'recurring-service'
  | 'project'
  | 'reserve';

export type OwnershipCostSourceBundle = Record<
  OwnershipCostAdapterKey,
  OwnershipCostSourceInput[]
>;

export type OwnershipCostAdapter = {
  key: OwnershipCostAdapterKey;
  sourceDomain: OwnershipCostSourceDomain;
  categories: readonly OwnershipCostCategory[];
  adapt: (
    inputs: readonly OwnershipCostSourceInput[],
    asOf: Date,
  ) => CanonicalOwnershipCostObservation[];
};

const ANNUALIZATION_MULTIPLIER: Record<OwnershipCostRecurrence, number | null> = {
  ONE_TIME: 1,
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMIANNUAL: 2,
  ANNUAL: 1,
  IRREGULAR: null,
};

const SOURCE_PRIORITY: Record<OwnershipCostSourceDomain, number> = {
  PROPERTY_TAX: 110,
  COVERAGE: 110,
  FINANCING: 110,
  UTILITY: 105,
  HOA: 105,
  MAINTENANCE: 105,
  RECURRING_SERVICE: 105,
  PROJECT: 105,
  RESERVE: 105,
  HOMEOWNER: 90,
  EXPENSE: 80,
  SYSTEM_ESTIMATE: 20,
};

const VERIFICATION_PRIORITY: Record<OwnershipCostVerificationStatus, number> = {
  VERIFIED: 30,
  PENDING_CONFIRMATION: 20,
  UNVERIFIED: 10,
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function ownershipCostFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function calendarPeriod(asOf: Date): { start: string; end: string } {
  return {
    start: new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)).toISOString(),
    end: new Date(Date.UTC(asOf.getUTCFullYear(), 11, 31, 23, 59, 59, 999))
      .toISOString(),
  };
}

function normalizeAmount(
  amountCents: number | null | undefined,
  recurrence: OwnershipCostRecurrence,
): { amountCents: number | null; annualizedAmountCents: number | null } {
  if (amountCents == null) {
    return { amountCents: null, annualizedAmountCents: null };
  }
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new Error('Ownership-cost amounts must be non-negative safe integer cents.');
  }
  const multiplier = ANNUALIZATION_MULTIPLIER[recurrence];
  return {
    amountCents,
    annualizedAmountCents:
      multiplier == null ? null : Math.round(amountCents * multiplier),
  };
}

function adapt(
  adapterKey: OwnershipCostAdapterKey,
  expectedDomain: OwnershipCostSourceDomain,
  acceptedCategories: readonly OwnershipCostCategory[],
  inputs: readonly OwnershipCostSourceInput[],
  asOf: Date,
): CanonicalOwnershipCostObservation[] {
  const fallbackPeriod = calendarPeriod(asOf);
  return inputs.map((input) => {
    if (input.sourceDomain !== expectedDomain) {
      throw new Error(
        `${adapterKey} adapter cannot consume ${input.sourceDomain} source records.`,
      );
    }
    if (!acceptedCategories.includes(input.category)) {
      throw new Error(
        `${adapterKey} adapter cannot emit ${input.category}.`,
      );
    }
    if (!input.sourceEntityId || !input.sourceEntityType) {
      throw new Error(`${adapterKey} observations require a canonical source reference.`);
    }

    const applicability = input.applicability ?? 'APPLICABLE';
    const missingDependencies = [...new Set(input.missingDependencies ?? [])].sort();
    const evidenceStatus = input.evidenceStatus ?? null;
    const amount = normalizeAmount(input.amountCents, input.recurrence);
    if (
      applicability === 'APPLICABLE'
      && amount.amountCents == null
      && missingDependencies.length === 0
    ) {
      throw new Error(
        `${adapterKey} missing observations must name at least one dependency.`,
      );
    }
    if (applicability === 'NOT_APPLICABLE' && amount.amountCents != null) {
      throw new Error('Not-applicable ownership-cost observations cannot carry an amount.');
    }
    if (amount.amountCents != null && evidenceStatus == null) {
      throw new Error('Ownership-cost amounts require an evidence status.');
    }

    const periodStart = iso(input.periodStart) ?? fallbackPeriod.start;
    const periodEnd = iso(input.periodEnd) ?? fallbackPeriod.end;
    if (periodStart > periodEnd) {
      throw new Error('Ownership-cost observation periodStart must not exceed periodEnd.');
    }

    const fingerprintInput = {
      definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION,
      adapterVersion: OWNERSHIP_COST_ADAPTER_VERSION,
      adapterKey,
      category: input.category,
      subcategory: input.subcategory ?? null,
      amountCents: amount.amountCents,
      currency: input.currency ?? 'USD',
      recurrence: input.recurrence,
      periodStart,
      periodEnd,
      temporalKind: input.temporalKind ?? 'CURRENT_PERIOD',
      evidenceStatus,
      verificationStatus: input.verificationStatus ?? 'UNVERIFIED',
      applicability,
      sourceDomain: input.sourceDomain,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      sourceDocumentId: input.sourceDocumentId ?? null,
      sourceUpdatedAt: iso(input.sourceUpdatedAt),
      missingDependencies,
    };

    return {
      adapterKey,
      adapterVersion: OWNERSHIP_COST_ADAPTER_VERSION,
      category: input.category,
      subcategory: input.subcategory ?? null,
      ...amount,
      currency: input.currency ?? 'USD',
      recurrence: input.recurrence,
      periodStart,
      periodEnd,
      temporalKind: input.temporalKind ?? 'CURRENT_PERIOD',
      evidenceStatus,
      verificationStatus: input.verificationStatus ?? 'UNVERIFIED',
      freshnessStatus: input.freshnessStatus ?? 'UNKNOWN',
      applicability,
      sourceDomain: input.sourceDomain,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      sourceDocumentId: input.sourceDocumentId ?? null,
      sourceFingerprint: ownershipCostFingerprint(fingerprintInput),
      confidence: input.confidence ?? null,
      assumptions: [...new Set(input.assumptions ?? [])].sort(),
      missingDependencies,
      dedupeKey:
        input.dedupeKey
        ?? [
          input.category,
          input.sourceDocumentId ?? input.sourceEntityId,
          periodStart,
          periodEnd,
        ].join(':'),
    };
  });
}

function adapter(
  key: OwnershipCostAdapterKey,
  sourceDomain: OwnershipCostSourceDomain,
  categories: readonly OwnershipCostCategory[],
): OwnershipCostAdapter {
  return {
    key,
    sourceDomain,
    categories,
    adapt: (inputs, asOf) => adapt(key, sourceDomain, categories, inputs, asOf),
  };
}

export const OWNERSHIP_COST_ADAPTERS: readonly OwnershipCostAdapter[] = [
  adapter('tax', 'PROPERTY_TAX', ['PROPERTY_TAX']),
  adapter('insurance', 'COVERAGE', ['INSURANCE']),
  adapter('financing', 'FINANCING', [
    'MORTGAGE_PRINCIPAL',
    'MORTGAGE_INTEREST',
    'PMI',
  ]),
  adapter('expense', 'EXPENSE', OWNERSHIP_COST_CATEGORIES),
  adapter('utility', 'UTILITY', ['UTILITIES']),
  adapter('hoa', 'HOA', ['HOA']),
  adapter('maintenance', 'MAINTENANCE', [
    'ROUTINE_MAINTENANCE',
    'KNOWN_REPAIR',
  ]),
  adapter('recurring-service', 'RECURRING_SERVICE', ['RECURRING_HOME_SERVICE']),
  adapter('project', 'PROJECT', ['CAPITAL_PROJECT']),
  adapter('reserve', 'RESERVE', ['RESERVE_CONTRIBUTION']),
] as const;

export function adaptOwnershipCostSources(
  bundle: OwnershipCostSourceBundle,
  asOf: Date,
): CanonicalOwnershipCostObservation[] {
  const observations = OWNERSHIP_COST_ADAPTERS.flatMap((definition) =>
    definition.adapt(bundle[definition.key], asOf));
  return deduplicateOwnershipCostObservations(observations);
}

function observationRank(observation: CanonicalOwnershipCostObservation): number {
  return (
    SOURCE_PRIORITY[observation.sourceDomain]
    + VERIFICATION_PRIORITY[observation.verificationStatus]
    + (observation.evidenceStatus === 'OBSERVED' ? 5 : 0)
  );
}

export function deduplicateOwnershipCostObservations(
  observations: readonly CanonicalOwnershipCostObservation[],
): CanonicalOwnershipCostObservation[] {
  const byKey = new Map<string, CanonicalOwnershipCostObservation>();
  for (const observation of [...observations].sort((left, right) =>
    left.sourceFingerprint.localeCompare(right.sourceFingerprint))) {
    const current = byKey.get(observation.dedupeKey);
    if (
      !current
      || observationRank(observation) > observationRank(current)
      || (
        observationRank(observation) === observationRank(current)
        && observation.sourceFingerprint.localeCompare(current.sourceFingerprint) < 0
      )
    ) {
      byKey.set(observation.dedupeKey, observation);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    left.category.localeCompare(right.category)
    || left.sourceFingerprint.localeCompare(right.sourceFingerprint));
}

export function ownershipCostInputFingerprint(
  observations: readonly CanonicalOwnershipCostObservation[],
): string {
  return ownershipCostFingerprint({
    methodVersion: OWNERSHIP_COST_METHOD_VERSION,
    observations: observations
      .map((observation) => observation.sourceFingerprint)
      .sort(),
  });
}

export function emptyOwnershipCostSourceBundle(): OwnershipCostSourceBundle {
  return {
    tax: [],
    insurance: [],
    financing: [],
    expense: [],
    utility: [],
    hoa: [],
    maintenance: [],
    'recurring-service': [],
    project: [],
    reserve: [],
  };
}
