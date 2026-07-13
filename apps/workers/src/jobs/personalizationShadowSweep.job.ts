// apps/workers/src/jobs/personalizationShadowSweep.job.ts
//
// Nightly sweep: runs the personalization shadow/Daily-Pulse comparison for
// every property with an active household link. This is the first thing
// that runs this module's shadow evaluation on its own — previously only
// tests called it. Deliberately the simplest real operational wiring that's
// cross-replica-safe (reuses the existing cron+lease mechanism every other
// registry entry uses) rather than a bespoke BullMQ queue with no live
// caller — see docs/personalization/ (migration steps 4-6 plan) for why.
import { listPropertyIdsWithActiveHouseholdLink } from '../../../backend/src/modules/personalization/infrastructure/householdPropertyRepository';
import { compareShadowWithDailyPulseForProperty } from '../../../backend/src/modules/personalization/application/compareShadowWithDailyPulse.usecase';
import { logger } from '../lib/logger';

export async function runPersonalizationShadowSweepJob(): Promise<void> {
  logger.info(`[PERSONALIZATION-SHADOW-SWEEP] Starting nightly sweep at ${new Date().toISOString()}`);

  const propertyIds = await listPropertyIdsWithActiveHouseholdLink();

  let successCount = 0;
  let failureCount = 0;

  for (const propertyId of propertyIds) {
    try {
      await compareShadowWithDailyPulseForProperty(propertyId);
      successCount++;
    } catch (error) {
      failureCount++;
      logger.error({ err: error }, `[PERSONALIZATION-SHADOW-SWEEP] Comparison failed for property ${propertyId}`);
    }
  }

  logger.info(
    `[PERSONALIZATION-SHADOW-SWEEP] Nightly sweep complete. ` +
      `Success: ${successCount}, Failed: ${failureCount}, Total: ${propertyIds.length}`,
  );
}
