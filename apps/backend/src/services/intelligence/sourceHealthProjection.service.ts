import { prisma } from '../../lib/prisma';

/**
 * Home Intelligence Functional Completeness FRD Phase 7 (HI-SRC-002) — one
 * read-only source-health projection combining the domain-specific health
 * stores (RadarSourceHealth, ServicePriceBenchmarkSourceHealth) that
 * already exist and remain the authoritative record for their own domain.
 * This does not replace either table or their domain-specific staleness
 * logic (e.g. radarAdminOperations.service.ts's freshnessSeconds-based
 * staleness check) — it only normalizes both into one comparable shape for
 * a platform-wide view. A source with no health row yet (never polled)
 * projects as UNKNOWN, not missing.
 */
export const UNIFIED_SOURCE_HEALTH_STATUSES = ['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'STALE', 'DISABLED', 'UNKNOWN'] as const;
export type UnifiedSourceHealthStatus = typeof UNIFIED_SOURCE_HEALTH_STATUSES[number];

export const SOURCE_HEALTH_DOMAINS = ['HOME_EVENT_RADAR', 'SERVICE_PRICE_BENCHMARK'] as const;
export type SourceHealthDomain = typeof SOURCE_HEALTH_DOMAINS[number];

export interface UnifiedSourceHealthEntry {
  domain: SourceHealthDomain;
  sourceKey: string;
  name: string;
  status: UnifiedSourceHealthStatus;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  consecutiveFailures: number;
  message: string | null;
}

const RADAR_STATUS_MAP: Record<string, UnifiedSourceHealthStatus> = {
  healthy: 'HEALTHY',
  degraded: 'DEGRADED',
  failed: 'UNHEALTHY',
  stale: 'STALE',
  disabled: 'DISABLED',
  unknown: 'UNKNOWN',
};

const SERVICE_PRICE_STATUS_MAP: Record<string, UnifiedSourceHealthStatus> = {
  UNKNOWN: 'UNKNOWN',
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNHEALTHY: 'UNHEALTHY',
};

export interface RadarSourceHealthRow {
  key: string;
  name: string;
  health: {
    status: string;
    lastSuccessAt: Date | null;
    lastAttemptAt: Date | null;
    consecutiveFailures: number;
    message: string | null;
  } | null;
}

export interface ServicePriceBenchmarkSourceHealthRow {
  sourceKey: string;
  name: string;
  health: {
    status: string;
    lastHealthyAt: Date | null;
    checkedAt: Date | null;
    consecutiveFailures: number;
  } | null;
}

export function mapRadarSourceHealth(source: RadarSourceHealthRow): UnifiedSourceHealthEntry {
  return {
    domain: 'HOME_EVENT_RADAR',
    sourceKey: source.key,
    name: source.name,
    status: RADAR_STATUS_MAP[source.health?.status ?? 'unknown'] ?? 'UNKNOWN',
    lastSuccessAt: source.health?.lastSuccessAt?.toISOString() ?? null,
    lastCheckedAt: source.health?.lastAttemptAt?.toISOString() ?? null,
    consecutiveFailures: source.health?.consecutiveFailures ?? 0,
    message: source.health?.message ?? null,
  };
}

export function mapServicePriceBenchmarkSourceHealth(source: ServicePriceBenchmarkSourceHealthRow): UnifiedSourceHealthEntry {
  return {
    domain: 'SERVICE_PRICE_BENCHMARK',
    sourceKey: source.sourceKey,
    name: source.name,
    status: SERVICE_PRICE_STATUS_MAP[source.health?.status ?? 'UNKNOWN'] ?? 'UNKNOWN',
    lastSuccessAt: source.health?.lastHealthyAt?.toISOString() ?? null,
    lastCheckedAt: source.health?.checkedAt?.toISOString() ?? null,
    consecutiveFailures: source.health?.consecutiveFailures ?? 0,
    // ServicePriceBenchmarkSourceHealth carries an unstructured detailsJson,
    // not a human-readable message field like Radar's — left null rather
    // than surfacing raw JSON as prose.
    message: null,
  };
}

export function isSourceHealthDegraded(status: UnifiedSourceHealthStatus): boolean {
  return status === 'DEGRADED' || status === 'UNHEALTHY' || status === 'STALE' || status === 'DISABLED';
}

export interface SourceHealthSummary {
  total: number;
  healthyCount: number;
  degradedCount: number;
  degradedSources: Pick<UnifiedSourceHealthEntry, 'domain' | 'sourceKey' | 'name' | 'status'>[];
}

export function summarizeSourceHealth(entries: readonly UnifiedSourceHealthEntry[]): SourceHealthSummary {
  const degraded = entries.filter((entry) => isSourceHealthDegraded(entry.status));
  return {
    total: entries.length,
    healthyCount: entries.length - degraded.length,
    degradedCount: degraded.length,
    degradedSources: degraded.map(({ domain, sourceKey, name, status }) => ({ domain, sourceKey, name, status })),
  };
}

export async function getUnifiedSourceHealth(): Promise<UnifiedSourceHealthEntry[]> {
  const [radarSources, benchmarkSources] = await Promise.all([
    prisma.radarSourceDefinition.findMany({
      where: { isEnabled: true },
      select: {
        key: true,
        name: true,
        health: { select: { status: true, lastSuccessAt: true, lastAttemptAt: true, consecutiveFailures: true, message: true } },
      },
    }),
    prisma.servicePriceBenchmarkSource.findMany({
      where: { isActive: true },
      select: {
        sourceKey: true,
        name: true,
        health: { select: { status: true, lastHealthyAt: true, checkedAt: true, consecutiveFailures: true } },
      },
    }),
  ]);

  return [
    ...radarSources.map(mapRadarSourceHealth),
    ...benchmarkSources.map(mapServicePriceBenchmarkSourceHealth),
  ].sort((a, b) => a.domain.localeCompare(b.domain) || a.sourceKey.localeCompare(b.sourceKey));
}
