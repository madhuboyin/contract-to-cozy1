import { isFinancingOwnerOnlyError, readOwnerOnly } from '../ownerOnly';

describe('financing owner-only reads', () => {
  it('recognizes the server refusal by status or code, and nothing else', () => {
    expect(isFinancingOwnerOnlyError({ status: 403 })).toBe(true);
    expect(isFinancingOwnerOnlyError({ status: 400, payload: { error: { code: 'PROPERTY_ROLE_REQUIRED' } } })).toBe(true);
    expect(isFinancingOwnerOnlyError({ status: 404 })).toBe(false);
    expect(isFinancingOwnerOnlyError({ status: 'NETWORK' })).toBe(false);
    expect(isFinancingOwnerOnlyError(null)).toBe(false);
    expect(isFinancingOwnerOnlyError(new Error('boom'))).toBe(false);
  });

  it('reports a refusal as owner-only, and any other failure as simply unavailable', async () => {
    await expect(readOwnerOnly(async () => 'profile')).resolves.toEqual({ value: 'profile', ownerOnly: false });
    await expect(readOwnerOnly(async () => { throw Object.assign(new Error('no'), { status: 403 }); })).resolves.toEqual({ value: null, ownerOnly: true });
    await expect(readOwnerOnly(async () => { throw Object.assign(new Error('missing'), { status: 404 }); })).resolves.toEqual({ value: null, ownerOnly: false });
  });
});
