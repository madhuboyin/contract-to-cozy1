import { logger, type AppLogger } from '../../lib/logger';
import { assertSafeUrl } from '../../utils/ssrfGuard';
import {
  type PropertyAddress,
  type RawTaxAssessmentRecord,
  type TaxAssessmentMatchConfidence,
  type TaxAssessmentSourceValidation,
  type TaxAssessorDataSourceConfig,
} from './taxAssessmentTypes';

const PAGE_SIZE = 1_000;
const MAX_PAGES = 20;
const MAX_RATE_LIMIT_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;
export const TAX_ASSESSMENT_FETCH_TIMEOUT_MS = 8_000;

const SOCRATA_DATASET_ID = /^[a-z0-9]{4}-[a-z0-9]{4}$/i;
const SOQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const CANONICAL_FIELDS = new Set([
  'externalId',
  'parcelId',
  'assessedValueRaw',
  'previousAssessedValueRaw',
  'assessmentDate',
  'taxYear',
  'situsAddress',
  'situsHouseNumber',
  'situsStreetName',
  'situsPostalCode',
]);
const REQUIRED_CANONICAL_FIELDS = ['externalId'] as const;
const CONTROL_FILTER_KEYS = new Set<string>([
  'addressColumn',
  'addressNumberColumn',
  'addressStreetColumn',
  'postalCodeColumn',
  'parcelIdFromExternalId',
  'latestTaxYearOnly',
  'eventTtlDays',
  'assessmentDatePolicy',
  'assessmentStage',
  'appealInfoUrl',
  'appealDisclaimer',
]);

type FetchLike = typeof fetch;

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateTaxAssessorDataSource(
  dataSource: TaxAssessorDataSourceConfig,
): TaxAssessmentSourceValidation {
  const errors: string[] = [];
  if (dataSource.adapterType !== 'SOCRATA') {
    errors.push(`Unsupported tax adapter type: ${dataSource.adapterType}`);
  }
  if (!dataSource.datasetId || !SOCRATA_DATASET_ID.test(dataSource.datasetId)) {
    errors.push('datasetId must use the Socrata xxxx-xxxx identifier format');
  }
  try {
    const url = new URL(dataSource.baseUrl);
    if (url.protocol !== 'https:') errors.push('baseUrl must use HTTPS');
  } catch {
    errors.push('baseUrl must be a valid URL');
  }
  if (!isObject(dataSource.fieldMappingJson)) {
    errors.push('fieldMappingJson must be an object');
  } else {
    const targets = new Set<string>();
    for (const [sourceField, canonicalField] of Object.entries(
      dataSource.fieldMappingJson,
    )) {
      if (!SOQL_IDENTIFIER.test(sourceField)) {
        errors.push(`Invalid source field identifier: ${sourceField}`);
      }
      if (
        typeof canonicalField !== 'string'
        || !CANONICAL_FIELDS.has(canonicalField)
      ) {
        errors.push(`Unsupported canonical field mapping: ${String(canonicalField)}`);
      } else if (targets.has(canonicalField)) {
        errors.push(`Duplicate canonical field mapping: ${canonicalField}`);
      } else {
        targets.add(canonicalField);
      }
    }
    for (const required of REQUIRED_CANONICAL_FIELDS) {
      if (!targets.has(required)) {
        errors.push(`fieldMappingJson must map ${required}`);
      }
    }
    const mapsWholeAddress = targets.has('situsAddress');
    const mapsSplitAddress =
      targets.has('situsHouseNumber') && targets.has('situsStreetName');
    if (!mapsWholeAddress && !mapsSplitAddress) {
      errors.push(
        'fieldMappingJson must map situsAddress or both situsHouseNumber and situsStreetName',
      );
    }
    if (
      !targets.has('assessedValueRaw')
      && !targets.has('previousAssessedValueRaw')
    ) {
      errors.push('fieldMappingJson must map at least one assessed value field');
    }
  }
  if (
    dataSource.queryFilterJson != null
    && !isObject(dataSource.queryFilterJson)
  ) {
    errors.push('queryFilterJson must be an object when provided');
  } else if (isObject(dataSource.queryFilterJson)) {
    const addressColumn = dataSource.queryFilterJson.addressColumn;
    if (
      addressColumn !== undefined
      && (
        typeof addressColumn !== 'string'
        || !SOQL_IDENTIFIER.test(addressColumn)
      )
    ) {
      errors.push('queryFilterJson.addressColumn must be a safe field identifier');
    }
    for (const key of [
      'addressNumberColumn',
      'addressStreetColumn',
      'postalCodeColumn',
    ] as const) {
      const value = dataSource.queryFilterJson[key];
      if (
        value !== undefined
        && (typeof value !== 'string' || !SOQL_IDENTIFIER.test(value))
      ) {
        errors.push(`queryFilterJson.${key} must be a safe field identifier`);
      }
    }
    const hasSplitNumber =
      dataSource.queryFilterJson.addressNumberColumn !== undefined;
    const hasSplitStreet =
      dataSource.queryFilterJson.addressStreetColumn !== undefined;
    if (hasSplitNumber !== hasSplitStreet) {
      errors.push(
        'queryFilterJson.addressNumberColumn and addressStreetColumn must be configured together',
      );
    }
    if (addressColumn !== undefined && hasSplitNumber) {
      errors.push(
        'queryFilterJson must use either addressColumn or split address columns, not both',
      );
    }
    const mappings = isObject(dataSource.fieldMappingJson)
      ? dataSource.fieldMappingJson
      : {};
    if (
      typeof addressColumn === 'string'
      && mappings[addressColumn] !== 'situsAddress'
    ) {
      errors.push(
        'queryFilterJson.addressColumn must map to canonical situsAddress',
      );
    }
    if (
      typeof dataSource.queryFilterJson.addressNumberColumn === 'string'
      && mappings[dataSource.queryFilterJson.addressNumberColumn]
        !== 'situsHouseNumber'
    ) {
      errors.push(
        'queryFilterJson.addressNumberColumn must map to canonical situsHouseNumber',
      );
    }
    if (
      typeof dataSource.queryFilterJson.addressStreetColumn === 'string'
      && mappings[dataSource.queryFilterJson.addressStreetColumn]
        !== 'situsStreetName'
    ) {
      errors.push(
        'queryFilterJson.addressStreetColumn must map to canonical situsStreetName',
      );
    }
    if (
      typeof dataSource.queryFilterJson.postalCodeColumn === 'string'
      && mappings[dataSource.queryFilterJson.postalCodeColumn]
        !== 'situsPostalCode'
    ) {
      errors.push(
        'queryFilterJson.postalCodeColumn must map to canonical situsPostalCode',
      );
    }
    if (
      dataSource.queryFilterJson.parcelIdFromExternalId !== undefined
      && typeof dataSource.queryFilterJson.parcelIdFromExternalId !== 'boolean'
    ) {
      errors.push('queryFilterJson.parcelIdFromExternalId must be boolean');
    }
    if (
      dataSource.queryFilterJson.latestTaxYearOnly !== undefined
      && typeof dataSource.queryFilterJson.latestTaxYearOnly !== 'boolean'
    ) {
      errors.push('queryFilterJson.latestTaxYearOnly must be boolean');
    }
    if (
      dataSource.queryFilterJson.latestTaxYearOnly === true
      && !Object.values(mappings).includes('taxYear')
    ) {
      errors.push(
        'queryFilterJson.latestTaxYearOnly requires a canonical taxYear mapping',
      );
    }
    const eventTtlDays = dataSource.queryFilterJson.eventTtlDays;
    if (
      eventTtlDays !== undefined
      && (
        typeof eventTtlDays !== 'number'
        || !Number.isInteger(eventTtlDays)
        || eventTtlDays < 30
        || eventTtlDays > 365
      )
    ) {
      errors.push('queryFilterJson.eventTtlDays must be an integer from 30 to 365');
    }
    const assessmentDatePolicy =
      dataSource.queryFilterJson.assessmentDatePolicy;
    if (
      assessmentDatePolicy !== undefined
      && !['provider_date', 'nyc_fiscal_year_start'].includes(
        String(assessmentDatePolicy),
      )
    ) {
      errors.push(
        'queryFilterJson.assessmentDatePolicy must be provider_date or nyc_fiscal_year_start',
      );
    }
    for (const key of ['assessmentStage', 'appealDisclaimer'] as const) {
      const value = dataSource.queryFilterJson[key];
      if (
        value !== undefined
        && (typeof value !== 'string' || value.trim().length === 0)
      ) {
        errors.push(`queryFilterJson.${key} must be a non-empty string`);
      }
    }
    const appealInfoUrl = dataSource.queryFilterJson.appealInfoUrl;
    if (appealInfoUrl !== undefined) {
      try {
        if (
          typeof appealInfoUrl !== 'string'
          || new URL(appealInfoUrl).protocol !== 'https:'
        ) {
          errors.push('queryFilterJson.appealInfoUrl must use HTTPS');
        }
      } catch {
        errors.push('queryFilterJson.appealInfoUrl must be a valid HTTPS URL');
      }
    }
    for (const [field, value] of Object.entries(dataSource.queryFilterJson)) {
      if (CONTROL_FILTER_KEYS.has(field)) continue;
      if (!SOQL_IDENTIFIER.test(field)) {
        errors.push(`Invalid query filter field identifier: ${field}`);
      }
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        errors.push(`Query filter ${field} must be a scalar value`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function mapFields(
  row: Record<string, unknown>,
  fieldMapping: Record<string, unknown>,
): Record<string, string | undefined> {
  const mapped: Record<string, string | undefined> = {};
  for (const [sourceField, canonicalField] of Object.entries(fieldMapping)) {
    if (typeof canonicalField !== 'string') continue;
    const value = row[sourceField];
    mapped[canonicalField] = value == null ? undefined : String(value);
  }
  return mapped;
}

function soqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function soqlValue(value: string | number | boolean): string {
  if (typeof value === 'string') return soqlString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (!Number.isFinite(value)) throw new Error('SoQL numeric filters must be finite');
  return String(value);
}

function normalizedStreet(value: string): string {
  const suffixes: Record<string, string> = {
    STREET: 'ST',
    AVENUE: 'AVE',
    ROAD: 'RD',
    DRIVE: 'DR',
    LANE: 'LN',
    COURT: 'CT',
    BOULEVARD: 'BLVD',
    PLACE: 'PL',
    HIGHWAY: 'HWY',
    PARKWAY: 'PKWY',
  };
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => suffixes[token] ?? token)
    .join(' ');
}

function addressConfidence(
  expected: PropertyAddress,
  actualAddress: string | undefined,
  actualPostalCode: string | undefined,
): TaxAssessmentMatchConfidence | null {
  if (!actualAddress) return null;
  const expectedAddress = normalizedStreet(expected.street);
  const actual = normalizedStreet(actualAddress);
  const expectedNumber = expectedAddress.match(/^\d+[A-Z]?/)?.[0];
  const actualNumber = actual.match(/^\d+[A-Z]?/)?.[0];
  if (!expectedNumber || expectedNumber !== actualNumber) return null;
  if (
    expected.postalCode
    && actualPostalCode
    && expected.postalCode.slice(0, 5) !== actualPostalCode.slice(0, 5)
  ) return null;
  if (
    actual === expectedAddress
    || actual.startsWith(`${expectedAddress} `)
    || expectedAddress.startsWith(`${actual} `)
  ) return 'high';

  const expectedTokens = new Set(expectedAddress.split(' ').slice(1));
  const actualTokens = new Set(actual.split(' ').slice(1));
  const overlap = [...expectedTokens].filter((token) => actualTokens.has(token)).length;
  return expectedTokens.size > 0 && overlap / expectedTokens.size >= 0.75
    ? 'medium'
    : null;
}

export function buildTaxAssessmentWhereClause(
  address: PropertyAddress,
  queryFilter?: Record<string, unknown>,
): string {
  const normalized = normalizedStreet(address.street);
  const [streetNumber, ...streetTokens] = normalized.split(' ');
  if (!streetNumber || streetTokens.length === 0 || !/^\d+[A-Z]?$/.test(streetNumber)) {
    throw new Error('A complete property street address is required');
  }
  const addressColumn = typeof queryFilter?.addressColumn === 'string'
    ? queryFilter.addressColumn
    : undefined;
  const addressNumberColumn =
    typeof queryFilter?.addressNumberColumn === 'string'
      ? queryFilter.addressNumberColumn
      : undefined;
  const addressStreetColumn =
    typeof queryFilter?.addressStreetColumn === 'string'
      ? queryFilter.addressStreetColumn
      : undefined;
  const parts: string[] = [];
  if (addressNumberColumn || addressStreetColumn) {
    if (
      !addressNumberColumn
      || !addressStreetColumn
      || !SOQL_IDENTIFIER.test(addressNumberColumn)
      || !SOQL_IDENTIFIER.test(addressStreetColumn)
    ) {
      throw new Error('Unsafe Socrata split-address column identifier');
    }
    parts.push(`${addressNumberColumn}=${soqlString(streetNumber)}`);
    parts.push(
      `upper(${addressStreetColumn}) like ${soqlString(`%${streetTokens.join('%')}%`)}`,
    );
  } else {
    const wholeAddressColumn = addressColumn ?? 'situs_address';
    if (!SOQL_IDENTIFIER.test(wholeAddressColumn)) {
      throw new Error('Unsafe Socrata address column identifier');
    }
    const addressPattern = `%${[streetNumber, ...streetTokens].join('%')}%`;
    parts.push(
      `upper(${wholeAddressColumn}) like ${soqlString(addressPattern)}`,
    );
  }
  const postalCodeColumn =
    typeof queryFilter?.postalCodeColumn === 'string'
      ? queryFilter.postalCodeColumn
      : undefined;
  if (postalCodeColumn) {
    if (!SOQL_IDENTIFIER.test(postalCodeColumn)) {
      throw new Error('Unsafe Socrata postal-code column identifier');
    }
    const postalCode = address.postalCode?.slice(0, 5);
    if (postalCode) parts.push(`${postalCodeColumn}=${soqlString(postalCode)}`);
  }
  for (const [field, value] of Object.entries(queryFilter ?? {})) {
    if (CONTROL_FILTER_KEYS.has(field)) continue;
    if (!SOQL_IDENTIFIER.test(field)) {
      throw new Error(`Unsafe Socrata query filter identifier: ${field}`);
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`Socrata query filter ${field} must be scalar`);
    }
    parts.push(`${field}=${soqlValue(value as string | number | boolean)}`);
  }
  return parts.join(' AND ');
}

export class SocrataTaxAdapter {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
    private readonly timeoutMs = TAX_ASSESSMENT_FETCH_TIMEOUT_MS,
    private readonly safeUrl: (url: string) => Promise<void> = assertSafeUrl,
    private readonly log: AppLogger = logger,
  ) {}

  async fetchAssessments(
    dataSource: TaxAssessorDataSourceConfig,
    address: PropertyAddress,
  ): Promise<RawTaxAssessmentRecord[]> {
    const validation = validateTaxAssessorDataSource(dataSource);
    if (!validation.valid) {
      throw new Error(`Invalid tax data source ${dataSource.slug}: ${validation.errors.join('; ')}`);
    }
    const fieldMapping = dataSource.fieldMappingJson as Record<string, unknown>;
    const queryFilter = dataSource.queryFilterJson as Record<string, unknown> | undefined;
    const whereClause = buildTaxAssessmentWhereClause(address, queryFilter);
    const results: RawTaxAssessmentRecord[] = [];
    let offset = 0;
    let page = 0;
    let retries = 0;

    while (page < MAX_PAGES) {
      const url = new URL(
        `${dataSource.baseUrl.replace(/\/+$/, '')}/resource/${dataSource.datasetId}.json`,
      );
      url.searchParams.set('$where', whereClause);
      url.searchParams.set(
        '$select',
        Object.keys(fieldMapping).sort().join(','),
      );
      if (queryFilter?.latestTaxYearOnly === true) {
        const taxYearField = Object.entries(fieldMapping).find(
          ([, canonicalField]) => canonicalField === 'taxYear',
        )?.[0];
        if (taxYearField) url.searchParams.set('$order', `${taxYearField} DESC`);
      }
      url.searchParams.set('$limit', String(PAGE_SIZE));
      url.searchParams.set('$offset', String(offset));
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (dataSource.apiKeyEnvVar) {
        const key = process.env[dataSource.apiKeyEnvVar];
        if (key) headers['X-App-Token'] = key;
      }

      await this.safeUrl(url.toString());
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      let body: unknown;
      try {
        response = await this.fetchImpl(url, {
          headers,
          signal: controller.signal,
        });
        if (response.ok) body = await response.json();
      } catch (error) {
        this.log.error(
          { err: error, dataSourceId: dataSource.id },
          '[SocrataTaxAdapter] fetch error',
        );
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 429) {
        retries += 1;
        if (retries > MAX_RATE_LIMIT_RETRIES) {
          throw new Error(
            `Socrata rate limit exceeded after ${MAX_RATE_LIMIT_RETRIES} retries`,
          );
        }
        const backoff = BASE_BACKOFF_MS * 2 ** (retries - 1);
        this.log.warn(
          { dataSourceId: dataSource.id, backoff },
          '[SocrataTaxAdapter] rate limited, backing off',
        );
        await this.sleep(backoff);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Socrata API error ${response.status} for ${dataSource.slug}`);
      }
      retries = 0;
      if (!Array.isArray(body)) {
        throw new Error(`Socrata returned a non-array payload for ${dataSource.slug}`);
      }
      const rows = body.filter(isObject);
      if (rows.length !== body.length) {
        throw new Error(`Socrata returned malformed rows for ${dataSource.slug}`);
      }
      for (const row of rows) {
        const mapped = mapFields(row, fieldMapping);
        if (!mapped.externalId?.trim()) continue;
        const situsAddress = mapped.situsAddress
          ?? [mapped.situsHouseNumber, mapped.situsStreetName]
            .filter(Boolean)
            .join(' ');
        const matchConfidence = addressConfidence(
          address,
          situsAddress,
          mapped.situsPostalCode,
        );
        if (!matchConfidence) continue;
        const parcelId = mapped.parcelId
          ?? (
            queryFilter?.parcelIdFromExternalId === true
              ? mapped.externalId
              : undefined
          );
        results.push({
          externalId: mapped.externalId!,
          parcelId,
          assessedValueRaw: mapped.assessedValueRaw,
          previousAssessedValueRaw: mapped.previousAssessedValueRaw,
          assessmentDate: mapped.assessmentDate,
          taxYear: mapped.taxYear,
          situsAddress,
          situsPostalCode: mapped.situsPostalCode,
          matchConfidence,
          matchMethod: parcelId
            ? 'address_with_parcel_evidence'
            : 'address',
          rawData: row,
        });
      }
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      page += 1;
    }
    let candidates = results;
    if (queryFilter?.latestTaxYearOnly === true) {
      const numericYears = candidates
        .map((record) => Number(record.taxYear))
        .filter(Number.isInteger);
      if (numericYears.length > 0) {
        const latestYear = Math.max(...numericYears);
        candidates = candidates.filter(
          (record) => Number(record.taxYear) === latestYear,
        );
      }
    }
    const deduplicated = new Map<string, RawTaxAssessmentRecord>();
    for (const record of candidates) {
      const identity = [
        record.externalId,
        record.taxYear ?? '',
        record.assessmentDate ?? '',
        record.assessedValueRaw ?? '',
        record.previousAssessedValueRaw ?? '',
        record.situsAddress ?? '',
        record.situsPostalCode ?? '',
      ].join('|');
      if (!deduplicated.has(identity)) deduplicated.set(identity, record);
    }
    candidates = [...deduplicated.values()];
    const distinctParcels = new Set(
      candidates.map((record) => record.parcelId).filter(Boolean),
    );
    if (candidates.length > 1) {
      this.log.warn(
        {
          dataSourceId: dataSource.id,
          candidateCount: candidates.length,
          distinctParcelCount: distinctParcels.size,
          reason:
            distinctParcels.size > 1
              ? 'multiple_parcels'
              : 'conflicting_latest_rows',
        },
        '[SocrataTaxAdapter] Ambiguous latest assessment rows; suppressing all candidates',
      );
      return [];
    }
    return candidates;
  }
}

export const socrataTaxAdapter = new SocrataTaxAdapter();
