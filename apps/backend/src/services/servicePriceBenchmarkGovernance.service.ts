import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  buildServicePriceBenchmarkScopeKey,
  SERVICE_PRICE_BENCHMARK_HEALTH_MAX_AGE_MS,
  SERVICE_PRICE_BENCHMARK_MIN_SAMPLE_SIZE,
} from './servicePriceBenchmarkQualification';
import {
  ServiceBenchmarkRegionTypeValue,
  ServiceCategoryValue,
} from './servicePriceRadar.types';

const prismaAny = prisma as any;

type BenchmarkObservationInput = {
  serviceCategory: ServiceCategoryValue;
  serviceSubcategory?: string | null;
  normalizedScopeKey: string;
  regionType: ServiceBenchmarkRegionTypeValue;
  regionKey: string;
  homeType?: string | null;
  sizeBand?: string | null;
  unit: string;
  quantityLow?: number | null;
  quantityHigh?: number | null;
  currency: 'USD';
  baseLow: number;
  baseHigh: number;
  baseMedian?: number | null;
  percentileLow?: number | null;
  percentileHigh?: number | null;
  sampleSize: number;
  laborFactor?: number | null;
  materialFactor?: number | null;
  complexityFactors?: Record<string, unknown> | null;
  observationNotes?: string | null;
};

export type IngestServicePriceBenchmarkReleaseInput = {
  source: {
    sourceKey: string;
    name: string;
    ownerName: string;
    sourceUrl: string;
    licenseSummary: string;
    rightsApproved: true;
    domainReviewApproved: true;
  };
  importRun: {
    externalRunKey: string;
    sourceVersion: string;
    checksumSha256: string;
  };
  release: {
    version: string;
    observationStart: string;
    observationEnd: string;
    publishedAt?: string | null;
    retrievedAt: string;
    effectiveAt: string;
    expiresAt: string;
    geographyDefinition: Record<string, unknown>;
    methodologySummary: string;
    cohortDefinition: Record<string, unknown>;
    percentileDefinition: Record<string, unknown>;
    benchmarks: BenchmarkObservationInput[];
  };
};

function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new APIError(`${field} is required`, 400, 'INVALID_BENCHMARK_RELEASE');
  return trimmed;
}

function parsedDate(value: string, field: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new APIError(`${field} must be a valid timestamp`, 400, 'INVALID_BENCHMARK_RELEASE');
  }
  return date;
}

function requiredHttpUrl(value: string, field: string): string {
  const text = requiredText(value, field);
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol');
    return url.toString();
  } catch {
    throw new APIError(`${field} must be an HTTP(S) URL`, 400, 'INVALID_BENCHMARK_SOURCE_URL');
  }
}

function normalizeRegionKey(
  regionType: ServiceBenchmarkRegionTypeValue,
  value: string,
): string {
  const raw = requiredText(value, 'regionKey');
  if (regionType === 'ZIP_PREFIX') {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 3) {
      throw new APIError('ZIP_PREFIX regionKey must contain exactly three digits', 400, 'INVALID_BENCHMARK_REGION');
    }
    return digits;
  }
  const normalized = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (regionType === 'STATE' && !/^[A-Z]{2}$/.test(normalized)) {
    throw new APIError('STATE regionKey must be a two-letter state code', 400, 'INVALID_BENCHMARK_REGION');
  }
  if (regionType === 'COUNTRY' && normalized !== 'US' && normalized !== 'USA') {
    throw new APIError('Only US country benchmarks are currently supported', 400, 'INVALID_BENCHMARK_REGION');
  }
  return normalized;
}

function validateBenchmark(observation: BenchmarkObservationInput): void {
  const expectedScopeKey = buildServicePriceBenchmarkScopeKey(
    observation.serviceCategory,
    observation.serviceSubcategory,
  );
  if (observation.normalizedScopeKey.trim().toLowerCase() !== expectedScopeKey) {
    throw new APIError(
      `normalizedScopeKey must equal ${expectedScopeKey}`,
      400,
      'INVALID_BENCHMARK_SCOPE_KEY',
    );
  }
  normalizeRegionKey(observation.regionType, observation.regionKey);
  requiredText(observation.unit, 'unit');
  if (observation.currency !== 'USD') {
    throw new APIError('Only USD benchmark releases are currently supported', 400, 'UNSUPPORTED_BENCHMARK_CURRENCY');
  }
  if (
    !Number.isFinite(observation.baseLow)
    || !Number.isFinite(observation.baseHigh)
    || observation.baseLow <= 0
    || observation.baseHigh <= observation.baseLow
    || (
      observation.baseMedian != null
      && (
        !Number.isFinite(observation.baseMedian)
        || observation.baseMedian < observation.baseLow
        || observation.baseMedian > observation.baseHigh
      )
    )
  ) {
    throw new APIError('Benchmark price distribution is invalid', 400, 'INVALID_BENCHMARK_DISTRIBUTION');
  }
  if (!Number.isInteger(observation.sampleSize) || observation.sampleSize < SERVICE_PRICE_BENCHMARK_MIN_SAMPLE_SIZE) {
    throw new APIError(
      `Benchmark sampleSize must be at least ${SERVICE_PRICE_BENCHMARK_MIN_SAMPLE_SIZE}`,
      400,
      'BENCHMARK_SAMPLE_TOO_SMALL',
    );
  }
  if (
    observation.quantityLow != null
    && observation.quantityHigh != null
    && observation.quantityHigh < observation.quantityLow
  ) {
    throw new APIError('Benchmark quantity range is invalid', 400, 'INVALID_BENCHMARK_QUANTITY');
  }
}

export async function ingestServicePriceBenchmarkRelease(
  userId: string,
  input: IngestServicePriceBenchmarkReleaseInput,
) {
  const observationStart = parsedDate(input.release.observationStart, 'observationStart');
  const observationEnd = parsedDate(input.release.observationEnd, 'observationEnd');
  const retrievedAt = parsedDate(input.release.retrievedAt, 'retrievedAt');
  const effectiveAt = parsedDate(input.release.effectiveAt, 'effectiveAt');
  const expiresAt = parsedDate(input.release.expiresAt, 'expiresAt');
  const publishedAt = input.release.publishedAt
    ? parsedDate(input.release.publishedAt, 'publishedAt')
    : null;

  if (
    observationEnd < observationStart
    || retrievedAt < observationEnd
    || expiresAt <= effectiveAt
    || expiresAt <= retrievedAt
  ) {
    throw new APIError('Benchmark release dates are inconsistent', 400, 'INVALID_BENCHMARK_DATES');
  }
  if (!/^[a-f0-9]{64}$/i.test(input.importRun.checksumSha256)) {
    throw new APIError('checksumSha256 must be a SHA-256 hex digest', 400, 'INVALID_BENCHMARK_CHECKSUM');
  }
  if (!input.release.benchmarks.length) {
    throw new APIError('A benchmark release must contain observations', 400, 'EMPTY_BENCHMARK_RELEASE');
  }
  input.release.benchmarks.forEach(validateBenchmark);

  return prisma.$transaction(async (tx) => {
    const db = tx as any;
    const source = await db.servicePriceBenchmarkSource.upsert({
      where: { sourceKey: requiredText(input.source.sourceKey, 'sourceKey') },
      create: {
        sourceKey: input.source.sourceKey.trim(),
        name: requiredText(input.source.name, 'source.name'),
        ownerName: requiredText(input.source.ownerName, 'source.ownerName'),
        sourceUrl: requiredHttpUrl(input.source.sourceUrl, 'source.sourceUrl'),
        licenseSummary: requiredText(input.source.licenseSummary, 'source.licenseSummary'),
        rightsStatus: 'APPROVED',
        reviewStatus: 'APPROVED',
        approvedByUserId: userId,
        approvedAt: new Date(),
        isActive: false,
      },
      update: {
        name: requiredText(input.source.name, 'source.name'),
        ownerName: requiredText(input.source.ownerName, 'source.ownerName'),
        sourceUrl: requiredHttpUrl(input.source.sourceUrl, 'source.sourceUrl'),
        licenseSummary: requiredText(input.source.licenseSummary, 'source.licenseSummary'),
        rightsStatus: 'APPROVED',
        reviewStatus: 'APPROVED',
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });

    const importRun = await db.servicePriceBenchmarkImportRun.create({
      data: {
        sourceId: source.id,
        externalRunKey: requiredText(input.importRun.externalRunKey, 'externalRunKey'),
        sourceVersion: requiredText(input.importRun.sourceVersion, 'sourceVersion'),
        checksumSha256: input.importRun.checksumSha256.toLowerCase(),
        requestedByUserId: userId,
        status: 'VALIDATED',
        startedAt: new Date(),
        completedAt: new Date(),
        rowCount: input.release.benchmarks.length,
        acceptedRowCount: input.release.benchmarks.length,
        rejectedRowCount: 0,
        validationJson: {
          minimumSampleSize: SERVICE_PRICE_BENCHMARK_MIN_SAMPLE_SIZE,
          currency: 'USD',
          dateContractValidated: true,
        },
      },
    });

    const release = await db.servicePriceBenchmarkRelease.create({
      data: {
        sourceId: source.id,
        importRunId: importRun.id,
        version: requiredText(input.release.version, 'release.version'),
        status: 'IN_REVIEW',
        qualityStatus: 'PASSED',
        observationStart,
        observationEnd,
        publishedAt,
        retrievedAt,
        effectiveAt,
        expiresAt,
        geographyDefinitionJson: input.release.geographyDefinition as Prisma.InputJsonValue,
        methodologySummary: requiredText(input.release.methodologySummary, 'methodologySummary'),
        cohortDefinitionJson: input.release.cohortDefinition as Prisma.InputJsonValue,
        percentileDefinitionJson: input.release.percentileDefinition as Prisma.InputJsonValue,
        benchmarks: {
          create: input.release.benchmarks.map((observation) => ({
            serviceCategory: observation.serviceCategory,
            serviceSubcategory: observation.serviceSubcategory?.trim() || null,
            normalizedScopeKey: buildServicePriceBenchmarkScopeKey(
              observation.serviceCategory,
              observation.serviceSubcategory,
            ),
            regionType: observation.regionType,
            regionKey: normalizeRegionKey(observation.regionType, observation.regionKey),
            homeType: observation.homeType?.trim() || null,
            sizeBand: observation.sizeBand?.trim() || null,
            unit: observation.unit.trim().toUpperCase(),
            quantityLow: observation.quantityLow ?? null,
            quantityHigh: observation.quantityHigh ?? null,
            currency: observation.currency,
            baseLow: observation.baseLow,
            baseHigh: observation.baseHigh,
            baseMedian: observation.baseMedian ?? null,
            percentileLow: observation.percentileLow ?? null,
            percentileHigh: observation.percentileHigh ?? null,
            sampleSize: observation.sampleSize,
            laborFactor: observation.laborFactor ?? null,
            materialFactor: observation.materialFactor ?? null,
            complexityFactorJson: observation.complexityFactors as Prisma.InputJsonValue,
            observationNotes: observation.observationNotes?.trim() || null,
          })),
        },
      },
      include: { benchmarks: true },
    });
    await db.servicePriceBenchmarkSourceHealth.upsert({
      where: { sourceId: source.id },
      create: {
        sourceId: source.id,
        status: 'UNKNOWN',
        checkedAt: new Date(0),
        lastImportAt: new Date(),
        consecutiveFailures: 0,
      },
      update: {
        lastImportAt: new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        userId,
        action: 'service_price_benchmark_release_ingested',
        entityType: 'ServicePriceBenchmarkRelease',
        entityId: release.id,
        newValues: {
          sourceId: source.id,
          importRunId: importRun.id,
          version: release.version,
          observationCount: release.benchmarks.length,
          status: release.status,
          qualityStatus: release.qualityStatus,
        },
      },
    });
    return release;
  });
}

export async function reviewServicePriceBenchmarkRelease(
  userId: string,
  releaseId: string,
  decision: 'APPROVE' | 'REJECT',
  reviewNotes: string,
) {
  const release = await prismaAny.servicePriceBenchmarkRelease.findUnique({ where: { id: releaseId } });
  if (!release) throw new APIError('Benchmark release not found', 404, 'BENCHMARK_RELEASE_NOT_FOUND');
  if (release.status !== 'IN_REVIEW') {
    throw new APIError('Only in-review releases can be reviewed', 409, 'INVALID_BENCHMARK_RELEASE_STATE');
  }
  const reviewed = await prismaAny.servicePriceBenchmarkRelease.update({
    where: { id: releaseId },
    data: {
      status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      qualityStatus: decision === 'APPROVE' ? 'PASSED' : 'QUARANTINED',
      reviewNotes: requiredText(reviewNotes, 'reviewNotes'),
      reviewedByUserId: userId,
      reviewedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: {
      userId,
      action: decision === 'APPROVE'
        ? 'service_price_benchmark_release_approved'
        : 'service_price_benchmark_release_rejected',
      entityType: 'ServicePriceBenchmarkRelease',
      entityId: releaseId,
      newValues: {
        decision,
        reviewNotes: requiredText(reviewNotes, 'reviewNotes'),
      },
    },
  });
  return reviewed;
}

export async function recordServicePriceBenchmarkSourceHealth(
  sourceId: string,
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY',
  details: Record<string, unknown>,
) {
  const now = new Date();
  const previous = await prismaAny.servicePriceBenchmarkSourceHealth.findUnique({ where: { sourceId }, select: { status: true } });
  const updated = await prismaAny.servicePriceBenchmarkSourceHealth.upsert({
    where: { sourceId },
    create: {
      sourceId,
      status,
      checkedAt: now,
      lastHealthyAt: status === 'HEALTHY' ? now : null,
      consecutiveFailures: status === 'HEALTHY' ? 0 : 1,
      detailsJson: details,
    },
    update: {
      status,
      checkedAt: now,
      ...(status === 'HEALTHY'
        ? { lastHealthyAt: now, consecutiveFailures: 0 }
        : { consecutiveFailures: { increment: 1 } }),
      detailsJson: details,
    },
  });
  if (previous?.status !== status) {
    const [{ allPropertyIds, emitSourceHealthChangesForProperties }, source] = await Promise.all([
      import('./intelligence/sourceHealthImpact.service'),
      prismaAny.servicePriceBenchmarkSource.findUnique({ where: { id: sourceId }, select: { sourceKey: true } }),
    ]);
    await emitSourceHealthChangesForProperties({
      propertyIds: await allPropertyIds(),
      sourceType: 'SERVICE_PRICE_BENCHMARK_SOURCE',
      sourceEntityId: source?.sourceKey ?? sourceId,
      sourceRevision: `${status}:${now.toISOString()}`,
      health: status === 'HEALTHY' ? 'CURRENT' : status === 'DEGRADED' ? 'DEGRADED' : 'UNAVAILABLE',
    });
  }
  return updated;
}

async function assertReleaseActivatable(
  releaseId: string,
  now: Date,
  allowedStatuses: string[] = ['APPROVED'],
) {
  const release = await prismaAny.servicePriceBenchmarkRelease.findUnique({
    where: { id: releaseId },
    include: { source: { include: { health: true } }, importRun: true },
  });
  if (!release) throw new APIError('Benchmark release not found', 404, 'BENCHMARK_RELEASE_NOT_FOUND');
  const healthAge = release.source.health?.checkedAt
    ? now.getTime() - release.source.health.checkedAt.getTime()
    : Number.POSITIVE_INFINITY;
  if (
    !allowedStatuses.includes(release.status)
    || release.qualityStatus !== 'PASSED'
    || release.importRun.status !== 'VALIDATED'
    || release.source.rightsStatus !== 'APPROVED'
    || release.source.reviewStatus !== 'APPROVED'
    || release.source.health?.status !== 'HEALTHY'
    || healthAge > SERVICE_PRICE_BENCHMARK_HEALTH_MAX_AGE_MS
    || release.effectiveAt > now
    || release.expiresAt <= now
  ) {
    throw new APIError('Benchmark release is not eligible for activation', 409, 'BENCHMARK_RELEASE_NOT_ELIGIBLE');
  }
  return release;
}

export async function activateServicePriceBenchmarkRelease(userId: string, releaseId: string) {
  const now = new Date();
  const release = await assertReleaseActivatable(releaseId, now);
  return prisma.$transaction(async (tx) => {
    const db = tx as any;
    await db.servicePriceBenchmarkRelease.updateMany({
      where: { sourceId: release.sourceId, status: 'ACTIVE', id: { not: releaseId } },
      data: { status: 'DEACTIVATED', deactivatedAt: now },
    });
    await db.servicePriceBenchmarkSource.update({
      where: { id: release.sourceId },
      data: { isActive: true },
    });
    const activated = await db.servicePriceBenchmarkRelease.update({
      where: { id: releaseId },
      data: {
        status: 'ACTIVE',
        activatedByUserId: userId,
        activatedAt: now,
        deactivatedAt: null,
      },
    });
    await db.auditLog.create({
      data: {
        userId,
        action: 'service_price_benchmark_release_activated',
        entityType: 'ServicePriceBenchmarkRelease',
        entityId: releaseId,
        newValues: { sourceId: release.sourceId, version: release.version },
      },
    });
    return activated;
  });
}

export async function deactivateServicePriceBenchmarkRelease(
  userId: string,
  releaseId: string,
  reason: string,
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const db = tx as any;
    const release = await db.servicePriceBenchmarkRelease.update({
      where: { id: releaseId },
      data: { status: 'DEACTIVATED', deactivatedAt: now },
    });
    const activeCount = await db.servicePriceBenchmarkRelease.count({
      where: { sourceId: release.sourceId, status: 'ACTIVE' },
    });
    if (activeCount === 0) {
      await db.servicePriceBenchmarkSource.update({
        where: { id: release.sourceId },
        data: { isActive: false },
      });
    }
    await db.auditLog.create({
      data: {
        userId,
        action: 'service_price_benchmark_release_deactivated',
        entityType: 'ServicePriceBenchmarkRelease',
        entityId: releaseId,
        newValues: { reason: requiredText(reason, 'reason') },
      },
    });
    return release;
  });
}

export async function rollbackServicePriceBenchmarkRelease(
  userId: string,
  activeReleaseId: string,
  restoreReleaseId: string,
  reason: string,
) {
  const now = new Date();
  const restore = await assertReleaseActivatable(
    restoreReleaseId,
    now,
    ['APPROVED', 'DEACTIVATED', 'ROLLED_BACK'],
  );
  const active = await prismaAny.servicePriceBenchmarkRelease.findUnique({
    where: { id: activeReleaseId },
  });
  if (!active || active.status !== 'ACTIVE' || active.sourceId !== restore.sourceId) {
    throw new APIError('Rollback releases must be active and belong to the same source', 409, 'INVALID_BENCHMARK_ROLLBACK');
  }

  return prisma.$transaction(async (tx) => {
    const db = tx as any;
    await db.servicePriceBenchmarkRelease.update({
      where: { id: activeReleaseId },
      data: { status: 'ROLLED_BACK', deactivatedAt: now },
    });
    const restored = await db.servicePriceBenchmarkRelease.update({
      where: { id: restoreReleaseId },
      data: {
        status: 'ACTIVE',
        activatedByUserId: userId,
        activatedAt: now,
        deactivatedAt: null,
      },
    });
    await db.servicePriceBenchmarkSource.update({
      where: { id: restore.sourceId },
      data: { isActive: true },
    });
    await db.auditLog.create({
      data: {
        userId,
        action: 'service_price_benchmark_release_rolled_back',
        entityType: 'ServicePriceBenchmarkRelease',
        entityId: activeReleaseId,
        newValues: {
          restoreReleaseId,
          sourceId: restore.sourceId,
          reason: requiredText(reason, 'reason'),
        },
      },
    });
    return restored;
  });
}
