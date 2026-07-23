import type { InventoryItem } from '@/types';
import { consolidateUrgentActions, resolveUrgentActionHref } from '../urgentActions';

function createInventoryItem(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'item-default',
    propertyId: 'prop-1',
    roomId: null,
    warrantyId: null,
    insurancePolicyId: null,
    name: 'Default Item',
    category: 'APPLIANCE',
    condition: 'GOOD',
    brand: null,
    model: null,
    serialNo: null,
    installedOn: null,
    purchasedOn: null,
    lastServicedOn: null,
    purchaseCostCents: null,
    replacementCostCents: 50000,
    currency: 'USD',
    notes: null,
    tags: [],
    sourceHash: null,
    coverageNotRequired: false,
    coverageState: 'MISSING',
    coverageStateLabel: 'Coverage missing',
    coverageStateDetail: 'You confirmed that no warranty or insurance is linked.',
    coverageActionable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('consolidateUrgentActions - Coverage Gaps', () => {
  it('creates a COVERAGE_GAP action for an item with no coverage', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-1',
        name: 'Dishwasher',
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('COVERAGE_GAP');
    expect(actions[0].title).toBe('Dishwasher needs coverage');
    expect(actions[0].itemId).toBe('item-1');
  });

  it('does not infer a partial gap when the backend coverage state is confirmed', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-2',
        name: 'Refrigerator',
        warrantyId: 'warranty-1',
        coverageState: 'CONFIRMED',
        coverageStateLabel: 'Coverage confirmed',
        coverageActionable: false,
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(0);
  });

  it('does not create an action for a fully covered item', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-3',
        name: 'Oven',
        warrantyId: 'warranty-1',
        insurancePolicyId: 'policy-1',
        coverageState: 'CONFIRMED',
        coverageActionable: false,
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(0);
  });

  it('does not create a financial coverage action below the canonical appliance threshold', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-4',
        name: 'Cheap Item',
        replacementCostCents: 5000,
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(0);
  });

  it('does not create an action when financial relevance is missing', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-4b',
        name: 'Washer Dryer',
        replacementCostCents: null,
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(0);
  });

  it('excludes managed and incomplete records while retaining an actionable gap', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-5',
        name: 'Association Roof',
        category: 'ROOF_EXTERIOR',
        coverageState: 'MANAGED_ELSEWHERE',
        coverageStateLabel: 'Managed by your HOA',
        coverageActionable: false,
      }),
      createInventoryItem({
        id: 'item-6',
        name: 'No Coverage Item',
      }),
      createInventoryItem({
        id: 'item-6b',
        name: 'Water Heater',
        category: 'PLUMBING',
        coverageState: 'INCOMPLETE',
        coverageStateLabel: 'Coverage status incomplete',
        coverageActionable: false,
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('COVERAGE_GAP');
  });

  it('resolves coverage gap actions to the canonical context-aware coverage page', () => {
    const [action] = consolidateUrgentActions(
      [],
      [],
      [],
      [],
      [],
      [createInventoryItem({ id: 'item-7', name: 'Washer Dryer' })],
    );

    expect(resolveUrgentActionHref(action, 'prop-1')).toBe(
      '/dashboard/properties/prop-1/inventory/items/item-7/coverage',
    );
  });
});
