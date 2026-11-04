import { resolveRouteAskContext } from '../routeContext';

describe('resolveRouteAskContext', () => {
  it('parses the home and the exact item from a reviewed inventory route and its sub-pages', () => {
    const expected = { propertyId: 'prop_12345', entityType: 'INVENTORY_ITEM', entityId: 'item-98765', operationId: 'REPLACEMENT_GUIDANCE' };
    expect(resolveRouteAskContext('/dashboard/properties/prop_12345/inventory/items/item-98765')).toMatchObject(expected);
    expect(resolveRouteAskContext('/dashboard/properties/prop_12345/inventory/items/item-98765/replace-repair')).toMatchObject(expected);
    expect(resolveRouteAskContext('/dashboard/properties/prop_12345/inventory/items/item-98765/coverage?x=1#y')).toMatchObject(expected);
  });
  it('stays generic for unsupported routes and malformed identifiers', () => {
    expect(resolveRouteAskContext('/dashboard/properties/prop_12345/inventory')).toBeNull();
    expect(resolveRouteAskContext('/dashboard/properties/prop_12345/inventory/items/item-98765/other')).toBeNull();
    expect(resolveRouteAskContext('/dashboard/properties/p/inventory/items/i')).toBeNull();
    expect(resolveRouteAskContext('/dashboard/properties/prop_12345/inventory/items/../../x')).toBeNull();
    expect(resolveRouteAskContext('/dashboard/ask')).toBeNull();
    expect(resolveRouteAskContext(null)).toBeNull();
  });
  it('takes both ids from the route itself, so a different item yields a different context and never carries the old one', () => {
    const a = resolveRouteAskContext('/dashboard/properties/prop_12345/inventory/items/item-aaaaaa');
    const b = resolveRouteAskContext('/dashboard/properties/prop_67890/inventory/items/item-bbbbbb');
    expect(a?.entityId).toBe('item-aaaaaa');
    expect(b).toMatchObject({ propertyId: 'prop_67890', entityId: 'item-bbbbbb' });
  });
});
