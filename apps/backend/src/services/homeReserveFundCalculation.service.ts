// apps/backend/src/services/homeReserveFundCalculation.service.ts
//
// Sinking-fund math for the Home Reserve / Sinking Fund Planner.
// See docs/functional/HOME_RESERVE_FUND_PLANNER_FRD.md, Section 5.
//
// Sourced solely from HomeCapitalTimelineItem — see the schema comment above
// the HomeReserveFund models in prisma/schema.prisma for why the other two
// forecasting engines (Appliance Oracle, Maintenance Prediction) are not used.

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import {
  Prisma,
  HomeCapitalTimelineItem,
  HomeReserveFund,
  HomeReserveFundPosture,
  HomeReserveFundRecalculationTrigger,
} from '@prisma/client';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';

// A capital item due within this many months is treated as a lump-sum
// shortfall rather than something that can be smoothed into a monthly rate.
const NEAR_TERM_MONTHS = 6;

// Guidance Engine shortfall signal only fires for items this close — a
// shortfall on something 4 years out isn't yet an "act now" condition.
const GUIDANCE_SIGNAL_WINDOW_DAYS = 90;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Whole months between two dates, floored at 1 so a due-tomorrow item never
// divides by zero (it just gets folded into the near-term shortfall bucket
// instead — this floor only matters for items right at the near-term/
// smoothable boundary).
function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const dayAdjust = to.getDate() >= from.getDate() ? 0 : -1;
  return Math.max(1, months + dayAdjust);
}

// FRD Section 5, step 3: pick a point estimate from the item's cost range
// based on the fund's posture.
function pointEstimateCents(
  item: Pick<HomeCapitalTimelineItem, 'estimatedCostMinCents' | 'estimatedCostMaxCents'>,
  posture: HomeReserveFundPosture
): number {
  const min = item.estimatedCostMinCents ?? item.estimatedCostMaxCents ?? 0;
  const max = item.estimatedCostMaxCents ?? item.estimatedCostMinCents ?? 0;
  switch (posture) {
    case 'CONSERVATIVE':
      return max;
    case 'AGGRESSIVE':
      return min;
    case 'MODERATE':
    default:
      return Math.round((min + max) / 2);
  }
}

type RecalculationResult = HomeReserveFund;

export class HomeReserveFundCalculationService {
  // ── Get-or-create the per-property fund ───────────────────────────
  async getOrCreateFund(propertyId: string, homeownerProfileId?: string): Promise<HomeReserveFund> {
    const existing = await prisma.homeReserveFund.findUnique({ where: { propertyId } });
    if (existing) return existing;

    const resolvedHomeownerProfileId =
      homeownerProfileId ??
      (
        await prisma.property.findUnique({
          where: { id: propertyId },
          select: { homeownerProfileId: true },
        })
      )?.homeownerProfileId;

    if (!resolvedHomeownerProfileId) {
      throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
    }

    return prisma.homeReserveFund.create({
      data: { propertyId, homeownerProfileId: resolvedHomeownerProfileId },
    });
  }

  // ── Core recalculation (FRD Section 5) ─────────────────────────────
  async recalculate(
    propertyId: string,
    trigger: HomeReserveFundRecalculationTrigger = 'MANUAL'
  ): Promise<RecalculationResult> {
    const fund = await this.getOrCreateFund(propertyId);

    const analysis = await prisma.homeCapitalTimelineAnalysis.findFirst({
      where: { propertyId, status: 'READY' },
      orderBy: { computedAt: 'desc' },
      include: { items: true },
    });

    // No fresh timeline to compute against (never run, or currently STALE
    // pending a rerun). Leave the fund's figures untouched rather than
    // wiping out line items based on the absence of data.
    if (!analysis) {
      await prisma.homeReserveFundRecalculation.create({
        data: {
          fundId: fund.id,
          trigger,
          previousMonthlyContributionCents: fund.recommendedMonthlyContributionCents,
          newMonthlyContributionCents: fund.recommendedMonthlyContributionCents,
          previousShortfallCents: fund.currentShortfallCents,
          newShortfallCents: fund.currentShortfallCents,
          itemsAdded: 0,
          itemsRetired: 0,
        },
      });
      return fund;
    }

    const now = new Date();
    const nearTermCutoff = addMonths(now, NEAR_TERM_MONTHS);
    const horizonCutoffMonths = fund.horizonYears * 12;

    const existingLineItems = await prisma.homeReserveFundLineItem.findMany({
      where: { fundId: fund.id },
    });
    const existingByTimelineItemId = new Map(existingLineItems.map((li) => [li.timelineItemId, li]));

    // Items already linked to a HomeEvent are treated as resolved — FRD
    // Section 6, evidence path 1. Everything else is still open.
    const openItems = analysis.items.filter((item) => !item.linkedHomeEventId);
    const resolvedItems = analysis.items.filter((item) => !!item.linkedHomeEventId);

    const totalTargetCents = openItems.reduce(
      (sum, item) => sum + pointEstimateCents(item, fund.posture),
      0
    );

    let recommendedMonthlyContributionCents = 0;
    let currentShortfallCents = 0;
    let itemsAdded = 0;
    let itemsRetired = 0;

    const keptTimelineItemIds = new Set<string>();
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    const urgentShortfallItems: HomeCapitalTimelineItem[] = [];

    for (const item of openItems) {
      keptTimelineItemIds.add(item.id);

      const targetCostCents = pointEstimateCents(item, fund.posture);
      // Proportional share of the current balance, for display only — the
      // balance itself is one number, not physically partitioned per item.
      const allocatedBalanceCents =
        totalTargetCents > 0
          ? Math.round((fund.currentBalanceCents * targetCostCents) / totalTargetCents)
          : 0;

      const isNearTerm = item.windowStart <= nearTermCutoff;
      let allocatedMonthlyCents = 0;

      if (isNearTerm) {
        const shortfall = Math.max(0, targetCostCents - allocatedBalanceCents);
        currentShortfallCents += shortfall;
        if (shortfall > 0) urgentShortfallItems.push(item);
      } else {
        const monthsUntil = Math.min(monthsBetween(now, item.windowStart), horizonCutoffMonths);
        allocatedMonthlyCents = Math.ceil(targetCostCents / monthsUntil);
        recommendedMonthlyContributionCents += allocatedMonthlyCents;
      }

      const existing = existingByTimelineItemId.get(item.id);
      if (!existing) itemsAdded++;

      writes.push(
        prisma.homeReserveFundLineItem.upsert({
          where: { fundId_timelineItemId: { fundId: fund.id, timelineItemId: item.id } },
          create: {
            fundId: fund.id,
            timelineItemId: item.id,
            status: 'ACTIVE',
            targetCostCents,
            allocatedMonthlyCents,
            allocatedBalanceCents,
          },
          update: {
            status: 'ACTIVE',
            targetCostCents,
            allocatedMonthlyCents,
            allocatedBalanceCents,
            retiredAt: null,
            retiredReason: null,
            retiredEvidenceRef: null,
          },
        })
      );
    }

    // FRD Section 6, evidence path 1: a HomeEvent got linked since the last
    // recalculation — retire automatically, no fuzzy matching needed.
    for (const item of resolvedItems) {
      keptTimelineItemIds.add(item.id);
      const existing = existingByTimelineItemId.get(item.id);
      if (existing && existing.status === 'ACTIVE') {
        itemsRetired++;
        writes.push(
          prisma.homeReserveFundLineItem.update({
            where: { id: existing.id },
            data: {
              status: 'RETIRED',
              retiredAt: now,
              retiredReason: 'LINKED_HOME_EVENT',
              retiredEvidenceRef: item.linkedHomeEventId,
            },
          })
        );
      }
    }

    // Line items whose timeline item disappeared entirely (DISABLE_ITEM
    // override applied upstream, or the item was otherwise removed) —
    // FRD Section 5, step 6.
    for (const existing of existingLineItems) {
      if (existing.status !== 'ACTIVE') continue;
      if (keptTimelineItemIds.has(existing.timelineItemId)) continue;
      itemsRetired++;
      writes.push(
        prisma.homeReserveFundLineItem.update({
          where: { id: existing.id },
          data: { status: 'RETIRED', retiredAt: now, retiredReason: 'MANUAL' },
        })
      );
    }

    const previousMonthlyContributionCents = fund.recommendedMonthlyContributionCents;
    const previousShortfallCents = fund.currentShortfallCents;

    await prisma.$transaction([
      ...writes,
      prisma.homeReserveFund.update({
        where: { id: fund.id },
        data: {
          recommendedMonthlyContributionCents,
          currentShortfallCents,
          lastRecalculatedAt: now,
          sourceAnalysisId: analysis.id,
        },
      }),
      prisma.homeReserveFundRecalculation.create({
        data: {
          fundId: fund.id,
          trigger,
          previousMonthlyContributionCents,
          newMonthlyContributionCents: recommendedMonthlyContributionCents,
          previousShortfallCents,
          newShortfallCents: currentShortfallCents,
          itemsAdded,
          itemsRetired,
        },
      }),
    ]);

    const updatedFund = await prisma.homeReserveFund.findUniqueOrThrow({ where: { id: fund.id } });

    // Fire-and-forget — a Guidance Engine hiccup must not fail the recalculation.
    this.maybeEmitShortfallSignal(propertyId, updatedFund, urgentShortfallItems).catch((err) =>
      logger.warn({ err, propertyId }, '[ReserveFund] shortfall guidance signal emission failed')
    );

    return updatedFund;
  }

  // ── FRD Section 11: rides the existing financial_exposure_resolution
  // journey template — no new template needed for this condition. ─────
  private async maybeEmitShortfallSignal(
    propertyId: string,
    fund: HomeReserveFund,
    urgentShortfallItems: HomeCapitalTimelineItem[]
  ) {
    if (fund.currentShortfallCents <= 0 || urgentShortfallItems.length === 0) return;

    const now = new Date();
    const signalCutoff = addDays(now, GUIDANCE_SIGNAL_WINDOW_DAYS);

    const mostUrgent = [...urgentShortfallItems]
      .filter((item) => item.windowStart <= signalCutoff)
      .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime())[0];

    if (!mostUrgent) return;

    await guidanceJourneyService.ingestSignal({
      propertyId,
      signalIntentFamily: 'financial_exposure',
      sourceEntityType: 'RESERVE_FUND_LINE_ITEM',
      sourceEntityId: mostUrgent.id,
      sourceToolKey: 'reserve-fund',
      sourceFeatureKey: 'shortfall',
    });
  }
}

export const homeReserveFundCalculationService = new HomeReserveFundCalculationService();
