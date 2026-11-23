// Inventory attribute questions: condition, age, install/purchase year, cost, oldest. Answered from recorded fields; items lacking the field are counted, never guessed.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { parseInventoryAttributeFilter, applyInventoryAttributeFilter, unjudgedSentence } = require('../../src/services/ask/support/inventoryAttributeFilter.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const inventoryService = require('../../src/services/inventory.service.ts').InventoryService;
const { prisma } = require('../../src/lib/prisma.ts');
const { inventoryLookupResult } = require('../../src/services/ask/handlers/inventory.handler.ts');
const { resolveAskOperation, ruleIdOfResolution } = require('../../src/services/ask/askOperationRegistry.ts');

const NOW = new Date(2026, 10, 23);
const d = (y, m = 5, day = 1) => new Date(y, m, day);
const ITEMS = [
  { id: 'a', name: 'Furnace', category: 'HVAC', condition: 'POOR', installedOn: d(2001), purchasedOn: null, purchaseCostCents: 900000, updatedAt: d(2025) },
  { id: 'b', name: 'Dishwasher', category: 'APPLIANCE', condition: 'GOOD', installedOn: null, purchasedOn: d(2012), purchaseCostCents: 80000, updatedAt: d(2025) },
  { id: 'c', name: 'Water heater', category: 'PLUMBING', condition: 'FAIR', installedOn: d(2020), purchasedOn: d(2020), purchaseCostCents: null, updatedAt: d(2025) },
  { id: 'd', name: 'Washer', category: 'APPLIANCE', condition: 'UNKNOWN', installedOn: null, purchasedOn: null, purchaseCostCents: 120000, updatedAt: d(2025) },
  { id: 'e', name: 'Fridge', category: 'APPLIANCE', condition: 'NEW', installedOn: null, purchasedOn: d(2026, 2), purchaseCostCents: 150000, updatedAt: d(2025) },
];
const ids = (outcome) => outcome.items.map((i) => i.id);

test('the questions are read into the right filter', () => {
  const cases = [
    ['Which appliances are more than ten years old?', { kind: 'OLDER_THAN_YEARS', years: 10 }], ['Which of my appliances are older than 15 years?', { kind: 'OLDER_THAN_YEARS', years: 15 }],
    ['Show me everything that was installed before 2010', { kind: 'INSTALLED_BEFORE', year: 2010 }], ['Which items did I buy this year?', { kind: 'PURCHASED_IN', year: 2026 }],
    ['Which items did I purchase in 2019?', { kind: 'PURCHASED_IN', year: 2019 }], ['Which items cost more than $1,000?', { kind: 'COST_OVER', dollars: 1000 }],
    ['Show me the items in poor condition', { kind: 'CONDITION', condition: 'POOR' }], ['Which appliances are in good condition?', { kind: 'CONDITION', condition: 'GOOD' }],
    ['What is the oldest item I own?', { kind: 'OLDEST' }],
  ];
  for (const [message, expected] of cases) assert.deepEqual(parseInventoryAttributeFilter(message, NOW), expected, message);
  for (const message of ['What appliances do I have?', 'How old is my furnace?', 'Show my warranty', 'Do I have a dehumidifier?']) assert.equal(parseInventoryAttributeFilter(message, NOW), null, message);
});

test('each filter keeps exactly the items it should and counts the ones it cannot judge', () => {
  const run = (filter) => applyInventoryAttributeFilter(ITEMS, filter, NOW);
  // age: furnace 2001, dishwasher purchase 2012 (no install date), washer has no date at all
  let out = run({ kind: 'OLDER_THAN_YEARS', years: 10 }); assert.deepEqual([ids(out), out.unjudged], [['a', 'b'], 1]);
  out = run({ kind: 'OLDER_THAN_YEARS', years: 20 }); assert.deepEqual([ids(out), out.unjudged], [['a'], 1]);
  out = run({ kind: 'INSTALLED_BEFORE', year: 2010 }); assert.deepEqual([ids(out), out.unjudged], [['a'], 1]);
  out = run({ kind: 'INSTALLED_BEFORE', year: 2013 }); assert.deepEqual(ids(out), ['a', 'b']);
  out = run({ kind: 'PURCHASED_IN', year: 2026 }); assert.deepEqual([ids(out), out.unjudged], [['e'], 2]); // furnace and washer have no purchase date
  out = run({ kind: 'COST_OVER', dollars: 1000 }); assert.deepEqual([ids(out), out.unjudged], [['a', 'd', 'e'], 1]); // water heater has no cost; $800 dishwasher is under
  out = run({ kind: 'COST_OVER', dollars: 9000 }); assert.deepEqual(ids(out), [], 'a cost exactly at the threshold is not "more than" it');
  out = run({ kind: 'CONDITION', condition: 'POOR' }); assert.deepEqual([ids(out), out.unjudged], [['a'], 1]); // washer UNKNOWN is unjudged, not "not poor"
  out = run({ kind: 'OLDEST' }); assert.deepEqual([ids(out), out.unjudged], [['a'], 1]);
});

test('the unjudged sentence names the missing field and stays silent when nothing was skipped', () => {
  assert.match(unjudgedSentence({ items: [], unjudged: 1, basis: 'a recorded condition of poor' }), /1 item has no recorded condition, so it was not judged\./);
  assert.match(unjudgedSentence({ items: [], unjudged: 3, basis: 'the recorded purchase cost' }), /3 items have no recorded purchase cost, so they were not judged\./);
  assert.equal(unjudgedSentence({ items: [], unjudged: 0, basis: 'x' }), '');
});

const withRecordFields = (items) => items.map((item) => ({ brand: null, manufacturer: null, model: null, modelNumber: null, serialNo: null, serialNumber: null, documents: [], linkedWarranties: [], insurancePolicyId: null, coverageEvidenceStatus: 'UNKNOWN', room: null, tags: [], status: 'ACTIVE', sourceType: 'MANUAL', verificationSource: null, ...item }));
function stub(items) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  inventoryService.prototype.listItems = async () => withRecordFields(items);
  prisma.property.findUnique = async () => ({ roofReplacementYear: null, roofType: null });
}

test('the inventory answer lists only the matching items and discloses what it could not judge', async () => {
  stub(ITEMS);
  // Several matches, so the answer is a list (a single match opens that item's detail, which reads other services).
  const result = await inventoryLookupResult('u1', 'p1', 'Which items cost more than $1,000?');
  const list = result.blocks.find((block) => block.type === 'GROUPED_LIST');
  assert.deepEqual(list.sections.flatMap((section) => section.items.map((item) => item.id)).sort(), ['a', 'd', 'e']);
  const summary = result.blocks.find((block) => block.id === 'inventory-summary');
  assert.match(summary.body, /1 item has no recorded purchase cost, so it was not judged/);
});

test('an attribute question that matches nothing says so honestly instead of listing everything', async () => {
  stub(ITEMS);
  const result = await inventoryLookupResult('u1', 'p1', 'Which items cost more than $50,000?');
  assert.equal(result.reasonCode, 'INVENTORY_MATCH_NOT_FOUND');
  assert.match(JSON.stringify(result.blocks), /recorded purchase cost/);
});

test('the attribute questions are claimed by the inventory lookup, and neighbours are not', () => {
  const claimed = (m) => { const r = resolveAskOperation(m); return r.operationId === 'INVENTORY_LOOKUP' ? ruleIdOfResolution(r) : r.operationId; };
  for (const m of ['Show me everything that was installed before 2010', 'Which items cost more than $1,000?', 'What is the oldest item I own?', 'Which items did I buy this year?']) assert.equal(claimed(m), 'DET_INVENTORY_LOOKUP_10', m);
  for (const m of ['Which warranties cost more than $500?', 'Which tasks are more than 10 days overdue?', 'Which documents were uploaded this year?', 'Which insurance claims are over $5,000?', 'Which items did I sell this year?']) assert.notEqual(claimed(m), 'DET_INVENTORY_LOOKUP_10', m);
});
