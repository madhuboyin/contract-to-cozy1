export type CoverageHealth = {
  state: 'CURRENT' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  comprehensive: false;
  checkedThrough: Date | null;
  limitations: string[];
  reasonCodes: string[];
};

export function deriveCoverageHealth(input: {
  coverage: {
    status: string;
    checkedThrough: Date | null;
    validFrom: Date | null;
    validThrough: Date | null;
    coverageLimitations: string | null;
  } | null;
  maxStalenessMinutes: number;
  now?: Date;
}): CoverageHealth {
  const now = input.now ?? new Date();
  const coverage = input.coverage;
  if (!coverage) {
    return {
      state: 'NOT_CONFIGURED',
      comprehensive: false,
      checkedThrough: null,
      limitations: ['No reviewed source coverage is configured for this geography.'],
      reasonCodes: ['COVERAGE_NOT_CONFIGURED'],
    };
  }

  const reasonCodes: string[] = [];
  if (coverage.status === 'UNAVAILABLE') reasonCodes.push('SOURCE_UNAVAILABLE');
  if (coverage.status === 'DEGRADED') reasonCodes.push('SOURCE_DEGRADED');
  if (coverage.validFrom && coverage.validFrom > now) reasonCodes.push('COVERAGE_NOT_YET_VALID');
  if (coverage.validThrough && coverage.validThrough < now) reasonCodes.push('COVERAGE_EXPIRED');
  if (!coverage.checkedThrough) reasonCodes.push('NEVER_CHECKED');
  if (
    coverage.checkedThrough
    && now.getTime() - coverage.checkedThrough.getTime()
      > input.maxStalenessMinutes * 60_000
  ) {
    reasonCodes.push('CHECKED_THROUGH_STALE');
  }

  const state: CoverageHealth['state'] =
    reasonCodes.includes('SOURCE_UNAVAILABLE') ? 'UNAVAILABLE'
      : reasonCodes.some((code) =>
        ['COVERAGE_EXPIRED', 'NEVER_CHECKED', 'CHECKED_THROUGH_STALE'].includes(code))
        ? 'STALE'
        : reasonCodes.length > 0 ? 'DEGRADED'
          : 'CURRENT';

  return {
    state,
    comprehensive: false,
    checkedThrough: coverage.checkedThrough,
    limitations: [
      ...(coverage.coverageLimitations ? [coverage.coverageLimitations] : []),
      ...(state === 'CURRENT'
        ? ['Coverage describes the reviewed provider scope only; it is not a universal all-clear.']
        : []),
    ],
    reasonCodes,
  };
}
