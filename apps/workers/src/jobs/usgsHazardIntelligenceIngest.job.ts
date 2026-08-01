import { prisma } from '../lib/prisma';
import { ingestIntelligenceBatch } from '@worker-shared/propertyIntelligence/propertyIntelligence.service';
import {
  ensureUsgsHazardPilotActivation,
  readUsgsHazardPilotConfig,
  USGS_HAZARD_SOURCE_KEY,
} from '@worker-shared/propertyIntelligence/pilots/usgsHazardPilot';
import { UsgsHazardProviderAdapter } from '../propertyIntelligence/providers/usgsHazard.provider';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import type { WorkerRunResult } from '../lib/workerRunResult';

export async function runUsgsHazardIntelligenceIngestJob(
  options: { dryRun?: boolean } = {},
): Promise<WorkerRunResult> {
  const config = readUsgsHazardPilotConfig();
  if (!config.enabled) return { examined: 0, skipped: 1, reason: 'Reviewed USGS hazard pilot is disabled.' };
  if (!options.dryRun) await ensureUsgsHazardPilotActivation(config);
  const source = await prisma.intelligenceSource.findUnique({
    where: { key: USGS_HAZARD_SOURCE_KEY },
    select: { coverages: { orderBy: { checkedThrough: 'desc' }, take: 1, select: { checkedThrough: true } } },
  });
  const batch = await new UsgsHazardProviderAdapter().fetch({
    checkedAfter: source?.coverages[0]?.checkedThrough ?? null,
    environment: config.environment,
  });
  if (options.dryRun) {
    return { examined: batch.observations.length, skipped: batch.observations.length, reason: 'USGS dry run did not persist observations.' };
  }
  const result = await ingestIntelligenceBatch({
    sourceKey: USGS_HAZARD_SOURCE_KEY,
    environment: config.environment,
    correlationId: generateSmokeCorrelationId('usgs-hazard-intelligence-ingest'),
    checkedThrough: batch.checkedThrough,
    observations: batch.observations,
  });
  return {
    examined: batch.observations.length,
    created: result.accepted - result.unchanged,
    refreshed: result.unchanged,
    failed: result.rejected,
  };
}
