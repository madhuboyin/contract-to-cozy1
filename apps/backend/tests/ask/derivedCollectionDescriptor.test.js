const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Presentation Quality 5: a producer that withholds rows without declaring a collection gets one derived from its own section counts.

const { withDerivedCollectionDescriptor, withDerivedCollectionDescriptors } = require('../../src/services/ask/support/collectionDescriptor.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const items = (n, prefix = 'i') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, title: `T${i}`, meta: [] }));
const list = (sections, extra = {}) => ({ type: 'GROUPED_LIST', id: 'l', title: 'L', actions: [], filters: [], sections, ...extra });

test('a list that withholds nothing is returned unchanged', () => {
  const block = list([{ id: 's', title: 'S', count: 3, items: items(3) }]);
  assert.equal(withDerivedCollectionDescriptor(block), block);
});

test('rows withheld with no window are declared truncated with an unknown source total and no continuation', () => {
  const block = withDerivedCollectionDescriptor(list([{ id: 'a', title: 'A', count: 30, items: items(20, 'a') }, { id: 'b', title: 'B', count: 4, items: items(4, 'b') }]));
  assert.deepEqual(block.collection, { sourceTotal: null, fetchedCount: 34, deliveredCount: 24, nextPageAvailable: false, deliveryTruncated: true });
  AskPresentationBlockSchema.parse(block);
});

test('a server window states the source total and a next page only while a window ends before its count', () => {
  const more = withDerivedCollectionDescriptor(list([{ id: 'a', title: 'A', count: 40, offset: 10, items: items(10) }]));
  assert.deepEqual(more.collection, { sourceTotal: 40, fetchedCount: 10, deliveredCount: 10, nextPageAvailable: true, deliveryTruncated: false });
  AskPresentationBlockSchema.parse(more);
  const last = withDerivedCollectionDescriptor(list([{ id: 'a', title: 'A', count: 20, offset: 10, items: items(10) }]));
  assert.equal(last.collection.nextPageAvailable, false);
  AskPresentationBlockSchema.parse(last);
});

test('a producer’s own declaration is never overwritten, and other block types are untouched', () => {
  const declared = { sourceTotal: 9, fetchedCount: 2, deliveredCount: 2, nextPageAvailable: true, deliveryTruncated: false };
  const block = list([{ id: 'a', title: 'A', count: 9, offset: 0, items: items(2) }], { collection: declared });
  assert.equal(withDerivedCollectionDescriptor(block), block);
  const summary = { type: 'SUMMARY', id: 's', title: 't', body: 'b', actions: [] };
  assert.equal(withDerivedCollectionDescriptor(summary), summary);
});

test('a result with nothing to derive is returned as the same object', () => {
  const result = { status: 'ANSWERED', blocks: [list([{ id: 's', title: 'S', count: 1, items: items(1) }])] };
  assert.equal(withDerivedCollectionDescriptors(result), result);
  const truncated = { status: 'ANSWERED', blocks: [list([{ id: 's', title: 'S', count: 5, items: items(1) }])] };
  assert.equal(withDerivedCollectionDescriptors(truncated).blocks[0].collection.deliveryTruncated, true);
});
