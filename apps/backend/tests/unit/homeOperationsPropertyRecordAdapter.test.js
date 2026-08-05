const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Continuity plan §8 (Slice 4): "promote missing/stale records through
// canonical Home Actions" — propertyRecordSourceAdapter.propose() is pure,
// no prisma mocking needed, same style as inspectionFinding.adapter's tests.

const {
  propertyRecordSourceAdapter,
  resolvePropertyRecordWorkKey,
} = require('../../src/modules/homeOperations/adapters/propertyRecord.adapter.ts');

function recordFixture(overrides = {}) {
  return {
    id: 'record-1',
    title: 'HVAC extended warranty',
    recordType: 'WARRANTY',
    sensitivity: 'STANDARD',
    needsReview: false,
    expiryStatus: null,
    effectiveTo: null,
    ...overrides,
  };
}

test('a record with no pending review and no expiry issue proposes nothing', () => {
  const proposed = propertyRecordSourceAdapter.propose(recordFixture(), 'property-1');
  assert.equal(proposed, null);
});

test('a record needing review proposes a PLAN-priority, LOW_CONSEQUENCE work item by default', () => {
  const proposed = propertyRecordSourceAdapter.propose(recordFixture({ needsReview: true }), 'property-1');
  assert.ok(proposed);
  assert.equal(proposed.priority, 'PLAN');
  assert.equal(proposed.safetyTier, 'LOW_CONSEQUENCE');
  assert.equal(proposed.dueAt, null, 'no fabricated due date for a pending-review-only gap');
  assert.equal(proposed.obligationType, 'RECORD_REVIEW');
  assert.deepEqual(proposed.subject, { type: 'PROPERTY', id: 'property-1' });
  assert.equal(proposed.occurrence.obligationSlug, 'record-review-record-1');
  assert.match(proposed.title, /Review extracted details/);
});

test('a financially-sensitive record (FINANCIAL/INSURANCE/CLAIM/LEGAL) needing review is MATERIAL_FINANCIAL', () => {
  for (const sensitivity of ['FINANCIAL', 'INSURANCE', 'CLAIM', 'LEGAL']) {
    const proposed = propertyRecordSourceAdapter.propose(
      recordFixture({ needsReview: true, sensitivity }),
      'property-1',
    );
    assert.equal(proposed.safetyTier, 'MATERIAL_FINANCIAL', `expected MATERIAL_FINANCIAL for ${sensitivity}`);
  }
});

test('an expired record proposes a SOON-priority item with a real due date (the expiry itself)', () => {
  const effectiveTo = new Date('2026-01-01T00:00:00.000Z');
  const proposed = propertyRecordSourceAdapter.propose(
    recordFixture({ expiryStatus: 'EXPIRED', effectiveTo }),
    'property-1',
  );
  assert.ok(proposed);
  assert.equal(proposed.priority, 'SOON');
  assert.equal(proposed.dueAt, effectiveTo);
  assert.match(proposed.title, /Review expiring record/);
});

test('an expiring-soon record proposes a PLAN-priority item', () => {
  const proposed = propertyRecordSourceAdapter.propose(
    recordFixture({ expiryStatus: 'EXPIRING_SOON' }),
    'property-1',
  );
  assert.ok(proposed);
  assert.equal(proposed.priority, 'PLAN');
});

test('resolvePropertyRecordWorkKey is stable per record and property, embedding the record id in the slug (PROPERTY subject collapses to no segment)', () => {
  const key = resolvePropertyRecordWorkKey('record-1', 'property-1');
  assert.equal(key, 'property:property-1:record-review-record-1');
});

// --- syncPropertyRecordWorkItem behavior (mocked resolve/transition layer) ---

let upsertCalls = [];
let transitionCalls = [];
let existingWorkItem = null;

function resetSyncFixtures() {
  upsertCalls = [];
  transitionCalls = [];
  existingWorkItem = null;
}

const resolveWorkItemPath = require.resolve('../../src/modules/homeOperations/application/resolveWorkItem.usecase.ts');
require.cache[resolveWorkItemPath] = {
  id: resolveWorkItemPath,
  filename: resolveWorkItemPath,
  loaded: true,
  exports: {
    resolveAndUpsertWorkItem: async (proposal) => {
      upsertCalls.push(proposal);
      return { id: 'work-item-1', state: 'CANDIDATE' };
    },
  },
};

const transitionWorkItemPath = require.resolve('../../src/modules/homeOperations/application/transitionWorkItem.usecase.ts');
require.cache[transitionWorkItemPath] = {
  id: transitionWorkItemPath,
  filename: transitionWorkItemPath,
  loaded: true,
  exports: {
    transitionWorkItem: async (input) => {
      transitionCalls.push(input);
      return { id: input.workItemId, state: input.to };
    },
  },
};

const workItemRepositoryPath = require.resolve('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');
require.cache[workItemRepositoryPath] = {
  id: workItemRepositoryPath,
  filename: workItemRepositoryPath,
  loaded: true,
  exports: {
    findWorkItemByWorkKey: async () => existingWorkItem,
  },
};

// Re-require after mocking so the module under test picks up the mocks.
delete require.cache[require.resolve('../../src/modules/homeOperations/adapters/propertyRecord.adapter.ts')];
const { syncPropertyRecordWorkItem } = require('../../src/modules/homeOperations/adapters/propertyRecord.adapter.ts');

test('syncPropertyRecordWorkItem proposes+upserts when the record needs review', async () => {
  resetSyncFixtures();
  await syncPropertyRecordWorkItem('property-1', recordFixture({ needsReview: true }));
  assert.equal(upsertCalls.length, 1);
  assert.equal(transitionCalls.length, 0);
});

test('syncPropertyRecordWorkItem closes a still-CANDIDATE item with NOT_RELEVANT once the condition clears', async () => {
  resetSyncFixtures();
  existingWorkItem = { id: 'work-item-1', state: 'CANDIDATE' };
  await syncPropertyRecordWorkItem('property-1', recordFixture({ needsReview: false }));
  assert.equal(upsertCalls.length, 0);
  assert.equal(transitionCalls.length, 1);
  assert.equal(transitionCalls[0].to, 'CLOSED');
  assert.equal(transitionCalls[0].disposition, 'NOT_RELEVANT');
});

test('syncPropertyRecordWorkItem walks an ACCEPTED item to genuine VERIFIED completion, not a not-relevant close', async () => {
  resetSyncFixtures();
  existingWorkItem = { id: 'work-item-1', state: 'ACCEPTED' };
  await syncPropertyRecordWorkItem('property-1', recordFixture({ needsReview: false }));
  assert.equal(upsertCalls.length, 0);
  const targets = transitionCalls.map((call) => call.to);
  assert.deepEqual(targets, ['REPORTED_COMPLETE', 'VERIFIED']);
  for (const call of transitionCalls) {
    assert.equal(call.disposition, undefined, 'genuine completion must carry no disposition');
  }
});

test('syncPropertyRecordWorkItem does nothing when there is no existing item and nothing to propose', async () => {
  resetSyncFixtures();
  existingWorkItem = null;
  await syncPropertyRecordWorkItem('property-1', recordFixture({ needsReview: false }));
  assert.equal(upsertCalls.length, 0);
  assert.equal(transitionCalls.length, 0);
});

test('syncPropertyRecordWorkItem is idempotent on an already-CLOSED item — no transition call', async () => {
  resetSyncFixtures();
  existingWorkItem = { id: 'work-item-1', state: 'CLOSED' };
  await syncPropertyRecordWorkItem('property-1', recordFixture({ needsReview: false }));
  assert.equal(transitionCalls.length, 0);
});
