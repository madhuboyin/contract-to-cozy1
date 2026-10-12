import { resolvePropertyOwnerAccess, resolvePropertyWriteAccess } from '../propertyWriteAccess';

// householdRole is present only for household members; the owner's own properties carry none. The server's role floor stays the authority.
describe('resolvePropertyWriteAccess', () => {
  const properties = [
    { id: 'owned', householdRole: undefined },
    { id: 'viewer', householdRole: 'VIEWER' as const },
    { id: 'contributor', householdRole: 'CONTRIBUTOR' as const },
    { id: 'member-owner', householdRole: 'OWNER' as const },
  ];

  it('refuses writes only for a household viewer', () => {
    expect(resolvePropertyWriteAccess(properties, 'viewer')).toEqual({ canWrite: false, isViewer: true });
  });

  it('allows the owner of record, a contributor and a member with the OWNER role', () => {
    for (const id of ['owned', 'contributor', 'member-owner']) {
      expect(resolvePropertyWriteAccess(properties, id)).toEqual({ canWrite: true, isViewer: false });
    }
  });

  it('leaves an unknown property, a missing list or no property id to the server (not a viewer)', () => {
    expect(resolvePropertyWriteAccess(properties, 'other').canWrite).toBe(true);
    expect(resolvePropertyWriteAccess(undefined, 'viewer').canWrite).toBe(true);
    expect(resolvePropertyWriteAccess(properties, '').canWrite).toBe(true);
    expect(resolvePropertyWriteAccess(properties, undefined).isViewer).toBe(false);
  });
});

describe('resolvePropertyOwnerAccess', () => {
  const properties = [
    { id: 'owned', householdRole: undefined },
    { id: 'viewer', householdRole: 'VIEWER' as const },
    { id: 'contributor', householdRole: 'CONTRIBUTOR' as const },
    { id: 'member-owner', householdRole: 'OWNER' as const },
  ];

  it('holds for the owner of record and a member with the OWNER role only', () => {
    expect(resolvePropertyOwnerAccess(properties, 'owned')).toBe(true);
    expect(resolvePropertyOwnerAccess(properties, 'member-owner')).toBe(true);
    expect(resolvePropertyOwnerAccess(properties, 'contributor')).toBe(false);
    expect(resolvePropertyOwnerAccess(properties, 'viewer')).toBe(false);
  });

  it('leaves an unknown property or a missing list to the server', () => {
    expect(resolvePropertyOwnerAccess(properties, 'other')).toBe(true);
    expect(resolvePropertyOwnerAccess(undefined, 'contributor')).toBe(true);
  });
});
