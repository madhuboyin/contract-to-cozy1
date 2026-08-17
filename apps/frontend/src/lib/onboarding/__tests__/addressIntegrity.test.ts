import {
  addressOnlyPropertyData,
  onboardingAddressError,
  reconcilePropertyLookup,
} from '../addressIntegrity';

const newJerseyAddress = {
  address: '94 Ashford Dr',
  city: 'Plainsboro',
  state: 'nj',
  zipCode: '08536',
};

describe('onboarding address integrity', () => {
  it('requires a complete US address before confirmation', () => {
    expect(onboardingAddressError({ ...newJerseyAddress, city: '' })).toBe('Enter the street address and city.');
    expect(onboardingAddressError({ ...newJerseyAddress, state: 'New Jersey' })).toBe('Enter a two-letter state abbreviation.');
    expect(onboardingAddressError({ ...newJerseyAddress, zipCode: '8536' })).toBe('Enter a five-digit ZIP code.');
    expect(onboardingAddressError(newJerseyAddress)).toBeNull();
  });

  it('rejects a lookup result whose location conflicts with the submitted ZIP and state', () => {
    expect(reconcilePropertyLookup(newJerseyAddress, {
      address: '94 ASHFOR DR',
      city: 'Austin',
      state: 'TX',
      zipCode: '08536',
      yearBuilt: 2015,
    })).toBeNull();
  });

  it('keeps submitted address fields authoritative for matching enrichment', () => {
    expect(reconcilePropertyLookup(newJerseyAddress, {
      address: 'A normalized provider address',
      city: 'Provider city label',
      state: 'NJ',
      zipCode: '08536',
      yearBuilt: 2001,
    })).toMatchObject({
      address: '94 Ashford Dr',
      city: 'Plainsboro',
      state: 'NJ',
      zipCode: '08536',
      yearBuilt: 2001,
    });
  });

  it('clears property facts when only an address is confirmed', () => {
    expect(addressOnlyPropertyData(newJerseyAddress)).toMatchObject({
      state: 'NJ',
      zipCode: '08536',
      yearBuilt: null,
      estimatedValue: null,
      lastSalePrice: null,
    });
  });
});
