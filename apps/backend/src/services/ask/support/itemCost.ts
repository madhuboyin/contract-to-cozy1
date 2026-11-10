// Ask support: the one place that turns a capital-timeline cost into the figures a homeowner is shown. Pure, so it is tested without a database.
//
// The Home Capital Timeline stores each cost range already grown to the middle of the item's predicted window, so a stored figure is NOT today's money.
// Three bases come from that one stored range, and every reader (the repair-or-replace and profile-roof answers, the funding goal, and the replacement
// cost read) must use this module so two answers about the same item never show two unexplained figures:
//   - today:   the stored cost taken back to today's money;
//   - window:  the stored cost, grown to the middle of the expected window (as stored);
//   - target:  today's money grown to a date the homeowner named.

/** Money in the future, from today's money: value × (1 + rate)^years. */
export function grow(cents: number, rate: number, years: number): number {
  return Math.round(cents * Math.pow(1 + rate, Math.max(0, years)));
}

export function yearsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export interface ItemCostInput {
  storedMinCents: number;
  storedMaxCents: number;
  windowStart: Date;
  windowEnd: Date;
  /** Yearly cost growth the timeline used. */
  growthRate: number;
  now: Date;
  /** A date the homeowner named, if any. */
  targetDate?: Date | null;
}

export interface CostRange { minCents: number; maxCents: number }

export interface ItemCostBases {
  today: CostRange;
  window: CostRange;
  target: CostRange | null;
}

export function windowMidpoint(windowStart: Date, windowEnd: Date): Date {
  return new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
}

export function itemCostBases(input: ItemCostInput): ItemCostBases {
  const { storedMinCents, storedMaxCents, windowStart, windowEnd, growthRate, now, targetDate } = input;
  const yearsToMid = yearsBetween(now, windowMidpoint(windowStart, windowEnd));
  const back = (cents: number) => Math.round(cents / Math.pow(1 + growthRate, yearsToMid));
  const today = { minCents: back(storedMinCents), maxCents: back(storedMaxCents) };
  const target = targetDate
    ? (() => {
      const yearsToTarget = yearsBetween(now, targetDate);
      return { minCents: grow(storedMinCents / Math.pow(1 + growthRate, yearsToMid), growthRate, yearsToTarget), maxCents: grow(storedMaxCents / Math.pow(1 + growthRate, yearsToMid), growthRate, yearsToTarget) };
    })()
    : null;
  return { today, window: { minCents: storedMinCents, maxCents: storedMaxCents }, target };
}
