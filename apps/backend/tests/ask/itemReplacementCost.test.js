const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { itemCostBases } = require('../../src/services/ask/support/itemCost.ts');
const { buildFundingPlan } = require('../../src/services/ask/support/itemFunding.ts');
const { profileRoofTimelineItem } = require('../../src/services/ask/support/profileRoof.ts');
const { resolveAskOperation, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const financialContext = require('../../src/services/financialContext/context.ts');
const { HomeCapitalTimelineService } = require('../../src/services/homeCapitalTimeline.service.ts');
const { itemReplacementCostResult } = require('../../src/services/ask/handlers/itemReplacementCost.handler.ts');

const NOW = new Date(2026, 10, 9);

test('the operation is a STANDARD read, routed from the cost wording', () => {
  const def = getAskOperationDefinition('ITEM_REPLACEMENT_COST');
  assert.equal(def.safetyClass, 'STANDARD');
  assert.equal(def.family, 'RECORD_QUERY');
  for (const m of ['how much does a new roof cost', 'what would a new one cost in my water heater'.replace('what would a new one cost in my water heater', 'what does a replacement water heater cost'), 'how much will a new roof cost in 5 years']) {
    assert.equal(resolveAskOperation(m).operationId, 'ITEM_REPLACEMENT_COST', m);
  }
  assert.equal(resolveAskOperation('how much should I save for a new roof').operationId, 'CAPITAL_ITEM_FUNDING_GOAL');
});

test('one cost function: today, window and target bases from one stored range', () => {
  const windowStart = new Date(2031, 10, 1);
  const bases = itemCostBases({ storedMinCents: 2_000_000, storedMaxCents: 2_400_000, windowStart, windowEnd: windowStart, growthRate: 0.05, now: NOW, targetDate: new Date(2031, 10, 1) });
  assert.equal(bases.window.minCents, 2_000_000);
  assert.ok(bases.today.minCents < 2_000_000 && bases.today.maxCents < 2_400_000);
  // growing today's figure to the same date as the window gives back the stored figure
  assert.ok(Math.abs(bases.target.minCents - 2_000_000) <= 2);
  assert.equal(itemCostBases({ storedMinCents: 1, storedMaxCents: 1, windowStart, windowEnd: windowStart, growthRate: 0.05, now: NOW }).target, null);
});

test('the funding plan and the cost read agree on the dated cost', () => {
  const windowStart = new Date(2028, 10, 1);
  const target = new Date(2031, 10, 8);
  const plan = buildFundingPlan({
    now: NOW, posture: 'AGGRESSIVE', targetDate: target, growthRate: 0.05,
    items: [{ id: 'r', name: 'Roof', windowStart, windowEnd: windowStart, costMinCents: 1_000_000, costMaxCents: 1_000_000, targetCents: 1_000_000, setAsideCents: 0 }],
    depositsPerMonthCents: 0, fundTargetTotalCents: 1_000_000,
  });
  const bases = itemCostBases({ storedMinCents: 1_000_000, storedMaxCents: 1_000_000, windowStart, windowEnd: windowStart, growthRate: 0.05, now: NOW, targetDate: target });
  assert.equal(plan.items[0].costMinAtTargetCents, bases.target.minCents);
});

test('the profile roof in today\'s dollars is the roof default, within a dollar', () => {
  const roofDefault = { lifespanYears: 25, costMinCents: 800_000, costMaxCents: 1_500_000 };
  const item = profileRoofTimelineItem({ roofReplacementYear: 2019, now: NOW, growthRate: 0.035, roofDefault });
  const bases = itemCostBases({ storedMinCents: item.estimatedCostMinCents, storedMaxCents: item.estimatedCostMaxCents, windowStart: item.windowStart, windowEnd: item.windowEnd, growthRate: 0.035, now: NOW });
  assert.ok(Math.abs(bases.today.minCents - roofDefault.costMinCents) <= 100);
  assert.ok(Math.abs(bases.today.maxCents - roofDefault.costMaxCents) <= 100);
});

// ---- handler, with the services it reads stubbed ----
function stub({ items, analysis = true, roofYear = null, stale = false }) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'VIEWER', isOwner: false });
  financialContext.getFinancialContextDecisions = async () => ({ contextVersion: stale ? 'ctx-new' : 'ctx-1' });
  prisma.property.findUnique = async () => ({ roofReplacementYear: roofYear });
  HomeCapitalTimelineService.prototype.getLatestTimeline = async () => (analysis ? {
    horizonYears: 10, confidence: 'MEDIUM', computedAt: new Date(2026, 10, 1), inputsSnapshot: { _propertyContextVersion: 'ctx-1' }, items,
  } : null);
  // a read must never run the timeline
  HomeCapitalTimelineService.prototype.runTimeline = async () => { throw new Error('the cost read must not recompute the timeline'); };
}
const roofItem = {
  id: 'ti-roof', category: 'ROOF', windowStart: new Date(2031, 10, 1), windowEnd: new Date(2031, 10, 1), confidence: 'MEDIUM',
  estimatedCostMinCents: 2_000_000, estimatedCostMaxCents: 2_400_000, inventoryItem: { name: 'Roof' },
};

test('handler: a tracked roof is stated in today\'s dollars and at the window, with canonical block ids and no actions', async () => {
  stub({ items: [roofItem] });
  const result = await itemReplacementCostResult('u1', 'p1', 'how much does a new roof cost', NOW);
  assert.equal(result.status, 'ANSWERED');
  const summary = result.blocks.find((b) => b.id === 'item-cost-summary');
  assert.match(summary.body, /in today’s dollars/);
  assert.match(summary.body, /At the window your home record expects it/);
  for (const block of result.blocks) assert.match(block.id, /^item-cost-/);
  assert.ok(result.blocks.every((b) => !b.actions || b.actions.length === 0));
  assert.ok(result.blocks.some((b) => b.type === 'BOUNDARY'));
});

test('handler: a named date adds the figure grown to that date', async () => {
  stub({ items: [roofItem] });
  const result = await itemReplacementCostResult('u1', 'p1', 'how much will a new roof cost in 5 years', NOW);
  assert.match(result.blocks.find((b) => b.id === 'item-cost-summary').body, /Grown to in 5 years/);
  assert.ok(result.blocks.find((b) => b.id === 'item-cost-items').columns.some((c) => c.key === 'atdate'));
});

test('handler: a roof only on the home profile is answered, limited, from the profile', async () => {
  stub({ items: [], roofYear: 2019 });
  const result = await itemReplacementCostResult('u1', 'p1', 'how much does a new roof cost', NOW);
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(result.reasonCode, 'ITEM_COST_FROM_PROFILE');
  assert.ok(result.blocks.find((b) => b.id === 'item-cost-evidence').items.some((i) => i.label === 'Home profile'));
});

test('handler: no timeline, an item not on it, a missing estimate and a stale timeline are each said plainly', async () => {
  stub({ items: [], analysis: false });
  assert.equal((await itemReplacementCostResult('u1', 'p1', 'how much does a new furnace cost', NOW)).reasonCode, 'ITEM_COST_TIMELINE_REQUIRED');
  stub({ items: [roofItem] });
  assert.equal((await itemReplacementCostResult('u1', 'p1', 'how much does a new water heater cost', NOW)).reasonCode, 'ITEM_COST_ITEM_NOT_ON_TIMELINE');
  stub({ items: [{ ...roofItem, estimatedCostMinCents: 0, estimatedCostMaxCents: 0 }] });
  assert.equal((await itemReplacementCostResult('u1', 'p1', 'how much does a new roof cost', NOW)).reasonCode, 'ITEM_COST_MISSING');
  stub({ items: [roofItem], stale: true });
  const stale = await itemReplacementCostResult('u1', 'p1', 'how much does a new roof cost', NOW);
  assert.equal(stale.reasonCode, 'ITEM_COST_TIMELINE_STALE');
  assert.match(stale.blocks.find((b) => b.id === 'item-cost-summary').body, /out of date/);
});
