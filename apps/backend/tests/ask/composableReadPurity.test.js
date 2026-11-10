// Composition FRD FR-ELG-2..6: every operation on the composable allowlist is certified by running its REAL handler and domain-service path against
// recording infrastructure. Reads are permitted and recorded; any write, raw write, outbound request, confirmation, capture or workflow result fails.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { runReadPurity, seedOwnedProperty } = require('../helpers/readPurityHarness.js');
const { COMPOSABLE_READ_OPERATION_IDS, ASK_OPERATION_DEFINITIONS, validateAskOperationRegistry } = require('../../src/services/ask/askOperationRegistry.ts');

const MESSAGES = {
  ITEM_REPLACEMENT_COST: 'how much does a new roof cost',
  INVENTORY_LOOKUP: 'how old is my roof',
  WARRANTY_LOOKUP: 'what warranties do I have',
  MAINTENANCE_BUDGET_FORECAST: 'what is my yearly maintenance budget',
  DO_NOTHING_SIMULATION: 'what happens if I do nothing',
  HOME_UPGRADE_SCENARIOS: 'show my saved upgrade scenarios',
  RECALL_REVIEW: 'are there any recalls on my appliances',
  HOME_TIMELINE_EVENTS: 'show my home timeline',
};

test('the allowlist and the certified messages cover the same operations', () => {
  assert.deepEqual([...COMPOSABLE_READ_OPERATION_IDS].sort(), Object.keys(MESSAGES).sort());
});

test('registry rules: a composable read is STANDARD, deterministic, routable, property-scoped and a read family; no MATERIAL_DECISION is composable', () => {
  const issues = (validateAskOperationRegistry ? validateAskOperationRegistry() : []).filter((issue) => /composable/i.test(issue));
  assert.deepEqual(issues, []);
  for (const entry of Object.values(ASK_OPERATION_DEFINITIONS)) {
    if (entry.safetyClass === 'MATERIAL_DECISION') assert.equal(entry.composableRead, false, entry.operationId);
    assert.equal(entry.composableRead, COMPOSABLE_READ_OPERATION_IDS.has(entry.operationId), entry.operationId);
  }
});

for (const [operationId, message] of Object.entries(MESSAGES)) {
  test(`purity: ${operationId} runs its real path with no writes, requests, confirmations, captures or workflow results`, async () => {
    const run = await runReadPurity(operationId, message, { seed: seedOwnedProperty });
    assert.equal(run.error, null, run.error && run.error.message);
    assert.deepEqual(run.problems, []);
    assert.ok(run.result, 'the handler returned a result');
    assert.notEqual(run.result.status, 'BLOCKED', `${operationId} was blocked before its handler ran: ${run.result.reasonCode}`);
    assert.ok(run.reads.length > 0, `${operationId} read something, so its real path ran`);
  });
}

test('the harness itself records a database write made while a handler runs', async () => {
  const { prisma } = require('../../src/lib/prisma.ts');
  // ITEM_REPLACEMENT_COST reads Property, so the seed hook runs inside the recorded window; the hook attempts a write on the real (patched) client.
  const run = await runReadPurity('ITEM_REPLACEMENT_COST', 'how much does a new roof cost', {
    seed: (model, method) => {
      if (model === 'Property' && method === 'findUnique') prisma.property.update({ where: { id: 'p1' }, data: {} }).catch(() => {});
      return seedOwnedProperty(model, method);
    },
  });
  assert.ok(run.problems.includes('prisma.Property.update'), JSON.stringify(run.problems));
});
