import { createHash } from 'node:crypto';
import {
  normalizeRentCastRecordAddress,
} from './addressMatcher';
import type {
  MappedPublicRecordFact,
  RentCastPropertyRecord,
  RentCastPropertyType,
  SupportedDwellingType,
  SupportedCoolingType,
  SupportedFoundationType,
  SupportedHeatingType,
  SupportedRoofType,
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

const PRIVATE_EXTERIOR_APPLICABLE = new Set<SupportedDwellingType>([
  'DETACHED_SINGLE_FAMILY',
  'MANUFACTURED_HOME',
]);

const SHARED_POOL_TYPES = new Set(['community', 'public', 'municipal']);

const HEATING_TYPE_MAP: Readonly<Record<string, SupportedHeatingType>> = {
  'central': 'HVAC',
  'central heating': 'HVAC',
  'forced air': 'HVAC',
  'furnace': 'FURNACE',
  'heat pump': 'HEAT_PUMP',
  'radiant': 'RADIATORS',
  'radiator': 'RADIATORS',
  'radiators': 'RADIATORS',
};

const COOLING_TYPE_MAP: Readonly<Record<string, SupportedCoolingType>> = {
  'central': 'CENTRAL_AC',
  'central air': 'CENTRAL_AC',
  'central a/c': 'CENTRAL_AC',
  'window unit': 'WINDOW_AC',
  'window units': 'WINDOW_AC',
  'window a/c': 'WINDOW_AC',
};

const ROOF_TYPE_MAP: Readonly<Record<string, SupportedRoofType>> = {
  'asphalt': 'SHINGLE',
  'asphalt shingle': 'SHINGLE',
  'asphalt shingles': 'SHINGLE',
  'composition': 'SHINGLE',
  'composition shingle': 'SHINGLE',
  'shingle': 'SHINGLE',
  'shingles': 'SHINGLE',
  'tile': 'TILE',
  'clay tile': 'TILE',
  'concrete tile': 'TILE',
  'flat': 'FLAT',
  'metal': 'METAL',
  'steel': 'METAL',
};

const FOUNDATION_TYPE_MAP: Readonly<Record<string, SupportedFoundationType>> = {
  'basement': 'BASEMENT',
  'crawl space': 'CRAWL_SPACE',
  'crawlspace': 'CRAWL_SPACE',
  'slab': 'SLAB',
  'slab on grade': 'SLAB',
  'pier and beam': 'PIER_AND_BEAM',
  'pier & beam': 'PIER_AND_BEAM',
  'raised': 'RAISED',
  'mixed': 'MIXED',
  'other': 'OTHER',
};

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

function normalizedProviderText(value: unknown, maxLength = 100): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

/**
 * RentCast strings may contain multiple values separated by `/`. Accept an
 * enum only when every component is recognized and resolves to one canonical
 * value; mixed systems remain unknown rather than being guessed.
 */
function mappedProviderEnum<T extends string>(
  value: unknown,
  mapping: Readonly<Record<string, T>>,
): T | null {
  const normalized = normalizedProviderText(value);
  if (!normalized) return null;
  const mapped = normalized
    .split('/')
    .map((part) => mapping[part.trim().toLowerCase()])
    .filter((item): item is T => Boolean(item));
  const componentCount = normalized.split('/').length;
  if (mapped.length !== componentCount || new Set(mapped).size !== 1) return null;
  return mapped[0] ?? null;
}

function privatePoolPresence(record: RentCastPropertyRecord): boolean | null {
  if (record.features?.pool === false) return false;
  if (record.features?.pool !== true) return null;
  const poolType = normalizedProviderText(record.features.poolType);
  if (!poolType) return null;
  const components = poolType.split('/').map((part) => part.trim().toLowerCase());
  return components.some((part) => SHARED_POOL_TYPES.has(part)) ? null : true;
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

  const heatingType = mappedProviderEnum(record.features?.heatingType, HEATING_TYPE_MAP);
  if (record.features?.heating !== false && heatingType) {
    facts.push({ factKey: 'systems.heatingType', propertyField: 'heatingType', value: heatingType });
  }
  const coolingType = mappedProviderEnum(record.features?.coolingType, COOLING_TYPE_MAP);
  if (record.features?.cooling !== false && coolingType) {
    facts.push({ factKey: 'systems.coolingType', propertyField: 'coolingType', value: coolingType });
  }
  const roofType = mappedProviderEnum(record.features?.roofType, ROOF_TYPE_MAP);
  if (roofType) {
    facts.push({ factKey: 'structure.roofType', propertyField: 'roofType', value: roofType });
  }
  const foundationType = mappedProviderEnum(record.features?.foundationType, FOUNDATION_TYPE_MAP);
  if (foundationType) {
    facts.push({ factKey: 'structure.foundationType', propertyField: 'foundationType', value: foundationType });
  }
  const sidingType = normalizedProviderText(record.features?.exteriorType);
  if (sidingType) {
    facts.push({ factKey: 'structure.sidingType', propertyField: 'sidingType', value: sidingType });
  }
  if (typeof record.features?.fireplace === 'boolean') {
    facts.push({ factKey: 'systems.hasFireplace', propertyField: 'hasFireplace', value: record.features.fireplace });
  }
  const hasPrivatePoolOrSpa = privatePoolPresence(record);
  if (hasPrivatePoolOrSpa !== null && dwellingType && PRIVATE_EXTERIOR_APPLICABLE.has(dwellingType)) {
    facts.push({ factKey: 'exterior.hasPoolOrSpa', propertyField: 'hasPoolOrSpa', value: hasPrivatePoolOrSpa });
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
