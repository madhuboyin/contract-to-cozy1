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
import { homeReserveFundCalculationService } from '@worker-shared/services/homeReserveFundCalculation.service';
import { logger, AppLogger } from '../lib/logger';
import { checkReserveFundWorkerContext } from '@worker-shared/services/financialContext/reserveFundWorkerContext.service';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';

const STALE_RECALC_DAYS = 35;

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface RecalculateReserveFundsDeps {
  prisma: Pick<typeof prisma, 'homeReserveFund' | 'homeCapitalTimelineAnalysis'>;
  homeReserveFundCalculationService: Pick<typeof homeReserveFundCalculationService, 'recalculate'>;
  checkReserveFundWorkerContext: typeof checkReserveFundWorkerContext;
  logger: AppLogger;
}

const defaultDeps: RecalculateReserveFundsDeps = {
  prisma,
  homeReserveFundCalculationService,
  checkReserveFundWorkerContext,
  logger,
};

export async function recalculateReserveFundsJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: RecalculateReserveFundsDeps = defaultDeps,
): Promise<{ recalculated: number; skipped: number; failed: number; smokeCorrelationId?: string }> {
  const { prisma, homeReserveFundCalculationService, checkReserveFundWorkerContext, logger } = deps;
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[ReserveFundRecalculate] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId ? generateSmokeCorrelationId('reserve-fund-recalculation') : undefined;

  const funds = await prisma.homeReserveFund.findMany({
    where: { isActive: true, ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}) },
    select: { id: true, propertyId: true, sourceAnalysisId: true, lastRecalculatedAt: true },
  });

  logger.info(`[ReserveFundRecalculate] Sweeping ${funds.length} active fund(s)${dryRun ? ' (dry run)' : ''}`);

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

      if (dryRun) {
        recalculated++;
        logger.info(`[ReserveFundRecalculate] (dry run) Would recalculate fund ${fund.id} (property ${fund.propertyId})`);
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

  return { recalculated, skipped, failed, smokeCorrelationId };
}
