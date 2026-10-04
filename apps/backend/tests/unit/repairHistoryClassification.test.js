const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { REPAIR_HISTORY_LOOKBACK_MONTHS, repairHistoryEventWhere } = require('../../src/services/repairHistory.ts');
const { ReplaceRepairService } = require('../../src/services/replaceRepairAnalysis.service.ts');
const { analyticsEmitter } = require('../../src/services/analytics');
const { composeHvacDecisionContext } = require('../../src/services/decisionPlatform/hvacRepairReplaceEngine.service.ts');

// One definition of repair history for the generic repair-versus-replace analysis, the HVAC engine, Home Action recurring-failure
// evidence and the Do-Nothing simulator: canonical, current, non-deleted HomeEventType.REPAIR only.

analyticsEmitter.outcomeGenerated = () => {};
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };
const row = (over = {}) => ({ id: `ev-${Math.random()}`, inventoryItemId: 'item-1', propertyId: 'prop-1', type: 'REPAIR', isCurrent: true, deletedAt: null, amount: null, occurredAt: monthsAgo(3), title: 'Event', subtype: null, ...over });
const NON_REPAIR_NOISE = [
  row({ type: 'INSPECTION', amount: 400, title: 'Annual inspection' }),
  row({ type: 'MAINTENANCE', amount: 250, title: 'Filter change' }),
  row({ type: 'MAINTENANCE', amount: 250, title: 'Repair the thermostat (typed as maintenance)' }),
  row({ type: 'IMPROVEMENT', amount: 6000, title: 'Replace furnace' }),
  row({ type: 'OTHER', amount: 90, subtype: 'REPAIR', title: 'Repair visit' }),
  row({ type: 'REPAIR', amount: 900, isCurrent: false, title: 'Superseded revision' }),
  row({ type: 'REPAIR', amount: 900, deletedAt: new Date(), title: 'Deleted repair' }),
  row({ type: 'REPAIR', amount: 900, occurredAt: monthsAgo(40), title: 'Outside the window' }),
];
const REAL_REPAIR = row({ type: 'REPAIR', amount: 300, title: 'Compressor repair' });

function installPrisma(events) {
  const wheres = [];
  const created = [];
  const original = { property: prisma.property, inventoryItem: prisma.inventoryItem, homeEvent: prisma.homeEvent, quote: prisma.quoteComparisonWorkspace, tx: prisma.$transaction };
  prisma.property = { findFirst: async () => ({ id: 'prop-1', homeownerProfileId: 'hp-1', riskReport: { riskScore: 70 } }) };
  prisma.inventoryItem = {
    findFirst: async ({ where }) => ({
      id: 'item-1', propertyId: 'prop-1', roomId: null, name: 'Rooftop unit', category: where.category ?? 'APPLIANCE', condition: 'GOOD',
      installedOn: null, purchasedOn: monthsAgo(60), lastServicedOn: null, purchaseCostCents: 500000, replacementCostCents: 900000,
      warrantyId: null, warranty: null, documents: [],
    }),
  };
  prisma.homeEvent = {
    // Applies the query's own classification, so the test fails if a query stops asking for it.
    findMany: async ({ where }) => {
      wheres.push(where);
      return events.filter((event) => event.inventoryItemId === where.inventoryItemId
        && (where.type === undefined || (typeof where.type === 'string' ? event.type === where.type : where.type.in.includes(event.type)))
        && (where.isCurrent === undefined || event.isCurrent === where.isCurrent)
        && (where.deletedAt === undefined || event.deletedAt === where.deletedAt)
        && (!where.occurredAt?.gte || event.occurredAt >= where.occurredAt.gte));
    },
  };
  prisma.quoteComparisonWorkspace = { findFirst: async () => null };
  prisma.$transaction = async (fn) => fn({
    replaceRepairAnalysis: {
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }) => { created.push(data); return { id: 'analysis-1', ...data, computedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }; },
    },
  });
  return { wheres, created, restore: () => { Object.assign(prisma, { property: original.property, inventoryItem: original.inventoryItem, homeEvent: original.homeEvent, quoteComparisonWorkspace: original.quote, $transaction: original.tx }); } };
}

test('the shared definition is canonical REPAIR, current and not deleted, over a 30-month window', () => {
  assert.deepEqual(repairHistoryEventWhere(), { type: 'REPAIR', isCurrent: true, deletedAt: null });
  assert.equal(REPAIR_HISTORY_LOOKBACK_MONTHS, 30);
});

const runGeneric = async (events) => {
  const stub = installPrisma(events);
  try {
    await new ReplaceRepairService().runItemAnalysis('prop-1', 'item-1', 'u1');
    return { data: stub.created[0], where: stub.wheres[0] };
  } finally { stub.restore(); }
};

test('generic analysis: inspections, maintenance, a "Replace furnace" title, superseded, deleted and out-of-window rows change nothing', async () => {
  const baseline = await runGeneric([]);
  const noisy = await runGeneric(NON_REPAIR_NOISE);
  const a = baseline.data.inputsSnapshot.assumptions;
  const b = noisy.data.inputsSnapshot.assumptions;
  assert.equal(b.repairEventCountLast30Months, 0);
  assert.equal(b.repairSpendCentsLast30Months, 0);
  assert.equal(b.failureProbability, a.failureProbability);
  assert.equal(noisy.data.verdict, baseline.data.verdict);
  assert.equal(noisy.data.estimatedNextRepairCostCents, baseline.data.estimatedNextRepairCostCents);
  assert.equal(noisy.data.confidence, baseline.data.confidence);
  assert.deepEqual(noisy.where.type, 'REPAIR');
  assert.equal(noisy.where.isCurrent, true);
  assert.equal(noisy.where.deletedAt, null);
});

test('generic analysis: a canonical current REPAIR still counts, with its spend, in 30-month-named fields', async () => {
  const baseline = await runGeneric([]);
  const withRepair = await runGeneric([...NON_REPAIR_NOISE, REAL_REPAIR]);
  const b = withRepair.data.inputsSnapshot.assumptions;
  assert.equal(b.repairEventCountLast30Months, 1);
  assert.equal(b.repairSpendCentsLast30Months, 30000);
  assert.ok(b.failureProbability > baseline.data.inputsSnapshot.assumptions.failureProbability);
  assert.equal('repairsLast24m' in b || 'repairSpendLast24mCents' in b, false, 'the 24-month names are gone');
  assert.ok(withRepair.data.decisionTrace.some((t) => t.label === 'Repair history frequency' && /1 repair event\(s\) in the last 30 months/.test(t.detail)));
});

test('generic analysis: a repair whose title says "replace" does not trigger a replace-now signal on its own', async () => {
  const quiet = await runGeneric([row({ type: 'REPAIR', title: 'Replace capacitor', subtype: 'REPLACEMENT', amount: 120 })]);
  const plain = await runGeneric([row({ type: 'REPAIR', title: 'Capacitor repair', subtype: null, amount: 120 })]);
  assert.equal(quiet.data.verdict, plain.data.verdict);
  assert.equal(quiet.data.inputsSnapshot.assumptions.failureProbability, plain.data.inputsSnapshot.assumptions.failureProbability);
});

test('HVAC engine: only canonical current REPAIR rows feed the count and spend', async () => {
  const stub = installPrisma([...NON_REPAIR_NOISE, REAL_REPAIR]);
  try {
    const { context } = await composeHvacDecisionContext('prop-1', 'item-1', { ownershipHorizonMonths: null, repairReplaceApproach: null });
    assert.equal(context.repairEventCountLast30Months, 1);
    assert.equal(context.repairSpendCentsLast30Months, 30000);
    assert.equal(stub.wheres[0].type, 'REPAIR');
    assert.equal(stub.wheres[0].isCurrent, true);
    assert.equal(stub.wheres[0].deletedAt, null);
    const none = await composeHvacDecisionContext('prop-1', 'item-1', { ownershipHorizonMonths: null, repairReplaceApproach: null });
    assert.ok(none);
  } finally { stub.restore(); }
  const quiet = installPrisma(NON_REPAIR_NOISE);
  try {
    const { context } = await composeHvacDecisionContext('prop-1', 'item-1', { ownershipHorizonMonths: null, repairReplaceApproach: null });
    assert.equal(context.repairEventCountLast30Months, 0);
    assert.equal(context.repairSpendCentsLast30Months, 0);
  } finally { quiet.restore(); }
});

// ---- consumers that are not executed here --------------------------------------------------------------------------------------

const read = (path) => readFileSync(resolve(__dirname, path), 'utf8');

test('all four consumers share the one definition; none infers repairs from titles or counts maintenance or inspections', () => {
  const generic = read('../../src/services/replaceRepairAnalysis.service.ts');
  const hvac = read('../../src/services/decisionPlatform/hvacRepairReplaceEngine.service.ts');
  const promotion = read('../../src/services/homeActionSourcePromotion.service.ts');
  const doNothing = read('../../src/services/doNothingSimulator.service.ts');
  for (const [name, source] of [['generic', generic], ['hvac', hvac], ['promotion', promotion], ['doNothing', doNothing]]) {
    assert.match(source, /repairHistoryEventWhere\(\)/, `${name} uses the shared definition`);
    assert.doesNotMatch(source, /descriptor\.includes\('(?:REPAIR|MAINTEN|INSPECT|REPLACE)'\)/, `${name} has no title keyword inference`);
  }
  assert.doesNotMatch(generic, /repairsLast24m|repairSpendLast24mCents|repairLikeEvents|replaceSignalFromHistory/);
  assert.doesNotMatch(hvac, /type: \{ in: \['REPAIR', 'MAINTENANCE'\] \}/);
  assert.doesNotMatch(promotion.slice(promotion.indexOf('async function findRecentRepairEventsByInventoryItem'), promotion.indexOf('async function loadRepairReplaceDecisionActions')), /MAINTENANCE/);
});

test('Do-Nothing counts the rows its query returns (current, non-deleted REPAIR, property-wide, 36-month window) and says so in its copy', () => {
  const source = read('../../src/services/doNothingSimulator.service.ts');
  assert.match(source, /\.\.\.repairHistoryEventWhere\(\),\n\s+occurredAt: \{ gte: lookback \},/);
  assert.match(source, /const repairEventCount = homeEvents\.length;/);
  assert.match(source, /repair event\(s\) used to tune cost sensitivity/);
  assert.doesNotMatch(source, /repair\/maintenance-related/);
});

test('the compound-rule registry describes the narrowed evidence', () => {
  const registry = read('../../src/services/intelligence/compoundRuleRegistry.ts');
  const rule = registry.slice(registry.indexOf("ruleId: 'RECURRING_FAILURE_REPAIR_REPLACE_READINESS'"));
  const body = rule.slice(0, rule.indexOf('sourceFile:'));
  assert.match(body, /version: '1\.1'/);
  assert.doesNotMatch(body, /REPAIR\/MAINTENANCE|repair\/maintenance/);
  assert.match(body, /type REPAIR, current, not deleted/);
});
