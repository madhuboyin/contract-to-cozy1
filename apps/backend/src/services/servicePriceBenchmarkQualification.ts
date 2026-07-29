import { ServicePriceBenchmarkRecord } from './servicePriceRadar.types';

export const SERVICE_PRICE_BENCHMARK_HEALTH_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const SERVICE_PRICE_BENCHMARK_MIN_SAMPLE_SIZE = 5;

export type ServicePriceBenchmarkQualification = {
  qualified: boolean;
  reasons: string[];
};

function normalizeScopeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function buildServicePriceBenchmarkScopeKey(
  serviceCategory: string,
  serviceSubcategory?: string | null,
): string {
  return `${normalizeScopeToken(serviceCategory)}:${serviceSubcategory
    ? normalizeScopeToken(serviceSubcategory)
    : 'general'}`;
}

function validDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function qualifyServicePriceBenchmark(
  benchmark: ServicePriceBenchmarkRecord,
  evaluatedAt = new Date(),
): ServicePriceBenchmarkQualification {
  const reasons: string[] = [];
  const now = evaluatedAt.getTime();

  if (!benchmark.sourceIsActive) reasons.push('SOURCE_INACTIVE');
  if (benchmark.sourceRightsStatus !== 'APPROVED') reasons.push('SOURCE_RIGHTS_NOT_APPROVED');
  if (benchmark.sourceReviewStatus !== 'APPROVED') reasons.push('SOURCE_REVIEW_NOT_APPROVED');
  if (benchmark.sourceHealthStatus !== 'HEALTHY') reasons.push('SOURCE_UNHEALTHY');
  if (
    !validDate(benchmark.sourceHealthCheckedAt)
    || now - benchmark.sourceHealthCheckedAt.getTime() > SERVICE_PRICE_BENCHMARK_HEALTH_MAX_AGE_MS
    || benchmark.sourceHealthCheckedAt.getTime() > now + 5 * 60 * 1000
  ) {
    reasons.push('SOURCE_HEALTH_STALE');
  }

  if (benchmark.importRunStatus !== 'VALIDATED') reasons.push('IMPORT_NOT_VALIDATED');
  if (!hasText(benchmark.importChecksumSha256)) reasons.push('IMPORT_CHECKSUM_MISSING');
  if (benchmark.releaseStatus !== 'ACTIVE') reasons.push('RELEASE_NOT_ACTIVE');
  if (benchmark.releaseQualityStatus !== 'PASSED') reasons.push('RELEASE_QUALITY_NOT_PASSED');
  if (!validDate(benchmark.reviewedAt)) reasons.push('RELEASE_NOT_REVIEWED');
  if (!validDate(benchmark.activatedAt)) reasons.push('RELEASE_NOT_ACTIVATED');

  if (
    !validDate(benchmark.observationStart)
    || !validDate(benchmark.observationEnd)
    || benchmark.observationEnd < benchmark.observationStart
    || benchmark.observationEnd.getTime() > now
  ) {
    reasons.push('OBSERVATION_PERIOD_INVALID');
  }
  if (
    !validDate(benchmark.retrievedAt)
    || benchmark.retrievedAt.getTime() > now
  ) {
    reasons.push('RETRIEVAL_DATE_INVALID');
  }
  if (
    !validDate(benchmark.effectiveAt)
    || !validDate(benchmark.expiresAt)
    || benchmark.effectiveAt.getTime() > now
    || benchmark.expiresAt.getTime() <= now
  ) {
    reasons.push('RELEASE_NOT_CURRENT');
  }

  if (
    !hasText(benchmark.sourceKey)
    || !hasText(benchmark.sourceName)
    || !hasText(benchmark.sourceUrl)
    || !validHttpUrl(benchmark.sourceUrl)
  ) {
    reasons.push('SOURCE_PROVENANCE_INCOMPLETE');
  }
  if (!hasText(benchmark.licenseSummary)) reasons.push('LICENSE_SUMMARY_MISSING');
  if (!hasText(benchmark.releaseId) || !hasText(benchmark.releaseVersion)) {
    reasons.push('RELEASE_PROVENANCE_INCOMPLETE');
  }
  if (!hasText(benchmark.methodologySummary)) reasons.push('METHODOLOGY_MISSING');
  if (!hasText(benchmark.normalizedScopeKey) || !hasText(benchmark.unit)) {
    reasons.push('SCOPE_NORMALIZATION_INCOMPLETE');
  } else if (
    benchmark.normalizedScopeKey
    !== buildServicePriceBenchmarkScopeKey(
      benchmark.serviceCategory,
      benchmark.serviceSubcategory,
    )
  ) {
    reasons.push('SCOPE_NORMALIZATION_INVALID');
  }
  if (benchmark.currency !== 'USD') reasons.push('UNSUPPORTED_BENCHMARK_CURRENCY');
  if (benchmark.sampleSize < SERVICE_PRICE_BENCHMARK_MIN_SAMPLE_SIZE) {
    reasons.push('SAMPLE_TOO_SMALL');
  }
  if (
    !Number.isFinite(benchmark.baseLow)
    || !Number.isFinite(benchmark.baseHigh)
    || benchmark.baseLow <= 0
    || benchmark.baseHigh <= benchmark.baseLow
    || (
      benchmark.baseMedian !== null
      && (benchmark.baseMedian < benchmark.baseLow || benchmark.baseMedian > benchmark.baseHigh)
    )
  ) {
    reasons.push('PRICE_DISTRIBUTION_INVALID');
  }

  return {
    qualified: reasons.length === 0,
    reasons,
  };
}
