import { logger } from '../lib/logger';

export async function requestBroadSavingsBenefitsReevaluation(reason: string): Promise<boolean> {
  if (process.env.NODE_TEST_CONTEXT) return true;
  try {
    // Keep queue clients lazy: importing editorial services in tests, scripts,
    // or migration tooling must not establish Redis connections.
    const { triggerJob } = await import('./adminWorkerJobs.service');
    await triggerJob('hidden-asset-refresh', { dryRun: false });
    logger.info({ reason }, '[SAVINGS-BENEFITS] Broad event-driven reevaluation queued');
    return true;
  } catch (err) {
    // The editorial mutation remains authoritative. The weekly sweep is the
    // recovery path if queue infrastructure is temporarily unavailable.
    logger.error({ err, reason }, '[SAVINGS-BENEFITS] Failed to queue broad reevaluation');
    return false;
  }
}

export async function requestPropertySavingsBenefitsReevaluation(
  propertyId: string,
  reason: string,
): Promise<boolean> {
  if (process.env.NODE_TEST_CONTEXT) return true;
  try {
    const { default: JobQueueService } = await import('./JobQueue.service');
    await JobQueueService.enqueuePropertyIntelligenceJobs(propertyId);
    logger.info({ propertyId, reason }, '[SAVINGS-BENEFITS] Property event-driven reevaluation queued');
    return true;
  } catch (err) {
    logger.error({ err, propertyId, reason }, '[SAVINGS-BENEFITS] Failed to queue property reevaluation');
    return false;
  }
}
