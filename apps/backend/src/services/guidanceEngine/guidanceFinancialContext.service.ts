type CoverageImpact = 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN';

export type GuidanceFinancialContext = {
  financialImpactScore: number;
  fundingGapFlag: boolean;
  costOfDelay: number;
  coverageImpact: CoverageImpact;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    try {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function detectCoverageImpact(latest: Record<string, unknown>): CoverageImpact {
  const verdictRaw = String(latest.coverageOverallVerdict ?? latest.insuranceVerdict ?? '').toLowerCase();
  if (!verdictRaw) return 'UNKNOWN';
  if (verdictRaw.includes('covered') && !verdictRaw.includes('not')) return 'COVERED';
  if (verdictRaw.includes('partial')) return 'PARTIAL';
  if (verdictRaw.includes('gap') || verdictRaw.includes('not') || verdictRaw.includes('none')) {
    return 'NOT_COVERED';
  }
  return 'UNKNOWN';
}

export class GuidanceFinancialContextService {
  evaluate(input: { journey: any; signal?: any | null }): GuidanceFinancialContext {
    const derived = asRecord(input.journey?.derivedSnapshotJson);
    const latest = asRecord(derived.latest);

    const annualTotalNow = asNumber(latest.annualTotalNow) ?? 0;
    const total5yCost = asNumber(latest.total5yCost) ?? asNumber(latest.total5y) ?? 0;
    const deductibleUsd = asNumber(latest.deductibleUsd) ?? 0;
    const expectedCoverageNetImpactUsd = asNumber(latest.expectedCoverageNetImpactUsd) ?? 0;
    const potentialAnnualSavings =
      asNumber(latest.potentialAnnualSavings) ??
      ((asNumber(latest.potentialMonthlySavings) ?? 0) * 12);

    const costOfDelay =
      asNumber(latest.costOfInactionMaxCents) != null
        ? (asNumber(latest.costOfInactionMaxCents) ?? 0) / 100
        : asNumber(latest.costOfDelay) ?? 0;

    const upcomingCost = Math.max(
      annualTotalNow,
      total5yCost > 0 ? total5yCost / 5 : 0,
      expectedCoverageNetImpactUsd,
      deductibleUsd
    );

    const fundingGapFlag = upcomingCost > 0 && potentialAnnualSavings >= 0 && upcomingCost > potentialAnnualSavings * 1.15;
    const coverageImpact = detectCoverageImpact(latest);

    const exposureBase = Math.max(upcomingCost, deductibleUsd, expectedCoverageNetImpactUsd);
    const exposureWeight = clamp((exposureBase / 20_000) * 40, 0, 40);
    const delayWeight = clamp((costOfDelay / 10_000) * 30, 0, 30);
    const fundingWeight = fundingGapFlag ? 15 : 0;
    const coverageWeight =
      coverageImpact === 'NOT_COVERED' ? 15 : coverageImpact === 'PARTIAL' ? 8 : 0;

    const financialImpactScore = clamp(
      Math.round(exposureWeight + delayWeight + fundingWeight + coverageWeight),
      0,
      100
    );

    return {
      financialImpactScore,
      fundingGapFlag,
      costOfDelay: Math.round(costOfDelay),
      coverageImpact,
    };
  }
}

export const guidanceFinancialContextService = new GuidanceFinancialContextService();
