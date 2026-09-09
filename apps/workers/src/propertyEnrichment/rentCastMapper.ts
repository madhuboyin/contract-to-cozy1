import { createHash } from 'node:crypto';
import {
  normalizeRentCastRecordAddress,
} from './addressMatcher';
import type {
  MappedPublicRecordFact,
  RentCastPropertyRecord,
  RentCastPropertyType,
  SupportedDwellingType,
} from './contracts';

const DWELLING_TYPE_MAP: Readonly<Record<RentCastPropertyType, SupportedDwellingType | null>> = {
  'Single Family': 'DETACHED_SINGLE_FAMILY',
  Townhouse: 'TOWNHOUSE',
  Condo: 'CONDO_UNIT',
  Apartment: 'APARTMENT_UNIT',
  'Multi-Family': 'MULTI_FAMILY',
  Manufactured: 'MANUFACTURED_HOME',
  Land: null,
};

const LOT_SIZE_NOT_APPLICABLE = new Set<SupportedDwellingType>([
  'TOWNHOUSE',
  'CONDO_UNIT',
  'APARTMENT_UNIT',
  'MULTI_FAMILY',
]);

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveInteger(value: unknown): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value >= 0;
}

function normalizedCounty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

/** RentCast documents state and county FIPS as separate 2- and 3-digit fields. */
export function fullCountyFips(
  stateFips: string | null | undefined,
  countyFips: string | null | undefined,
): string | null {
  const state = stateFips?.trim() ?? '';
  const county = countyFips?.trim() ?? '';
  if (!/^\d{2}$/.test(state)) return null;
  if (/^\d{3}$/.test(county)) return `${state}${county}`;
  if (/^\d{5}$/.test(county) && county.startsWith(state)) return county;
  return null;
}

export function mapRentCastPropertyRecord(
  record: RentCastPropertyRecord,
  currentYear = new Date().getUTCFullYear(),
): MappedPublicRecordFact[] {
  const facts: MappedPublicRecordFact[] = [];
  const dwellingType = typeof record.propertyType === 'string'
    && Object.prototype.hasOwnProperty.call(DWELLING_TYPE_MAP, record.propertyType)
    ? DWELLING_TYPE_MAP[record.propertyType as RentCastPropertyType]
    : null;

  if (dwellingType) {
    facts.push({
      factKey: 'core.dwellingType',
      propertyField: 'dwellingType',
      value: dwellingType,
    });
  }
  if (
    nonNegativeInteger(record.yearBuilt)
    && record.yearBuilt >= 1700
    && record.yearBuilt <= currentYear + 1
  ) {
    facts.push({ factKey: 'core.yearBuilt', propertyField: 'yearBuilt', value: record.yearBuilt });
  }
  if (positiveInteger(record.squareFootage)) {
    facts.push({
      factKey: 'core.propertySizeSqFt',
      propertyField: 'propertySize',
      value: record.squareFootage,
    });
  }
  if (nonNegativeInteger(record.bedrooms)) {
    facts.push({ factKey: 'core.bedrooms', propertyField: 'bedrooms', value: record.bedrooms });
  }
  if (finiteNumber(record.bathrooms) && record.bathrooms >= 0) {
    facts.push({ factKey: 'core.bathrooms', propertyField: 'bathrooms', value: record.bathrooms });
  }
  if (
    finiteNumber(record.lotSize)
    && record.lotSize > 0
    && (!dwellingType || !LOT_SIZE_NOT_APPLICABLE.has(dwellingType))
  ) {
    facts.push({
      factKey: 'exterior.lotSizeSqFt',
      propertyField: 'lotSizeSqFt',
      value: record.lotSize,
    });
  }

  const county = normalizedCounty(record.county);
  if (county) {
    facts.push({ factKey: 'location.county', propertyField: 'county', value: county });
  }
  const countyFips = fullCountyFips(record.stateFips, record.countyFips);
  if (countyFips) {
    facts.push({
      factKey: 'location.countyFips',
      propertyField: 'countyFips',
      value: countyFips,
    });
  }

  if (
    finiteNumber(record.latitude)
    && record.latitude >= -90
    && record.latitude <= 90
    && finiteNumber(record.longitude)
    && record.longitude >= -180
    && record.longitude <= 180
  ) {
    facts.push({
      factKey: 'location.geocoded',
      propertyField: 'coordinates',
      value: { latitude: record.latitude, longitude: record.longitude },
    });
  }

  return facts;
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(',')}}`;
}

export function fingerprintRentCastRecord(
  record: RentCastPropertyRecord,
  facts: readonly MappedPublicRecordFact[] = mapRentCastPropertyRecord(record),
): string {
  const address = normalizeRentCastRecordAddress(record);
  const acceptedFacts = [...facts]
    .sort((left, right) => left.factKey.localeCompare(right.factKey))
    .map(({ factKey, propertyField, value }) => ({ factKey, propertyField, value }));
  const acceptedBoundary = {
    identity: {
      externalId: record.id.trim(),
      assessorId: record.assessorID?.trim() || null,
      ...address,
    },
    facts: acceptedFacts,
  };
  return createHash('sha256').update(stableValue(acceptedBoundary)).digest('hex');
}
