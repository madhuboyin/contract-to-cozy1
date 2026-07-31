// Canonical Home Briefing delivery job.

import { generateDueHomeBriefings } from '@worker-shared/homeBriefing/homeBriefing.service';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { logger } from '../lib/logger';

export async function runHomeBriefingDeliveryJob(
  opts?: { propertyId?: string },
): Promise<{
  published: number;
  skipped: number;
  alreadyPublished: number;
  failed: number;
  examined: number;
  smokeCorrelationId?: string;
}> {
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[HOME-BRIEFING] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId
    ? generateSmokeCorrelationId('home-briefing-delivery')
    : undefined;
  const results = await generateDueHomeBriefings(opts?.propertyId);
  const published = results.filter((result) =>
    result.status === 'DELIVERED' && result.itemCount > 0).length;
  const skipped = results.filter((result) =>
    result.status === 'DELIVERED' && result.itemCount === 0).length;
  const failed = results.filter((result) => result.status === 'FAILED').length;

  logger.info({
    propertyId: opts?.propertyId,
    deliveredWithItems: published,
    quietDeliveries: skipped,
    failed,
    examined: results.length,
  }, '[HOME-BRIEFING] Canonical delta delivery run completed');

  return {
    published,
    skipped,
    alreadyPublished: 0,
    failed,
    examined: results.length,
    smokeCorrelationId,
  };
}
