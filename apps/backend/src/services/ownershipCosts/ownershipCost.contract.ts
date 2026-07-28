export const OWNERSHIP_COST_DEFINITION_VERSION = 'ownership-cost-v1';

export const OWNERSHIP_COST_LENSES = [
  'OPERATING_EXPENSE',
  'CASH_OUTFLOW',
  'ECONOMIC_COST',
  'CAPITAL_EXPENDITURE',
  'RESERVE_PLAN',
] as const;

export type OwnershipCostLens = typeof OWNERSHIP_COST_LENSES[number];

export const OWNERSHIP_COST_CATEGORIES = [
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
] as const;

export type OwnershipCostCategory = typeof OWNERSHIP_COST_CATEGORIES[number];

export const OWNERSHIP_COST_EVIDENCE_STATUSES = [
  'OBSERVED',
  'CONFIRMED',
  'HOMEOWNER_REPORTED',
  'EXTRACTED',
  'BENCHMARK',
  'ESTIMATED',
  'FORECAST',
] as const;

export type OwnershipCostEvidenceStatus =
  typeof OWNERSHIP_COST_EVIDENCE_STATUSES[number];

export const OWNERSHIP_COST_VERIFICATION_STATUSES = [
  'VERIFIED',
  'PENDING_CONFIRMATION',
  'UNVERIFIED',
] as const;

export type OwnershipCostVerificationStatus =
  typeof OWNERSHIP_COST_VERIFICATION_STATUSES[number];

export const OWNERSHIP_COST_FRESHNESS_STATUSES = [
  'CURRENT',
  'AGING',
  'STALE',
  'UNKNOWN',
] as const;

export type OwnershipCostFreshnessStatus =
  typeof OWNERSHIP_COST_FRESHNESS_STATUSES[number];

export const OWNERSHIP_COST_COVERAGE_STATUSES = [
  'CREDIBLE',
  'PARTIAL',
  'ESTIMATE_ONLY',
  'NOT_READY',
] as const;

export type OwnershipCostCoverageStatus =
  typeof OWNERSHIP_COST_COVERAGE_STATUSES[number];

export const OWNERSHIP_COST_TEMPORAL_KINDS = [
  'CURRENT_PERIOD',
  'OBSERVED_PAST_PERIOD',
  'FORECAST_PERIOD',
  'SCENARIO_PERIOD',
] as const;

export type OwnershipCostTemporalKind =
  typeof OWNERSHIP_COST_TEMPORAL_KINDS[number];

export const OWNERSHIP_COST_APPLICABILITY = [
  'APPLICABLE',
  'NOT_APPLICABLE',
  'UNKNOWN',
] as const;

export type OwnershipCostApplicability =
  typeof OWNERSHIP_COST_APPLICABILITY[number];

export const OWNERSHIP_COST_RECURRENCES = [
  'ONE_TIME',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
  'IRREGULAR',
] as const;

export type OwnershipCostRecurrence =
  typeof OWNERSHIP_COST_RECURRENCES[number];

export const OWNERSHIP_COST_SOURCE_DOMAINS = [
  'PROPERTY_TAX',
  'COVERAGE',
  'FINANCING',
  'EXPENSE',
  'UTILITY',
  'HOA',
  'MAINTENANCE',
  'RECURRING_SERVICE',
  'PROJECT',
  'RESERVE',
  'HOMEOWNER',
  'SYSTEM_ESTIMATE',
] as const;

export type OwnershipCostSourceDomain =
  typeof OWNERSHIP_COST_SOURCE_DOMAINS[number];

export const OWNERSHIP_COST_VIEW_KEYS = [
  'current',
  'changes',
  'forecast',
  'variability',
] as const;

export type OwnershipCostViewKey = typeof OWNERSHIP_COST_VIEW_KEYS[number];

export type OwnershipCostLineContract = {
  category: OwnershipCostCategory;
  subcategory: string | null;
  amountCents: number | null;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  temporalKind: OwnershipCostTemporalKind;
  applicability: OwnershipCostApplicability;
  recurrence: OwnershipCostRecurrence;
  evidenceStatus: OwnershipCostEvidenceStatus | null;
  verificationStatus: typeof OWNERSHIP_COST_VERIFICATION_STATUSES[number];
  freshnessStatus: typeof OWNERSHIP_COST_FRESHNESS_STATUSES[number];
  sourceType: string | null;
  sourceDomain: OwnershipCostSourceDomain;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  assumptions: string[];
  missingDependencies: string[];
  includedByLens: Partial<Record<OwnershipCostLens, boolean>>;
};

export const OWNERSHIP_COST_INVARIANTS = [
  'Every total names its cost lens.',
  'Every included line has a period and evidence status.',
  'Missing is not zero.',
  'Observed and estimated amounts remain distinguishable after aggregation.',
  'Past periods are not generated from present estimates.',
  'Forecast periods begin after the base period.',
  'Scenario overrides never mutate canonical facts.',
  'Mortgage principal is not labeled an economic expense.',
  'Capital spend and reserve contributions remain separate from recurring operating cost.',
  'Compared windows use stable category definitions.',
  'Material explanations trace to evidence or are labeled as hypotheses.',
  'Recommendations identify the controllable action and canonical owner.',
] as const;
