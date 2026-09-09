import { buildSparsePropertyUpdatePayload } from '@/lib/property/propertyUpdatePayload';

describe('buildSparsePropertyUpdatePayload', () => {
  it('sends only the unrelated field the homeowner changed', () => {
    const payload = {
      name: 'Lake house',
      address: '123 Main St',
      heatingType: 'UNKNOWN',
      hasSmokeDetectors: true,
    };

    expect(buildSparsePropertyUpdatePayload(payload, { name: true })).toEqual({
      name: 'Lake house',
    });
  });

  it('preserves an explicit No while omitting an unknown boolean assertion', () => {
    const payload = {
      hasSmokeDetectors: false,
      hasCoDetectors: undefined,
    };

    expect(buildSparsePropertyUpdatePayload(payload, {
      hasSmokeDetectors: true,
      hasCoDetectors: true,
    })).toEqual({
      hasSmokeDetectors: false,
    });
  });

  it('includes a unit only when the address-line field changed', () => {
    expect(buildSparsePropertyUpdatePayload(
      { unit: 'Apt 4B', city: 'Boston' },
      { unit: true },
    )).toEqual({ unit: 'Apt 4B' });
    expect(buildSparsePropertyUpdatePayload(
      { unit: null },
      { unit: true },
    )).toEqual({ unit: null });
  });

  it('includes the normalized exterior envelope when an exterior fact changes', () => {
    const exteriorProfile = {
      hasPrivateOutdoorSpace: null,
      outdoorSpaceTypes: [],
      hasFence: false,
    };

    expect(buildSparsePropertyUpdatePayload(
      { exteriorProfile },
      { hasFence: true },
    )).toEqual({ exteriorProfile });
  });

  it('maps dirty financial and appliance form fields to the API contract', () => {
    const majorAppliances = [{ id: 'item-1', type: 'DISHWASHER', installYear: 2021 }];
    const result = buildSparsePropertyUpdatePayload({
      purchasePriceCents: 425_000_00,
      purchaseDate: '2024-01-15',
      lastAppraisedValue: 450_000_00,
      lastAppraisalDate: '2025-05-10',
      majorAppliances,
    }, {
      purchasePriceDollars: true,
      purchaseDate: true,
      lastAppraisedValueDollars: true,
      lastAppraisalDate: true,
      appliances: [{ installYear: true }],
    });

    expect(result).toEqual({
      purchasePriceCents: 425_000_00,
      purchaseDate: '2024-01-15',
      lastAppraisedValue: 450_000_00,
      lastAppraisalDate: '2025-05-10',
      majorAppliances,
    });
  });

  it('can update or clear the cover photo without dirtying another field', () => {
    expect(buildSparsePropertyUpdatePayload({}, {}, { coverPhotoDocumentId: 'document-1' }))
      .toEqual({ coverPhotoDocumentId: 'document-1' });
    expect(buildSparsePropertyUpdatePayload({}, {}, { coverPhotoDocumentId: null }))
      .toEqual({ coverPhotoDocumentId: null });
  });
});
