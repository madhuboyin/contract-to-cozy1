import type {
  PropertyAddressIdentity,
  RentCastMatchOutcome,
  RentCastPropertyRecord,
} from './contracts';

const STREET_TOKEN_ALIASES: Readonly<Record<string, string>> = {
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
  STREET: 'ST',
  AVENUE: 'AVE',
  BOULEVARD: 'BLVD',
  ROAD: 'RD',
  DRIVE: 'DR',
  LANE: 'LN',
  COURT: 'CT',
  CIRCLE: 'CIR',
  HIGHWAY: 'HWY',
  PARKWAY: 'PKWY',
  PLACE: 'PL',
  TERRACE: 'TER',
  TRAIL: 'TRL',
  WAY: 'WAY',
};

function normalizePunctuation(value: string): string {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[.'’]/g, '')
    .replace(/[,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeStreetAddress(value: string): string {
  return normalizePunctuation(value)
    .split(' ')
    .map((token) => STREET_TOKEN_ALIASES[token] ?? token)
    .join(' ')
    .replace(/\bN E\b/g, 'NE')
    .replace(/\bN W\b/g, 'NW')
    .replace(/\bS E\b/g, 'SE')
    .replace(/\bS W\b/g, 'SW');
}

export function normalizeUnit(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const normalized = normalizePunctuation(value)
    .replace(/^(?:APARTMENT|APT|UNIT|SUITE|STE)\s*/, '')
    .replace(/^#\s*/, '')
    .trim();
  return normalized || null;
}

export function normalizeCity(value: string): string {
  return normalizePunctuation(value);
}

export function normalizeState(value: string): string {
  return normalizePunctuation(value);
}

export function normalizeZipCode(value: string): string | null {
  const normalized = value.trim();
  return /^\d{5}$/.test(normalized) ? normalized : null;
}

export interface NormalizedAddressIdentity {
  street: string;
  unit: string | null;
  city: string;
  state: string;
  zipCode: string | null;
}

export function normalizePropertyAddress(
  address: PropertyAddressIdentity,
): NormalizedAddressIdentity {
  return {
    street: normalizeStreetAddress(address.address),
    unit: normalizeUnit(address.unit),
    city: normalizeCity(address.city),
    state: normalizeState(address.state),
    zipCode: normalizeZipCode(address.zipCode),
  };
}

export function normalizeRentCastRecordAddress(
  record: RentCastPropertyRecord,
): NormalizedAddressIdentity {
  return {
    street: normalizeStreetAddress(record.addressLine1),
    unit: normalizeUnit(record.addressLine2),
    city: normalizeCity(record.city),
    state: normalizeState(record.state),
    zipCode: normalizeZipCode(record.zipCode),
  };
}

function identitiesMatch(
  expected: NormalizedAddressIdentity,
  candidate: NormalizedAddressIdentity,
): boolean {
  return Boolean(
    expected.street
      && expected.city
      && expected.state
      && expected.zipCode
      && expected.street === candidate.street
      && expected.unit === candidate.unit
      && expected.city === candidate.city
      && expected.state === candidate.state
      && expected.zipCode === candidate.zipCode,
  );
}

export function selectExactRentCastMatch(
  property: PropertyAddressIdentity,
  records: readonly RentCastPropertyRecord[],
): RentCastMatchOutcome {
  const expected = normalizePropertyAddress(property);
  const candidates = records.filter((record) =>
    identitiesMatch(expected, normalizeRentCastRecordAddress(record)));

  if (candidates.length === 0) return { kind: 'NO_MATCH' };
  if (candidates.length > 1) {
    return { kind: 'AMBIGUOUS', candidateCount: candidates.length };
  }
  return { kind: 'MATCHED', record: candidates[0] };
}
