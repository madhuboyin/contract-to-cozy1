import { HomeSavingsBillingCadence, Prisma } from '@prisma/client';

function decimalEquals(a: Prisma.Decimal | null, b: number | null): boolean {
  if (a === null || b === null) return a === null && b === null;
  return a.toNumber() === b;
}

function dateEquals(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === null && b === null;
  return a.getTime() === b.getTime();
}

/**
 * True when a HomeSavingsAccount's cached copy of a canonical record's
 * facts (insurance premium, warranty cost, renewal date, etc.) has drifted
 * from the canonical record's current values — the account was only ever
 * populated once at first capture, so without this check a later edit to
 * the real policy/warranty would go unnoticed indefinitely.
 */
export function canonicalFactsChanged(
  cached: {
    providerName: string | null;
    planName: string | null;
    amount: Prisma.Decimal | null;
    startDate: Date | null;
    renewalDate: Date | null;
    contractEndDate: Date | null;
  },
  canonical: {
    providerName: string | null;
    planName: string | null;
    amount: number | null;
    startDate: Date | null;
    renewalDate: Date | null;
    contractEndDate: Date | null;
  }
): boolean {
  return (
    cached.providerName !== canonical.providerName ||
    cached.planName !== canonical.planName ||
    !decimalEquals(cached.amount, canonical.amount) ||
    !dateEquals(cached.startDate, canonical.startDate) ||
    !dateEquals(cached.renewalDate, canonical.renewalDate) ||
    !dateEquals(cached.contractEndDate, canonical.contractEndDate)
  );
}

export function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'object' && value && 'toNumber' in (value as Record<string, unknown>)) {
    const next = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(next) ? next : undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateEstimatedPaybackMonths(
  estimatedMonthlySavings: number | null,
  estimatedAnnualSavings: number | null,
  estimatedSwitchingCost: number | null,
): number | null {
  const grossMonthlySavings =
    estimatedMonthlySavings
    ?? (estimatedAnnualSavings != null ? estimatedAnnualSavings / 12 : null);
  if (
    grossMonthlySavings == null
    || grossMonthlySavings <= 0
    || estimatedSwitchingCost == null
  ) {
    return null;
  }
  return estimatedSwitchingCost <= 0
    ? 0
    : round2(estimatedSwitchingCost / grossMonthlySavings);
}

export function highestSingleAnnualSavings(
  opportunities: Array<{
    netAnnualSavings: number | null | undefined;
    estimatedAnnualSavings: number | null | undefined;
  }>,
): number {
  return round2(opportunities.reduce((highest, opportunity) => {
    const value =
      opportunity.netAnnualSavings
      ?? opportunity.estimatedAnnualSavings
      ?? 0;
    return Math.max(highest, value);
  }, 0));
}

export function amountToMonthly(amount: number | undefined, cadence: HomeSavingsBillingCadence): number | undefined {
  if (amount === undefined || !Number.isFinite(amount) || amount < 0) return undefined;

  switch (cadence) {
    case HomeSavingsBillingCadence.MONTHLY:
      return amount;
    case HomeSavingsBillingCadence.QUARTERLY:
      return amount / 3;
    case HomeSavingsBillingCadence.ANNUAL:
      return amount / 12;
    case HomeSavingsBillingCadence.OTHER:
    default:
      return amount;
  }
}

export function amountToAnnual(amount: number | undefined, cadence: HomeSavingsBillingCadence): number | undefined {
  if (amount === undefined || !Number.isFinite(amount) || amount < 0) return undefined;

  switch (cadence) {
    case HomeSavingsBillingCadence.MONTHLY:
      return amount * 12;
    case HomeSavingsBillingCadence.QUARTERLY:
      return amount * 4;
    case HomeSavingsBillingCadence.ANNUAL:
      return amount;
    case HomeSavingsBillingCadence.OTHER:
    default:
      return amount * 12;
  }
}

export function pickStateValue(
  source: Record<string, unknown> | undefined,
  state: string | null | undefined,
  fallback: number
): number {
  if (!source) return fallback;
  const normalizedState = (state || '').toUpperCase();
  const stateValue = asNumber(source[normalizedState]);
  if (stateValue !== undefined) return stateValue;
  const defaultValue = asNumber(source.default);
  if (defaultValue !== undefined) return defaultValue;
  return fallback;
}

export function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  const diffMs = date.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
