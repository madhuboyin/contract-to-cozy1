import { legacyAskViewRedirect } from '@/app/(dashboard)/dashboard/ask/legacyViewRedirect';

describe('legacy Ask destination addresses', () => {
  it('open Ask with the same question already asked, for the same home', () => {
    expect(legacyAskViewRedirect('record', { propertyId: 'home-1', section: 'rooms' })).toBe('/dashboard/ask?propertyId=home-1&question=Browse+my+home+record');
    expect(legacyAskViewRedirect('work', { propertyId: 'home-1', open: 'claim:c1' })).toBe('/dashboard/ask?propertyId=home-1&question=What+needs+me%3F');
    expect(legacyAskViewRedirect('saved', {})).toBe('/dashboard/ask?question=Show+my+saved+results');
  });

  it('ask to export for the old export-review address, and keep a view of their own only for the conversation list', () => {
    expect(legacyAskViewRedirect('record', { propertyId: 'home-1', export: 'review' })).toBe('/dashboard/ask?propertyId=home-1&question=Export+my+home+record');
    expect(legacyAskViewRedirect('history', { propertyId: 'home-1' })).toBe('/dashboard/ask?propertyId=home-1&view=history');
  });
});
