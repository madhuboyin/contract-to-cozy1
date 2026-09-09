import type { BasementConfiguration, DwellingType } from '@/types';
import {
  normalizeOnboardingAddress,
  type OnboardingAddress,
} from '@/lib/onboarding/addressIntegrity';

type ConfirmedHomeProfile = {
  dwellingType: DwellingType;
  yearBuilt?: number;
  bedrooms?: number;
  bathrooms?: number;
  basementConfiguration: BasementConfiguration;
  hasPoolOrSpa: 'YES' | 'NO' | 'UNKNOWN';
};

type LookupPropertyFacts = OnboardingAddress & {
  propertySize?: unknown;
  lastSalePrice?: unknown;
  lastSaleDate?: unknown;
};

export function buildAddressPropertyCreatePayload(
  address: OnboardingAddress,
  hasExistingProperty: boolean,
  makePrimary: boolean,
) {
  return {
    ...normalizeOnboardingAddress(address),
    ...(hasExistingProperty ? { isPrimary: makePrimary } : {}),
  };
}

export function buildConfirmedPropertyCreatePayload(
  data: LookupPropertyFacts,
  profile: ConfirmedHomeProfile,
  options: { includeOptionalFacts?: boolean } = {},
) {
  const includeOptionalFacts = options.includeOptionalFacts !== false;
  const propertySize = typeof data.propertySize === 'number' && Number.isFinite(data.propertySize)
    ? data.propertySize
    : undefined;
  const purchasePriceCents = typeof data.lastSalePrice === 'number' && Number.isFinite(data.lastSalePrice)
    ? data.lastSalePrice
    : undefined;
  const purchaseDate = data.lastSaleDate instanceof Date
    || (typeof data.lastSaleDate === 'string' && data.lastSaleDate.trim())
    ? data.lastSaleDate as Date | string
    : undefined;

  return {
    ...normalizeOnboardingAddress(data),
    ...(!includeOptionalFacts || profile.yearBuilt === undefined ? {} : { yearBuilt: profile.yearBuilt }),
    ...(!includeOptionalFacts || propertySize === undefined ? {} : { propertySize }),
    ...(!includeOptionalFacts || profile.dwellingType === 'UNKNOWN' ? {} : { dwellingType: profile.dwellingType }),
    ...(!includeOptionalFacts || profile.bedrooms === undefined ? {} : { bedrooms: profile.bedrooms }),
    ...(!includeOptionalFacts || profile.bathrooms === undefined ? {} : { bathrooms: profile.bathrooms }),
    ...(!includeOptionalFacts || profile.basementConfiguration === 'UNKNOWN'
      ? {}
      : { basementConfiguration: profile.basementConfiguration }),
    ...(!includeOptionalFacts || profile.hasPoolOrSpa === 'UNKNOWN'
      ? {}
      : { exteriorProfile: { hasPoolOrSpa: profile.hasPoolOrSpa === 'YES' } }),
    isPrimary: true,
    ...(!includeOptionalFacts || purchasePriceCents === undefined ? {} : { purchasePriceCents }),
    ...(!includeOptionalFacts || purchaseDate === undefined ? {} : { purchaseDate }),
  };
}
