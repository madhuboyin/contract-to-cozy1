// apps/workers/src/jobs/evaluateHomeActionProactiveDelivery.job.ts
//
// Ask Intelligence FRD §18, Phase 9C. Cron entry point for
// evaluateHomeActionProactiveDeliveryForProperty
// (@worker-shared/services/decisionPlatform/homeActionProactiveDelivery
// .service.ts) -- finds candidate (property, user) pairs and runs one
// bounded evaluation pass per property. A no-op the moment the env flag or
// DB kill switch is off, so this is safe to register even while the
// feature stays disabled by default.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { WorkerRunResult } from '../lib/workerRunResult';
import {
  evaluateHomeActionProactiveDeliveryForProperty,
  isHomeActionProactiveDeliveryActive,
} from '@worker-shared/services/decisionPlatform/homeActionProactiveDelivery.service';

export async function evaluateHomeActionProactiveDeliveryJob(): Promise<WorkerRunResult> {
  if (!(await isHomeActionProactiveDeliveryActive())) {
    return { examined: 0, skipped: 1, reason: 'Home Action proactive delivery inactive (env flag or kill switch)' };
  }

  // Only users who currently hold an active EMAIL consent for some category
  // can possibly be eligible -- scoping the property scan to them avoids a
  // full property-table scan for a channel almost nobody has opted into.
  const consentedUserIds = (await prisma.notificationChannelConsent.findMany({
    where: { channel: 'EMAIL', consentedAt: { not: null }, revokedAt: null },
    select: { userId: true },
    distinct: ['userId'],
  })).map((row) => row.userId);

  if (!consentedUserIds.length) {
    return { examined: 0, skipped: 1, reason: 'No user currently holds an active Home Action email consent' };
  }

  const properties = await prisma.property.findMany({
    where: { homeownerProfile: { userId: { in: consentedUserIds } } },
    select: { id: true, homeownerProfile: { select: { userId: true } } },
  });

  let notified = 0;
  let failed = 0;
  for (const property of properties) {
    const userId = property.homeownerProfile.userId;
    try {
      const outcomes = await evaluateHomeActionProactiveDeliveryForProperty(property.id, userId);
      notified += outcomes.filter((outcome) => outcome.eligible && outcome.notificationId).length;
    } catch (error) {
      failed += 1;
      logger.warn({ err: error, propertyId: property.id, userId }, '[HOME-ACTION-PROACTIVE] Evaluation pass failed for property');
    }
  }

  return { examined: properties.length, notified, failed };
}
