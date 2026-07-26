import { prisma } from '../lib/prisma';
import { logger, type AppLogger } from '../lib/logger';
import {
  socrataTaxAdapter,
  validateTaxAssessorDataSource,
} from './taxAssessorAdapters/socrataTaxAdapter';
import {
  type PropertyAddress,
  type RawTaxAssessmentRecord,
  type TaxAssessmentCoverageRegistration,
  type TaxAssessorDataSourceConfig,
} from './taxAssessorAdapters/taxAssessmentTypes';

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function stateCode(value: string): string {
  return value.trim().toUpperCase();
}

function countyFips(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/\D/g, '');
  return /^\d{5}$/.test(normalized) ? normalized : null;
}

export function taxCoverageKey(
  coverageType: TaxAssessorDataSourceConfig['coverageType'],
  property: Pick<PropertyForTaxFetch, 'city' | 'state' | 'countyFips'>,
): string | null {
  const state = stateCode(property.state ?? '');
  if (!/^[A-Z]{2}$/.test(state)) return null;
  if (coverageType === 'STATE') return `US-${state}`;
  if (coverageType === 'COUNTY') {
    const fips = countyFips(property.countyFips);
    return fips ? `US-${state}-COUNTY-${fips}` : null;
  }
  const city = slug(property.city ?? '');
  return city ? `US-${state}-${city}` : null;
}

export function taxCoverageRegistration(
  dataSource: TaxAssessorDataSourceConfig,
): TaxAssessmentCoverageRegistration | null {
  const key = dataSource.normalizedCoverageKey.trim();
  if (dataSource.coverageType === 'STATE') {
    const match = /^US-([A-Z]{2})$/.exec(key);
    return match
      ? { coverageType: 'state', countryCode: 'US', stateCode: match[1] }
      : null;
  }
  if (dataSource.coverageType === 'COUNTY') {
    const match = /^US-([A-Z]{2})-COUNTY-(\d{5})$/.exec(key);
    return match
      ? { coverageType: 'county', countryCode: 'US', countyFips: match[2] }
      : null;
  }
  const match = /^US-([A-Z]{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(key);
  return match
    ? {
        coverageType: 'city',
        countryCode: 'US',
        stateCode: match[1],
        cityName: match[2].replace(/-/g, ' '),
      }
    : null;
}

export type PropertyForTaxFetch = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  countyFips?: string | null;
};

export type TaxAssessmentFetchResult = {
  property: PropertyForTaxFetch;
  dataSource: TaxAssessorDataSourceConfig;
  records: RawTaxAssessmentRecord[];
};

export type PreparedTaxAssessmentSources = {
  sources: TaxAssessorDataSourceConfig[];
  coverage: TaxAssessmentCoverageRegistration[];
  invalidSources: number;
};

export type TaxAssessmentFetchBatch = {
  results: TaxAssessmentFetchResult[];
  propertiesExamined: number;
  propertiesCovered: number;
  propertiesUncovered: number;
  fetchAttempts: number;
  fetchSucceeded: number;
  fetchFailed: number;
  invalidSources: number;
};

type TaxAssessmentFetchDb = Pick<typeof prisma, 'taxAssessorDataSource'>;
type TaxAssessmentAdapter = Pick<
  typeof socrataTaxAdapter,
  'fetchAssessments'
>;

function propertyAddress(property: PropertyForTaxFetch): PropertyAddress {
  return {
    street: property.address,
    city: property.city,
    state: property.state,
    postalCode: property.zipCode || undefined,
    countyFips: property.countyFips ?? undefined,
  };
}

function addressCacheKey(
  dataSourceId: string,
  address: PropertyAddress,
): string {
  return [
    dataSourceId,
    address.street.trim().toUpperCase().replace(/\s+/g, ' '),
    address.city.trim().toUpperCase(),
    address.state.trim().toUpperCase(),
    (address.postalCode ?? '').slice(0, 5),
  ].join('|');
}

function sourceForProperty(
  property: PropertyForTaxFetch,
  byKey: Map<string, TaxAssessorDataSourceConfig>,
): TaxAssessorDataSourceConfig | null {
  for (const coverageType of ['CITY', 'COUNTY', 'STATE'] as const) {
    const key = taxCoverageKey(coverageType, property);
    if (key && byKey.has(key)) return byKey.get(key)!;
  }
  return null;
}

export class TaxAssessmentFetchService {
  constructor(
    private readonly db: TaxAssessmentFetchDb = prisma,
    private readonly adapter: TaxAssessmentAdapter = socrataTaxAdapter,
    private readonly log: AppLogger = logger,
  ) {}

  async prepareSources(): Promise<PreparedTaxAssessmentSources> {
    const rows = await this.db.taxAssessorDataSource.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { id: 'asc' },
    });
    const sources: TaxAssessorDataSourceConfig[] = [];
    const coverage: TaxAssessmentCoverageRegistration[] = [];
    let invalidSources = 0;
    for (const row of rows) {
      const source = row as TaxAssessorDataSourceConfig;
      const validation = validateTaxAssessorDataSource(source);
      const registration = taxCoverageRegistration(source);
      const expectedKey = taxCoverageKey(source.coverageType, {
        city: registration?.coverageType === 'city'
          ? registration.cityName
          : '',
        state: registration && 'stateCode' in registration
          ? registration.stateCode
          : source.normalizedCoverageKey.split('-')[1] ?? '',
        countyFips: registration?.coverageType === 'county'
          ? registration.countyFips
          : null,
      });
      if (
        !validation.valid
        || !registration
        || expectedKey !== source.normalizedCoverageKey
      ) {
        invalidSources += 1;
        this.log.error(
          {
            dataSourceId: source.id,
            errors: [
              ...validation.errors,
              ...(!registration || expectedKey !== source.normalizedCoverageKey
                ? ['coverageType and normalizedCoverageKey do not agree']
                : []),
            ],
          },
          '[TaxAssessmentFetchService] Invalid active data source skipped',
        );
        continue;
      }
      sources.push(source);
      coverage.push(registration);
    }
    return { sources, coverage, invalidSources };
  }

  async fetchForProperties(
    properties: PropertyForTaxFetch[],
    prepared?: PreparedTaxAssessmentSources,
    options: { recordBookkeeping?: boolean } = {},
  ): Promise<TaxAssessmentFetchBatch> {
    const sourceSet = prepared ?? await this.prepareSources();
    const byKey = new Map(
      sourceSet.sources.map((source) => [
        source.normalizedCoverageKey,
        source,
      ]),
    );
    const cache = new Map<string, Promise<RawTaxAssessmentRecord[]>>();
    const sourceStats = new Map<
      string,
      { fetched: number; errors: string[]; attempted: boolean }
    >();
    const results: TaxAssessmentFetchResult[] = [];
    let propertiesCovered = 0;
    let propertiesUncovered = 0;
    let fetchAttempts = 0;
    let fetchSucceeded = 0;
    let fetchFailed = 0;
    const successfulRequests = new Set<string>();
    const failedRequests = new Set<string>();

    for (const property of properties) {
      const dataSource = sourceForProperty(property, byKey);
      if (!dataSource) {
        propertiesUncovered += 1;
        continue;
      }
      propertiesCovered += 1;
      const address = propertyAddress(property);
      const cacheKey = addressCacheKey(dataSource.id, address);
      let request = cache.get(cacheKey);
      if (!request) {
        fetchAttempts += 1;
        request = this.adapter.fetchAssessments(dataSource, address);
        cache.set(cacheKey, request);
      }
      const stats = sourceStats.get(dataSource.id) ?? {
        fetched: 0,
        errors: [],
        attempted: false,
      };
      stats.attempted = true;
      sourceStats.set(dataSource.id, stats);
      try {
        const records = await request;
        if (!successfulRequests.has(cacheKey)) {
          successfulRequests.add(cacheKey);
          fetchSucceeded += 1;
          stats.fetched += records.length;
        }
        results.push({ property, dataSource, records });
      } catch (error) {
        if (!failedRequests.has(cacheKey)) {
          failedRequests.add(cacheKey);
          fetchFailed += 1;
        }
        const message = error instanceof Error ? error.message : String(error);
        stats.errors.push(message);
        this.log.error(
          { err: error, propertyId: property.id, dataSourceId: dataSource.id },
          '[TaxAssessmentFetchService] Fetch failed; preserving existing lifecycle',
        );
      }
    }

    if (options.recordBookkeeping !== false) {
      const finishedAt = new Date();
      for (const source of sourceSet.sources) {
        const stats = sourceStats.get(source.id);
        if (!stats?.attempted) continue;
        await this.db.taxAssessorDataSource.update({
          where: { id: source.id },
          data: {
            lastFetchAt: finishedAt,
            lastFetchError: stats.errors.length > 0
              ? stats.errors.join('; ').slice(0, 2_000)
              : null,
            totalAssessmentsFetched: { increment: stats.fetched },
          },
        });
      }
    }

    return {
      results,
      propertiesExamined: properties.length,
      propertiesCovered,
      propertiesUncovered,
      fetchAttempts,
      fetchSucceeded,
      fetchFailed,
      invalidSources: sourceSet.invalidSources,
    };
  }
}

export const taxAssessmentFetchService = new TaxAssessmentFetchService();
