const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { isItemReserveAllocationMessage, isItemFundingGoalMessage } = require('../../src/services/ask/support/itemFundingWording.ts');
const { resolveAskOperation, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const { itemReserveAllocationResult } = require('../../src/services/ask/handlers/itemReserveAllocation.handler.ts');

test('the operation is a STANDARD read, routed from the allocation wording; how-much-to-save stays with the funding goal', () => {
  const def = getAskOperationDefinition('ITEM_RESERVE_ALLOCATION');
  assert.equal(def.safetyClass, 'STANDARD');
  assert.equal(def.composableRead, true);
  for (const m of ['how much of my reserve is set aside for the roof', 'what has been allocated to the water heater', 'how much have I put toward the furnace so far', 'how much have I set aside for my roof']) {
    assert.equal(isItemReserveAllocationMessage(m), true, m);
    assert.equal(resolveAskOperation(m).operationId, 'ITEM_RESERVE_ALLOCATION', m);
  }
  for (const m of ['how much should I set aside for the roof', 'how much do I need to save for the roof', 'how much more should I set aside for the roof each month', 'set aside $500 for the roof', 'how much does a new roof cost', 'show my reserve fund']) {
    assert.equal(isItemReserveAllocationMessage(m), false, m);
  }
  assert.equal(resolveAskOperation('how much should I set aside each month for a new water heater').operationId, 'CAPITAL_ITEM_FUNDING_GOAL');
  assert.equal(isItemFundingGoalMessage('how much of my reserve is set aside for the roof'), false);
});

function stub({ fund, lines = [] }) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'VIEWER', isOwner: false });
  prisma.homeReserveFund.findUnique = async () => fund;
  prisma.homeReserveFundLineItem.findMany = async () => lines;
  // the read must never create a fund row
  prisma.homeReserveFund.create = async () => { throw new Error('the allocation read must not create a fund'); };
  prisma.homeReserveFund.upsert = async () => { throw new Error('the allocation read must not create a fund'); };
}
const fund = { id: 'f1', posture: 'MODERATE', currentBalanceCents: 500_000, lastRecalculatedAt: new Date('2026-11-01T00:00:00Z') };
const roofLine = (allocated) => ({ id: 'l1', status: 'ACTIVE', targetCostCents: 2_000_000, allocatedBalanceCents: allocated, timelineItem: { category: 'ROOF', inventoryItem: { name: 'Roof' } } });

test('handler: what is set aside, as a labeled estimate, with canonical block ids and no actions', async () => {
  stub({ fund, lines: [roofLine(400_000)] });
  const result = await itemReserveAllocationResult('u1', 'p1', 'how much of my reserve is set aside for the roof');
  assert.equal(result.status, 'ANSWERED');
  const summary = result.blocks.find((b) => b.id === 'item-reserve-summary');
  assert.match(summary.title, /Roof: about \$4,000 set aside \(estimate\)/);
  assert.match(summary.body, /20% of its \$20,000 reserve target/);
  assert.match(summary.body, /estimate/);
  const row = result.blocks.find((b) => b.id === 'item-reserve-items').rows[0].values;
  assert.deepEqual([row.setaside, row.target, row.funded], ['$4,000', '$20,000', '20%']);
  for (const block of result.blocks) assert.match(block.id, /^item-reserve-/);
  assert.ok(result.blocks.every((b) => !b.actions || b.actions.length === 0));
  assert.equal(result.blocks.find((b) => b.id === 'item-reserve-evidence').items[0].observedAt, '2026-11-01T00:00:00.000Z');
});

test('handler: nothing set aside, no fund, an item with no reserve line, and targets never calculated are each said plainly', async () => {
  stub({ fund, lines: [roofLine(0)] });
  assert.match((await itemReserveAllocationResult('u1', 'p1', 'how much have I set aside for the roof')).blocks[0].title, /nothing set aside yet/);
  stub({ fund: null });
  assert.equal((await itemReserveAllocationResult('u1', 'p1', 'how much have I set aside for the roof')).reasonCode, 'ITEM_RESERVE_NO_FUND');
  stub({ fund, lines: [roofLine(1)] });
  assert.equal((await itemReserveAllocationResult('u1', 'p1', 'how much have I set aside for the water heater')).reasonCode, 'ITEM_RESERVE_ITEM_NOT_FUNDED');
  stub({ fund: { ...fund, lastRecalculatedAt: null }, lines: [roofLine(400_000)] });
  const never = await itemReserveAllocationResult('u1', 'p1', 'how much have I set aside for the roof');
  assert.equal(never.reasonCode, 'ITEM_RESERVE_NOT_CALCULATED');
  assert.match(never.blocks[0].body, /not been calculated yet/);
});
