import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ingestIntelligenceBatch } from '@worker-shared/propertyIntelligence/propertyIntelligence.service';
import {
  ensureNycZapPilotActivation,
  readNycZapPilotConfig,
  NYC_ZAP_SOURCE_KEY,
} from '@worker-shared/propertyIntelligence/pilots/nycZapPilot';
import { NycZapProviderAdapter } from '../propertyIntelligence/providers/nycZap.provider';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import type { WorkerRunResult } from '../lib/workerRunResult';

type JobOptions = {
  dryRun?: boolean;
};

type NycZapPlanningIngestDeps = {
  readConfig: typeof readNycZapPilotConfig;
  activate: typeof ensureNycZapPilotActivation;
  createAdapter: (
    config: ReturnType<typeof readNycZapPilotConfig>,
  ) => Pick<NycZapProviderAdapter, 'fetch'>;
  ingest: typeof ingestIntelligenceBatch;
  lastCheckedThrough: () => Promise<Date | null>;
  correlationId: () => string;
};

const defaultDeps: NycZapPlanningIngestDeps = {
  readConfig: readNycZapPilotConfig,
  activate: ensureNycZapPilotActivation,
  createAdapter: (config) => new NycZapProviderAdapter(config),
  ingest: ingestIntelligenceBatch,
  lastCheckedThrough: async () => {
    const source = await prisma.intelligenceSource.findUnique({
      where: { key: NYC_ZAP_SOURCE_KEY },
      select: {
        coverages: {
          where: { qaReviewedAt: { not: null } },
          orderBy: { checkedThrough: 'desc' },
          take: 1,
          select: { checkedThrough: true },
        },
      },
    });
    return source?.coverages[0]?.checkedThrough ?? null;
  },
  correlationId: () => generateSmokeCorrelationId('nyc-zap-planning-ingest'),
};

export async function runNycZapPlanningIngestJob(
  options: JobOptions = {},
  deps: NycZapPlanningIngestDeps = defaultDeps,
): Promise<WorkerRunResult> {
  const config = deps.readConfig();
  if (!config.enabled) {
    return {
      examined: 0,
      skipped: 1,
      reason: 'NYC ZAP reviewed pilot is disabled.',
    };
  }
  const adapter = deps.createAdapter(config);
  const checkedAfter = await deps.lastCheckedThrough();
  const batch = await adapter.fetch({
    checkedAfter,
    environment: config.environment,
  });
  if (options.dryRun) {
    return {
      examined: batch.observations.length,
      skipped: batch.observations.length,
      reason:
        `Dry run fetched ${batch.observations.length} reviewed NYC ZAP record(s) `
        + `for ${config.counties.join(', ')} without persistence.`,
    };
  }

  await deps.activate(config);
  const smokeCorrelationId = deps.correlationId();
  const result = await deps.ingest({
    sourceKey: NYC_ZAP_SOURCE_KEY,
    environment: config.environment,
    correlationId: smokeCorrelationId,
    checkedThrough: batch.checkedThrough,
    observations: batch.observations,
  });
  logger.info(
    { ...result, counties: config.counties },
    '[nyc-zap-planning-ingest] Reviewed NYC Planning pilot ingest completed',
  );
  return {
    examined: batch.observations.length,
    created: result.accepted - result.unchanged,
    refreshed: result.unchanged,
    failed: result.rejected,
    reason:
      result.rejected > 0
        ? `${result.rejected} record(s) were rejected by source governance.`
        : undefined,
    smokeCorrelationId,
  };
}
