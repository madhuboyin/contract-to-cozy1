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

export type OwnershipCostObservedChange = {
  id: string | null;
  category: OwnershipCostCategory;
  label: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  priorPeriod: { start: string; end: string };
  currentPeriod: { start: string; end: string };
  priorAnnualCents: number;
  currentAnnualCents: number;
  deltaCents: number;
  deltaPercent: number | null;
  impact: 'RECURRING' | 'ONE_TIME';
  recurringDeltaCents: number | null;
  reason:
    | 'PRICE'
    | 'USAGE'
    | 'SCOPE'
    | 'ASSESSMENT'
    | 'RATE'
    | 'COVERAGE'
    | 'FINANCING'
    | 'ONE_TIME_EVENT'
    | 'UNEXPLAINED';
  explanationStatus: 'SUPPORTED' | 'UNEXPLAINED';
  explanation: string;
  evidence: Array<{
    observationId: string;
    sourceDomain: string;
    sourceEntityType: string | null;
    sourceEntityId: string | null;
    sourceDocumentId: string | null;
    periodStart: string;
    periodEnd: string;
    evidenceStatus: string;
    verificationStatus: string;
  }>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  materiality: {
    material: boolean;
    absoluteThresholdCents: number;
    percentageThreshold: number;
  };
  rankScore: number;
  action: { href: string; label: string; actionable: boolean };
};

export type OwnershipCostChangeReadModel = {
  propertyId: string;
  selectedLens: OwnershipCostCurrentLens;
  comparable: boolean;
  reason: string | null;
  comparison: {
    fromSnapshotId: string;
    toSnapshotId: string;
    priorPeriodStart: string;
    priorPeriodEnd: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  } | null;
  totalRecurringDeltaCents: number;
  totalOneTimeDeltaCents: number;
  changes: OwnershipCostObservedChange[];
  limitations: string[];
};

export type OwnershipCostScenarioOverrides = {
  categoryGrowthRates?: Partial<Record<OwnershipCostCategory, number>>;
  categoryAnnualAdjustmentsCents?: Partial<
    Record<OwnershipCostCategory, number>
  >;
};

export type OwnershipCostForecastRange = {
  lowCents: number;
  baseCents: number;
  highCents: number;
};

export type OwnershipCostForecastReadModel = {
  propertyId: string;
  forecastId: string | null;
  scenario: {
    id: string;
    name: string;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'STALE';
  } | null;
  selectedLens: OwnershipCostCurrentLens;
  forecastKind: 'FORWARD_PLANNING_RANGE';
  nominalDollars: true;
  methodVersion: string;
  categoryDefinitionVersion: string;
  baseSnapshot: {
    id: string;
    inputFingerprint: string;
    periodStart: string;
    periodEnd: string;
    annualCents: number;
  };
  forecastStart: string;
  forecastEnd: string;
  horizonYears: number;
  stale: { isStale: boolean; reason: string | null };
  summary: {
    firstYear: OwnershipCostForecastRange;
    endYear: OwnershipCostForecastRange;
  };
  periods: Array<OwnershipCostForecastRange & {
    year: number;
    periodStart: string;
    periodEnd: string;
  }>;
  drivers: Array<{
    category: OwnershipCostCategory;
    label: string;
    baseAnnualCents: number;
    lowRate: number;
    baseRate: number;
    highRate: number;
    rateSource:
      | 'SOURCE_BACKED'
      | 'SCENARIO_OVERRIDE'
      | 'DEFAULT_ASSUMPTION';
    rateSourceLabel: string;
    annualAdjustmentCents: number;
    knownEvents: Array<{
      year: number;
      deltaCents: number;
      label: string;
      recurring: boolean;
    }>;
    endRangeCents: OwnershipCostForecastRange;
    sensitivityCents: number;
  }>;
  overrides: OwnershipCostScenarioOverrides;
  limitations: string[];
  disclaimer: string;
  calculationFingerprint: string;
};

export type OwnershipCostScenarioReadModel = {
  id: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'STALE';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  isStale: boolean;
  staleReason: string | null;
  forecast: OwnershipCostForecastReadModel;
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

export async function getOwnershipCostChanges(
  propertyId: string,
  lens: OwnershipCostCurrentLens,
) {
  const query = new URLSearchParams({ lens });
  const response = await api.get<{
    ownershipCostChanges: OwnershipCostChangeReadModel;
  }>(
    `/api/properties/${encodeURIComponent(propertyId)}/ownership-costs/changes?${query}`,
  );
  return response.data.ownershipCostChanges;
}

function forecastEndpoint(
  propertyId: string,
  lens: OwnershipCostCurrentLens,
  horizonYears: number,
  suffix = '',
) {
  const query = new URLSearchParams({
    lens,
    horizonYears: String(horizonYears),
  });
  return `/api/properties/${encodeURIComponent(propertyId)}/ownership-costs/forecast${suffix}?${query}`;
}

export async function getOwnershipCostForecast(
  propertyId: string,
  lens: OwnershipCostCurrentLens,
  horizonYears: number,
) {
  const response = await api.get<{
    ownershipCostForecast: OwnershipCostForecastReadModel;
  }>(forecastEndpoint(propertyId, lens, horizonYears));
  return response.data.ownershipCostForecast;
}

export async function recalculateOwnershipCostForecast(
  propertyId: string,
  lens: OwnershipCostCurrentLens,
  horizonYears: number,
) {
  const response = await api.post<{
    ownershipCostForecast: OwnershipCostForecastReadModel;
  }>(forecastEndpoint(propertyId, lens, horizonYears, '/recalculate'), {});
  return response.data.ownershipCostForecast;
}

export async function listOwnershipCostScenarios(
  propertyId: string,
  includeArchived = false,
) {
  const query = new URLSearchParams({
    includeArchived: String(includeArchived),
  });
  const response = await api.get<{
    ownershipCostScenarios: OwnershipCostScenarioReadModel[];
  }>(
    `/api/properties/${encodeURIComponent(propertyId)}/ownership-costs/scenarios?${query}`,
  );
  return response.data.ownershipCostScenarios;
}

export async function createOwnershipCostScenario(
  propertyId: string,
  input: {
    name: string;
    lens: OwnershipCostCurrentLens;
    horizonYears: number;
    overrides: OwnershipCostScenarioOverrides;
  },
) {
  const response = await api.post<{
    ownershipCostScenario: OwnershipCostScenarioReadModel;
  }>(
    `/api/properties/${encodeURIComponent(propertyId)}/ownership-costs/scenarios`,
    input,
  );
  return response.data.ownershipCostScenario;
}

export async function updateOwnershipCostScenario(
  propertyId: string,
  scenarioId: string,
  patch: {
    name?: string;
    status?: 'ACTIVE' | 'ARCHIVED';
    lens?: OwnershipCostCurrentLens;
    horizonYears?: number;
    overrides?: OwnershipCostScenarioOverrides;
  },
) {
  const response = await api.patch<{
    ownershipCostScenario: OwnershipCostScenarioReadModel;
  }>(
    `/api/properties/${encodeURIComponent(propertyId)}/ownership-costs/scenarios/${encodeURIComponent(scenarioId)}`,
    patch,
  );
  return response.data.ownershipCostScenario;
}

export async function deleteOwnershipCostScenario(
  propertyId: string,
  scenarioId: string,
) {
  await api.delete(
    `/api/properties/${encodeURIComponent(propertyId)}/ownership-costs/scenarios/${encodeURIComponent(scenarioId)}`,
  );
}
