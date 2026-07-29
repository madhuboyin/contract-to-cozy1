import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';
import {
  savingsBenefitsSourceOldestOverdueSeconds,
  savingsBenefitsSourcesByHealth,
} from '../lib/metrics';
import type { WorkerRunResult } from '../lib/workerRunResult';

export type SavingsBenefitsSourceHealth = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';

type SourceRow = {
  id: string;
  name: string;
  status: string;
  lastReviewedAt: Date | null;
  reviewSlaDays: number;
};

export interface SavingsBenefitsSourceHealthAuditDeps {
  prisma: Pick<typeof prisma, 'hiddenAssetSource'>;
  logger: AppLogger;
  metrics: {
    resetSources(): void;
    setSources(health: SavingsBenefitsSourceHealth, value: number): void;
    setOldestOverdueSeconds(value: number): void;
  };
}

export function classifySavingsBenefitsSource(
  source: SourceRow,
  now = new Date(),
): { health: SavingsBenefitsSourceHealth; overdueSeconds: number } {
  if (source.status !== 'ACTIVE' || !source.lastReviewedAt) {
    return { health: 'CRITICAL', overdueSeconds: 0 };
  }

  const reviewDueAt = new Date(
    source.lastReviewedAt.getTime() + source.reviewSlaDays * 24 * 60 * 60 * 1000,
  );
  const overdueSeconds = Math.max(0, Math.floor((now.getTime() - reviewDueAt.getTime()) / 1000));
  return {
    health: overdueSeconds > 0 ? 'DEGRADED' : 'HEALTHY',
    overdueSeconds,
  };
}

const defaultDeps: SavingsBenefitsSourceHealthAuditDeps = {
  prisma,
  logger,
  metrics: {
    resetSources: () => savingsBenefitsSourcesByHealth.reset(),
    setSources: (health, value) => savingsBenefitsSourcesByHealth.set({ health }, value),
    setOldestOverdueSeconds: (value) => savingsBenefitsSourceOldestOverdueSeconds.set(value),
  },
};

/**
 * Publishes source SLA health for alerting and logs the exact affected source
 * records for operators. This job never mutates source review state: a review
 * must remain an explicit human action in the admin console.
 */
export async function savingsBenefitsSourceHealthAuditJob(
  _opts?: { dryRun?: boolean; propertyId?: string },
  deps: SavingsBenefitsSourceHealthAuditDeps = defaultDeps,
): Promise<WorkerRunResult> {
  const now = new Date();
  const sources = await (deps.prisma as any).hiddenAssetSource.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      lastReviewedAt: true,
      reviewSlaDays: true,
    },
    orderBy: { name: 'asc' },
  }) as SourceRow[];

  const counts: Record<SavingsBenefitsSourceHealth, number> = {
    HEALTHY: 0,
    DEGRADED: 0,
    CRITICAL: 0,
  };
  let oldestOverdueSeconds = 0;

  for (const source of sources) {
    const result = classifySavingsBenefitsSource(source, now);
    counts[result.health] += 1;
    oldestOverdueSeconds = Math.max(oldestOverdueSeconds, result.overdueSeconds);
    if (result.health !== 'HEALTHY') {
      deps.logger.warn(
        {
          sourceId: source.id,
          sourceName: source.name,
          status: source.status,
          lastReviewedAt: source.lastReviewedAt,
          reviewSlaDays: source.reviewSlaDays,
          health: result.health,
          overdueSeconds: result.overdueSeconds,
        },
        '[SavingsBenefitsSourceHealthAudit] source requires operational review',
      );
    }
  }

  deps.metrics.resetSources();
  for (const health of ['HEALTHY', 'DEGRADED', 'CRITICAL'] as const) {
    deps.metrics.setSources(health, counts[health]);
  }
  deps.metrics.setOldestOverdueSeconds(oldestOverdueSeconds);

  deps.logger.info(
    { examined: sources.length, ...counts, oldestOverdueSeconds },
    '[SavingsBenefitsSourceHealthAudit] completed',
  );

  return {
    examined: sources.length,
    updated: sources.length,
    skipped: 0,
    failed: 0,
    reason:
      counts.CRITICAL > 0 || counts.DEGRADED > 0
        ? `${counts.CRITICAL} critical and ${counts.DEGRADED} overdue source(s)`
        : undefined,
  };
}
