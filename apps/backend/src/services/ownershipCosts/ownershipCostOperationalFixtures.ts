import {
  OWNERSHIP_COST_CATEGORIES,
  type OwnershipCostCategory,
  type OwnershipCostSourceDomain,
} from './ownershipCost.contract';
import {
  OWNERSHIP_COST_ADAPTER_VERSION,
  ownershipCostFingerprint,
  type CanonicalOwnershipCostObservation,
  type OwnershipCostAdapterKey,
} from './ownershipCostAdapters';

const CATEGORY_SOURCE: Record<OwnershipCostCategory, {
  adapterKey: OwnershipCostAdapterKey;
  sourceDomain: OwnershipCostSourceDomain;
}> = {
  PROPERTY_TAX: { adapterKey: 'tax', sourceDomain: 'PROPERTY_TAX' },
  INSURANCE: { adapterKey: 'insurance', sourceDomain: 'COVERAGE' },
  HOA: { adapterKey: 'hoa', sourceDomain: 'HOA' },
  UTILITIES: { adapterKey: 'utility', sourceDomain: 'UTILITY' },
  MORTGAGE_PRINCIPAL: { adapterKey: 'financing', sourceDomain: 'FINANCING' },
  MORTGAGE_INTEREST: { adapterKey: 'financing', sourceDomain: 'FINANCING' },
  PMI: { adapterKey: 'financing', sourceDomain: 'FINANCING' },
  RECURRING_HOME_SERVICE: {
    adapterKey: 'recurring-service',
    sourceDomain: 'RECURRING_SERVICE',
  },
  ROUTINE_MAINTENANCE: {
    adapterKey: 'maintenance',
    sourceDomain: 'MAINTENANCE',
  },
  KNOWN_REPAIR: { adapterKey: 'maintenance', sourceDomain: 'MAINTENANCE' },
  CAPITAL_PROJECT: { adapterKey: 'project', sourceDomain: 'PROJECT' },
  RESERVE_CONTRIBUTION: { adapterKey: 'reserve', sourceDomain: 'RESERVE' },
};

function observation(
  propertyKey: string,
  category: OwnershipCostCategory,
  amountCents: number | null,
  options: {
    evidenceStatus?: CanonicalOwnershipCostObservation['evidenceStatus'];
    verificationStatus?: CanonicalOwnershipCostObservation['verificationStatus'];
    applicability?: CanonicalOwnershipCostObservation['applicability'];
  } = {},
): CanonicalOwnershipCostObservation {
  const source = CATEGORY_SOURCE[category];
  const applicability = options.applicability ?? 'APPLICABLE';
  const sourceFingerprint = ownershipCostFingerprint({
    fixture: propertyKey,
    category,
    amountCents,
    applicability,
  });
  return {
    adapterKey: source.adapterKey,
    adapterVersion: OWNERSHIP_COST_ADAPTER_VERSION,
    category,
    subcategory: null,
    amountCents,
    annualizedAmountCents: amountCents,
    currency: 'USD',
    recurrence: category === 'KNOWN_REPAIR' || category === 'CAPITAL_PROJECT'
      ? 'ONE_TIME'
      : 'ANNUAL',
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-12-31T23:59:59.999Z',
    temporalKind: 'CURRENT_PERIOD',
    evidenceStatus: amountCents == null
      ? null
      : options.evidenceStatus ?? 'CONFIRMED',
    verificationStatus:
      options.verificationStatus ?? (amountCents == null
        ? 'UNVERIFIED'
        : 'VERIFIED'),
    freshnessStatus: 'CURRENT',
    applicability,
    sourceDomain: source.sourceDomain,
    sourceEntityType: 'OperationalFixture',
    sourceEntityId: `${propertyKey}:${category}`,
    sourceDocumentId: null,
    sourceFingerprint,
    confidence: amountCents == null ? null : 'HIGH',
    assumptions: ['Representative Slice 9 operational fixture.'],
    missingDependencies:
      amountCents == null && applicability === 'APPLICABLE'
        ? [`fixture.${category.toLowerCase()}`]
        : [],
    dedupeKey: `${propertyKey}:${category}`,
  };
}

const COMPLETE_AMOUNTS: Record<OwnershipCostCategory, number> = {
  PROPERTY_TAX: 720_000,
  INSURANCE: 240_000,
  HOA: 120_000,
  UTILITIES: 360_000,
  MORTGAGE_PRINCIPAL: 1_200_000,
  MORTGAGE_INTEREST: 960_000,
  PMI: 120_000,
  RECURRING_HOME_SERVICE: 180_000,
  ROUTINE_MAINTENANCE: 300_000,
  KNOWN_REPAIR: 250_000,
  CAPITAL_PROJECT: 500_000,
  RESERVE_CONTRIBUTION: 600_000,
};

export const OWNERSHIP_COST_REPRESENTATIVE_FIXTURES = [
  {
    key: 'financed-detached-credible',
    description:
      'Complete, verified financed-home evidence with every category represented.',
    expectedCoverageStatus: 'CREDIBLE',
    observations: OWNERSHIP_COST_CATEGORIES.map((category) =>
      observation(
        'financed-detached-credible',
        category,
        COMPLETE_AMOUNTS[category],
      )),
  },
  {
    key: 'condo-partial',
    description:
      'Confirmed tax, coverage, and HOA with unresolved utility, financing, maintenance, and reserve facts.',
    expectedCoverageStatus: 'PARTIAL',
    observations: OWNERSHIP_COST_CATEGORIES.map((category) =>
      observation(
        'condo-partial',
        category,
        ['PROPERTY_TAX', 'INSURANCE', 'HOA'].includes(category)
          ? COMPLETE_AMOUNTS[category]
          : null,
      )),
  },
  {
    key: 'paid-off-estimate-only',
    description:
      'Paid-off home with financing categories explicitly not applicable and remaining amounts benchmark-estimated.',
    expectedCoverageStatus: 'ESTIMATE_ONLY',
    observations: OWNERSHIP_COST_CATEGORIES.map((category) => {
      const financing = [
        'MORTGAGE_PRINCIPAL',
        'MORTGAGE_INTEREST',
        'PMI',
      ].includes(category);
      return observation(
        'paid-off-estimate-only',
        category,
        financing ? null : COMPLETE_AMOUNTS[category],
        financing
          ? { applicability: 'NOT_APPLICABLE' }
          : {
              evidenceStatus: 'BENCHMARK',
              verificationStatus: 'UNVERIFIED',
            },
      );
    }),
  },
] as const;
