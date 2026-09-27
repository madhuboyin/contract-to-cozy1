const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { loadOptionalBuyerPlanContext } = require('../../src/services/ask/askOrchestrator.service.ts');

const input = {
  userId: 'user-1',
  propertyId: 'property-1',
  operationId: 'HOME_ACTIONS',
  signal: new AbortController().signal,
};

test('optional Buyer Plan context returns an in-budget result', async () => {
  const expected = { status: 'NOT_APPLICABLE', entityCount: 0, factCount: 0 };
  const result = await loadOptionalBuyerPlanContext(input, async () => expected, 50);
  assert.equal(result, expected);
});

test('optional Buyer Plan context times out without failing HOME_ACTIONS', async () => {
  const startedAt = Date.now();
  const result = await loadOptionalBuyerPlanContext(input, () => new Promise(() => {}), 10);
  assert.equal(result, null);
  assert.ok(Date.now() - startedAt < 250, 'optional context must respect its latency budget');
});

test('optional Buyer Plan context failure degrades to the homeowner feed', async () => {
  const result = await loadOptionalBuyerPlanContext(input, async () => { throw new Error('buyer context unavailable'); }, 50);
  assert.equal(result, null);
});

test('HOME_ACTIONS evaluates Property Context and the canonical feed concurrently', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/services/ask/handlers/homeActions.handler.ts'), 'utf8');
  assert.match(source, /const \[evaluation, feedResult\] = await Promise\.all\(\[/);
  assert.match(source, /evaluateFeatureContext\(propertyId, userId/);
  assert.match(source, /getHomeActionFeed\(propertyId, userId\)/);
});
