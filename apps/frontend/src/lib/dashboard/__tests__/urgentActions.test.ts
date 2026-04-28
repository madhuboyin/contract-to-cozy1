import type { InventoryItem } from '@/types';
import { consolidateUrgentActions, resolveUrgentActionHref } from '../urgentActions';

function createInventoryItem(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'item-default',
    propertyId: 'prop-1',
    roomId: null,
    homeAssetId: null,
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

  it('creates a COVERAGE_PARTIAL action for an item with only warranty', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-2',
        name: 'Refrigerator',
        warrantyId: 'warranty-1',
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('COVERAGE_PARTIAL');
    expect(actions[0].title).toBe('Refrigerator has partial coverage');
  });

  it('does not create an action for a fully covered item', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-3',
        name: 'Oven',
        warrantyId: 'warranty-1',
        insurancePolicyId: 'policy-1',
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(0);
  });

  it('still creates an action for low-value items so Fix matches the coverage tab count', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-4',
        name: 'Cheap Item',
        replacementCostCents: 5000,
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('COVERAGE_GAP');
  });

  it('creates an action when replacement cost is missing', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-4b',
        name: 'Washer Dryer',
        replacementCostCents: null,
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(1);
    expect(actions[0].description).toContain('Replacement value has not been added yet.');
  });

  it('prioritizes COVERAGE_GAP ahead of COVERAGE_PARTIAL', () => {
    const inventoryItems: InventoryItem[] = [
      createInventoryItem({
        id: 'item-5',
        name: 'Partial Item',
        warrantyId: 'warranty-1',
      }),
      createInventoryItem({
        id: 'item-6',
        name: 'No Coverage Item',
      }),
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('COVERAGE_GAP');
    expect(actions[1].type).toBe('COVERAGE_PARTIAL');
  });

  it('resolves coverage gap actions back to the highlighted inventory item', () => {
    const [action] = consolidateUrgentActions(
      [],
      [],
      [],
      [],
      [],
      [createInventoryItem({ id: 'item-7', name: 'Washer Dryer' })],
    );

    expect(resolveUrgentActionHref(action, 'prop-1')).toBe(
      '/dashboard/properties/prop-1/inventory?tab=coverage&highlight=item-7',
    );
  });
});
