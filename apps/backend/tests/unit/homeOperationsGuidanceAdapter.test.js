const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { guidanceJourneySourceAdapter } = require('../../src/modules/homeOperations/adapters/guidanceJourney.adapter.ts');

function makeJourney(overrides = {}) {
  return {
    id: 'journey-1',
    propertyId: 'property-1',
    inventoryItemId: 'inventory-1',
    journeyTypeKey: 'asset_lifecycle_resolution',
    scopeCategory: 'ITEM',
    status: 'ACTIVE',
    templateVersion: 'asset_lifecycle_resolution@1.0.0',
    version: 3,
    isLowContext: false,
    missingContextKeys: [],
    currentStepSafetyTier: null,
    ...overrides,
  };
}

test('an active, item-scoped journey proposes a DECISION work item on the inventory item', () => {
  const proposed = guidanceJourneySourceAdapter.propose(makeJourney(), 'property-1');
  assert.ok(proposed);
  assert.deepEqual(proposed.subject, { type: 'INVENTORY_ITEM', id: 'inventory-1' });
  assert.equal(proposed.obligationType, 'DECISION');
  assert.equal(proposed.occurrence.obligationSlug, 'guidance-asset_lifecycle_resolution');
  assert.equal(proposed.priority, 'SOON');
  assert.equal(proposed.source.sourceType, 'GUIDANCE');
  assert.equal(proposed.source.sourceEntityId, 'journey-1');
  assert.equal(proposed.source.sourceVersion, 'asset_lifecycle_resolution@1.0.0');
  assert.equal(proposed.source.sourceRole, 'TRIGGER');
});

test('a NOT_STARTED journey is still open work but lower priority', () => {
  const proposed = guidanceJourneySourceAdapter.propose(makeJourney({ status: 'NOT_STARTED' }), 'property-1');
  assert.ok(proposed);
  assert.equal(proposed.priority, 'PLAN');
});

for (const status of ['ABORTED', 'ARCHIVED', 'COMPLETED', 'DISMISSED', 'BRANCHED']) {
  test(`a ${status} journey is not open work`, () => {
    assert.equal(guidanceJourneySourceAdapter.propose(makeJourney({ status }), 'property-1'), null);
  });
}

test('a SERVICE-scoped or item-less journey falls back to a PROPERTY subject', () => {
  const serviceProposed = guidanceJourneySourceAdapter.propose(
    makeJourney({ scopeCategory: 'SERVICE', inventoryItemId: null }),
    'property-1',
  );
  assert.deepEqual(serviceProposed.subject, { type: 'PROPERTY', id: 'property-1' });

  const noItemProposed = guidanceJourneySourceAdapter.propose(
    makeJourney({ inventoryItemId: null }),
    'property-1',
  );
  assert.deepEqual(noItemProposed.subject, { type: 'PROPERTY', id: 'property-1' });
});

test('a missing templateVersion falls back to the numeric version as sourceVersion', () => {
  const proposed = guidanceJourneySourceAdapter.propose(makeJourney({ templateVersion: null, version: 5 }), 'property-1');
  assert.equal(proposed.source.sourceVersion, '5');
});

test('safetyTier defaults to LOW_CONSEQUENCE when no current step safety tier is supplied', () => {
  const proposed = guidanceJourneySourceAdapter.propose(makeJourney(), 'property-1');
  assert.equal(proposed.safetyTier, 'LOW_CONSEQUENCE');

  const escalated = guidanceJourneySourceAdapter.propose(
    makeJourney({ currentStepSafetyTier: 'SAFETY_EMERGENCY' }),
    'property-1',
  );
  assert.equal(escalated.safetyTier, 'SAFETY_EMERGENCY');
});

test('a low-context journey surfaces reduced confidence and its missing context keys', () => {
  const proposed = guidanceJourneySourceAdapter.propose(
    makeJourney({ isLowContext: true, missingContextKeys: ['Roof age'] }),
    'property-1',
  );
  assert.equal(proposed.confidence, 0.4);
  assert.deepEqual(proposed.missingContext, ['Roof age']);
});
