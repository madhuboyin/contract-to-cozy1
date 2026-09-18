const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// D01 fix (docs/architecture/ASK_COZY_PHASE7_DECISIONS_ACCEPTANCE_VERIFICATION.md):
// hvacDecisionStartResult/hvacDecisionContinueResult declared EVIDENCE and
// ASSUMPTIONS as allowed block types but never emitted either -- a homeowner
// resuming a decision saw the verdict and reason codes but not what facts or
// assumptions it was actually built on. Pure, exported for direct unit
// testing without a database, same convention as
// selectBuyerDeadlineMilestones/isCapitalTimelineAnalysisStale.
const { evidenceItemsForCanonicalFacts, assumptionsItemsForSnapshot } = require('../../src/services/ask/decisionThreadPresentationBlocks.ts');

function item(overrides = {}) {
  return { condition: 'FAIR', installedOn: new Date('2018-05-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'), ...overrides };
}

test('resolves a condition reference to the item\'s live, current condition -- not a value stored on the snapshot itself', () => {
  const items = evidenceItemsForCanonicalFacts(
    [{ entityType: 'INVENTORY_ITEM', entityId: 'inv-1', fieldPath: 'condition' }],
    item({ condition: 'POOR' }),
  );
  assert.equal(items.length, 1);
  assert.match(items[0].label, /Recorded condition: poor/);
  assert.equal(items[0].source, 'Home inventory record');
  assert.equal(items[0].observedAt, '2026-01-01T00:00:00.000Z');
});

test('resolves an installedOn reference to a recorded install date', () => {
  const items = evidenceItemsForCanonicalFacts(
    [{ entityType: 'INVENTORY_ITEM', entityId: 'inv-1', fieldPath: 'installedOn' }],
    item(),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'Installed on 2018-05-01');
});

test('an installedOn reference with no recorded date discloses that honestly rather than omitting the item', () => {
  const items = evidenceItemsForCanonicalFacts(
    [{ entityType: 'INVENTORY_ITEM', entityId: 'inv-1', fieldPath: 'installedOn' }],
    item({ installedOn: null }),
  );
  assert.equal(items[0].label, 'Install date not recorded');
});

test('both condition and installedOn references produce 2 distinct items, each only once', () => {
  const items = evidenceItemsForCanonicalFacts(
    [
      { entityType: 'INVENTORY_ITEM', entityId: 'inv-1', fieldPath: 'condition' },
      { entityType: 'INVENTORY_ITEM', entityId: 'inv-1', fieldPath: 'installedOn' },
      { entityType: 'INVENTORY_ITEM', entityId: 'inv-1', fieldPath: 'condition' },
    ],
    item(),
  );
  assert.equal(items.length, 2);
});

test('an unrecognized fieldPath is silently skipped rather than throwing', () => {
  const items = evidenceItemsForCanonicalFacts([{ entityType: 'INVENTORY_ITEM', entityId: 'inv-1', fieldPath: 'someFutureField' }], item());
  assert.deepEqual(items, []);
});

test('malformed or missing canonicalFactReferences (not an array) returns no items rather than throwing', () => {
  assert.deepEqual(evidenceItemsForCanonicalFacts(null, item()), []);
  assert.deepEqual(evidenceItemsForCanonicalFacts(undefined, item()), []);
  assert.deepEqual(evidenceItemsForCanonicalFacts({ not: 'an array' }, item()), []);
});

test('with no preference basis on file, both preference assumption lines explicitly disclose that, verified against the engine\'s own no-op behavior for a null approach/horizon', () => {
  const items = assumptionsItemsForSnapshot([], '1.0');
  assert.equal(items.length, 3);
  assert.match(items[0], /No ownership-horizon preference on file/);
  assert.match(items[1], /No cost-preference on file/);
  assert.match(items[2], /engine version 1\.0/);
});

test('with both preferences on file, both lines point to the preference reference blocks instead of restating the value', () => {
  const items = assumptionsItemsForSnapshot(
    [{ definitionId: 'OWNERSHIP_HORIZON' }, { definitionId: 'REPAIR_REPLACE_APPROACH' }],
    '2.1',
  );
  assert.match(items[0], /Uses your saved ownership-horizon plan/);
  assert.match(items[1], /Uses your confirmed repair\/replace approach/);
  assert.match(items[2], /engine version 2\.1/);
});

test('with only one preference on file, only that line reflects it -- the other still discloses absence', () => {
  const items = assumptionsItemsForSnapshot([{ definitionId: 'OWNERSHIP_HORIZON' }], '1.0');
  assert.match(items[0], /Uses your saved ownership-horizon plan/);
  assert.match(items[1], /No cost-preference on file/);
});
