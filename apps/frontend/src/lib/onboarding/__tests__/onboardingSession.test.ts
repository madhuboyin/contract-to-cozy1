import { normalizeCommittedPropertyId } from '@/lib/onboarding/onboardingSession';

describe('onboarding lookup session committed Property ID', () => {
  it('retains only a valid UUID', () => {
    expect(normalizeCommittedPropertyId(' 4df2ac7b-b715-4ad9-9400-4ce0d10c4e78 '))
      .toBe('4df2ac7b-b715-4ad9-9400-4ce0d10c4e78');
    expect(normalizeCommittedPropertyId('not-a-property-id')).toBeUndefined();
    expect(normalizeCommittedPropertyId(null)).toBeUndefined();
  });
});
