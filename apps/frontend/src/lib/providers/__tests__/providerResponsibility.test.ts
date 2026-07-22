import {
  getProviderResponsibilityConfig,
  isResponsibilityAssignedElsewhere,
  isResponsibilityUnknown,
  responsibilityPartyLabel,
} from '../providerResponsibility';

const context = (status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN', reasonCodes: string[], missingFactKeys: string[] = []) => ({
  contextVersion: 'v1',
  decision: {
    status,
    reasonCodes,
    missingFactKeys,
    usedFactKeys: [],
    conflictedFactKeys: [],
    validUntil: null,
  },
});

describe('provider responsibility presentation', () => {
  test.each([
    ['HVAC', 'responsibility.hvac', 'HVAC service'],
    ['PLUMBING', 'responsibility.plumbing', 'plumbing service'],
    ['ELECTRICAL', 'responsibility.sharedSystems', 'electrical service'],
    ['LANDSCAPING', 'responsibility.landscaping', 'landscaping work'],
  ])('maps %s to its responsibility fact', (category, factKey, subject) => {
    expect(getProviderResponsibilityConfig(category)).toMatchObject({ factKey, subject });
  });

  test('does not ask a responsibility question for categories without a responsibility gate', () => {
    expect(getProviderResponsibilityConfig('CLEANING')).toBeNull();
    expect(getProviderResponsibilityConfig('ALL')).toBeNull();
  });

  test('distinguishes an unknown fact from work assigned elsewhere', () => {
    const config = getProviderResponsibilityConfig('HVAC');
    expect(isResponsibilityUnknown(context('UNKNOWN', ['WORK_SCOPE_RESPONSIBILITY_UNKNOWN'], ['responsibility.hvac']), config)).toBe(true);
    expect(isResponsibilityAssignedElsewhere(context('NOT_APPLICABLE', ['WORK_SCOPE_RESPONSIBILITY_ASSIGNED_ELSEWHERE']))).toBe(true);
    expect(isResponsibilityUnknown(context('NOT_APPLICABLE', ['WORK_SCOPE_RESPONSIBILITY_ASSIGNED_ELSEWHERE']), config)).toBe(false);
  });

  test('uses homeowner-facing party names', () => {
    expect(responsibilityPartyLabel('LANDLORD')).toBe('your landlord or property manager');
    expect(responsibilityPartyLabel('ASSOCIATION')).toBe('your HOA or condo association');
    expect(responsibilityPartyLabel('SHARED')).toBe('you and another responsible party');
  });
});
