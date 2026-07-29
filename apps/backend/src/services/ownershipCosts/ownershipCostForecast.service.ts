import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import {
  OWNERSHIP_COST_CATEGORIES,
  type OwnershipCostCategory,
  type OwnershipCostEvidenceStatus,
  type OwnershipCostLens,
} from './ownershipCost.contract';
import {
  normalizeOwnershipCostAmount,
} from './ownershipCostAdapters';
import {
  type OwnershipCostCurrentLens,
} from './ownershipCostReadModel.service';
import { OwnershipCostAccessDeniedError } from './ownershipCostObservation.service';
import { OWNERSHIP_COST_LENS_CATEGORIES } from './ownershipCostSnapshot';

export const OWNERSHIP_COST_FORECAST_METHOD_VERSION =
  'ownership-cost-forecast-v1';
export const OWNERSHIP_COST_FORECAST_HORIZONS = [1, 3, 5, 10] as const;
export const OWNERSHIP_COST_MIN_GROWTH_RATE = -0.25;
export const OWNERSHIP_COST_MAX_GROWTH_RATE = 0.5;
export const OWNERSHIP_COST_MAX_ADJUSTMENT_CENTS = 100_000_000;

type ForecastLine = {
  category: OwnershipCostCategory;
  annualizedAmountCents: number | null;
  applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  evidenceStatus: OwnershipCostEvidenceStatus | null;
  temporalKind?: 'CURRENT_PERIOD' | 'FORECAST_PERIOD';
  includedLenses: OwnershipCostLens[];
  sourceObservation: {
    assumptionsJson: unknown;
  };
};

export type OwnershipCostForecastSnapshot = {
  id: string;
  inputFingerprint: string;
  methodVersion: string;
  categoryDefinitionVersion: string;
  basePeriodStart: Date;
  basePeriodEnd: Date;
  computedAt: Date;
  lines: ForecastLine[];
};

export type OwnershipCostScenarioOverrides = {
  categoryGrowthRates?: Partial<Record<OwnershipCostCategory, number>>;
  categoryAnnualAdjustmentsCents?: Partial<
    Record<OwnershipCostCategory, number>
  >;
};

type ForecastRange = {
  lowCents: number;
  baseCents: number;
  highCents: number;
};

export type OwnershipCostForecastDriver = {
  category: OwnershipCostCategory;
  label: string;
  baseAnnualCents: number;
  lowRate: number;
  baseRate: number;
  highRate: number;
  rateSource: 'SOURCE_BACKED' | 'SCENARIO_OVERRIDE' | 'DEFAULT_ASSUMPTION';
  rateSourceLabel: string;
  annualAdjustmentCents: number;
  knownEvents: Array<{
    year: number;
    deltaCents: number;
    label: string;
    recurring: boolean;
  }>;
  endRangeCents: ForecastRange;
  sensitivityCents: number;
};

export type OwnershipCostForecastReadModel = {
  propertyId: string;
  forecastId: string | null;
  scenario: {
    id: string;
    name: string;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'STALE';
  } | null;
  selectedLens: OwnershipCostCurrentLens;
  forecastKind: 'FORWARD_PLANNING_RANGE';
  nominalDollars: true;
  methodVersion: string;
  categoryDefinitionVersion: string;
  baseSnapshot: {
    id: string;
    inputFingerprint: string;
    periodStart: string;
    periodEnd: string;
    annualCents: number;
  };
  forecastStart: string;
  forecastEnd: string;
  horizonYears: number;
  stale: {
    isStale: boolean;
    reason: string | null;
  };
  summary: {
    firstYear: ForecastRange;
    endYear: ForecastRange;
  };
  periods: Array<ForecastRange & {
    year: number;
    periodStart: string;
    periodEnd: string;
  }>;
  drivers: OwnershipCostForecastDriver[];
  overrides: OwnershipCostScenarioOverrides;
  limitations: string[];
  disclaimer: string;
  calculationFingerprint: string;
};

export type OwnershipCostScenarioReadModel = {
  id: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'STALE';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  isStale: boolean;
  staleReason: string | null;
  forecast: OwnershipCostForecastReadModel;
};

type ScenarioRow = {
  id: string;
  propertyId: string;
  baseSnapshotId: string;
  createdByUserId: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'STALE';
  methodVersion: string;
  baseInputFingerprint: string;
  overrideFingerprint: string;
  overridesJson: unknown;
  staleReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  baseSnapshot: OwnershipCostForecastSnapshot;
  forecasts?: Array<{ id: string }>;
};

type ForecastDb = {
  ownershipCostSnapshot: {
    findFirst: (args: unknown) => Promise<OwnershipCostForecastSnapshot | null>;
  };
  ownershipCostForecast: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  ownershipCostObservation?: {
    findMany: (args: unknown) => Promise<Array<{
      category: OwnershipCostCategory;
      amountCents: number | null;
      recurrence:
        | 'ONE_TIME'
        | 'WEEKLY'
        | 'MONTHLY'
        | 'QUARTERLY'
        | 'SEMIANNUAL'
        | 'ANNUAL'
        | 'IRREGULAR';
      applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
      evidenceStatus: OwnershipCostEvidenceStatus | null;
      temporalKind: 'FORECAST_PERIOD';
      assumptionsJson: unknown;
      sourceFingerprint: string;
    }>>;
  };
  ownershipCostScenario: {
    findMany: (args: unknown) => Promise<ScenarioRow[]>;
    findFirst: (args: unknown) => Promise<ScenarioRow | null>;
    create: (args: unknown) => Promise<ScenarioRow>;
    update: (args: unknown) => Promise<ScenarioRow>;
    delete: (args: unknown) => Promise<unknown>;
  };
};

const CATEGORY_LABELS: Record<OwnershipCostCategory, string> = {
  PROPERTY_TAX: 'Property tax',
  INSURANCE: 'Home insurance',
  HOA: 'HOA dues',
  UTILITIES: 'Utilities',
  MORTGAGE_PRINCIPAL: 'Mortgage principal',
  MORTGAGE_INTEREST: 'Mortgage interest',
  PMI: 'Private mortgage insurance',
  RECURRING_HOME_SERVICE: 'Recurring home services',
  ROUTINE_MAINTENANCE: 'Routine maintenance',
  KNOWN_REPAIR: 'Known repairs',
  CAPITAL_PROJECT: 'Capital projects',
  RESERVE_CONTRIBUTION: 'Reserve contribution',
};

const DEFAULT_RATES: Record<
  OwnershipCostCategory,
  { low: number; base: number; high: number; label: string }
> = {
  PROPERTY_TAX: {
    low: 0,
    base: 0.03,
    high: 0.06,
    label: 'Planning assumption; confirm local assessment and levy rules',
  },
  INSURANCE: {
    low: 0.02,
    base: 0.06,
    high: 0.12,
    label: 'Planning assumption; actual renewal terms control',
  },
  HOA: {
    low: 0,
    base: 0.03,
    high: 0.08,
    label: 'Planning assumption; association notices control',
  },
  UTILITIES: {
    low: -0.02,
    base: 0.04,
    high: 0.1,
    label: 'Planning assumption; rate and usage may move independently',
  },
  MORTGAGE_PRINCIPAL: {
    low: 0,
    base: 0,
    high: 0,
    label: 'Held level unless a supported financing event is supplied',
  },
  MORTGAGE_INTEREST: {
    low: 0,
    base: 0,
    high: 0,
    label: 'Held level unless a supported financing event is supplied',
  },
  PMI: {
    low: -0.2,
    base: 0,
    high: 0,
    label: 'Planning range only; cancellation eligibility is not inferred',
  },
  RECURRING_HOME_SERVICE: {
    low: 0,
    base: 0.03,
    high: 0.08,
    label: 'Planning assumption; provider terms control',
  },
  ROUTINE_MAINTENANCE: {
    low: 0,
    base: 0.04,
    high: 0.1,
    label: 'Planning assumption; scope and timing remain uncertain',
  },
  KNOWN_REPAIR: {
    low: 0,
    base: 0,
    high: 0,
    label: 'One-time costs appear only when a supported event is supplied',
  },
  CAPITAL_PROJECT: {
    low: 0,
    base: 0,
    high: 0,
    label: 'One-time costs appear only when a supported event is supplied',
  },
  RESERVE_CONTRIBUTION: {
    low: 0,
    base: 0,
    high: 0,
    label: 'Held level unless the homeowner changes the planning scenario',
  },
};

const ONE_TIME_CATEGORIES = new Set<OwnershipCostCategory>([
  'KNOWN_REPAIR',
  'CAPITAL_PROJECT',
]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function addUtcYears(date: Date, years: number) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

function firstInstantAfter(date: Date) {
  return new Date(date.getTime() + 1);
}

function endBefore(date: Date) {
  return new Date(date.getTime() - 1);
}

function stringAssumptions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function assertRate(rate: number, field: string) {
  if (
    !Number.isFinite(rate)
    || rate < OWNERSHIP_COST_MIN_GROWTH_RATE
    || rate > OWNERSHIP_COST_MAX_GROWTH_RATE
  ) {
    throw new Error(
      `${field} must be between -25% and 50% per year.`,
    );
  }
}

export function validateOwnershipCostScenarioOverrides(
  value: OwnershipCostScenarioOverrides,
): OwnershipCostScenarioOverrides {
  const categoryGrowthRates: Partial<Record<OwnershipCostCategory, number>> = {};
  const categoryAnnualAdjustmentsCents: Partial<
    Record<OwnershipCostCategory, number>
  > = {};
  for (const [key, rate] of Object.entries(value.categoryGrowthRates ?? {})) {
    if (!OWNERSHIP_COST_CATEGORIES.includes(key as OwnershipCostCategory)) {
      throw new Error(`Unsupported ownership-cost category: ${key}.`);
    }
    assertRate(rate, `${key} growth rate`);
    categoryGrowthRates[key as OwnershipCostCategory] = rate;
  }
  for (
    const [key, adjustment]
    of Object.entries(value.categoryAnnualAdjustmentsCents ?? {})
  ) {
    if (!OWNERSHIP_COST_CATEGORIES.includes(key as OwnershipCostCategory)) {
      throw new Error(`Unsupported ownership-cost category: ${key}.`);
    }
    if (
      !Number.isSafeInteger(adjustment)
      || Math.abs(adjustment) > OWNERSHIP_COST_MAX_ADJUSTMENT_CENTS
    ) {
      throw new Error(
        `${key} annual adjustment must be a whole-cent amount between `
        + '-$1,000,000 and $1,000,000.',
      );
    }
    categoryAnnualAdjustmentsCents[key as OwnershipCostCategory] = adjustment;
  }
  return { categoryGrowthRates, categoryAnnualAdjustmentsCents };
}

function sourceRate(lines: ForecastLine[]) {
  for (const line of lines) {
    for (const assumption of stringAssumptions(
      line.sourceObservation.assumptionsJson,
    )) {
      const match = /^FORECAST_RATE:(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?):(.+)$/u
        .exec(assumption);
      if (!match) continue;
      const low = Number(match[1]);
      const base = Number(match[2]);
      const high = Number(match[3]);
      try {
        assertRate(low, 'Source low rate');
        assertRate(base, 'Source base rate');
        assertRate(high, 'Source high rate');
      } catch {
        continue;
      }
      if (low <= base && base <= high) {
        return { low, base, high, label: match[4].trim() };
      }
    }
  }
  return null;
}

function knownEvents(lines: ForecastLine[]) {
  return lines.flatMap((line) =>
    stringAssumptions(line.sourceObservation.assumptionsJson)
      .map((assumption) => {
        const match =
          /^FORECAST_EVENT:(\d{4}):(-?\d+):(?:(ONE_TIME|RECURRING):)?(.+)$/u
            .exec(assumption);
        if (!match) return null;
        const deltaCents = Number(match[2]);
        if (
          !Number.isSafeInteger(deltaCents)
          || Math.abs(deltaCents) > OWNERSHIP_COST_MAX_ADJUSTMENT_CENTS
        ) {
          return null;
        }
        return {
          year: Number(match[1]),
          deltaCents,
          recurring: match[3] === 'RECURRING',
          label: match[4].trim(),
        };
      })
      .filter((event): event is {
        year: number;
        deltaCents: number;
        label: string;
        recurring: boolean;
      } => event != null));
}

function annualAmount(lines: ForecastLine[]) {
  const amounts = lines
    .filter((line) =>
      line.applicability === 'APPLICABLE'
      && line.temporalKind !== 'FORECAST_PERIOD'
      && line.annualizedAmountCents != null)
    .map((line) => line.annualizedAmountCents!);
  return amounts.reduce((total, amount) => total + amount, 0);
}

function projectedAmount(
  startingCents: number,
  rate: number,
  yearIndex: number,
  annualAdjustmentCents: number,
  eventDeltaCents: number,
) {
  const adjustedBase = Math.max(0, startingCents + annualAdjustmentCents);
  return Math.max(
    0,
    Math.round(adjustedBase * ((1 + rate) ** yearIndex)) + eventDeltaCents,
  );
}

export function buildOwnershipCostForecast(
  propertyId: string,
  snapshot: OwnershipCostForecastSnapshot,
  lens: OwnershipCostCurrentLens,
  horizonYears: number,
  overridesInput: OwnershipCostScenarioOverrides = {},
): OwnershipCostForecastReadModel {
  if (
    !Number.isInteger(horizonYears)
    || horizonYears < 1
    || horizonYears > 10
  ) {
    throw new Error('Forecast horizon must be a whole number from 1 to 10.');
  }
  const overrides = validateOwnershipCostScenarioOverrides(overridesInput);
  const forecastStart = firstInstantAfter(snapshot.basePeriodEnd);
  const drivers = OWNERSHIP_COST_CATEGORIES.flatMap((category) => {
    const lines = snapshot.lines.filter((line) =>
      line.category === category && line.includedLenses.includes(lens));
    if (lines.length === 0) return [];
    const supportedRate = sourceRate(lines);
    const overrideRate = overrides.categoryGrowthRates?.[category];
    const defaults = DEFAULT_RATES[category];
    const resolvedRate = supportedRate ?? defaults;
    const rate = overrideRate != null
      ? { low: overrideRate, base: overrideRate, high: overrideRate }
      : resolvedRate;
    const events = knownEvents(lines);
    const baseAnnualCents = ONE_TIME_CATEGORIES.has(category)
      ? 0
      : annualAmount(lines);
    const annualAdjustmentCents =
      overrides.categoryAnnualAdjustmentsCents?.[category] ?? 0;
    const endYear = forecastStart.getUTCFullYear() + horizonYears - 1;
    const endEventDelta = events
      .filter((event) =>
        event.year === endYear || (event.recurring && event.year <= endYear))
      .reduce((total, event) => total + event.deltaCents, 0);
    const endRangeCents = {
      lowCents: projectedAmount(
        baseAnnualCents,
        rate.low,
        horizonYears,
        annualAdjustmentCents,
        endEventDelta,
      ),
      baseCents: projectedAmount(
        baseAnnualCents,
        rate.base,
        horizonYears,
        annualAdjustmentCents,
        endEventDelta,
      ),
      highCents: projectedAmount(
        baseAnnualCents,
        rate.high,
        horizonYears,
        annualAdjustmentCents,
        endEventDelta,
      ),
    };
    return [{
      category,
      label: CATEGORY_LABELS[category],
      baseAnnualCents,
      lowRate: rate.low,
      baseRate: rate.base,
      highRate: rate.high,
      rateSource: overrideRate != null
        ? 'SCENARIO_OVERRIDE' as const
        : supportedRate
          ? 'SOURCE_BACKED' as const
          : 'DEFAULT_ASSUMPTION' as const,
      rateSourceLabel: overrideRate != null
        ? 'Homeowner scenario override'
        : resolvedRate.label,
      annualAdjustmentCents,
      knownEvents: events,
      endRangeCents,
      sensitivityCents: endRangeCents.highCents - endRangeCents.lowCents,
    }];
  });
  const periods = Array.from({ length: horizonYears }, (_, offset) => {
    const yearIndex = offset + 1;
    const periodStart = addUtcYears(forecastStart, offset);
    const periodEnd = endBefore(addUtcYears(periodStart, 1));
    const range = drivers.reduce<ForecastRange>(
      (totals, driver) => {
        const eventDelta = driver.knownEvents
          .filter((event) =>
            event.year === periodStart.getUTCFullYear()
            || (
              event.recurring
              && event.year <= periodStart.getUTCFullYear()
            ))
          .reduce((total, event) => total + event.deltaCents, 0);
        totals.lowCents += projectedAmount(
          driver.baseAnnualCents,
          driver.lowRate,
          yearIndex,
          driver.annualAdjustmentCents,
          eventDelta,
        );
        totals.baseCents += projectedAmount(
          driver.baseAnnualCents,
          driver.baseRate,
          yearIndex,
          driver.annualAdjustmentCents,
          eventDelta,
        );
        totals.highCents += projectedAmount(
          driver.baseAnnualCents,
          driver.highRate,
          yearIndex,
          driver.annualAdjustmentCents,
          eventDelta,
        );
        return totals;
      },
      { lowCents: 0, baseCents: 0, highCents: 0 },
    );
    return {
      year: periodStart.getUTCFullYear(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      ...range,
    };
  });
  const baseAnnual = snapshot.lines
    .filter((line) =>
      line.includedLenses.includes(lens)
      && line.temporalKind !== 'FORECAST_PERIOD')
    .reduce((total, line) =>
      total + (
        line.applicability === 'APPLICABLE'
          ? line.annualizedAmountCents ?? 0
          : 0
      ), 0);
  const calculationFingerprint = fingerprint({
    methodVersion: OWNERSHIP_COST_FORECAST_METHOD_VERSION,
    snapshot: snapshot.inputFingerprint,
    categoryDefinitionVersion: snapshot.categoryDefinitionVersion,
    lens,
    horizonYears,
    overrides,
    drivers,
  });

  return {
    propertyId,
    forecastId: null,
    scenario: null,
    selectedLens: lens,
    forecastKind: 'FORWARD_PLANNING_RANGE',
    nominalDollars: true,
    methodVersion: OWNERSHIP_COST_FORECAST_METHOD_VERSION,
    categoryDefinitionVersion: snapshot.categoryDefinitionVersion,
    baseSnapshot: {
      id: snapshot.id,
      inputFingerprint: snapshot.inputFingerprint,
      periodStart: snapshot.basePeriodStart.toISOString(),
      periodEnd: snapshot.basePeriodEnd.toISOString(),
      annualCents: baseAnnual,
    },
    forecastStart: forecastStart.toISOString(),
    forecastEnd: periods.at(-1)!.periodEnd,
    horizonYears,
    stale: { isStale: false, reason: null },
    summary: {
      firstYear: {
        lowCents: periods[0].lowCents,
        baseCents: periods[0].baseCents,
        highCents: periods[0].highCents,
      },
      endYear: {
        lowCents: periods.at(-1)!.lowCents,
        baseCents: periods.at(-1)!.baseCents,
        highCents: periods.at(-1)!.highCents,
      },
    },
    periods,
    drivers: [...drivers].sort(
      (left, right) => right.sensitivityCents - left.sensitivityCents,
    ),
    overrides,
    limitations: [
      'This is a forward nominal-dollar planning range, not observed history.',
      'Default category rates are assumptions unless a source-backed rate is named.',
      'Known events appear only when a canonical source supplies an explicit dated event.',
      'The range does not predict emergencies, market quotes, tax law, or financing eligibility.',
      'Scenario overrides change only this planning calculation; canonical facts remain unchanged.',
    ],
    disclaimer:
      'This range supports planning and is not a guarantee, quote, or professional financial advice.',
    calculationFingerprint,
  };
}

function parseScenarioPayload(value: unknown): {
  lens: OwnershipCostCurrentLens;
  horizonYears: number;
  overrides: OwnershipCostScenarioOverrides;
  forwardLines: ForecastLine[];
} {
  const payload = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const lens = payload.lens === 'CASH_OUTFLOW'
    ? 'CASH_OUTFLOW'
    : 'OPERATING_EXPENSE';
  const horizonYears = typeof payload.horizonYears === 'number'
    ? payload.horizonYears
    : 5;
  const overrides = validateOwnershipCostScenarioOverrides(
    (payload.overrides ?? {}) as OwnershipCostScenarioOverrides,
  );
  const forwardLines = Array.isArray(payload.forwardLines)
    ? payload.forwardLines.filter((line): line is ForecastLine =>
      Boolean(line)
      && typeof line === 'object'
      && OWNERSHIP_COST_CATEGORIES.includes(
        (line as ForecastLine).category,
      )
      && (line as ForecastLine).temporalKind === 'FORECAST_PERIOD')
    : [];
  return { lens, horizonYears, overrides, forwardLines };
}

function retainedForwardLines(snapshot: OwnershipCostForecastSnapshot) {
  return snapshot.lines
    .filter((line) => line.temporalKind === 'FORECAST_PERIOD')
    .map((line) => ({
      ...line,
      sourceObservation: {
        assumptionsJson: stringAssumptions(
          line.sourceObservation.assumptionsJson,
        ),
      },
    }));
}

function snapshotInclude() {
  return {
    lines: {
      include: {
        sourceObservation: {
          select: { assumptionsJson: true },
        },
      },
    },
  };
}

async function defaultAuthorize(userId: string, propertyId: string) {
  return Boolean(await resolvePropertyAccess(userId, propertyId));
}

export class OwnershipCostForecastService {
  constructor(
    private readonly db: ForecastDb = prisma as unknown as ForecastDb,
    private readonly authorize = defaultAuthorize,
  ) {}

  private async assertAccess(userId: string, propertyId: string) {
    if (!await this.authorize(userId, propertyId)) {
      throw new OwnershipCostAccessDeniedError();
    }
  }

  private async latestSnapshot(propertyId: string) {
    const snapshot = await this.db.ownershipCostSnapshot.findFirst({
      where: { propertyId },
      orderBy: { computedAt: 'desc' },
      include: snapshotInclude(),
    });
    if (!snapshot) {
      throw new Error('No ownership-cost snapshot is available for forecasting.');
    }
    const futureObservations = this.db.ownershipCostObservation
      ? await this.db.ownershipCostObservation.findMany({
        where: { propertyId, temporalKind: 'FORECAST_PERIOD' },
        orderBy: [{ periodStart: 'asc' }, { sourceFingerprint: 'asc' }],
        select: {
          category: true,
          amountCents: true,
          recurrence: true,
          applicability: true,
          evidenceStatus: true,
          temporalKind: true,
          assumptionsJson: true,
          sourceFingerprint: true,
        },
      })
      : [];
    return {
      ...snapshot,
      inputFingerprint: fingerprint({
        snapshot: snapshot.inputFingerprint,
        futureObservations: futureObservations
          .map((observation) => observation.sourceFingerprint)
          .sort(),
      }),
      lines: [
        ...snapshot.lines,
        ...futureObservations.map((observation) => ({
          category: observation.category,
          annualizedAmountCents: normalizeOwnershipCostAmount(
            observation.amountCents,
            observation.recurrence,
          ).annualizedAmountCents,
          applicability: observation.applicability,
          evidenceStatus: observation.evidenceStatus,
          temporalKind: observation.temporalKind,
          includedLenses: (
            Object.keys(OWNERSHIP_COST_LENS_CATEGORIES) as OwnershipCostLens[]
          ).filter((lens) =>
            OWNERSHIP_COST_LENS_CATEGORIES[lens]
              .includes(observation.category)),
          sourceObservation: {
            assumptionsJson: observation.assumptionsJson,
          },
        })),
      ],
    };
  }

  private async persistForecast(
    forecast: OwnershipCostForecastReadModel,
    scenarioId?: string,
  ) {
    const inputFingerprint = fingerprint({
      calculationFingerprint: forecast.calculationFingerprint,
      scenarioId: scenarioId ?? null,
    });
    const existing = await this.db.ownershipCostForecast.findUnique({
      where: {
        propertyId_inputFingerprint: {
          propertyId: forecast.propertyId,
          inputFingerprint,
        },
      },
      select: { id: true },
    });
    if (existing) return { ...forecast, forecastId: existing.id };
    const persisted = await this.db.ownershipCostForecast.create({
      data: {
        propertyId: forecast.propertyId,
        baseSnapshotId: forecast.baseSnapshot.id,
        scenarioId,
        methodVersion: forecast.methodVersion,
        inputFingerprint,
        forecastStart: new Date(forecast.forecastStart),
        forecastEnd: new Date(forecast.forecastEnd),
        limitationsJson: forecast.limitations as Prisma.InputJsonValue,
        lines: {
          create: forecast.periods.flatMap((period) =>
            forecast.drivers.map((driver) => {
              const eventDelta = driver.knownEvents
                .filter((event) =>
                  event.year === period.year
                  || (event.recurring && event.year <= period.year))
                .reduce((total, event) => total + event.deltaCents, 0);
              const yearIndex =
                period.year - new Date(forecast.forecastStart).getUTCFullYear() + 1;
              return {
                category: driver.category,
                periodStart: new Date(period.periodStart),
                periodEnd: new Date(period.periodEnd),
                lowCents: projectedAmount(
                  driver.baseAnnualCents,
                  driver.lowRate,
                  yearIndex,
                  driver.annualAdjustmentCents,
                  eventDelta,
                ),
                baseCents: projectedAmount(
                  driver.baseAnnualCents,
                  driver.baseRate,
                  yearIndex,
                  driver.annualAdjustmentCents,
                  eventDelta,
                ),
                highCents: projectedAmount(
                  driver.baseAnnualCents,
                  driver.highRate,
                  yearIndex,
                  driver.annualAdjustmentCents,
                  eventDelta,
                ),
                evidenceStatus: 'FORECAST',
                driverJson: driver as unknown as Prisma.InputJsonValue,
              };
            })),
        },
      },
      select: { id: true },
    });
    return { ...forecast, forecastId: persisted.id };
  }

  async getForecast(
    propertyId: string,
    userId: string,
    lens: OwnershipCostCurrentLens,
    horizonYears: number,
  ) {
    await this.assertAccess(userId, propertyId);
    const snapshot = await this.latestSnapshot(propertyId);
    const forecast = buildOwnershipCostForecast(
      propertyId,
      snapshot,
      lens,
      horizonYears,
    );
    const inputFingerprint = fingerprint({
      calculationFingerprint: forecast.calculationFingerprint,
      scenarioId: null,
    });
    const persisted = await this.db.ownershipCostForecast.findUnique({
      where: {
        propertyId_inputFingerprint: { propertyId, inputFingerprint },
      },
      select: { id: true },
    });
    return { ...forecast, forecastId: persisted?.id ?? null };
  }

  async recalculateForecast(
    propertyId: string,
    userId: string,
    lens: OwnershipCostCurrentLens,
    horizonYears: number,
  ) {
    await this.assertAccess(userId, propertyId);
    const snapshot = await this.latestSnapshot(propertyId);
    return this.persistForecast(
      buildOwnershipCostForecast(
        propertyId,
        snapshot,
        lens,
        horizonYears,
      ),
    );
  }

  async listScenarios(
    propertyId: string,
    userId: string,
    includeArchived = false,
  ): Promise<OwnershipCostScenarioReadModel[]> {
    await this.assertAccess(userId, propertyId);
    const latest = await this.latestSnapshot(propertyId);
    const rows = await this.db.ownershipCostScenario.findMany({
      where: {
        propertyId,
        ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        baseSnapshot: { include: snapshotInclude() },
        forecasts: {
          orderBy: { computedAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    return rows.map((row) => this.scenarioModel(row, latest));
  }

  private scenarioModel(
    row: ScenarioRow,
    latest: OwnershipCostForecastSnapshot,
  ): OwnershipCostScenarioReadModel {
    const payload = parseScenarioPayload(row.overridesJson);
    const stale = row.baseInputFingerprint !== latest.inputFingerprint
      || row.methodVersion !== OWNERSHIP_COST_FORECAST_METHOD_VERSION;
    const staleReason = stale
      ? 'Canonical ownership-cost inputs changed after this scenario was saved.'
      : row.staleReason;
    const retainedBase = {
      ...row.baseSnapshot,
      inputFingerprint: row.baseInputFingerprint,
      lines: [...row.baseSnapshot.lines, ...payload.forwardLines],
    };
    const forecast = buildOwnershipCostForecast(
      row.propertyId,
      retainedBase,
      payload.lens,
      payload.horizonYears,
      payload.overrides,
    );
    forecast.forecastId = row.forecasts?.[0]?.id ?? null;
    forecast.scenario = {
      id: row.id,
      name: row.name,
      status: stale ? 'STALE' : row.status,
    };
    forecast.stale = { isStale: stale, reason: staleReason };
    return {
      id: row.id,
      name: row.name,
      status: stale ? 'STALE' : row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      isStale: stale,
      staleReason,
      forecast,
    };
  }

  async createScenario(
    propertyId: string,
    userId: string,
    input: {
      name: string;
      lens: OwnershipCostCurrentLens;
      horizonYears: number;
      overrides: OwnershipCostScenarioOverrides;
    },
  ) {
    await this.assertAccess(userId, propertyId);
    const snapshot = await this.latestSnapshot(propertyId);
    const overrides = validateOwnershipCostScenarioOverrides(input.overrides);
    const payload = {
      lens: input.lens,
      horizonYears: input.horizonYears,
      overrides,
      forwardLines: retainedForwardLines(snapshot),
    };
    const forecast = buildOwnershipCostForecast(
      propertyId,
      snapshot,
      input.lens,
      input.horizonYears,
      overrides,
    );
    const row = await this.db.ownershipCostScenario.create({
      data: {
        propertyId,
        baseSnapshotId: snapshot.id,
        createdByUserId: userId,
        name: input.name.trim(),
        status: 'ACTIVE',
        methodVersion: OWNERSHIP_COST_FORECAST_METHOD_VERSION,
        baseInputFingerprint: snapshot.inputFingerprint,
        overrideFingerprint: fingerprint(payload),
        overridesJson: payload as Prisma.InputJsonValue,
      },
      include: {
        baseSnapshot: { include: snapshotInclude() },
        forecasts: { select: { id: true } },
      },
    });
    const persisted = await this.persistForecast(forecast, row.id);
    row.forecasts = [{ id: persisted.forecastId! }];
    return this.scenarioModel(row, snapshot);
  }

  async updateScenario(
    propertyId: string,
    scenarioId: string,
    userId: string,
    patch: {
      name?: string;
      status?: 'ACTIVE' | 'ARCHIVED';
      lens?: OwnershipCostCurrentLens;
      horizonYears?: number;
      overrides?: OwnershipCostScenarioOverrides;
    },
  ) {
    await this.assertAccess(userId, propertyId);
    const current = await this.db.ownershipCostScenario.findFirst({
      where: { id: scenarioId, propertyId },
      include: {
        baseSnapshot: { include: snapshotInclude() },
        forecasts: {
          orderBy: { computedAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!current) throw new Error('Ownership-cost scenario was not found.');
    const previous = parseScenarioPayload(current.overridesJson);
    const payload = {
      lens: patch.lens ?? previous.lens,
      horizonYears: patch.horizonYears ?? previous.horizonYears,
      overrides: patch.overrides == null
        ? previous.overrides
        : validateOwnershipCostScenarioOverrides(patch.overrides),
      forwardLines: previous.forwardLines,
    };
    const calculationChanged = patch.lens != null
      || patch.horizonYears != null
      || patch.overrides != null;
    const updated = await this.db.ownershipCostScenario.update({
      where: { id: scenarioId },
      data: {
        ...(patch.name == null ? {} : { name: patch.name.trim() }),
        ...(patch.status == null ? {} : {
          status: patch.status,
          archivedAt: patch.status === 'ARCHIVED' ? new Date() : null,
        }),
        ...(calculationChanged ? {
          overridesJson: payload as Prisma.InputJsonValue,
          overrideFingerprint: fingerprint(payload),
        } : {}),
      },
      include: {
        baseSnapshot: { include: snapshotInclude() },
        forecasts: {
          orderBy: { computedAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (calculationChanged) {
      const persisted = await this.persistForecast(
        buildOwnershipCostForecast(
          propertyId,
          {
            ...current.baseSnapshot,
            inputFingerprint: current.baseInputFingerprint,
            lines: [
              ...current.baseSnapshot.lines,
              ...previous.forwardLines,
            ],
          },
          payload.lens,
          payload.horizonYears,
          payload.overrides,
        ),
        scenarioId,
      );
      updated.forecasts = [{ id: persisted.forecastId! }];
    }
    const latest = await this.latestSnapshot(propertyId);
    return this.scenarioModel(updated, latest);
  }

  async deleteScenario(
    propertyId: string,
    scenarioId: string,
    userId: string,
  ) {
    await this.assertAccess(userId, propertyId);
    const scenario = await this.db.ownershipCostScenario.findFirst({
      where: { id: scenarioId, propertyId },
      include: {
        baseSnapshot: { include: snapshotInclude() },
      },
    });
    if (!scenario) throw new Error('Ownership-cost scenario was not found.');
    await this.db.ownershipCostScenario.delete({ where: { id: scenarioId } });
  }
}

export const ownershipCostForecastService =
  new OwnershipCostForecastService();
