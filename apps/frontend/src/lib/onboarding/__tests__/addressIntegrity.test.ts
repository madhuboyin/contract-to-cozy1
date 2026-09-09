import {
  addressOnlyPropertyData,
  normalizeOnboardingAddress,
  onboardingAddressError,
  sameOnboardingAddress,
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

  it('keeps address-only setup free of provider-shaped property facts', () => {
    expect(addressOnlyPropertyData(newJerseyAddress)).toEqual({
      address: '94 Ashford Dr',
      city: 'Plainsboro',
      state: 'NJ',
      zipCode: '08536',
    });
  });

  it('matches committed properties using normalized address identity', () => {
    expect(sameOnboardingAddress(
      { address: ' 1 Main St ', city: 'Princeton', state: 'nj', zipCode: '08536' },
      { address: '1 main st', city: 'princeton', state: 'NJ', zipCode: '08536' },
    )).toBe(true);
  });

  it('normalizes and distinguishes apartment units', () => {
    expect(normalizeOnboardingAddress({ ...newJerseyAddress, unit: '  Apt   4B ' })).toMatchObject({ unit: 'Apt 4B' });
    expect(sameOnboardingAddress(
      { ...newJerseyAddress, unit: 'Apt 4B' },
      { ...newJerseyAddress, unit: ' apt 4b ' },
    )).toBe(true);
    expect(sameOnboardingAddress(
      { ...newJerseyAddress, unit: 'Apt 4B' },
      { ...newJerseyAddress, unit: 'Apt 5C' },
    )).toBe(false);
  });
});
