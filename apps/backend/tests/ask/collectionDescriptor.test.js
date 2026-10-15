const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Presentation Quality 2A: the honest collection vocabulary. The schema rejects contradictory combinations; the Status Board
// delivers every fetched row (no silent 25-row cap) and says when its source is larger.

const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { collectionDescriptor } = require('../../src/services/ask/support/collectionDescriptor.ts');
const { statusBoardFromView } = require('../../src/services/ask/askOrchestrator.service.ts');

const list = (itemCount, collection) => ({
  type: 'GROUPED_LIST', id: 'x', title: 't', actions: [], filters: [],
  sections: [{ id: 's', title: 'S', count: itemCount, items: Array.from({ length: itemCount }, (_, i) => ({ id: `i${i}`, title: `Item ${i}`, meta: [] })) }],
  ...(collection ? { collection } : {}),
});
const ok = (block) => AskPresentationBlockSchema.safeParse(block).success;

test('a descriptor must agree with the rows the sections carry and with itself', () => {
  assert.equal(ok(list(3)), true, 'the descriptor is optional');
  assert.equal(ok(list(3, { sourceTotal: 3, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: false })), true);
  assert.equal(ok(list(3, { sourceTotal: 10, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: true, deliveryTruncated: false })), true, 'a real next page');
  assert.equal(ok(list(3, { sourceTotal: null, fetchedCount: 5, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: true })), true, 'unknown source total');
  // contradictions
  assert.equal(ok(list(3, { sourceTotal: 3, fetchedCount: 3, deliveredCount: 2, nextPageAvailable: false, deliveryTruncated: true })), false, 'delivered must equal the section items');
  assert.equal(ok(list(3, { sourceTotal: 2, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: false })), false, 'fetched cannot exceed the source');
  assert.equal(ok(list(3, { sourceTotal: 3, fetchedCount: 5, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: false })), false, 'truncation must be declared');
  assert.equal(ok(list(3, { sourceTotal: 3, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: true, deliveryTruncated: false })), false, 'no next page when the whole source was delivered');
  assert.equal(ok(list(3, { sourceTotal: 3, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: true })), false, 'truncated with nothing withheld');
});

test('collectionDescriptor derives delivered and truncated from the sections', () => {
  const d = collectionDescriptor({ sourceTotal: 12, fetchedCount: 10, sections: [{ items: [1, 2, 3] }, { items: [4, 5] }], nextPageAvailable: true });
  assert.deepEqual(d, { sourceTotal: 12, fetchedCount: 10, deliveredCount: 5, nextPageAvailable: true, deliveryTruncated: true });
});

const row = (id, condition) => ({
  id, displayName: `Item ${id}`, category: 'APPLIANCE', condition, recommendation: 'OK', ageYears: 5, computedReasons: [],
  warrantyStatus: 'ACTIVE', pendingMaintenance: 0, room: null, isPinned: false, needsInstallDateForPrediction: false,
});
const board = (n, total = n) => statusBoardFromView({
  items: Array.from({ length: n }, (_, i) => row(`i${i}`, ['ACTION_NEEDED', 'MONITOR', 'GOOD'][i % 3])),
  summary: {}, pagination: { page: 1, limit: 100, total, totalPages: 1 },
}, 'p1');

test('Status Board delivers every fetched row at 0, 1, 5, 20, 50 and 100, declares itself complete, and still parses', () => {
  for (const n of [1, 5, 20, 50, 100]) {
    const list = board(n).blocks.find((block) => block.id === 'status-board-items');
    assert.equal(ok(list), true, `${n}`);
    assert.equal(list.collection.deliveredCount, n);
    assert.equal(list.collection.deliveryTruncated, false);
    assert.equal(list.collection.nextPageAvailable, false);
    assert.equal(list.collection.sourceTotal, n);
    for (const section of list.sections) {
      assert.equal(section.items.length, section.count, 'a section count never exceeds what it carries');
      assert.equal(section.initialVisibleCount, 6);
    }
  }
  assert.equal(board(0).blocks.find((block) => block.id === 'status-board-items'), undefined);
});

test('Status Board past its read limit declares the larger source with no continuation', () => {
  const list = board(100, 140).blocks.find((block) => block.id === 'status-board-items');
  assert.equal(ok(list), true);
  assert.deepEqual(list.collection, { sourceTotal: 140, fetchedCount: 100, deliveredCount: 100, nextPageAvailable: false, deliveryTruncated: false });
});
