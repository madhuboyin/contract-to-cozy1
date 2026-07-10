import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { socrataTaxAdapter } from './taxAssessorAdapters/socrataTaxAdapter';
import {
  PropertyAddress,
  RawTaxAssessmentRecord,
  TaxAssessorDataSourceConfig,
} from './taxAssessorAdapters/taxAssessmentTypes';

function buildNormalizedKey(city: string, state: string): string {
  const citySlug = city.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const stateUpper = state.toUpperCase();
  return `US-${stateUpper}-${citySlug}`;
}

export type PropertyForTaxFetch = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export type TaxAssessmentFetchResult = {
  property: PropertyForTaxFetch;
  dataSource: TaxAssessorDataSourceConfig;
  records: RawTaxAssessmentRecord[];
};

/**
 * For each property, looks up a configured TaxAssessorDataSource by
 * jurisdiction (city+state, same normalization scheme as the permit
 * pipeline's buildNormalizedKey) and fetches real assessment records.
 * Properties with no configured jurisdiction are silently skipped — not
 * every county is covered yet, and that's expected, not an error. A single
 * jurisdiction's fetch failure is logged and skipped rather than aborting
 * the whole batch, since this runs across many properties per cron tick.
 */
export class TaxAssessmentFetchService {
  async fetchForProperties(properties: PropertyForTaxFetch[]): Promise<TaxAssessmentFetchResult[]> {
    const results: TaxAssessmentFetchResult[] = [];

    for (const property of properties) {
      const normalizedKey = buildNormalizedKey(property.city ?? '', property.state ?? '');

      const dataSource = await prisma.taxAssessorDataSource.findFirst({
        where: { normalizedCoverageKey: normalizedKey, status: 'ACTIVE' },
      });

      if (!dataSource) continue;

      const address: PropertyAddress = {
        street: property.address ?? '',
        city: property.city ?? '',
        state: property.state ?? '',
        postalCode: property.zipCode ?? undefined,
      };

      try {
        const records = await socrataTaxAdapter.fetchAssessments(dataSource as TaxAssessorDataSourceConfig, address);
        results.push({ property, dataSource: dataSource as TaxAssessorDataSourceConfig, records });

        await prisma.taxAssessorDataSource.update({
          where: { id: dataSource.id },
          data: { lastFetchAt: new Date(), totalAssessmentsFetched: { increment: records.length } },
        });
      } catch (err: any) {
        logger.error(
          { err, propertyId: property.id, dataSourceId: dataSource.id },
          '[TaxAssessmentFetchService] fetch failed for jurisdiction, skipping',
        );
        await prisma.taxAssessorDataSource.update({
          where: { id: dataSource.id },
          data: { lastFetchError: err?.message ?? 'Unknown error' },
        });
      }
    }

    return results;
  }
}

export const taxAssessmentFetchService = new TaxAssessmentFetchService();
