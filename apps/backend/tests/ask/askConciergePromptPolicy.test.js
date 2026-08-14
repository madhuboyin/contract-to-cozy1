const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  inventoryDecisionQuestion,
  selectInventoryDecisionCandidate,
} = require('../../src/services/ask/askConciergePromptPolicy.ts');

const now = new Date('2026-08-14T12:00:00.000Z');

function item(overrides = {}) {
  return {
    id: 'item-1',
    name: 'refrigerator',
    condition: 'GOOD',
    expectedExpiryDate: null,
    updatedAt: new Date('2026-08-01T12:00:00.000Z'),
    ...overrides,
  };
}

test('does not imply a repair-or-replace decision for an ordinary inventory item', () => {
  assert.equal(selectInventoryDecisionCandidate([item()], now), null);
});

test('selects an inventory item only when condition or lifecycle evidence makes the decision relevant', () => {
  const fairRefrigerator = item({ condition: 'FAIR' });
  const expiringWaterHeater = item({
    id: 'item-2',
    name: 'water heater',
    expectedExpiryDate: new Date('2026-10-01T12:00:00.000Z'),
  });

  assert.equal(selectInventoryDecisionCandidate([fairRefrigerator, expiringWaterHeater], now)?.id, 'item-2');
  assert.equal(inventoryDecisionQuestion('Water heater'), 'Should I repair or replace my water heater?');
});

test('uses property-safe wording when no usable entity label is available', () => {
  assert.equal(
    inventoryDecisionQuestion('   '),
    'Help me compare repair and replacement options for a home system or appliance.',
  );
});
