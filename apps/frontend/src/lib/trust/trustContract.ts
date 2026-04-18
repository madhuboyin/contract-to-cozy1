export type TrustConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TrustContract {
  confidenceLabel: string;
  freshnessLabel: string;
  sourceLabel: string;
  rationale?: string | null;
  confidenceBand?: TrustConfidenceBand | null;
  sourceUpdatedAt?: string | null;
  sourceKind?: string | null;
}

export function mergeTrustContract(
  base: TrustContract,
  overrides?: Partial<TrustContract>,
): TrustContract {
  if (!overrides) {
    return base;
  }

  return {
    ...base,
    ...overrides,
  };
}
