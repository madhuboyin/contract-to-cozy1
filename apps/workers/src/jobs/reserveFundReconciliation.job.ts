// apps/workers/src/jobs/reserveFundReconciliation.job.ts
//
// Sweep that computes fuzzy expense-match suggestions for active Reserve Fund
// line items and notifies the homeowner when any exist.
// See docs/functional/HOME_RESERVE_FUND_PLANNER_FRD.md, Section 6 (evidence
// path 2) and Section 10.
//
// Suggestions are computed live, not persisted (see the Phase 1 note at the
// top of homeReserveFundReconciliation.service.ts) — there is no "already
// notified for this suggestion" row to check. W3 (financial) fix:
// HomeReserveFund.reconciliationNotifiedFingerprint stamps a fingerprint of
// the current suggestion set so the same still-open set doesn't re-notify
// every weekly run indefinitely; only a genuine change (a new suggestion
// appears, or one is accepted/expires) triggers a fresh notification.

import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  homeReserveFundReconciliationService,
  ReconciliationSuggestion,
} from '@worker-shared/services/homeReserveFundReconciliation.service';
import { NotificationService } from '@worker-shared/services/notification.service';
import { logger } from '../lib/logger';
import { checkReserveFundWorkerContext } from '@worker-shared/services/financialContext/reserveFundWorkerContext.service';

export function fingerprintSuggestions(suggestions: ReconciliationSuggestion[]): string {
  const pairs = suggestions
    .map((s) => `${s.lineItemId}:${s.expenseId}`)
    .sort();
  return createHash('sha256').update(pairs.join('|')).digest('hex');
}

export async function reserveFundReconciliationJob(): Promise<void> {
  const funds = await prisma.homeReserveFund.findMany({
    where: { isActive: true },
    select: {
      propertyId: true,
      reconciliationNotifiedFingerprint: true,
      homeownerProfile: { select: { userId: true } },
    },
  });

  logger.info(`[ReserveFundReconciliation] Checking ${funds.length} active fund(s) for expense matches`);

  let notified = 0;
  let unchanged = 0;

  for (const fund of funds) {
    const userId = fund.homeownerProfile?.userId;
    if (!userId) continue;

    try {
      const context = await checkReserveFundWorkerContext(fund.propertyId, {
        requireCurrentFund: true,
        requireCurrentTimeline: true,
      });
      if (!context.allowed) {
        logger.warn(
          { propertyId: fund.propertyId, reasonCodes: context.reasonCodes },
          '[ReserveFundReconciliation] Skipping because Property Context is not current',
        );
        continue;
      }
      const suggestions = await homeReserveFundReconciliationService.findMatchSuggestions(fund.propertyId);
      if (suggestions.length === 0) continue;

      const fingerprint = fingerprintSuggestions(suggestions);
      if (fingerprint === fund.reconciliationNotifiedFingerprint) {
        unchanged++;
        continue;
      }

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
        category: 'GENERAL',
        urgency: 'ROUTINE',
        metadata: { propertyId: fund.propertyId },
      });

      await prisma.homeReserveFund.update({
        where: { propertyId: fund.propertyId },
        data: { reconciliationNotifiedFingerprint: fingerprint, reconciliationNotifiedAt: new Date() },
      });

      notified++;
    } catch (err) {
      logger.error({ err, propertyId: fund.propertyId }, '[ReserveFundReconciliation] Failed to check property');
    }
  }

  logger.info(`[ReserveFundReconciliation] Done — notified ${notified} homeowner(s), ${unchanged} unchanged since last notification`);
}
