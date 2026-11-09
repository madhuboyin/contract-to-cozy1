const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { parseTargetDate } = require('../../src/services/ask/support/targetDate.ts');
const { buildFundingPlan, depositsPerMonth, grow } = require('../../src/services/ask/support/itemFunding.ts');
const { isItemFundingGoalMessage, namedFundingTerms, selectFundingItems, wantsAllFundingItems } = require('../../src/services/ask/support/itemFundingWording.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const NOW = new Date(2026, 10, 8); // 8 Nov 2026

test('target dates: the wordings a homeowner uses', () => {
  const cases = [
    ['replace my roof in 5 years', 60, 'in 5 years'],
    ['in 18 months', 18, 'in 18 months'],
    ['within three years', 36, 'in three years'],
    ['by 2031', 61, 'by the end of 2031'],
    ['next year', 12, 'next year'],
    ['a 5-year plan for the roof', 60, 'in 5 years'],
  ];
  for (const [message, months, label] of cases) {
    const parsed = parseTargetDate(message, NOW);
    assert.ok(parsed, message);
    assert.equal(parsed.months, months, message);
    assert.equal(parsed.label, label, message);
  }
  for (const message of ['my roof is 18 years old', 'show my capital plan', 'how old is my roof']) {
    assert.equal(parseTargetDate(message, NOW), null, message);
  }
});

test('growth and the funding plan: the arithmetic, worked by hand', () => {
  assert.equal(grow(10000, 0.1, 2), 12100);
  const windowStart = new Date(2031, 10, 1);
  const windowEnd = new Date(2032, 4, 1);
  // Stored cost is for the window midpoint; with no named date it is used as stored.
  const plan = buildFundingPlan({
    now: NOW, posture: 'MODERATE', targetDate: null, growthRate: 0.04,
    items: [{ id: 'r', name: 'Roof', windowStart, windowEnd, costMinCents: 2_000_000, costMaxCents: 2_400_000, targetCents: 2_200_000, setAsideCents: 200_000 }],
    depositsPerMonthCents: 20_000, fundTargetTotalCents: 4_400_000,
  });
  assert.equal(plan.costAtTargetCents, 2_200_000);
  assert.equal(plan.setAsideCents, 200_000);
  assert.equal(plan.stillToFundCents, 2_000_000);
  assert.equal(plan.months, 60);
  assert.equal(plan.neededPerMonthCents, Math.ceil(2_000_000 / 60));
  // The roof is half the fund's targets, so half of the $200/month deposit counts toward it.
  assert.equal(plan.currentPerMonthCents, 10_000);
  assert.equal(plan.additionalPerMonthCents, Math.ceil(2_000_000 / 60) - 10_000);
  assert.equal(plan.nearTerm, false);
});

test('a named date takes the stored cost back to today and grows it to that date', () => {
  const windowStart = new Date(2028, 10, 1);
  const windowEnd = new Date(2028, 10, 1);
  const target = new Date(2031, 10, 8);
  const plan = buildFundingPlan({
    now: NOW, posture: 'AGGRESSIVE', targetDate: target, growthRate: 0.05,
    items: [{ id: 'r', name: 'Roof', windowStart, windowEnd, costMinCents: 1_000_000, costMaxCents: 1_000_000, targetCents: 1_000_000, setAsideCents: 0 }],
    depositsPerMonthCents: 0, fundTargetTotalCents: 1_000_000,
  });
  const yearsToMid = (windowStart.getTime() - NOW.getTime()) / (365.25 * 24 * 3600 * 1000);
  const yearsToTarget = (target.getTime() - NOW.getTime()) / (365.25 * 24 * 3600 * 1000);
  const expected = Math.round(Math.round(1_000_000 / Math.pow(1.05, yearsToMid)) * Math.pow(1.05, yearsToTarget));
  assert.ok(Math.abs(plan.costAtTargetCents - expected) <= 2, `${plan.costAtTargetCents} vs ${expected}`);
  assert.equal(plan.modelExpectsSooner, undefined);
  assert.equal(plan.items[0].modelExpectsSooner, true, 'the model expects it before the planned date');
});

test('a date inside six months is a lump sum, not a monthly figure', () => {
  const plan = buildFundingPlan({
    now: NOW, posture: 'MODERATE', targetDate: new Date(2027, 0, 1), growthRate: 0.04,
    items: [{ id: 'w', name: 'Water heater', windowStart: new Date(2027, 0, 1), windowEnd: new Date(2027, 2, 1), costMinCents: 150_000, costMaxCents: 150_000, targetCents: 150_000, setAsideCents: 0 }],
    depositsPerMonthCents: 0, fundTargetTotalCents: 150_000,
  });
  assert.equal(plan.nearTerm, true);
  assert.equal(plan.neededPerMonthCents, null);
  assert.equal(plan.additionalPerMonthCents, null);
});

test('already saving enough gives zero additional, never a negative', () => {
  const plan = buildFundingPlan({
    now: NOW, posture: 'MODERATE', targetDate: null, growthRate: 0.04,
    items: [{ id: 'r', name: 'Roof', windowStart: new Date(2031, 10, 1), windowEnd: new Date(2031, 10, 1), costMinCents: 1_200_000, costMaxCents: 1_200_000, targetCents: 1_200_000, setAsideCents: 0 }],
    depositsPerMonthCents: 100_000, fundTargetTotalCents: 1_200_000,
  });
  assert.equal(plan.additionalPerMonthCents, 0);
});

test('the deposit rate counts only recent deposits', () => {
  const rows = [
    { type: 'DEPOSIT', amountCents: 60_000, occurredAt: new Date(2026, 9, 1) },
    { type: 'DEPOSIT', amountCents: 60_000, occurredAt: new Date(2026, 7, 1) },
    { type: 'DEPOSIT', amountCents: 999_999, occurredAt: new Date(2025, 0, 1) },
    { type: 'WITHDRAWAL', amountCents: -50_000, occurredAt: new Date(2026, 9, 2) },
    { type: 'BALANCE_CORRECTION', amountCents: 500_000, occurredAt: new Date(2026, 9, 3) },
  ];
  assert.deepEqual(depositsPerMonth(rows, NOW), { perMonthCents: 20_000, depositCount: 2 });
});

test('wording: which messages are funding goals', () => {
  for (const message of [
    'In case if i want to replace my roof in 5 years how much capital do i need and how much additional capital i need to start saving',
    'How much should I set aside each month for a new water heater?',
    'If I replace my HVAC and roof in the next 3 years am I on track with my reserve fund',
    'How much do I need to save per month to cover all my big-ticket replacements through 2035',
  ]) assert.equal(isItemFundingGoalMessage(message), true, message);
  for (const message of [
    'how much does a new roof cost',
    'how old is my roof',
    'Should I repair or replace my roof?',
    'how can I save money on a new roof',
    'Can I afford to refinance and also replace my roof next year',
    'what will my insurance premium be if I replace the roof',
    'Show my capital reserve plan',
    'How much should I save monthly for repairs',
  ]) assert.equal(isItemFundingGoalMessage(message), false, message);
});

test('wording: item selection is by whole word and never mixes a dishwasher with a washer', () => {
  const items = [
    { name: 'Roof', category: 'ROOF' }, { name: 'Gas furnace', category: 'HVAC' },
    { name: 'Dishwasher', category: 'APPLIANCE' }, { name: 'Washer', category: 'APPLIANCE' },
    { name: 'Water heater', category: 'WATER_HEATER' },
  ];
  assert.deepEqual(selectFundingItems('replace my roof and furnace', items).map((i) => i.name), ['Roof', 'Gas furnace']);
  assert.deepEqual(selectFundingItems('save for a new washer', items).map((i) => i.name), ['Washer']);
  assert.deepEqual(selectFundingItems('save for the water heater', items).map((i) => i.name), ['Water heater']);
  assert.deepEqual(namedFundingTerms('nothing here'), []);
  assert.equal(wantsAllFundingItems('save for all my big replacements'), true);
  assert.equal(wantsAllFundingItems('save for my roof'), false);
});

test('routing: the owner prompt reaches the funding goal, and neighbours keep their operations', () => {
  const owner = 'In case if i want to replace my roof in 5 years how much capital do i need and how much additional capital i need to start saving';
  assert.equal(resolveAskRoutingCascade(owner).operation.operationId, 'CAPITAL_ITEM_FUNDING_GOAL');
  const keep = [
    ['Should I repair or replace my roof?', 'REPLACEMENT_GUIDANCE'],
    ['how old is my roof', 'INVENTORY_LOOKUP'],
    ['Show my capital plan for major replacements', 'CAPITAL_RESERVE_PLAN'],
    ['Add $500 to my reserve fund', 'RESERVE_FUND_COMMAND'],
  ];
  for (const [message, expected] of keep) assert.equal(resolveAskOperation(message).operationId, expected, message);
});

// ---- handler, with the services it reads stubbed ----
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const evaluateModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const financialContext = require('../../src/services/financialContext/context.ts');
const { HomeCapitalTimelineService } = require('../../src/services/homeCapitalTimeline.service.ts');
const { homeReserveFundService } = require('../../src/services/homeReserveFund.service.ts');
const { itemFundingGoalResult } = require('../../src/services/ask/handlers/capitalItemFunding.handler.ts');

function stub({ items, balanceCents = 0, lines = [], contributions = [], inventoryCount = 3, role = 'OWNER' }) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  evaluateModule.evaluateFeatureContext = async () => ({ contextVersion: 'ctx-1', requirements: [] });
  financialContext.getFinancialContextDecisions = async () => ({ contextVersion: 'ctx-1' });
  prisma.property.findUnique = async () => ({ homeownerProfileId: 'h1' });
  prisma.inventoryItem.count = async () => inventoryCount;
  HomeCapitalTimelineService.prototype.getLatestTimeline = async () => ({
    horizonYears: 10, confidence: 'MEDIUM', computedAt: new Date(2026, 10, 1),
    inputsSnapshot: { _propertyContextVersion: 'ctx-1' }, items,
  });
  homeReserveFundService.getSummary = async () => ({ posture: 'MODERATE', currentBalanceCents: balanceCents, lastRecalculatedAt: new Date(2026, 10, 1) });
  homeReserveFundService.listLineItems = async () => lines;
  homeReserveFundService.listContributions = async () => ({ items: contributions });
}

const roofItem = {
  id: 'ti-roof', category: 'ROOF', windowStart: new Date(2031, 10, 1), windowEnd: new Date(2031, 10, 1), confidence: 'MEDIUM',
  estimatedCostMinCents: 2_000_000, estimatedCostMaxCents: 2_400_000, inventoryItem: { name: 'Roof' },
};

test('handler: the owner prompt gets cost, set-aside, monthly need and the additional amount in one answer', async () => {
  stub({
    items: [roofItem], balanceCents: 200_000,
    lines: [{ timelineItemId: 'ti-roof', status: 'ACTIVE', targetCostCents: 2_200_000, allocatedBalanceCents: 200_000 }],
    contributions: [{ type: 'DEPOSIT', amountCents: 120_000, occurredAt: new Date(2026, 9, 1) }],
  });
  const result = await itemFundingGoalResult('u1', 'p1', 'replace my roof in 5 years how much capital do i need and how much additional capital i need to start saving', NOW);
  assert.equal(result.status, 'ANSWERED');
  const summary = result.blocks.find((b) => b.id === 'item-funding-summary');
  assert.match(summary.title, /Roof: save about \$\d+ more a month/);
  assert.match(summary.body, /in 5 years/);
  assert.match(summary.body, /\$2,000 of your reserve|\$2,000 /);
  assert.match(summary.body, /60 months/);
  const steps = result.blocks.find((b) => b.id === 'item-funding-steps');
  assert.deepEqual(steps.rows.map((r) => r.id), ['cost', 'set-aside', 'still', 'months', 'needed', 'current', 'additional']);
  assert.ok(result.blocks.some((b) => b.type === 'BOUNDARY'));
  // Every id the answer carries starts with the canonical prefix the relevance check recognises.
  for (const block of result.blocks) assert.match(block.id, /^item-funding-/);
});

test('handler: no deposits logged is said plainly and counted as zero', async () => {
  stub({ items: [roofItem], lines: [{ timelineItemId: 'ti-roof', status: 'ACTIVE', targetCostCents: 2_200_000, allocatedBalanceCents: 0 }] });
  const result = await itemFundingGoalResult('u1', 'p1', 'how much should I save for a new roof in 5 years', NOW);
  const summary = result.blocks.find((b) => b.id === 'item-funding-summary');
  assert.match(summary.body, /No reserve deposits are logged/);
  assert.match(summary.body, /Nothing in your reserve balance counts toward it/);
});

test('handler: an item that is not on the timeline is said so, with an add action for a contributor', async () => {
  stub({ items: [roofItem] });
  const result = await itemFundingGoalResult('u1', 'p1', 'how much should I save to replace my water heater in 3 years', NOW);
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(result.reasonCode, 'ITEM_FUNDING_ITEM_NOT_ON_TIMELINE');
  assert.match(result.blocks[0].title, /water heater/);
  assert.ok(result.blocks[0].actions.some((a) => a.id === 'add-inventory-item'));
});

test('handler: a viewer sees the answer without the deposit action', async () => {
  stub({ items: [roofItem], role: 'VIEWER', lines: [{ timelineItemId: 'ti-roof', status: 'ACTIVE', targetCostCents: 2_200_000, allocatedBalanceCents: 0 }] });
  const result = await itemFundingGoalResult('u1', 'p1', 'how much should I save for a new roof in 5 years', NOW);
  const summary = result.blocks.find((b) => b.id === 'item-funding-summary');
  assert.deepEqual(summary.actions.map((a) => a.id), ['item-funding-capital-plan']);
});

test('handler: two items are summed, and the earliest model window is called out when sooner than the plan', async () => {
  const furnace = { ...roofItem, id: 'ti-hvac', category: 'HVAC', inventoryItem: { name: 'Furnace' }, windowStart: new Date(2027, 10, 1), windowEnd: new Date(2027, 10, 1), estimatedCostMinCents: 900_000, estimatedCostMaxCents: 900_000 };
  stub({ items: [roofItem, furnace], lines: [] });
  const result = await itemFundingGoalResult('u1', 'p1', 'if I replace my roof and furnace in 5 years how much do I need to save', NOW);
  const summary = result.blocks.find((b) => b.id === 'item-funding-summary');
  assert.match(summary.title, /Roof and Furnace/);
  assert.match(summary.body, /sooner than you planned/);
  assert.equal(result.blocks.find((b) => b.id === 'item-funding-items').rows.length, 2);
});

test('handler: an empty home asks for the item first', async () => {
  stub({ items: [], inventoryCount: 0 });
  const result = await itemFundingGoalResult('u1', 'p1', 'how much should I save for a new roof in 5 years', NOW);
  assert.equal(result.reasonCode, 'ITEM_FUNDING_INVENTORY_REQUIRED');
});

test('single-fact building blocks: an item\'s condition and its replacement cost reach the existing item answers', () => {
  const cases = [
    ["what's my roof's condition", 'INVENTORY_LOOKUP'],
    ['the condition of my dishwasher', 'INVENTORY_LOOKUP'],
    ['how much does a new roof cost', 'REPLACEMENT_GUIDANCE'],
    ['cost of a new dishwasher', 'REPLACEMENT_GUIDANCE'],
    // with a date it is the cost line of the funding answer
    ['how much will a new roof cost in 5 years', 'CAPITAL_ITEM_FUNDING_GOAL'],
    // not an item
    ['how much does a new house cost', 'OWNERSHIP_COSTS'],
  ];
  for (const [message, expected] of cases) assert.equal(resolveAskRoutingCascade(message).operation.operationId, expected, message);
});

test('"replace everything that is due" and a no-date plan question keep their reads', () => {
  assert.equal(isItemFundingGoalMessage('What will it cost to replace everything that is due in the next 10 years and what should I save per month for it?'), true);
  assert.equal(isItemFundingGoalMessage('How much should I save for major replacements?'), false);
});

// ---- the roof is on the home profile, not a tracked item ----
test('handler: a roof recorded only on the home profile is planned for, from the profile year and the timeline roof default', async () => {
  stub({ items: [], inventoryCount: 0 });
  prisma.property.findUnique = async () => ({ homeownerProfileId: 'h1', roofReplacementYear: 2008 });
  const result = await itemFundingGoalResult('u1', 'p1', 'replace my roof in 5 years how much capital do i need and how much additional capital i need to start saving', NOW);
  assert.equal(result.reasonCode, 'ITEM_FUNDING_FROM_PROFILE');
  const summary = result.blocks.find((b) => b.id === 'item-funding-summary');
  assert.match(summary.title, /Roof/);
  const evidence = result.blocks.find((b) => b.id === 'item-funding-evidence');
  assert.ok(evidence.items.some((item) => item.label === 'Home profile'), 'the answer says where the roof came from');
  // Planned for 2031 against a 2033 end of life: the model expects it later, so nothing says "sooner".
  assert.doesNotMatch(summary.body, /sooner than you planned/);
});

test('handler: with no tracked item and no roof on the profile the answer still asks for the item', async () => {
  stub({ items: [], inventoryCount: 0 });
  prisma.property.findUnique = async () => ({ homeownerProfileId: 'h1', roofReplacementYear: null });
  const result = await itemFundingGoalResult('u1', 'p1', 'how much should I save for a new roof in 5 years', NOW);
  assert.equal(result.reasonCode, 'ITEM_FUNDING_INVENTORY_REQUIRED');
});

const { profileRoofTimelineItem } = require('../../src/services/ask/support/profileRoof.ts');
test('profile roof: window is the roof default life after the recorded year; a roof past its life is due now; cost is grown to the window middle', () => {
  const roofDefault = { lifespanYears: 25, costMinCents: 800_000, costMaxCents: 1_500_000 };
  const later = profileRoofTimelineItem({ roofReplacementYear: 2015, now: NOW, growthRate: 0.035, roofDefault });
  assert.equal(later.windowStart.getFullYear(), 2040);
  assert.ok(later.estimatedCostMinCents > roofDefault.costMinCents, 'grown to 2040');
  const past = profileRoofTimelineItem({ roofReplacementYear: 1995, now: NOW, growthRate: 0.035, roofDefault });
  assert.equal(past.windowStart.getFullYear(), 2026);
  assert.ok(past.windowEnd > past.windowStart);
});
