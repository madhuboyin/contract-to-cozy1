import { logger } from '../../lib/logger';
import { PropertyAddress, RawPermitRecord, PermitDataSource } from './permitNormalizer';

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

function buildAddressFilter(address: PropertyAddress, queryFilter?: Record<string, unknown>): string {
  const parts: string[] = [];

  // Street number + name partial match
  const streetNum = address.street.split(' ')[0];
  const streetName = address.street.split(' ').slice(1).join(' ').toUpperCase();
  parts.push(`upper(address) like '%${streetNum}%${streetName}%'`);

  if (queryFilter) {
    for (const [field, value] of Object.entries(queryFilter)) {
      if (typeof value === 'string') {
        parts.push(`${field}='${value}'`);
      }
    }
  }

  return parts.join(' AND ');
}

export class SocrataAdapter {
  async fetchPermits(
    dataSource: PermitDataSource,
    address: PropertyAddress,
  ): Promise<RawPermitRecord[]> {
    const fieldMapping = dataSource.fieldMappingJson as Record<string, string>;
    const queryFilter = dataSource.queryFilterJson as Record<string, unknown> | undefined;
    const whereClause = buildAddressFilter(address, queryFilter);

    const results: RawPermitRecord[] = [];
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
        logger.error({ err, dataSourceId: dataSource.id }, '[SocrataAdapter] fetch error');
        throw err;
      }

      if (response.status === 429) {
        retries++;
        if (retries > 3) throw new Error('Socrata rate limit exceeded after 3 retries');
        const backoff = BASE_BACKOFF_MS * Math.pow(2, retries - 1);
        logger.warn({ dataSourceId: dataSource.id, backoff }, '[SocrataAdapter] rate limited, backing off');
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
          permitNumber: mapped['permitNumber'],
          categoryRaw: mapped['categoryRaw'],
          description: mapped['description'],
          statusRaw: mapped['statusRaw'],
          applicantName: mapped['applicantName'],
          contractorName: mapped['contractorName'],
          contractorLicense: mapped['contractorLicense'],
          workLocation: mapped['workLocation'],
          applicationDate: mapped['applicationDate'],
          issueDate: mapped['issueDate'],
          expirationDate: mapped['expirationDate'],
          finaledDate: mapped['finaledDate'],
          estimatedCostRaw: mapped['estimatedCostCents'],
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

export const socrataAdapter = new SocrataAdapter();
