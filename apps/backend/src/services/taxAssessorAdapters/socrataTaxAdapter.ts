import { logger } from '../../lib/logger';
import { PropertyAddress, RawTaxAssessmentRecord, TaxAssessorDataSourceConfig } from './taxAssessmentTypes';

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
const BASE_BACKOFF_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapFields(
  row: Record<string, unknown>,
  fieldMapping: Record<string, string>,
): Record<string, string | undefined> {
  const mapped: Record<string, string | undefined> = {};
  for (const [sourceField, canonicalField] of Object.entries(fieldMapping)) {
    const val = row[sourceField];
    mapped[canonicalField] = val != null ? String(val) : undefined;
  }
  return mapped;
}

// Tax-assessment datasets query by parcel/situs address rather than permit
// filters, so this builds its own $where clause (not shared with
// permitAdapters/socrata.adapter.ts) even though the HTTP/pagination/backoff
// mechanics below are the same shape.
//
// The address column name is NOT standardized across county/city datasets
// (e.g. Cook County vs. NYC vs. a given county's own assessor export), so it
// is configurable per data source via queryFilterJson.addressColumn, falling
// back to 'situs_address' — a common convention, but not universal. The
// remaining queryFilterJson keys (if any) are appended as additional exact
// -match filters, same as before.
function buildAddressFilter(address: PropertyAddress, queryFilter?: Record<string, unknown>): string {
  const parts: string[] = [];
  const { addressColumn, ...extraFilters } = queryFilter ?? {};
  const addressField = typeof addressColumn === 'string' && addressColumn.trim() ? addressColumn : 'situs_address';

  const streetNum = address.street.split(' ')[0];
  const streetName = address.street.split(' ').slice(1).join(' ').toUpperCase();
  parts.push(`upper(${addressField}) like '%${streetNum}%${streetName}%'`);

  for (const [field, value] of Object.entries(extraFilters)) {
    if (typeof value === 'string') {
      parts.push(`${field}='${value}'`);
    }
  }

  return parts.join(' AND ');
}

export class SocrataTaxAdapter {
  async fetchAssessments(
    dataSource: TaxAssessorDataSourceConfig,
    address: PropertyAddress,
  ): Promise<RawTaxAssessmentRecord[]> {
    const fieldMapping = dataSource.fieldMappingJson as Record<string, string>;
    const queryFilter = dataSource.queryFilterJson as Record<string, unknown> | undefined;
    const whereClause = buildAddressFilter(address, queryFilter);

    const results: RawTaxAssessmentRecord[] = [];
    let offset = 0;
    let page = 0;
    let retries = 0;

    while (page < MAX_PAGES) {
      const url = new URL(`${dataSource.baseUrl}/resource/${dataSource.datasetId}.json`);
      url.searchParams.set('$where', whereClause);
      url.searchParams.set('$limit', String(PAGE_SIZE));
      url.searchParams.set('$offset', String(offset));

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (dataSource.apiKeyEnvVar) {
        const key = process.env[dataSource.apiKeyEnvVar];
        if (key) headers['X-App-Token'] = key;
      }

      let response: Response;
      try {
        response = await fetch(url.toString(), { headers });
      } catch (err) {
        logger.error({ err, dataSourceId: dataSource.id }, '[SocrataTaxAdapter] fetch error');
        throw err;
      }

      if (response.status === 429) {
        retries++;
        if (retries > 3) throw new Error('Socrata rate limit exceeded after 3 retries');
        const backoff = BASE_BACKOFF_MS * Math.pow(2, retries - 1);
        logger.warn({ dataSourceId: dataSource.id, backoff }, '[SocrataTaxAdapter] rate limited, backing off');
        await sleep(backoff);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Socrata API error ${response.status} for ${dataSource.slug}`);
      }

      retries = 0;
      const rows = (await response.json()) as Record<string, unknown>[];

      for (const row of rows) {
        const mapped = mapFields(row, fieldMapping);
        results.push({
          externalId: mapped['externalId'] ?? `${dataSource.slug}-${offset}-${results.length}`,
          parcelId: mapped['parcelId'],
          assessedValueRaw: mapped['assessedValueRaw'],
          previousAssessedValueRaw: mapped['previousAssessedValueRaw'],
          assessmentDate: mapped['assessmentDate'],
          taxYear: mapped['taxYear'],
          situsAddress: mapped['situsAddress'],
          rawData: row,
        });
      }

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      page++;
    }

    return results;
  }
}

export const socrataTaxAdapter = new SocrataTaxAdapter();
