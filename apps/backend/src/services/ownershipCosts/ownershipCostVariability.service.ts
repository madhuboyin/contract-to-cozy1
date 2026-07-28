import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import {
  type OwnershipCostCategory,
  type OwnershipCostEvidenceStatus,
  type OwnershipCostFreshnessStatus,
  type OwnershipCostLens,
  type OwnershipCostVerificationStatus,
} from './ownershipCost.contract';
import {
  ownershipCostForecastService,
  type OwnershipCostForecastReadModel,
} from './ownershipCostForecast.service';
import {
  type OwnershipCostCurrentLens,
} from './ownershipCostReadModel.service';
import { OwnershipCostAccessDeniedError } from './ownershipCostObservation.service';

const REQUIRED_COMPARABLE_PERIODS = 3;
const DAY_MS = 86_400_000;
const MIN_ANNUAL_DAYS = 320;
const MAX_ANNUAL_DAYS = 410;

const OBSERVED_EVIDENCE = new Set<OwnershipCostEvidenceStatus>([
  'OBSERVED',
  'CONFIRMED',
  'HOMEOWNER_REPORTED',
  'EXTRACTED',
]);

const ONE_TIME_CATEGORIES = new Set<OwnershipCostCategory>([
  'KNOWN_REPAIR',
  'CAPITAL_PROJECT',
]);

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

type VariabilityLine = {
  category: OwnershipCostCategory;
  subcategory: string | null;
  annualizedAmountCents: number | null;
  applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  evidenceStatus: OwnershipCostEvidenceStatus | null;
  verificationStatus: OwnershipCostVerificationStatus;
  freshnessStatus: OwnershipCostFreshnessStatus;
  includedLenses: OwnershipCostLens[];
  sourceObservation: {
    id: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    temporalKind:
      | 'CURRENT_PERIOD'
      | 'OBSERVED_PAST_PERIOD'
      | 'FORECAST_PERIOD'
      | 'SCENARIO_PERIOD';
    sourceDomain: string;
    sourceEntityType: string | null;
    sourceEntityId: string | null;
    sourceDocumentId: string | null;
  };
};

export type OwnershipCostVariabilitySnapshot = {
  id: string;
  inputFingerprint: string;
  methodVersion: string;
  categoryDefinitionVersion: string;
  basePeriodStart: Date;
  basePeriodEnd: Date;
  computedAt: Date;
  lines: VariabilityLine[];
};

type PeriodMeasurement = {
  snapshotId: string;
  year: number;
  periodStart: string;
  periodEnd: string;
  recurringCents: number;
  oneTimeCents: number;
};

export type OwnershipCostVariabilityReadModel = {
  propertyId: string;
  selectedLens: OwnershipCostCurrentLens;
  eligibility: {
    eligible: boolean;
    requiredComparablePeriods: number;
    comparableObservedPeriods: number;
    reason: string;
    stableMethodVersion: string | null;
    stableCategoryDefinitionVersion: string | null;
    measuredCategories: OwnershipCostCategory[];
    excludedCategories: Array<{
      category: OwnershipCostCategory;
      reason: string;
    }>;
  };
  measured: {
    status: 'MEASURED_OBSERVED' | 'INSUFFICIENT_HISTORY';
    currency: 'USD';
    periods: PeriodMeasurement[];
    recurring: {
      averageAnnualCents: number;
      observedLowCents: number;
      observedHighCents: number;
      standardDeviationCents: number;
      maxYearOverYearSwingCents: number;
      variabilityRatio: number | null;
      formula: string;
    } | null;
    categoryBreakdown: Array<{
      category: OwnershipCostCategory;
      label: string;
      annualAmountsCents: number[];
      observedLowCents: number;
      observedHighCents: number;
      standardDeviationCents: number;
    }>;
    oneTimeCapital: {
      excludedFromRecurringVariability: true;
      observedByPeriod: Array<{
        snapshotId: string;
        year: number;
        amountCents: number;
      }>;
    };
  };
  planningBuffer: {
    basis: 'SCENARIO_NOT_MEASURED_VOLATILITY';
    forecastId: string | null;
    horizonYears: number;
    monthlyCashBufferCents: number;
    capitalReserveCents: number;
    monthlyMethod: string;
    capitalMethod: string;
    nonDuplicationRule: string;
    monthlyHandoff: {
      target: 'BUDGET_PLANNER';
      enabled: boolean;
      label: string;
    };
    capitalHandoff: {
      target: 'RESERVE_FUND';
      enabled: boolean;
      label: string;
    };
  };
  limitations: string[];
};

export type OwnershipCostPlanningDecision = {
  id: string;
  decisionType: 'MONTHLY_CASH_BUFFER' | 'CAPITAL_RESERVE';
  amountCents: number;
  recordedAt: string;
  handoff: {
    target: 'BUDGET_PLANNER' | 'RESERVE_FUND';
    href: string;
  };
};

type VariabilityDependencies = {
  authorize: (userId: string, propertyId: string) => Promise<boolean>;
  loadSnapshots: (
    propertyId: string,
  ) => Promise<OwnershipCostVariabilitySnapshot[]>;
  loadForecast: (
    propertyId: string,
    userId: string,
    lens: OwnershipCostCurrentLens,
  ) => Promise<OwnershipCostForecastReadModel>;
  persistDecision: (input: {
    propertyId: string;
    snapshotId: string;
    scenarioId: string | null;
    userId: string;
    decisionType: 'MONTHLY_CASH_BUFFER' | 'CAPITAL_RESERVE';
    payload: Record<string, unknown>;
  }) => Promise<{ id: string; recordedAt: Date }>;
};

function periodDays(start: Date, end: Date) {
  return (end.getTime() - start.getTime() + 1) / DAY_MS;
}

function annualSnapshot(snapshot: OwnershipCostVariabilitySnapshot) {
  const days = periodDays(snapshot.basePeriodStart, snapshot.basePeriodEnd);
  return days >= MIN_ANNUAL_DAYS && days <= MAX_ANNUAL_DAYS;
}

function observedAnnualLines(
  snapshot: OwnershipCostVariabilitySnapshot,
  category: OwnershipCostCategory,
  lens: OwnershipCostCurrentLens,
) {
  const lines = snapshot.lines.filter((line) =>
    line.category === category
    && line.includedLenses.includes(lens)
    && line.applicability === 'APPLICABLE'
    && line.annualizedAmountCents != null
    && line.evidenceStatus != null
    && OBSERVED_EVIDENCE.has(line.evidenceStatus)
    && line.verificationStatus !== 'UNVERIFIED'
    && ['CURRENT_PERIOD', 'OBSERVED_PAST_PERIOD']
      .includes(line.sourceObservation.temporalKind));
  if (lines.length === 0) return [];
  const starts = lines
    .map((line) => line.sourceObservation.periodStart)
    .filter((value): value is Date => value != null);
  const ends = lines
    .map((line) => line.sourceObservation.periodEnd)
    .filter((value): value is Date => value != null);
  if (starts.length !== lines.length || ends.length !== lines.length) return [];
  const start = new Date(Math.min(...starts.map((value) => value.getTime())));
  const end = new Date(Math.max(...ends.map((value) => value.getTime())));
  const days = periodDays(start, end);
  return days >= MIN_ANNUAL_DAYS && days <= MAX_ANNUAL_DAYS
    ? lines
    : [];
}

function stableSubcategories(lines: VariabilityLine[]) {
  return [...new Set(
    lines.map((line) => line.subcategory ?? '__CATEGORY_TOTAL__'),
  )].sort().join('|');
}

function sumLines(lines: VariabilityLine[]) {
  return lines.reduce(
    (total, line) => total + (line.annualizedAmountCents ?? 0),
    0,
  );
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sampleStandardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce(
    (total, value) => total + ((value - mean) ** 2),
    0,
  ) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxYearOverYearSwing(values: number[]) {
  return values.slice(1).reduce(
    (maximum, value, index) =>
      Math.max(maximum, Math.abs(value - values[index])),
    0,
  );
}

function compatibleWindow(snapshots: OwnershipCostVariabilitySnapshot[]) {
  const latest = snapshots[0];
  if (!latest) return [];
  return snapshots
    .filter((snapshot) =>
      snapshot.methodVersion === latest.methodVersion
      && snapshot.categoryDefinitionVersion
        === latest.categoryDefinitionVersion
      && annualSnapshot(snapshot))
    .sort((left, right) =>
      left.basePeriodStart.getTime() - right.basePeriodStart.getTime())
    .filter((snapshot, index, compatible) =>
      index === 0
      || compatible[index - 1].basePeriodEnd < snapshot.basePeriodStart)
    .slice(-REQUIRED_COMPARABLE_PERIODS);
}

function planningBuffer(forecast: OwnershipCostForecastReadModel) {
  const recurringDrivers = forecast.drivers.filter(
    (driver) => !ONE_TIME_CATEGORIES.has(driver.category),
  );
  const capitalDrivers = forecast.drivers.filter(
    (driver) => ONE_TIME_CATEGORIES.has(driver.category),
  );
  const annualScenarioRangeCents = recurringDrivers.reduce(
    (total, driver) => total + Math.max(0, driver.sensitivityCents),
    0,
  );
  const capitalReserveCents = capitalDrivers.reduce(
    (total, driver) => total + driver.knownEvents
      .filter((event) => !event.recurring && event.deltaCents > 0)
      .reduce((subtotal, event) => subtotal + event.deltaCents, 0),
    0,
  );
  return {
    basis: 'SCENARIO_NOT_MEASURED_VOLATILITY' as const,
    forecastId: forecast.forecastId,
    horizonYears: forecast.horizonYears,
    monthlyCashBufferCents: Math.ceil(annualScenarioRangeCents / 12),
    capitalReserveCents,
    monthlyMethod:
      'Sum of recurring-category high-minus-low sensitivity at the selected forecast horizon, divided by 12.',
    capitalMethod:
      'Sum of supported positive one-time repair and capital events in the forecast horizon.',
    nonDuplicationRule:
      'Monthly cash buffer excludes one-time repair and capital categories; capital reserve excludes recurring-category sensitivity.',
    monthlyHandoff: {
      target: 'BUDGET_PLANNER' as const,
      enabled: annualScenarioRangeCents > 0,
      label: 'Send monthly buffer to Budget Planner',
    },
    capitalHandoff: {
      target: 'RESERVE_FUND' as const,
      enabled: capitalReserveCents > 0,
      label: 'Send capital need to Reserve Fund',
    },
  };
}

export function buildOwnershipCostVariability(
  propertyId: string,
  snapshots: OwnershipCostVariabilitySnapshot[],
  forecast: OwnershipCostForecastReadModel,
  lens: OwnershipCostCurrentLens,
): OwnershipCostVariabilityReadModel {
  const window = compatibleWindow(snapshots);
  const latest = snapshots[0] ?? null;
  const recurringCategories = (
    latest
      ? [...new Set(latest.lines
        .filter((line) =>
          line.includedLenses.includes(lens)
          && !ONE_TIME_CATEGORIES.has(line.category))
        .map((line) => line.category))]
      : []
  ).sort();
  const measuredCategories: OwnershipCostCategory[] = [];
  const excludedCategories: OwnershipCostVariabilityReadModel[
    'eligibility'
  ]['excludedCategories'] = [];
  const categoryLines = new Map<
    OwnershipCostCategory,
    VariabilityLine[][]
  >();

  for (const category of recurringCategories) {
    const linesByPeriod = window.map((snapshot) =>
      observedAnnualLines(snapshot, category, lens));
    if (
      window.length !== REQUIRED_COMPARABLE_PERIODS
      || linesByPeriod.some((lines) => lines.length === 0)
    ) {
      excludedCategories.push({
        category,
        reason:
          'Three complete observed annual periods are not available for this category.',
      });
      continue;
    }
    const subcategoryShapes = new Set(
      linesByPeriod.map(stableSubcategories),
    );
    if (subcategoryShapes.size !== 1) {
      excludedCategories.push({
        category,
        reason: 'Category scope changed across the observed window.',
      });
      continue;
    }
    measuredCategories.push(category);
    categoryLines.set(category, linesByPeriod);
  }

  const eligible = window.length === REQUIRED_COMPARABLE_PERIODS
    && measuredCategories.length > 0;
  const periods = window.map((snapshot, periodIndex) => {
    const recurringCents = measuredCategories.reduce(
      (total, category) =>
        total + sumLines(categoryLines.get(category)![periodIndex]),
      0,
    );
    const oneTimeCents = snapshot.lines
      .filter((line) =>
        ONE_TIME_CATEGORIES.has(line.category)
        && line.includedLenses.includes(lens)
        && line.applicability === 'APPLICABLE'
        && line.annualizedAmountCents != null
        && line.evidenceStatus != null
        && OBSERVED_EVIDENCE.has(line.evidenceStatus)
        && line.verificationStatus !== 'UNVERIFIED'
        && ['CURRENT_PERIOD', 'OBSERVED_PAST_PERIOD']
          .includes(line.sourceObservation.temporalKind))
      .reduce(
        (total, line) => total + (line.annualizedAmountCents ?? 0),
        0,
      );
    return {
      snapshotId: snapshot.id,
      year: snapshot.basePeriodStart.getUTCFullYear(),
      periodStart: snapshot.basePeriodStart.toISOString(),
      periodEnd: snapshot.basePeriodEnd.toISOString(),
      recurringCents,
      oneTimeCents,
    };
  });
  const recurringValues = periods.map((period) => period.recurringCents);
  const categoryBreakdown = eligible
    ? measuredCategories.map((category) => {
      const annualAmountsCents = categoryLines.get(category)!.map(sumLines);
      return {
        category,
        label: CATEGORY_LABELS[category],
        annualAmountsCents,
        observedLowCents: Math.min(...annualAmountsCents),
        observedHighCents: Math.max(...annualAmountsCents),
        standardDeviationCents: Math.round(
          sampleStandardDeviation(annualAmountsCents),
        ),
      };
    }).sort((left, right) =>
      right.standardDeviationCents - left.standardDeviationCents)
    : [];
  const averageAnnualCents = eligible
    ? Math.round(average(recurringValues))
    : 0;

  return {
    propertyId,
    selectedLens: lens,
    eligibility: {
      eligible,
      requiredComparablePeriods: REQUIRED_COMPARABLE_PERIODS,
      comparableObservedPeriods: window.length,
      reason: eligible
        ? 'Measured from three non-overlapping observed annual periods with stable definitions and category scope.'
        : 'Not enough cost history to measure variability.',
      stableMethodVersion: window.length > 0
        ? window[0].methodVersion
        : null,
      stableCategoryDefinitionVersion: window.length > 0
        ? window[0].categoryDefinitionVersion
        : null,
      measuredCategories,
      excludedCategories,
    },
    measured: {
      status: eligible ? 'MEASURED_OBSERVED' : 'INSUFFICIENT_HISTORY',
      currency: 'USD',
      periods: eligible ? periods : [],
      recurring: eligible ? {
        averageAnnualCents,
        observedLowCents: Math.min(...recurringValues),
        observedHighCents: Math.max(...recurringValues),
        standardDeviationCents: Math.round(
          sampleStandardDeviation(recurringValues),
        ),
        maxYearOverYearSwingCents:
          maxYearOverYearSwing(recurringValues),
        variabilityRatio: averageAnnualCents > 0
          ? sampleStandardDeviation(recurringValues) / averageAnnualCents
          : null,
        formula:
          'Sample standard deviation of annual recurring totals across three comparable observed periods; one-time capital spend is excluded.',
      } : null,
      categoryBreakdown,
      oneTimeCapital: {
        excludedFromRecurringVariability: true,
        observedByPeriod: eligible
          ? periods.map((period) => ({
            snapshotId: period.snapshotId,
            year: period.year,
            amountCents: period.oneTimeCents,
          }))
          : [],
      },
    },
    planningBuffer: planningBuffer(forecast),
    limitations: [
      'Measured variability uses observed or confirmed annual evidence only; estimates, benchmarks, forecasts, and synthetic backcasts are excluded.',
      'A stable method, category definition, and category scope are required across the measured window.',
      'The planning buffer is scenario-derived and is not labeled measured volatility.',
      'No national benchmark or climate-to-cost modifier is used.',
      'The result supports household planning and is not a guarantee or professional financial advice.',
    ],
  };
}

async function defaultLoadSnapshots(propertyId: string) {
  return prisma.ownershipCostSnapshot.findMany({
    where: { propertyId },
    orderBy: { computedAt: 'desc' },
    take: 12,
    select: {
      id: true,
      inputFingerprint: true,
      methodVersion: true,
      categoryDefinitionVersion: true,
      basePeriodStart: true,
      basePeriodEnd: true,
      computedAt: true,
      lines: {
        select: {
          category: true,
          subcategory: true,
          annualizedAmountCents: true,
          applicability: true,
          evidenceStatus: true,
          verificationStatus: true,
          freshnessStatus: true,
          includedLenses: true,
          sourceObservation: {
            select: {
              id: true,
              periodStart: true,
              periodEnd: true,
              temporalKind: true,
              sourceDomain: true,
              sourceEntityType: true,
              sourceEntityId: true,
              sourceDocumentId: true,
            },
          },
        },
      },
    },
  });
}

const defaultDependencies: VariabilityDependencies = {
  authorize: async (userId, propertyId) =>
    Boolean(await resolvePropertyAccess(userId, propertyId)),
  loadSnapshots: defaultLoadSnapshots,
  loadForecast: (propertyId, userId, lens) =>
    ownershipCostForecastService.getForecast(
      propertyId,
      userId,
      lens,
      5,
    ),
  persistDecision: async (input) => prisma.ownershipCostDecision.create({
    data: {
      propertyId: input.propertyId,
      snapshotId: input.snapshotId,
      scenarioId: input.scenarioId,
      recordedByUserId: input.userId,
      decisionType: input.decisionType,
      status: 'RECORDED',
      payloadJson: input.payload as Prisma.InputJsonValue,
    },
    select: { id: true, recordedAt: true },
  }),
};

export class OwnershipCostVariabilityService {
  constructor(
    private readonly dependencies: VariabilityDependencies =
      defaultDependencies,
  ) {}

  private async assertAccess(userId: string, propertyId: string) {
    if (!await this.dependencies.authorize(userId, propertyId)) {
      throw new OwnershipCostAccessDeniedError();
    }
  }

  async getVariability(
    propertyId: string,
    userId: string,
    lens: OwnershipCostCurrentLens,
  ) {
    await this.assertAccess(userId, propertyId);
    const [snapshots, forecast] = await Promise.all([
      this.dependencies.loadSnapshots(propertyId),
      this.dependencies.loadForecast(propertyId, userId, lens),
    ]);
    if (snapshots.length === 0) {
      throw new Error('No ownership-cost snapshot is available.');
    }
    return buildOwnershipCostVariability(
      propertyId,
      snapshots,
      forecast,
      lens,
    );
  }

  async recordPlanningDecision(
    propertyId: string,
    userId: string,
    lens: OwnershipCostCurrentLens,
    decisionType: 'MONTHLY_CASH_BUFFER' | 'CAPITAL_RESERVE',
  ): Promise<OwnershipCostPlanningDecision> {
    const variability = await this.getVariability(propertyId, userId, lens);
    const amountCents = decisionType === 'MONTHLY_CASH_BUFFER'
      ? variability.planningBuffer.monthlyCashBufferCents
      : variability.planningBuffer.capitalReserveCents;
    if (amountCents <= 0) {
      throw new Error(
        decisionType === 'MONTHLY_CASH_BUFFER'
          ? 'No positive monthly planning buffer is currently available.'
          : 'No supported upcoming capital need is currently available.',
      );
    }
    const latestSnapshot = variability.measured.periods.at(-1)?.snapshotId
      ?? (await this.dependencies.loadSnapshots(propertyId))[0]?.id;
    if (!latestSnapshot) {
      throw new Error('No ownership-cost snapshot is available.');
    }
    const target = decisionType === 'MONTHLY_CASH_BUFFER'
      ? 'BUDGET_PLANNER' as const
      : 'RESERVE_FUND' as const;
    const persisted = await this.dependencies.persistDecision({
      propertyId,
      snapshotId: latestSnapshot,
      scenarioId: null,
      userId,
      decisionType,
      payload: {
        amountCents,
        basis: variability.planningBuffer.basis,
        target,
        selectedLens: lens,
        measuredEligibility: variability.eligibility.eligible,
        nonDuplicationRule: variability.planningBuffer.nonDuplicationRule,
        forecastId: variability.planningBuffer.forecastId,
      },
    });
    const query = new URLSearchParams({
      propertyId,
      ownershipCostDecisionId: persisted.id,
      ...(decisionType === 'MONTHLY_CASH_BUFFER'
        ? { ownershipCostMonthlyBufferCents: String(amountCents) }
        : { ownershipCostCapitalReserveCents: String(amountCents) }),
    });
    const href = decisionType === 'MONTHLY_CASH_BUFFER'
      ? `/dashboard/budget?${query}`
      : `/dashboard/properties/${propertyId}/tools/reserve-fund?${query}`;
    return {
      id: persisted.id,
      decisionType,
      amountCents,
      recordedAt: persisted.recordedAt.toISOString(),
      handoff: { target, href },
    };
  }
}

export const ownershipCostVariabilityService =
  new OwnershipCostVariabilityService();
