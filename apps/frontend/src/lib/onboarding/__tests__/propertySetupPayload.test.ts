import {
  buildAddressPropertyCreatePayload,
  buildConfirmedPropertyCreatePayload,
} from '@/lib/onboarding/propertySetupPayload';

const address = {
  address: ' 123 Main St ',
  city: ' Knoxville ',
  state: ' tn ',
  zipCode: ' 37902 ',
};

describe('property setup create payloads', () => {
  it('keeps first-property creation address-only and lets the service own primary status', () => {
    expect(buildAddressPropertyCreatePayload(address, false, false)).toEqual({
      address: '123 Main St',
      city: 'Knoxville',
      state: 'TN',
      zipCode: '37902',
    });
  });

  it('includes an explicit later-property primary choice', () => {
    expect(buildAddressPropertyCreatePayload(address, true, false)).toEqual({
      address: '123 Main St',
      city: 'Knoxville',
      state: 'TN',
      zipCode: '37902',
      isPrimary: false,
    });
  });

  it('omits every unanswered established-owner fact', () => {
    const result = buildConfirmedPropertyCreatePayload(address, {
      dwellingType: 'UNKNOWN',
      basementConfiguration: 'UNKNOWN',
      hasPoolOrSpa: 'UNKNOWN',
    });

    expect(result).toEqual({
      address: '123 Main St',
      city: 'Knoxville',
      state: 'TN',
      zipCode: '37902',
      isPrimary: true,
    });
  });

  it('preserves explicitly supplied home facts, including an explicit No', () => {
    const setupData = {
      ...address,
      propertySize: 1850,
      // A legacy/provider-shaped session may still contain these values. They
      // must never become homeowner-reported financing facts.
      lastSalePrice: 350_000_00,
      lastSaleDate: '2024-04-20',
    };
    const result = buildConfirmedPropertyCreatePayload(setupData, {
      dwellingType: 'DETACHED_SINGLE_FAMILY',
      yearBuilt: 1998,
      bedrooms: 3,
      bathrooms: 2.5,
      basementConfiguration: 'NONE',
      hasPoolOrSpa: 'NO',
    });

    expect(result).toMatchObject({
      dwellingType: 'DETACHED_SINGLE_FAMILY',
      yearBuilt: 1998,
      propertySize: 1850,
      bedrooms: 3,
      bathrooms: 2.5,
      basementConfiguration: 'NONE',
      exteriorProfile: { hasPoolOrSpa: false },
    });
    expect(result).not.toHaveProperty('purchasePriceCents');
    expect(result).not.toHaveProperty('purchaseDate');
  });

  it('keeps established-owner creation address-only even when lookup facts are available', () => {
    const legacyLookupData = {
      ...address,
      propertySize: 1850,
      lastSalePrice: 350_000_00,
      lastSaleDate: '2024-04-20',
    };
    const result = buildConfirmedPropertyCreatePayload(legacyLookupData, {
      dwellingType: 'DETACHED_SINGLE_FAMILY',
      yearBuilt: 1998,
      bedrooms: 3,
      bathrooms: 2.5,
      basementConfiguration: 'FINISHED',
      hasPoolOrSpa: 'YES',
    }, { includeOptionalFacts: false });

    expect(result).toEqual({
      address: '123 Main St',
      city: 'Knoxville',
      state: 'TN',
      zipCode: '37902',
      isPrimary: true,
    });
  });
});
