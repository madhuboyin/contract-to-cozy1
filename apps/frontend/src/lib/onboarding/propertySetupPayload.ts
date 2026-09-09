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
) {
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
    ...(profile.yearBuilt === undefined ? {} : { yearBuilt: profile.yearBuilt }),
    ...(propertySize === undefined ? {} : { propertySize }),
    ...(profile.dwellingType === 'UNKNOWN' ? {} : { dwellingType: profile.dwellingType }),
    ...(profile.bedrooms === undefined ? {} : { bedrooms: profile.bedrooms }),
    ...(profile.bathrooms === undefined ? {} : { bathrooms: profile.bathrooms }),
    ...(profile.basementConfiguration === 'UNKNOWN'
      ? {}
      : { basementConfiguration: profile.basementConfiguration }),
    ...(profile.hasPoolOrSpa === 'UNKNOWN'
      ? {}
      : { exteriorProfile: { hasPoolOrSpa: profile.hasPoolOrSpa === 'YES' } }),
    isPrimary: true,
    ...(purchasePriceCents === undefined ? {} : { purchasePriceCents }),
    ...(purchaseDate === undefined ? {} : { purchaseDate }),
  };
}
