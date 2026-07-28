import {
  OWNERSHIP_COST_CATEGORIES,
  type OwnershipCostCategory,
  type OwnershipCostLens,
} from './ownershipCost.contract';
import {
  OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION,
  OWNERSHIP_COST_METHOD_VERSION,
  ownershipCostInputFingerprint,
  type CanonicalOwnershipCostObservation,
} from './ownershipCostAdapters';

const LENS_CATEGORIES: Record<OwnershipCostLens, readonly OwnershipCostCategory[]> = {
  OPERATING_EXPENSE: [
    'PROPERTY_TAX',
    'INSURANCE',
    'HOA',
    'UTILITIES',
    'RECURRING_HOME_SERVICE',
    'ROUTINE_MAINTENANCE',
  ],
  CASH_OUTFLOW: [
    'PROPERTY_TAX',
    'INSURANCE',
    'HOA',
    'UTILITIES',
    'MORTGAGE_PRINCIPAL',
    'MORTGAGE_INTEREST',
    'PMI',
    'RECURRING_HOME_SERVICE',
    'ROUTINE_MAINTENANCE',
    'KNOWN_REPAIR',
    'CAPITAL_PROJECT',
    'RESERVE_CONTRIBUTION',
  ],
  ECONOMIC_COST: [
    'PROPERTY_TAX',
    'INSURANCE',
    'HOA',
    'UTILITIES',
    'MORTGAGE_INTEREST',
    'PMI',
    'RECURRING_HOME_SERVICE',
    'ROUTINE_MAINTENANCE',
    'KNOWN_REPAIR',
    'CAPITAL_PROJECT',
  ],
  CAPITAL_EXPENDITURE: ['KNOWN_REPAIR', 'CAPITAL_PROJECT'],
  RESERVE_PLAN: ['RESERVE_CONTRIBUTION'],
};

export type OwnershipCostSnapshotLineDraft = {
  sourceFingerprint: string;
  category: OwnershipCostCategory;
  subcategory: string | null;
  amountCents: number | null;
  annualizedAmountCents: number | null;
  applicability: CanonicalOwnershipCostObservation['applicability'];
  evidenceStatus: CanonicalOwnershipCostObservation['evidenceStatus'];
  verificationStatus: CanonicalOwnershipCostObservation['verificationStatus'];
  freshnessStatus: CanonicalOwnershipCostObservation['freshnessStatus'];
  includedLenses: OwnershipCostLens[];
};

export type OwnershipCostSnapshotDraft = {
  methodVersion: string;
  categoryDefinitionVersion: string;
  inputFingerprint: string;
  basePeriodStart: string;
  basePeriodEnd: string;
  coverageStatus: 'CREDIBLE' | 'PARTIAL' | 'ESTIMATE_ONLY' | 'NOT_READY';
  applicableCategories: OwnershipCostCategory[];
  missingCategories: OwnershipCostCategory[];
  totalsByLens: Record<OwnershipCostLens, number>;
  lines: OwnershipCostSnapshotLineDraft[];
};

function includedLenses(category: OwnershipCostCategory): OwnershipCostLens[] {
  return (Object.keys(LENS_CATEGORIES) as OwnershipCostLens[])
    .filter((lens) => LENS_CATEGORIES[lens].includes(category));
}

function coverageStatus(
  observations: readonly CanonicalOwnershipCostObservation[],
  missingCategories: readonly OwnershipCostCategory[],
): OwnershipCostSnapshotDraft['coverageStatus'] {
  const withAmounts = observations.filter((observation) =>
    observation.applicability === 'APPLICABLE'
    && observation.annualizedAmountCents != null);
  if (withAmounts.length === 0) return 'NOT_READY';

  const credible = withAmounts.filter((observation) =>
    ['OBSERVED', 'CONFIRMED', 'HOMEOWNER_REPORTED'].includes(
      observation.evidenceStatus ?? '',
    ));
  if (credible.length === 0) return 'ESTIMATE_ONLY';
  if (
    missingCategories.length === 0
    && credible.length === withAmounts.length
    && credible.every((observation) =>
      observation.verificationStatus === 'VERIFIED')
  ) {
    return 'CREDIBLE';
  }
  return 'PARTIAL';
}

export function buildOwnershipCostSnapshotDraft(
  observations: readonly CanonicalOwnershipCostObservation[],
  asOf: Date,
): OwnershipCostSnapshotDraft {
  const currentObservations = observations.filter((observation) =>
    observation.temporalKind === 'CURRENT_PERIOD');
  const applicableCategories = [...new Set(
    currentObservations
      .filter((observation) => observation.applicability === 'APPLICABLE')
      .map((observation) => observation.category),
  )].sort();
  const notApplicable = new Set(
    currentObservations
      .filter((observation) => observation.applicability === 'NOT_APPLICABLE')
      .map((observation) => observation.category),
  );
  const categoriesWithAmounts = new Set(
    currentObservations
      .filter((observation) => observation.annualizedAmountCents != null)
      .map((observation) => observation.category),
  );
  const missingCategories = OWNERSHIP_COST_CATEGORIES
    .filter((category) =>
      !notApplicable.has(category) && !categoriesWithAmounts.has(category))
    .sort();

  const totalsByLens = Object.fromEntries(
    (Object.keys(LENS_CATEGORIES) as OwnershipCostLens[]).map((lens) => [
      lens,
      currentObservations.reduce((total, observation) => {
        if (
          observation.applicability !== 'APPLICABLE'
          || observation.annualizedAmountCents == null
          || !LENS_CATEGORIES[lens].includes(observation.category)
        ) {
          return total;
        }
        return total + observation.annualizedAmountCents;
      }, 0),
    ]),
  ) as Record<OwnershipCostLens, number>;

  const basePeriodStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  const basePeriodEnd = new Date(
    Date.UTC(asOf.getUTCFullYear(), 11, 31, 23, 59, 59, 999),
  );

  return {
    methodVersion: OWNERSHIP_COST_METHOD_VERSION,
    categoryDefinitionVersion: OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION,
    inputFingerprint: ownershipCostInputFingerprint(currentObservations),
    basePeriodStart: basePeriodStart.toISOString(),
    basePeriodEnd: basePeriodEnd.toISOString(),
    coverageStatus: coverageStatus(currentObservations, missingCategories),
    applicableCategories,
    missingCategories,
    totalsByLens,
    lines: currentObservations.map((observation) => ({
      sourceFingerprint: observation.sourceFingerprint,
      category: observation.category,
      subcategory: observation.subcategory,
      amountCents: observation.amountCents,
      annualizedAmountCents: observation.annualizedAmountCents,
      applicability: observation.applicability,
      evidenceStatus: observation.evidenceStatus,
      verificationStatus: observation.verificationStatus,
      freshnessStatus: observation.freshnessStatus,
      includedLenses: includedLenses(observation.category),
    })),
  };
}
