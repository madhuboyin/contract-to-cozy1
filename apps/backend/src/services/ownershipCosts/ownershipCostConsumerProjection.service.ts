import {
  ownershipCostForecastService,
  type OwnershipCostForecastReadModel,
} from './ownershipCostForecast.service';
import {
  ownershipCostReadModelService,
  type OwnershipCostCurrentLens,
  type OwnershipCostReadModel,
} from './ownershipCostReadModel.service';

export const OWNERSHIP_COST_CONSUMER_CONTRACT_VERSION =
  'ownership-cost-consumer-v1';

export type OwnershipCostConsumerProjection = {
  contractVersion: typeof OWNERSHIP_COST_CONSUMER_CONTRACT_VERSION;
  propertyId: string;
  lens: OwnershipCostCurrentLens;
  snapshot: {
    id: string;
    definitionVersion: string;
    methodVersion: string;
    categoryDefinitionVersion: string;
    inputPeriodStart: string;
    inputPeriodEnd: string;
    calculatedAt: string;
    coverageStatus: OwnershipCostReadModel['snapshot']['coverageStatus'];
    annualCents: number;
  };
  forecast: {
    id: string | null;
    methodVersion: string;
    categoryDefinitionVersion: string;
    calculationFingerprint: string;
    horizonYears: number;
    stale: boolean;
  };
  currentAnnualDollars: number;
  forwardAnnualDollars: Array<{
    year: number;
    low: number;
    base: number;
    high: number;
  }>;
  categoryAnnualDollars: Partial<Record<
    OwnershipCostReadModel['categories'][number]['category'],
    number
  >>;
  limitations: string[];
};

type ConsumerDependencies = {
  loadCurrent: (
    propertyId: string,
    userId: string,
    lens: OwnershipCostCurrentLens,
  ) => Promise<OwnershipCostReadModel>;
  loadForecast: (
    propertyId: string,
    userId: string,
    lens: OwnershipCostCurrentLens,
    horizonYears: number,
  ) => Promise<OwnershipCostForecastReadModel>;
};

const defaultDependencies: ConsumerDependencies = {
  loadCurrent: (propertyId, userId, lens) =>
    ownershipCostReadModelService.getCurrent(
      propertyId,
      userId,
      lens,
      { refresh: true },
    ),
  loadForecast: (propertyId, userId, lens, horizonYears) =>
    ownershipCostForecastService.getForecast(
      propertyId,
      userId,
      lens,
      horizonYears,
    ),
};

function dollars(cents: number) {
  return Math.round(cents) / 100;
}

export class OwnershipCostConsumerProjectionService {
  constructor(
    private readonly dependencies: ConsumerDependencies =
      defaultDependencies,
  ) {}

  async getProjection(input: {
    propertyId: string;
    userId: string;
    lens: OwnershipCostCurrentLens;
    horizonYears: number;
  }): Promise<OwnershipCostConsumerProjection> {
    if (!input.userId) {
      throw new Error('A homeowner is required to load ownership-cost truth.');
    }
    if (
      !Number.isInteger(input.horizonYears)
      || input.horizonYears < 1
      || input.horizonYears > 10
    ) {
      throw new Error('Ownership-cost consumer horizons must be between 1 and 10 years.');
    }
    const current = await this.dependencies.loadCurrent(
      input.propertyId,
      input.userId,
      input.lens,
    );
    const forecast = await this.dependencies.loadForecast(
      input.propertyId,
      input.userId,
      input.lens,
      input.horizonYears,
    );
    if (
      forecast.baseSnapshot.id !== current.snapshot.id
      || forecast.selectedLens !== input.lens
    ) {
      throw new Error(
        'Ownership-cost snapshot changed during projection; retry with one consistent lens.',
      );
    }

    const categoryAnnualDollars = Object.fromEntries(
      current.categories
        .filter((category) =>
          category.includedInSelectedLens && category.amountCents != null)
        .map((category) => [
          category.category,
          dollars(category.amountCents as number),
        ]),
    );

    return {
      contractVersion: OWNERSHIP_COST_CONSUMER_CONTRACT_VERSION,
      propertyId: input.propertyId,
      lens: input.lens,
      snapshot: {
        id: current.snapshot.id,
        definitionVersion: current.definitionVersion,
        methodVersion: current.methodVersion,
        categoryDefinitionVersion: current.categoryDefinitionVersion,
        inputPeriodStart: current.snapshot.basePeriodStart,
        inputPeriodEnd: current.snapshot.basePeriodEnd,
        calculatedAt: current.snapshot.calculatedAt,
        coverageStatus: current.snapshot.coverageStatus,
        annualCents: current.snapshot.annualTotalCents,
      },
      forecast: {
        id: forecast.forecastId,
        methodVersion: forecast.methodVersion,
        categoryDefinitionVersion: forecast.categoryDefinitionVersion,
        calculationFingerprint: forecast.calculationFingerprint,
        horizonYears: forecast.horizonYears,
        stale: forecast.stale.isStale,
      },
      currentAnnualDollars: dollars(current.snapshot.annualTotalCents),
      forwardAnnualDollars: forecast.periods.map((period) => ({
        year: period.year,
        low: dollars(period.lowCents),
        base: dollars(period.baseCents),
        high: dollars(period.highCents),
      })),
      categoryAnnualDollars,
      limitations: [
        ...current.limitations,
        ...forecast.limitations,
        `Consumer lens is fixed to ${input.lens}; consumers must not reinterpret this total under another lens.`,
      ],
    };
  }
}

export const ownershipCostConsumerProjectionService =
  new OwnershipCostConsumerProjectionService();
