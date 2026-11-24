import { fieldSourceText, promotionHeadline, fieldLabel, type PromotionReview } from '../candidatePromotion';

const base: PromotionReview = { proposal: { candidateId: 'c', fields: [], missingRequired: [], notCarriedOver: [] }, token: 't', existingHome: null, canPromote: true };

describe('candidate promotion copy', () => {
  it('claims a source only when one was recorded', () => {
    expect(fieldSourceText({ field: 'bedrooms', value: 3, source: 'LISTING', asOf: '2026-11-01T00:00:00Z' })).toBe('from the listing, 2026-11-01');
    expect(fieldSourceText({ field: 'city', value: 'Austin', source: 'USER_ENTERED', asOf: null })).toBe('entered by you');
    expect(fieldSourceText({ field: 'bathrooms', value: 2, source: null, asOf: null })).toBe('source not recorded');
  });
  it('names what is missing, warns about a duplicate, or explains what will be created', () => {
    expect(promotionHeadline({ ...base, canPromote: false, proposal: { ...base.proposal, missingRequired: ['city', 'ZIP code'] } })).toBe('Add the city, ZIP code before moving this home.');
    expect(promotionHeadline({ ...base, existingHome: { propertyId: 'p', name: null, address: '12 Maple St' } })).toMatch(/already have a home at 12 Maple St/);
    expect(promotionHeadline(base)).toMatch(/under contract/);
  });
  it('labels known fields and passes unknown ones through', () => {
    expect(fieldLabel('zipCode')).toBe('ZIP code');
    expect(fieldLabel('mystery')).toBe('mystery');
  });
});
