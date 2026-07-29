import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

export async function requestBroadSavingsBenefitsReevaluation(reason: string): Promise<boolean> {
  if (process.env.NODE_TEST_CONTEXT) return true;
  try {
    // Fan out onto the property-scoped intelligence queue. Editorial events
    // are automatic domain events, not manual broad-sweep operations, and
    // therefore must not depend on WORKER_MUTATING_SWEEPS_ENABLED.
    const { default: JobQueueService } = await import('./JobQueue.service');
    let cursor: string | undefined;
    let queued = 0;
    do {
      const properties = await prisma.property.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (properties.length === 0) break;
      const decisions = await Promise.all(
        properties.map((property) => JobQueueService.enqueueHiddenAssetRefresh(property.id)),
      );
      if (decisions.some((decision) => !decision)) {
        throw new Error('Worker execution policy blocked one or more property refreshes.');
      }
      queued += decisions.length;
      cursor = properties.at(-1)?.id;
      if (properties.length < 500) break;
    } while (cursor);
    logger.info({ reason, queued }, '[SAVINGS-BENEFITS] Broad event-driven reevaluation queued');
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
    const queued = await JobQueueService.enqueueHiddenAssetRefresh(propertyId);
    if (!queued) {
      throw new Error('Worker execution policy blocked the property refresh.');
    }
    logger.info({ propertyId, reason }, '[SAVINGS-BENEFITS] Property event-driven reevaluation queued');
    return true;
  } catch (err) {
    logger.error({ err, propertyId, reason }, '[SAVINGS-BENEFITS] Failed to queue property reevaluation');
    return false;
  }
}
