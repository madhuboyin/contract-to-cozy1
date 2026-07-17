// apps/workers/src/jobs/recalculateReserveFunds.job.ts
//
// Safety-net sweep for the Home Reserve / Sinking Fund Planner.
// See docs/functional/HOME_RESERVE_FUND_PLANNER_FRD.md, Section 10.
//
// The primary recalculation trigger is event-driven: homeCapitalTimeline.service.ts
// fires a fire-and-forget recalculation whenever a property's Capital Timeline is
// regenerated (see the TIMELINE_REFRESH call at the end of runTimeline()). This
// sweep exists purely to catch cases where that direct call was ever missed —
// e.g. the API process crashed mid-request, or the fund didn't exist yet when the
// timeline was last regenerated — and as a monthly recompute even when nothing
// changed, matching the FRD's "belt and suspenders" design.

import { prisma } from '../lib/prisma';
import { homeReserveFundCalculationService } from '../../../backend/src/services/homeReserveFundCalculation.service';
import { logger } from '../lib/logger';
import { checkReserveFundWorkerContext } from '../../../backend/src/services/financialContext/reserveFundWorkerContext.service';

const STALE_RECALC_DAYS = 35;

export async function recalculateReserveFundsJob(): Promise<void> {
  const funds = await prisma.homeReserveFund.findMany({
    where: { isActive: true },
    select: { id: true, propertyId: true, sourceAnalysisId: true, lastRecalculatedAt: true },
  });

  logger.info(`[ReserveFundRecalculate] Sweeping ${funds.length} active fund(s)`);

  let recalculated = 0;
  let skipped = 0;
  let failed = 0;

  for (const fund of funds) {
    try {
      const context = await checkReserveFundWorkerContext(fund.propertyId, {
        requireCurrentTimeline: true,
      });
      if (!context.allowed || !context.userId) {
        skipped++;
        logger.warn(
          { propertyId: fund.propertyId, reasonCodes: context.reasonCodes },
          '[ReserveFundRecalculate] Skipping because Property Context is not current',
        );
        continue;
      }
      const latestAnalysis = await prisma.homeCapitalTimelineAnalysis.findFirst({
        where: { propertyId: fund.propertyId, status: 'READY' },
        orderBy: { computedAt: 'desc' },
        select: { id: true },
      });

      const isBehindLatestAnalysis = !!latestAnalysis && latestAnalysis.id !== fund.sourceAnalysisId;
      const isStale =
        !fund.lastRecalculatedAt ||
        Date.now() - new Date(fund.lastRecalculatedAt).getTime() > STALE_RECALC_DAYS * 24 * 60 * 60 * 1000;

      if (!isBehindLatestAnalysis && !isStale) {
        skipped++;
        continue;
      }

      await homeReserveFundCalculationService.recalculate(
        fund.propertyId,
        'SCHEDULED',
        context.contextVersion,
        context.userId,
      );
      recalculated++;
    } catch (err) {
      failed++;
      logger.error({ err, propertyId: fund.propertyId }, '[ReserveFundRecalculate] Failed to recalculate fund');
    }
  }

  logger.info(
    `[ReserveFundRecalculate] Done — recalculated: ${recalculated}, skipped (up to date): ${skipped}, failed: ${failed}`
  );
}
