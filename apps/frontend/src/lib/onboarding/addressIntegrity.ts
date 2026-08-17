export type OnboardingAddress = {
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export type OnboardingAddressSource = 'LOOKUP' | 'AUTOCOMPLETE' | 'MANUAL';

export function normalizeOnboardingAddress(value: OnboardingAddress): OnboardingAddress {
  return {
    address: value.address.trim(),
    city: value.city.trim(),
    state: value.state.trim().toUpperCase(),
    zipCode: value.zipCode.trim(),
  };
}

export function onboardingAddressError(value: OnboardingAddress): string | null {
  const normalized = normalizeOnboardingAddress(value);
  if (!normalized.address || !normalized.city) return 'Enter the street address and city.';
  if (!/^[A-Z]{2}$/.test(normalized.state)) return 'Enter a two-letter state abbreviation.';
  if (!/^\d{5}$/.test(normalized.zipCode)) return 'Enter a five-digit ZIP code.';
  return null;
}

export function addressOnlyPropertyData(value: OnboardingAddress) {
  return {
    ...normalizeOnboardingAddress(value),
    yearBuilt: null,
    propertySize: null,
    estimatedValue: null,
    dwellingType: null,
    lastSalePrice: null,
    lastSaleDate: null,
  };
}

/**
 * Public-record enrichment is optional and untrusted. Location fields entered or
 * selected by the user remain authoritative, and enrichment is accepted only
 * when its state and ZIP identify the same location.
 */
export function reconcilePropertyLookup(
  submitted: OnboardingAddress,
  lookup: Record<string, unknown>,
): Record<string, unknown> | null {
  const normalized = normalizeOnboardingAddress(submitted);
  const lookupState = typeof lookup.state === 'string' ? lookup.state.trim().toUpperCase() : '';
  const lookupZip = typeof lookup.zipCode === 'string' ? lookup.zipCode.trim() : '';
  if (lookupState !== normalized.state || lookupZip !== normalized.zipCode) return null;
  return { ...lookup, ...normalized };
}
