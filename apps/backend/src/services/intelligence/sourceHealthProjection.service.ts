import { prisma } from '../../lib/prisma';
import { AI_SOURCE_REGISTRY, sourceRegistryEntry, type IntelligenceSourceRegistryEntry } from './sourceRegistry';
import { getAIRouteHealth, type AIRouteHealthReading } from '../ai/aiRequestGovernance.service';

/**
 * Home Intelligence Functional Completeness FRD Phase 7 (HI-SRC-002) — one
 * read-only source-health projection combining domain-specific Radar and
 * Service Price health, reviewed Property Intelligence sources, and the
 * code-owned AI source registry. Existing domain stores remain authoritative.
 * This does not replace those stores or their domain-specific staleness
 * logic (e.g. radarAdminOperations.service.ts's freshnessSeconds-based
 * staleness check) — it only normalizes both into one comparable shape for
 * a platform-wide view. A source with no health row yet (never polled)
 * projects as UNKNOWN, not missing.
 */
export const UNIFIED_SOURCE_HEALTH_STATUSES = ['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'STALE', 'DISABLED', 'UNKNOWN'] as const;
export type UnifiedSourceHealthStatus = typeof UNIFIED_SOURCE_HEALTH_STATUSES[number];

export const SOURCE_HEALTH_DOMAINS = ['HOME_EVENT_RADAR', 'SERVICE_PRICE_BENCHMARK', 'PROPERTY_INTELLIGENCE', 'AI'] as const;
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
  owner: string;
  affectedCapabilityIds: string[];
  freshnessSlaSeconds: number;
  credentialConfigRequirements: string[];
  retryPolicy: { maxAttempts: number; backoffMs: number };
  fallbackBehavior: string;
  userVisibleDegradationMessage: string;
  operationalRunbook: string;
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
  provider?: string;
  freshnessSeconds?: number;
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
  ownerName?: string;
  health: {
    status: string;
    lastHealthyAt: Date | null;
    checkedAt: Date | null;
    consecutiveFailures: number;
  } | null;
}

function registryFields(entry: IntelligenceSourceRegistryEntry, overrides: Partial<Pick<UnifiedSourceHealthEntry, 'owner' | 'freshnessSlaSeconds'>> = {}) {
  return {
    owner: overrides.owner ?? entry.owner,
    affectedCapabilityIds: [...entry.capabilityConsumers],
    freshnessSlaSeconds: overrides.freshnessSlaSeconds ?? entry.freshnessSlaSeconds,
    credentialConfigRequirements: [...entry.credentialConfigRequirements],
    retryPolicy: { ...entry.retryPolicy },
    fallbackBehavior: entry.fallbackBehavior,
    userVisibleDegradationMessage: entry.userVisibleDegradationMessage,
    operationalRunbook: entry.operationalRunbook,
  };
}

export function mapRadarSourceHealth(source: RadarSourceHealthRow): UnifiedSourceHealthEntry {
  const registry = sourceRegistryEntry('external:home-event-radar')!;
  return {
    domain: 'HOME_EVENT_RADAR',
    sourceKey: source.key,
    name: source.name,
    status: RADAR_STATUS_MAP[source.health?.status ?? 'unknown'] ?? 'UNKNOWN',
    lastSuccessAt: source.health?.lastSuccessAt?.toISOString() ?? null,
    lastCheckedAt: source.health?.lastAttemptAt?.toISOString() ?? null,
    consecutiveFailures: source.health?.consecutiveFailures ?? 0,
    message: source.health?.message ?? null,
    ...registryFields(registry, { owner: source.provider ?? registry.owner, freshnessSlaSeconds: source.freshnessSeconds ?? registry.freshnessSlaSeconds }),
  };
}

export function mapServicePriceBenchmarkSourceHealth(source: ServicePriceBenchmarkSourceHealthRow): UnifiedSourceHealthEntry {
  const registry = sourceRegistryEntry('external:service-price-benchmark')!;
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
    ...registryFields(registry, { owner: source.ownerName ?? registry.owner }),
  };
}

export interface PropertyIntelligenceSourceHealthRow {
  key: string;
  provider: string;
  reviewedStatus: string;
  refreshPolicy: unknown;
  runs: Array<{ status: string; startedAt: Date; completedAt: Date | null; failureDetail: string | null }>;
  coverages: Array<{ checkedThrough: Date | null }>;
}

export function mapPropertyIntelligenceSourceHealth(source: PropertyIntelligenceSourceHealthRow): UnifiedSourceHealthEntry {
  const latest = source.runs[0];
  const policy = source.refreshPolicy && typeof source.refreshPolicy === 'object' && !Array.isArray(source.refreshPolicy)
    ? source.refreshPolicy as Record<string, unknown> : {};
  const freshnessSlaSeconds = typeof policy.freshnessSeconds === 'number' ? policy.freshnessSeconds : 86_400;
  const status: UnifiedSourceHealthStatus = source.reviewedStatus === 'PAUSED' || source.reviewedStatus === 'REJECTED'
    ? 'DISABLED'
    : !latest ? 'UNKNOWN'
      : latest.status === 'SUCCEEDED' ? 'HEALTHY'
        : latest.status === 'PARTIAL' ? 'DEGRADED'
          : latest.status === 'FAILED' || latest.status === 'REJECTED' ? 'UNHEALTHY' : 'UNKNOWN';
  return {
    domain: 'PROPERTY_INTELLIGENCE', sourceKey: source.key, name: source.key, status,
    lastSuccessAt: latest?.status === 'SUCCEEDED' || latest?.status === 'PARTIAL' ? (latest.completedAt ?? latest.startedAt).toISOString() : null,
    lastCheckedAt: latest?.startedAt.toISOString() ?? null,
    consecutiveFailures: status === 'UNHEALTHY' ? 1 : 0, message: latest?.failureDetail ?? null,
    owner: source.provider, affectedCapabilityIds: ['property-intelligence', 'home-briefing'], freshnessSlaSeconds,
    credentialConfigRequirements: ['reviewed source configuration'], retryPolicy: { maxAttempts: 3, backoffMs: 60_000 },
    fallbackBehavior: 'Mark local observations stale and omit dependent material conclusions.',
    userVisibleDegradationMessage: 'Some around-your-home intelligence is delayed or unavailable.',
    operationalRunbook: 'docs/product/PROPERTY_INTELLIGENCE_AND_BRIEFINGS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md',
  };
}

/**
 * AI route health is one shared record per route (owner decision AI-HEALTH-1), so this view shows every process's combined result instead of
 * whatever the answering process happened to observe. When the shared store is unreachable the entry says so: it shows this process's own last
 * observation labelled as such, or UNKNOWN if it has none. It never invents a status.
 */
export function mapAIRegistryHealth(entry: IntelligenceSourceRegistryEntry, env: NodeJS.ProcessEnv = process.env, reading: AIRouteHealthReading | null = null): UnifiedSourceHealthEntry {
  const routeKey = entry.sourceId.replace(/^ai:/, '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const disabled = env.AI_REQUESTS_ENABLED === 'false' || env[`AI_ROUTE_${routeKey}_ENABLED`] === 'false';
  const configured = Boolean(env.GEMINI_API_KEY);
  const runtime = reading?.snapshot ?? null;
  const lastKnownOnly = Boolean(reading?.sharedUnavailable);
  const observedAt = runtime?.lastAttemptAt.toISOString() ?? null;
  const message = disabled ? 'Disabled by an operator control.'
    : !configured ? 'Required AI credential is not configured.'
      : lastKnownOnly
        ? (runtime
          ? `Shared AI health is unavailable; showing this process's last observation (${observedAt}). ${runtime.message ?? ''}`.trim()
          : 'Shared AI health is unavailable and this process has not observed a governed request.')
        : runtime?.message ?? 'Configured; no governed request has been observed yet.';
  return {
    domain: 'AI', sourceKey: entry.sourceId, name: entry.sourceId.replace(/^ai:/, '').replace(/-/g, ' '),
    status: disabled ? 'DISABLED' : !configured ? 'UNKNOWN' : runtime?.status ?? 'UNKNOWN',
    lastSuccessAt: runtime?.lastSuccessAt?.toISOString() ?? null,
    lastCheckedAt: observedAt,
    consecutiveFailures: runtime?.consecutiveFailures ?? 0,
    message,
    ...registryFields(entry),
  };
}

export function isSourceHealthDegraded(status: UnifiedSourceHealthStatus): boolean {
  return status === 'DEGRADED' || status === 'UNHEALTHY' || status === 'STALE' || status === 'DISABLED';
}

export interface SourceHealthSummary {
  total: number;
  healthyCount: number;
  degradedCount: number;
  unknownCount: number;
  degradedSources: Pick<UnifiedSourceHealthEntry, 'domain' | 'sourceKey' | 'name' | 'status'>[];
}

export function summarizeSourceHealth(entries: readonly UnifiedSourceHealthEntry[]): SourceHealthSummary {
  const degraded = entries.filter((entry) => isSourceHealthDegraded(entry.status));
  const unknownCount = entries.filter((entry) => entry.status === 'UNKNOWN').length;
  return {
    total: entries.length,
    healthyCount: entries.filter((entry) => entry.status === 'HEALTHY').length,
    degradedCount: degraded.length,
    unknownCount,
    degradedSources: degraded.map(({ domain, sourceKey, name, status }) => ({ domain, sourceKey, name, status })),
  };
}

export async function getUnifiedSourceHealth(): Promise<UnifiedSourceHealthEntry[]> {
  const [radarSources, benchmarkSources, propertyIntelligenceSources] = await Promise.all([
    prisma.radarSourceDefinition.findMany({
      where: { isEnabled: true },
      select: {
        key: true,
        name: true,
        provider: true,
        freshnessSeconds: true,
        health: { select: { status: true, lastSuccessAt: true, lastAttemptAt: true, consecutiveFailures: true, message: true } },
      },
    }),
    prisma.servicePriceBenchmarkSource.findMany({
      where: { isActive: true },
      select: {
        sourceKey: true,
        name: true,
        ownerName: true,
        health: { select: { status: true, lastHealthyAt: true, checkedAt: true, consecutiveFailures: true } },
      },
    }),
    prisma.intelligenceSource.findMany({
      select: {
        key: true, provider: true, reviewedStatus: true, refreshPolicy: true,
        runs: { orderBy: { startedAt: 'desc' }, take: 1, select: { status: true, startedAt: true, completedAt: true, failureDetail: true } },
        coverages: { select: { checkedThrough: true } },
      },
    }),
  ]);

  const aiEntries = await Promise.all(AI_SOURCE_REGISTRY.map(async (entry) => mapAIRegistryHealth(entry, process.env, await getAIRouteHealth(entry.sourceId))));

  return [
    ...radarSources.map(mapRadarSourceHealth),
    ...benchmarkSources.map(mapServicePriceBenchmarkSourceHealth),
    ...propertyIntelligenceSources.map(mapPropertyIntelligenceSourceHealth),
    ...aiEntries,
  ].sort((a, b) => a.domain.localeCompare(b.domain) || a.sourceKey.localeCompare(b.sourceKey));
}
