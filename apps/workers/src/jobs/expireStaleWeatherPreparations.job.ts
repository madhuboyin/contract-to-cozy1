import { expireStaleWeatherPreparations } from '@worker-shared/services/incidents/expireWeatherPreparationIncidents.usecase';
import { logger } from '../lib/logger';
import type { WorkerRunResult } from '../lib/workerRunResult';

export async function runExpireStaleWeatherPreparationsJob(
  opts?: { propertyId?: string; dryRun?: boolean },
): Promise<WorkerRunResult> {
  const result = await expireStaleWeatherPreparations(opts);
  logger.info(
    { ...result },
    `[expire-stale-weather-preparations] examined=${result.examined} resolved=${result.resolved}`,
  );
  return { examined: result.examined, updated: result.resolved };
}
