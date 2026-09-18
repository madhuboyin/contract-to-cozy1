const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// D05 fix (docs/architecture/ASK_COZY_PHASE7_DECISIONS_ACCEPTANCE_VERIFICATION.md):
// found while retracing D05's "workflow restored" requirement -- Ask's own
// quoteComparisonReviewResult built a `?workspaceId=` link the frontend
// QuoteComparisonWorkspaceClient.tsx never actually consumes for loading
// (confirmed by direct read: it always calls getOrCreateQuoteComparisonWorkspace
// scoped by serviceCategory/inventoryItemId, ignoring any workspace id in
// the URL). Pure, exported for direct unit testing.
const { quoteComparisonWorkspaceHref } = require('../../src/services/ask/askOrchestrator.service.ts');

test('a workspace scoped by both serviceCategory and inventoryItemId gets both params, using the frontend\'s own param names', () => {
  const href = quoteComparisonWorkspaceHref('/dashboard/properties/p1/tools/quote-comparison', {
    id: 'ws-1', serviceCategory: 'ROOFING', inventoryItemId: 'inv-1',
  });
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.get('serviceCategory'), 'ROOFING');
  assert.equal(url.searchParams.get('itemId'), 'inv-1');
  assert.equal(url.searchParams.get('workspaceId'), null);
});

test('a workspace scoped only by serviceCategory omits the itemId param entirely, not an empty one', () => {
  const href = quoteComparisonWorkspaceHref('/dashboard/properties/p1/tools/quote-comparison', {
    id: 'ws-1', serviceCategory: 'ROOFING', inventoryItemId: null,
  });
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.get('serviceCategory'), 'ROOFING');
  assert.equal(url.searchParams.has('itemId'), false);
});

test('a workspace scoped only by inventoryItemId omits the serviceCategory param', () => {
  const href = quoteComparisonWorkspaceHref('/dashboard/properties/p1/tools/quote-comparison', {
    id: 'ws-1', serviceCategory: null, inventoryItemId: 'inv-1',
  });
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.has('serviceCategory'), false);
  assert.equal(url.searchParams.get('itemId'), 'inv-1');
});

test('an unscoped ("general") workspace falls back to the old workspaceId form -- not fixed, but not made worse either', () => {
  const href = quoteComparisonWorkspaceHref('/dashboard/properties/p1/tools/quote-comparison', {
    id: 'ws-1', serviceCategory: null, inventoryItemId: null,
  });
  assert.equal(href, '/dashboard/properties/p1/tools/quote-comparison?workspaceId=ws-1');
});
