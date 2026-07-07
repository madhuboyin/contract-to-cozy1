// apps/workers/src/jobs/reserveFundReconciliation.job.ts
//
// Sweep that computes fuzzy expense-match suggestions for active Reserve Fund
// line items and notifies the homeowner when any exist.
// See docs/functional/HOME_RESERVE_FUND_PLANNER_FRD.md, Section 6 (evidence
// path 2) and Section 10.
//
// KNOWN LIMITATION: suggestions are computed live, not persisted (see the
// Phase 1 note at the top of homeReserveFundReconciliation.service.ts) — there
// is no "already notified for this suggestion" state to check. This job runs
// weekly rather than the FRD's originally-stated daily cadence specifically to
// keep the notification from re-firing too often for the same still-open
// suggestion until a persisted suggestion/dismiss model exists.

import { prisma } from '../lib/prisma';
import { homeReserveFundReconciliationService } from '../../../backend/src/services/homeReserveFundReconciliation.service';
import { NotificationService } from '../../../backend/src/services/notification.service';
import { logger } from '../lib/logger';

export async function reserveFundReconciliationJob(): Promise<void> {
  const funds = await prisma.homeReserveFund.findMany({
    where: { isActive: true },
    select: {
      propertyId: true,
      homeownerProfile: { select: { userId: true } },
    },
  });

  logger.info(`[ReserveFundReconciliation] Checking ${funds.length} active fund(s) for expense matches`);

  let notified = 0;

  for (const fund of funds) {
    const userId = fund.homeownerProfile?.userId;
    if (!userId) continue;

    try {
      const suggestions = await homeReserveFundReconciliationService.findMatchSuggestions(fund.propertyId);
      if (suggestions.length === 0) continue;

      await NotificationService.create({
        userId,
        type: 'RESERVE_FUND_RECONCILIATION_SUGGESTION',
        title: 'We found a possible match for your reserve fund',
        message:
          suggestions.length === 1
            ? 'An expense you logged looks like it may cover one of your reserve fund line items.'
            : `${suggestions.length} logged expenses look like they may cover reserve fund line items.`,
        actionUrl: `/dashboard/properties/${fund.propertyId}/tools/reserve-fund`,
        entityType: 'HomeReserveFund',
        entityId: fund.propertyId,
      });
      notified++;
    } catch (err) {
      logger.error({ err, propertyId: fund.propertyId }, '[ReserveFundReconciliation] Failed to check property');
    }
  }

  logger.info(`[ReserveFundReconciliation] Done — notified ${notified} homeowner(s)`);
}
