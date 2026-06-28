import { logger } from '../../lib/logger';
import { PropertyAddress, RawPermitRecord, PermitDataSource } from './permitNormalizer';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

interface AccelaTokenResponse {
  access_token: string;
  expires_in: number;
}

interface AccelaRecord {
  id?: { value?: string };
  customId?: string;
  type?: { value?: string; subType?: { value?: string } };
  status?: { value?: string };
  openedDate?: string;
  closedDate?: string;
  expiredDate?: string;
  description?: string;
  addresses?: Array<{ streetStart?: string; streetName?: string }>;
  [key: string]: unknown;
}

async function getAccelaToken(dataSource: PermitDataSource): Promise<string> {
  const apiKey = dataSource.apiKeyEnvVar ? process.env[dataSource.apiKeyEnvVar] : undefined;
  if (!apiKey) throw new Error(`No API key configured for Accela source ${dataSource.slug}`);

  const resp = await fetch(`${dataSource.baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: apiKey,
      client_secret: '',
    }),
  });

  if (!resp.ok) throw new Error(`Accela OAuth failed: ${resp.status}`);
  const data = (await resp.json()) as AccelaTokenResponse;
  return data.access_token;
}

function mapAccelaRecord(
  record: AccelaRecord,
  fieldMapping: Record<string, string>,
): RawPermitRecord {
  const externalId =
    record.id?.value ??
    record.customId ??
    `accela-${Date.now()}-${Math.random()}`;

  const mapped: Record<string, string | undefined> = {};
  for (const [sourceField, canonicalField] of Object.entries(fieldMapping)) {
    const parts = sourceField.split('.');
    let val: unknown = record;
    for (const part of parts) {
      val = (val as Record<string, unknown>)?.[part];
    }
    mapped[canonicalField] = val != null ? String(val) : undefined;
  }

  return {
    externalId,
    permitNumber: mapped['permitNumber'] ?? record.customId,
    categoryRaw: mapped['categoryRaw'] ?? record.type?.value,
    description: mapped['description'] ?? record.description,
    statusRaw: mapped['statusRaw'] ?? record.status?.value,
    applicationDate: mapped['applicationDate'] ?? record.openedDate,
    finaledDate: mapped['finaledDate'] ?? record.closedDate,
    expirationDate: mapped['expirationDate'] ?? record.expiredDate,
    applicantName: mapped['applicantName'],
    contractorName: mapped['contractorName'],
    contractorLicense: mapped['contractorLicense'],
    rawData: record,
  };
}

export class AccelaAdapter {
  async fetchPermits(
    dataSource: PermitDataSource,
    address: PropertyAddress,
  ): Promise<RawPermitRecord[]> {
    const fieldMapping = dataSource.fieldMappingJson as Record<string, string>;
    let token: string;

    try {
      token = await getAccelaToken(dataSource);
    } catch (err) {
      logger.error({ err, dataSourceId: dataSource.id }, '[AccelaAdapter] auth failed');
      throw err;
    }

    const results: RawPermitRecord[] = [];
    let offset = 0;
    let page = 0;

    while (page < MAX_PAGES) {
      const url = new URL(`${dataSource.baseUrl}/v4/records`);
      url.searchParams.set('type', 'Building');
      url.searchParams.set('address', address.street);
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(offset));

      const resp = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        logger.error({ status: resp.status, dataSourceId: dataSource.id }, '[AccelaAdapter] API error');
        throw new Error(`Accela API error ${resp.status}`);
      }

      const body = (await resp.json()) as { result?: AccelaRecord[] };
      const rows = body.result ?? [];

      for (const row of rows) {
        results.push(mapAccelaRecord(row, fieldMapping));
      }

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      page++;
    }

    return results;
  }
}

export const accelaAdapter = new AccelaAdapter();
