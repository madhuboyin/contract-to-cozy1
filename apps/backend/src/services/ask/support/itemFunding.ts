// Ask support: the arithmetic behind "how much do I need for X by date Y, and how much more should I be saving?". Pure, so it is tested without a database.
//
// Cost basis. The Home Capital Timeline stores each cost range already grown to the middle of the item's predicted window (homeCapitalTimeline.service:
// projectValueAtYear(cost, growth, yearsUntilWindowMid)). It is therefore NOT today's money. To value an item at a date the homeowner named, this module
// takes the stored cost back to today's money and grows it forward to that date with the same rate. Without a named date the stored cost is used as is.
//
// What is already set aside is the item's proportional share of the reserve balance, the same convention the reserve fund uses to display it (the balance is
// one number, not partitioned). What the homeowner is putting aside now is the reserve ledger's DEPOSITs over the last six months, as a monthly average,
// times the same share. Neither is a bank balance: the ledger is self-reported.

import { grow, itemCostBases, yearsBetween } from './itemCost';
export { grow, yearsBetween };

export const DEFAULT_CAPITAL_COST_GROWTH_RATE = 0.035;
export const NEAR_TERM_MONTHS = 6;
export const DEPOSIT_RATE_WINDOW_MONTHS = 6;

export interface FundingTimelineItem {
  id: string;
  name: string;
  windowStart: Date;
  windowEnd: Date;
  costMinCents: number;
  costMaxCents: number;
  /** The reserve fund's target for this item (posture-chosen point of the cost range), when a reserve line exists. */
  targetCents: number | null;
  /** This item's proportional share of the recorded reserve balance, when a reserve line exists. */
  setAsideCents: number | null;
}

export type FundingPosture = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';

export function pointEstimate(min: number, max: number, posture: FundingPosture): number {
  if (posture === 'CONSERVATIVE') return max;
  if (posture === 'AGGRESSIVE') return min;
  return Math.round((min + max) / 2);
}

export interface FundingItemResult {
  id: string;
  name: string;
  windowStart: Date;
  windowEnd: Date;
  /** The cost the homeowner should plan for at the planning date. */
  costAtTargetCents: number;
  costMinAtTargetCents: number;
  costMaxAtTargetCents: number;
  setAsideCents: number;
  stillToFundCents: number;
  /** True when the model's own window opens before the date the homeowner named (planning later than the model expects). */
  modelExpectsSooner: boolean;
}

export interface FundingPlan {
  planningDate: Date;
  /** True when the date came from the homeowner's words; false when the model's own window start was used. */
  planningDateFromHomeowner: boolean;
  months: number;
  items: FundingItemResult[];
  costAtTargetCents: number;
  setAsideCents: number;
  stillToFundCents: number;
  /** Monthly saving needed to reach `stillToFundCents` by the planning date. Null when the date is too near for monthly saving to matter. */
  neededPerMonthCents: number | null;
  /** The item's estimated share of the logged deposit rate. Null when no deposits are logged: that is unknown, not a confirmed $0. */
  currentPerMonthCents: number | null;
  additionalPerMonthCents: number | null;
  nearTerm: boolean;
  growthRate: number;
}

export function monthsUntil(now: Date, to: Date): number {
  const months = (to.getFullYear() - now.getFullYear()) * 12 + (to.getMonth() - now.getMonth());
  return Math.max(1, months);
}

export function buildFundingPlan(input: {
  now: Date;
  items: readonly FundingTimelineItem[];
  posture: FundingPosture;
  /** The date the homeowner named, or null to plan for the earliest model window among the items. */
  targetDate: Date | null;
  growthRate: number;
  /** Average monthly DEPOSIT over the ledger window, for the whole fund. */
  /** The fund-wide logged deposit rate, or null when no deposits are logged (unknown, not zero). */
  depositsPerMonthCents: number | null;
  /** Sum of every active reserve target, to split the deposit rate by cost share. */
  fundTargetTotalCents: number;
}): FundingPlan {
  const { now, posture, growthRate } = input;
  const earliestWindow = input.items.reduce((earliest, item) => (item.windowStart < earliest ? item.windowStart : earliest), input.items[0].windowStart);
  const planningDate = input.targetDate ?? earliestWindow;
  const months = monthsUntil(now, planningDate);

  const items: FundingItemResult[] = input.items.map((item) => {
    // One shared cost function (support/itemCost.ts): stored cost as is, or back to today's money and forward to the homeowner's date.
    const bases = itemCostBases({ storedMinCents: item.costMinCents, storedMaxCents: item.costMaxCents, windowStart: item.windowStart, windowEnd: item.windowEnd, growthRate, now, targetDate: input.targetDate });
    const chosen = bases.target ?? bases.window;
    const min = chosen.minCents;
    const max = chosen.maxCents;
    const cost = pointEstimate(min, max, posture);
    const setAside = Math.min(item.setAsideCents ?? 0, cost);
    return {
      id: item.id, name: item.name, windowStart: item.windowStart, windowEnd: item.windowEnd,
      costAtTargetCents: cost, costMinAtTargetCents: min, costMaxAtTargetCents: max,
      setAsideCents: setAside, stillToFundCents: Math.max(0, cost - setAside),
      modelExpectsSooner: input.targetDate != null && item.windowStart < input.targetDate,
    };
  });

  const costAtTargetCents = items.reduce((sum, item) => sum + item.costAtTargetCents, 0);
  const setAsideCents = items.reduce((sum, item) => sum + item.setAsideCents, 0);
  const stillToFundCents = items.reduce((sum, item) => sum + item.stillToFundCents, 0);
  const nearTerm = months <= NEAR_TERM_MONTHS;
  const neededPerMonthCents = nearTerm ? null : Math.ceil(stillToFundCents / months);

  // The items' share of the fund's targets decides how much of the logged deposit rate counts toward them.
  const itemTargetShare = input.fundTargetTotalCents > 0
    ? Math.min(1, input.items.reduce((sum, item) => sum + (item.targetCents ?? 0), 0) / input.fundTargetTotalCents)
    : 0;
  const currentPerMonthCents = input.depositsPerMonthCents == null ? null : Math.round(input.depositsPerMonthCents * itemTargetShare);
  const additionalPerMonthCents = neededPerMonthCents == null || currentPerMonthCents == null ? null : Math.max(0, neededPerMonthCents - currentPerMonthCents);

  return {
    planningDate, planningDateFromHomeowner: input.targetDate != null, months, items,
    costAtTargetCents, setAsideCents, stillToFundCents, neededPerMonthCents, currentPerMonthCents, additionalPerMonthCents,
    nearTerm, growthRate,
  };
}

/** Average monthly DEPOSIT over the trailing ledger window. WITHDRAWAL and BALANCE_CORRECTION rows are not saving behaviour. */
export function depositsPerMonth(
  rows: ReadonlyArray<{ type: string; amountCents: number; occurredAt: Date }>,
  now: Date,
  windowMonths: number = DEPOSIT_RATE_WINDOW_MONTHS,
): { perMonthCents: number; depositCount: number } {
  const since = new Date(now.getFullYear(), now.getMonth() - windowMonths, now.getDate());
  const deposits = rows.filter((row) => row.type === 'DEPOSIT' && row.amountCents > 0 && row.occurredAt >= since);
  const total = deposits.reduce((sum, row) => sum + row.amountCents, 0);
  return { perMonthCents: Math.round(total / windowMonths), depositCount: deposits.length };
}
