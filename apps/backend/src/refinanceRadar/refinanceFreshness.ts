export type RefinanceFreshnessState =
  | 'CURRENT'
  | 'AGING'
  | 'STALE'
  | 'UNKNOWN';

export type RefinanceAlertReadiness =
  | 'READY'
  | 'REVIEW_MORTGAGE_DATA'
  | 'WAITING_FOR_MARKET_DATA';

export const REFINANCE_FRESHNESS_THRESHOLDS = {
  MARKET_CURRENT_DAYS: 10,
  MARKET_STALE_DAYS: 21,
  MORTGAGE_CURRENT_DAYS: 90,
  MORTGAGE_STALE_DAYS: 180,
} as const;

export interface RefinanceFreshnessContract {
  mortgageDataAsOf: string | null;
  mortgageDataFreshness: RefinanceFreshnessState;
  mortgageDataAgeDays: number | null;
  marketDataAsOf: string | null;
  marketDataFreshness: RefinanceFreshnessState;
  marketDataAgeDays: number | null;
  marketDataSource: string | null;
  alertReadiness: RefinanceAlertReadiness;
  freshnessWarnings: string[];
}

function classifyFreshness(
  value: string | null | undefined,
  currentDays: number,
  staleDays: number,
  now: Date,
): { state: RefinanceFreshnessState; ageDays: number | null; asOf: string | null } {
  if (!value) return { state: 'UNKNOWN', ageDays: null, asOf: null };
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    return { state: 'UNKNOWN', ageDays: null, asOf: null };
  }
  const ageDays = Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
  // A date more than one day in the future is not useful freshness evidence.
  if (ageDays < -1) return { state: 'UNKNOWN', ageDays: null, asOf: value };
  if (ageDays <= currentDays) {
    return { state: 'CURRENT', ageDays: Math.max(0, ageDays), asOf: value };
  }
  if (ageDays <= staleDays) {
    return { state: 'AGING', ageDays, asOf: value };
  }
  return { state: 'STALE', ageDays, asOf: value };
}

export function buildRefinanceFreshness(
  input: {
    mortgageDataAsOf?: string | null;
    marketDataAsOf?: string | null;
    marketDataSource?: string | null;
  },
  now = new Date(),
): RefinanceFreshnessContract {
  const mortgage = classifyFreshness(
    input.mortgageDataAsOf,
    REFINANCE_FRESHNESS_THRESHOLDS.MORTGAGE_CURRENT_DAYS,
    REFINANCE_FRESHNESS_THRESHOLDS.MORTGAGE_STALE_DAYS,
    now,
  );
  const market = classifyFreshness(
    input.marketDataAsOf,
    REFINANCE_FRESHNESS_THRESHOLDS.MARKET_CURRENT_DAYS,
    REFINANCE_FRESHNESS_THRESHOLDS.MARKET_STALE_DAYS,
    now,
  );
  const freshnessWarnings: string[] = [];

  if (market.state === 'UNKNOWN') {
    freshnessWarnings.push(
      'Current market-rate freshness cannot be verified. Monitoring will wait for a dated rate snapshot.',
    );
  } else if (market.state === 'AGING') {
    freshnessWarnings.push(
      'The latest market benchmark is older than the normal weekly update window.',
    );
  } else if (market.state === 'STALE') {
    freshnessWarnings.push(
      'The market benchmark is more than three weeks old and should not drive an external alert.',
    );
  }

  if (mortgage.state === 'UNKNOWN') {
    freshnessWarnings.push(
      'Your mortgage balance date is not recorded. Estimates remain available, but confirm the balance before acting.',
    );
  } else if (mortgage.state === 'AGING') {
    freshnessWarnings.push(
      'Your saved mortgage balance is more than three months old; consider confirming it before comparing offers.',
    );
  } else if (mortgage.state === 'STALE') {
    freshnessWarnings.push(
      'Your saved mortgage balance is more than six months old and should be confirmed before relying on an opportunity alert.',
    );
  }

  const alertReadiness: RefinanceAlertReadiness =
    market.state !== 'CURRENT'
      ? 'WAITING_FOR_MARKET_DATA'
      : mortgage.state !== 'CURRENT'
        ? 'REVIEW_MORTGAGE_DATA'
        : 'READY';

  return {
    mortgageDataAsOf: mortgage.asOf,
    mortgageDataFreshness: mortgage.state,
    mortgageDataAgeDays: mortgage.ageDays,
    marketDataAsOf: market.asOf,
    marketDataFreshness: market.state,
    marketDataAgeDays: market.ageDays,
    marketDataSource: input.marketDataSource ?? null,
    alertReadiness,
    freshnessWarnings,
  };
}
