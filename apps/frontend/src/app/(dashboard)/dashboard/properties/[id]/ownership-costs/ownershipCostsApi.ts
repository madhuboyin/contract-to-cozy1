import { api } from '@/lib/api/client';

export type OwnershipCostCurrentLens =
  | 'OPERATING_EXPENSE'
  | 'CASH_OUTFLOW';

export type OwnershipCostCategory =
  | 'PROPERTY_TAX'
  | 'INSURANCE'
  | 'HOA'
  | 'UTILITIES'
  | 'MORTGAGE_PRINCIPAL'
  | 'MORTGAGE_INTEREST'
  | 'PMI'
  | 'RECURRING_HOME_SERVICE'
  | 'ROUTINE_MAINTENANCE'
  | 'KNOWN_REPAIR'
  | 'CAPITAL_PROJECT'
  | 'RESERVE_CONTRIBUTION';

export type OwnershipCostReadModelCategory = {
  category: OwnershipCostCategory;
  label: string;
  amountCents: number | null;
  monthlyAmountCents: number | null;
  applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  amountKind: 'CONFIRMED' | 'ESTIMATED' | 'MISSING' | 'NOT_APPLICABLE';
  includedInSelectedLens: boolean;
  evidenceStatus:
    | 'OBSERVED'
    | 'CONFIRMED'
    | 'HOMEOWNER_REPORTED'
    | 'EXTRACTED'
    | 'BENCHMARK'
    | 'ESTIMATED'
    | 'FORECAST'
    | null;
  verificationStatus: 'VERIFIED' | 'PENDING_CONFIRMATION' | 'UNVERIFIED' | null;
  freshnessStatus: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN';
  sourceDomain: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourceDocumentId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  assumptions: string[];
  missingDependencies: string[];
  correction: { href: string; label: string };
};

export type OwnershipCostReadModel = {
  propertyId: string;
  propertyLabel: string;
  definitionVersion: string;
  methodVersion: string;
  categoryDefinitionVersion: string;
  selectedLens: OwnershipCostCurrentLens;
  snapshot: {
    id: string;
    calculatedAt: string;
    basePeriodStart: string;
    basePeriodEnd: string;
    coverageStatus: 'CREDIBLE' | 'PARTIAL' | 'ESTIMATE_ONLY' | 'NOT_READY';
    annualTotalCents: number;
    monthlyTotalCents: number;
    confirmedAnnualCents: number;
    estimatedAnnualCents: number;
    materialMissingCategory: OwnershipCostCategory | null;
    lastKnownGood: boolean;
  };
  coverage: {
    includedCategoryCount: number;
    confirmedCategoryCount: number;
    estimatedCategoryCount: number;
    missingCategoryCount: number;
    notApplicableCategoryCount: number;
  };
  categories: OwnershipCostReadModelCategory[];
  evidenceSummary: {
    confirmedAnnualCents: number;
    estimatedAnnualCents: number;
    staleCategoryCount: number;
    pendingConfirmationCount: number;
  };
  rankedAction: {
    kind: 'ADD_MISSING' | 'REFRESH_STALE' | 'CONFIRM_EVIDENCE' | 'NONE';
    title: string;
    detail: string;
    href: string | null;
    label: string | null;
    category: OwnershipCostCategory | null;
  };
  stale: { isStale: boolean; reason: string | null };
  limitations: string[];
};

type OwnershipCostResponse = {
  ownershipCosts: OwnershipCostReadModel;
};

function endpoint(
  propertyId: string,
  lens: OwnershipCostCurrentLens,
  suffix = '',
) {
  const query = new URLSearchParams({ lens });
  return `/api/properties/${encodeURIComponent(propertyId)}/ownership-costs${suffix}?${query}`;
}

export async function getOwnershipCosts(
  propertyId: string,
  lens: OwnershipCostCurrentLens,
) {
  const response = await api.get<OwnershipCostResponse>(
    endpoint(propertyId, lens),
  );
  return response.data.ownershipCosts;
}

export async function recalculateOwnershipCosts(
  propertyId: string,
  lens: OwnershipCostCurrentLens,
) {
  const response = await api.post<OwnershipCostResponse>(
    endpoint(propertyId, lens, '/recalculate'),
    {},
  );
  return response.data.ownershipCosts;
}
