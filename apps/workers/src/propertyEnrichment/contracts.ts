/**
 * Worker-owned contracts for post-commit Property enrichment.
 *
 * Keep provider payloads and credentials out of jobs. The worker reloads the
 * current canonical address and rejects jobs for an old address version.
 */
export const PROPERTY_ENRICHMENT_CONTRACT_VERSION = 1 as const;
export const RENTCAST_PROVIDER = 'RENTCAST' as const;
export const RENTCAST_EVIDENCE_SOURCE = 'PUBLIC_RECORD' as const;
export const RENTCAST_SOURCE_ENTITY_TYPE = 'RENTCAST_PROPERTY_RECORD' as const;

export interface PropertyEnrichmentJobPayload {
  propertyId: string;
  provider: typeof RENTCAST_PROVIDER;
  addressVersion: number;
  contractVersion: typeof PROPERTY_ENRICHMENT_CONTRACT_VERSION;
}

export type RentCastPropertyType =
  | 'Single Family'
  | 'Townhouse'
  | 'Condo'
  | 'Apartment'
  | 'Multi-Family'
  | 'Manufactured'
  | 'Land';

/**
 * The narrow record the adapter may expose to matching/mapping code. Sale,
 * owner, valuation, rent, tax, listing, and raw response fields are omitted by
 * design and must remain outside this boundary.
 */
export interface RentCastPropertyRecord {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  stateFips?: string | null;
  zipCode: string;
  county?: string | null;
  /** RentCast currently documents this as the three-digit county component. */
  countyFips?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Kept open so newly introduced provider values can be safely ignored. */
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFootage?: number | null;
  lotSize?: number | null;
  yearBuilt?: number | null;
  assessorID?: string | null;
}

export type RentCastFetchOutcome =
  | { kind: 'SUCCESS'; records: RentCastPropertyRecord[]; requestCompletedAt: Date }
  | { kind: 'NO_RESULT'; requestCompletedAt: Date }
  | { kind: 'NOT_CONFIGURED' }
  | { kind: 'RETRYABLE'; code: 'TIMEOUT' | 'NETWORK' | 'RATE_LIMIT' | 'PROVIDER_500' | 'PROVIDER_504' }
  | { kind: 'TERMINAL'; code: 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_RESPONSE' };

export interface PropertyAddressIdentity {
  address: string;
  unit?: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export type RentCastMatchOutcome =
  | { kind: 'MATCHED'; record: RentCastPropertyRecord }
  | { kind: 'NO_MATCH' }
  | { kind: 'AMBIGUOUS'; candidateCount: number };

export type SupportedDwellingType =
  | 'DETACHED_SINGLE_FAMILY'
  | 'TOWNHOUSE'
  | 'CONDO_UNIT'
  | 'APARTMENT_UNIT'
  | 'MULTI_FAMILY'
  | 'MANUFACTURED_HOME';

/**
 * A discriminated allowlist prevents provider financial or identity fields
 * from being mistaken for canonical facts during later persistence work.
 */
export type MappedPublicRecordFact =
  | { factKey: 'core.dwellingType'; propertyField: 'dwellingType'; value: SupportedDwellingType }
  | { factKey: 'core.yearBuilt'; propertyField: 'yearBuilt'; value: number }
  | { factKey: 'core.propertySizeSqFt'; propertyField: 'propertySize'; value: number }
  | { factKey: 'core.bedrooms'; propertyField: 'bedrooms'; value: number }
  | { factKey: 'core.bathrooms'; propertyField: 'bathrooms'; value: number }
  | { factKey: 'exterior.lotSizeSqFt'; propertyField: 'lotSizeSqFt'; value: number }
  | { factKey: 'location.county'; propertyField: 'county'; value: string }
  | { factKey: 'location.countyFips'; propertyField: 'countyFips'; value: string }
  | {
      factKey: 'location.geocoded';
      propertyField: 'coordinates';
      value: { latitude: number; longitude: number };
    };
