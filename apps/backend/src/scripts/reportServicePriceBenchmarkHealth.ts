import { prisma } from '../lib/prisma';
import { SERVICE_PRICE_BENCHMARK_HEALTH_MAX_AGE_MS } from '../services/servicePriceBenchmarkQualification';

async function main() {
  const now = new Date();
  const sources = await prisma.servicePriceBenchmarkSource.findMany({
    orderBy: { sourceKey: 'asc' },
    include: {
      health: true,
      releases: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          version: true,
          status: true,
          qualityStatus: true,
          observationEnd: true,
          effectiveAt: true,
          expiresAt: true,
          activatedAt: true,
          _count: { select: { benchmarks: true } },
        },
      },
      _count: {
        select: {
          importRuns: true,
          releases: true,
        },
      },
    },
  });

  const report = sources.map((source) => {
    const healthAgeMs = source.health
      ? now.getTime() - source.health.checkedAt.getTime()
      : null;
    const healthFresh = healthAgeMs !== null
      && healthAgeMs >= 0
      && healthAgeMs <= SERVICE_PRICE_BENCHMARK_HEALTH_MAX_AGE_MS;
    const activeRelease = source.releases.find((release) => release.status === 'ACTIVE') ?? null;
    const eligible = Boolean(
      source.isActive
      && source.rightsStatus === 'APPROVED'
      && source.reviewStatus === 'APPROVED'
      && source.health?.status === 'HEALTHY'
      && healthFresh
      && activeRelease
      && activeRelease.qualityStatus === 'PASSED'
      && activeRelease.effectiveAt <= now
      && activeRelease.expiresAt > now,
    );

    return {
      sourceKey: source.sourceKey,
      sourceName: source.name,
      eligible,
      source: {
        isActive: source.isActive,
        rightsStatus: source.rightsStatus,
        reviewStatus: source.reviewStatus,
      },
      health: source.health
        ? {
            status: source.health.status,
            checkedAt: source.health.checkedAt.toISOString(),
            fresh: healthFresh,
            consecutiveFailures: source.health.consecutiveFailures,
          }
        : null,
      activeRelease: activeRelease
        ? {
            id: activeRelease.id,
            version: activeRelease.version,
            qualityStatus: activeRelease.qualityStatus,
            observationEnd: activeRelease.observationEnd.toISOString(),
            effectiveAt: activeRelease.effectiveAt.toISOString(),
            expiresAt: activeRelease.expiresAt.toISOString(),
            benchmarkCount: activeRelease._count.benchmarks,
          }
        : null,
      counts: source._count,
      recentReleases: source.releases.map((release) => ({
        id: release.id,
        version: release.version,
        status: release.status,
        qualityStatus: release.qualityStatus,
        expiresAt: release.expiresAt.toISOString(),
        benchmarkCount: release._count.benchmarks,
      })),
    };
  });

  process.stdout.write(`${JSON.stringify({
    generatedAt: now.toISOString(),
    healthMaxAgeHours: SERVICE_PRICE_BENCHMARK_HEALTH_MAX_AGE_MS / (60 * 60 * 1000),
    sourceCount: report.length,
    eligibleSourceCount: report.filter((source) => source.eligible).length,
    sources: report,
  }, null, 2)}\n`);
}

main()
  .catch((error) => {
    console.error('[service-price-benchmark-health] report failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
