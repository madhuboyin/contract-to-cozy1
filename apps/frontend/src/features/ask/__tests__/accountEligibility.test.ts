import { askIneligibleDestination, isAskAccountRoleEligible } from '../accountEligibility';

describe('Ask Cozy account eligibility', () => {
  it('allows only homeowner accounts', () => {
    expect(isAskAccountRoleEligible('HOMEOWNER')).toBe(true);
    expect(isAskAccountRoleEligible('PROVIDER')).toBe(false);
    expect(isAskAccountRoleEligible('ADMIN')).toBe(false);
    expect(isAskAccountRoleEligible(null)).toBe(false);
  });

  it('routes excluded roles to their own workspace', () => {
    expect(askIneligibleDestination('PROVIDER')).toBe('/providers/dashboard');
    expect(askIneligibleDestination('ADMIN')).toBe('/dashboard/admin');
    expect(askIneligibleDestination('HOMEOWNER')).toBeNull();
  });
});
