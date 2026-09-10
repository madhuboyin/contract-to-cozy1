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

  it('preserves an optional unit in both property creation paths', () => {
    const unitAddress = { ...address, unit: '  Apt 4B  ' };
    expect(buildAddressPropertyCreatePayload(unitAddress, false, false)).toMatchObject({ unit: 'Apt 4B' });
    expect(buildConfirmedPropertyCreatePayload(unitAddress, {
      dwellingType: 'UNKNOWN',
      basementConfiguration: 'UNKNOWN',
      hasPoolOrSpa: 'UNKNOWN',
    })).toMatchObject({ unit: 'Apt 4B' });
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

  it('preserves explicitly supplied homeowner facts, including an explicit No', () => {
    const result = buildConfirmedPropertyCreatePayload(address, {
      dwellingType: 'DETACHED_SINGLE_FAMILY',
      yearBuilt: 1998,
      propertySize: 2200,
      bedrooms: 3,
      bathrooms: 2.5,
      basementConfiguration: 'NONE',
      hasPoolOrSpa: 'NO',
    });

    expect(result).toMatchObject({
      dwellingType: 'DETACHED_SINGLE_FAMILY',
      yearBuilt: 1998,
      propertySize: 2200,
      bedrooms: 3,
      bathrooms: 2.5,
      basementConfiguration: 'NONE',
      exteriorProfile: { hasPoolOrSpa: false },
    });
    expect(result).not.toHaveProperty('purchasePriceCents');
    expect(result).not.toHaveProperty('purchaseDate');
  });

  it('keeps established-owner creation address-only even when optional profile values exist', () => {
    const result = buildConfirmedPropertyCreatePayload(address, {
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
