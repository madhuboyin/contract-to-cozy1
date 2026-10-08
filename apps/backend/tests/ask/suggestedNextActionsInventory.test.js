const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { SuggestedNextActionSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { inventoryMissingDetailCandidates, inventoryMissingCorrectionActions, inventoryCorrectionItemActions, inventoryCorrectionFieldFor, inventoryItemContextVersion, INVENTORY_CORRECTION_FIELDS } = require('../../src/services/ask/handlers/inventory.handler.ts');
const { isRegisteredOutcome, correctionFieldForOutcome, MISSING_FACT_CAPTURES } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { getSuggestedNextActionEntityValidator } = require('../../src/services/ask/suggestedActions/suggestedNextActionEntityValidators.ts');
const { inventoryItemContextVersion: leafVersion } = require('../../src/services/ask/suggestedActions/domainVersions.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Phase 3, inventory: typed next actions on the create and correct receipts.

const NOW = new Date('2026-10-04T12:00:00.000Z');
const UPDATED = new Date('2026-10-04T11:00:00.000Z');
const item = (over = {}) => ({ id: 'item-1', name: 'Samsung microwave', updatedAt: UPDATED, brand: null, manufacturer: null, model: null, modelNumber: null, serialNo: null, serialNumber: null, purchasedOn: null, ...over });
const ctxArgs = { propertyId: 'prop-1', sourceOperationId: 'INVENTORY_ITEM_CREATE' };

test('a new item with nothing recorded is offered purchase date, brand and model, in that order, capped at three', () => {
  const candidates = inventoryMissingDetailCandidates(item(), ctxArgs);
  assert.deepEqual(candidates.map((c) => c.outcomeKey), ['ADD_PURCHASE_DATE', 'ADD_BRAND', 'ADD_MODEL']);
  assert.equal(inventoryMissingDetailCandidates(item(), { ...ctxArgs, limit: 4 }).length, 4);
});

test('only details that are actually missing are offered; a complete item offers nothing', () => {
  assert.deepEqual(inventoryMissingDetailCandidates(item({ brand: 'Samsung', purchasedOn: new Date() }), ctxArgs).map((c) => c.outcomeKey), ['ADD_MODEL', 'ADD_SERIAL_NUMBER']);
  assert.deepEqual(inventoryMissingDetailCandidates(item({ manufacturer: 'Samsung', modelNumber: 'X', serialNumber: 'S', purchasedOn: '2020-01-01' }), ctxArgs), []);
});

test('each candidate is schema-valid, names the exact item, uses a registered outcome mapped to a real correction field', () => {
  for (const candidate of inventoryMissingDetailCandidates(item(), { ...ctxArgs, limit: 4 })) {
    assert.ok(SuggestedNextActionCandidateSchema.safeParse(candidate).success, JSON.stringify(candidate));
    assert.equal(candidate.entityContext.entityId, 'item-1');
    assert.equal(candidate.entityContext.entityType, 'INVENTORY_ITEM');
    assert.equal(candidate.entityContext.contextVersion, inventoryItemContextVersion(item()));
    assert.ok(isRegisteredOutcome('INVENTORY_ITEM_CORRECT', candidate.outcomeKey));
    const field = correctionFieldForOutcome('INVENTORY_ITEM_CORRECT', candidate.outcomeKey);
    assert.ok(field in INVENTORY_CORRECTION_FIELDS, `${candidate.outcomeKey} -> ${field}`);
    assert.match(candidate.message, /inventory item "Samsung microwave"/);
    assert.ok(candidate.label.startsWith('Add the '));
  }
});

test('rich inventory correction actions publish the same registered outcomes used by compact candidates', () => {
  const all = inventoryCorrectionItemActions(true);
  assert.equal(all.length, Object.keys(INVENTORY_CORRECTION_FIELDS).length);
  assert.ok(all.every((action) => isRegisteredOutcome(action.operationId, action.outcomeKey)));
  assert.deepEqual(inventoryMissingCorrectionActions(item(), true).map((action) => action.outcomeKey), ['ADD_BRAND', 'ADD_MODEL', 'ADD_SERIAL_NUMBER', 'ADD_PURCHASE_DATE']);
});

test('a long item name keeps the label within the contract limit while the message keeps the full name', () => {
  const name = 'The very long named basement dehumidifier unit number twelve with an extended description';
  const [candidate] = inventoryMissingDetailCandidates(item({ name }), ctxArgs);
  assert.ok(candidate.label.length <= 80, candidate.label);
  assert.ok(candidate.message.includes(name));
  assert.ok(SuggestedNextActionCandidateSchema.safeParse(candidate).success);
});

test('the version a handler stamps and the one the validator compares are the same function', () => {
  assert.equal(inventoryItemContextVersion(item()), leafVersion(item()));
});

test('a selected action picks its field from the registered outcome, never from the message', () => {
  // An item whose own name contains "room" used to redirect the correction to the room link when the message was re-read.
  const message = 'Correct the brand of inventory item "Room AC".';
  assert.equal(inventoryCorrectionFieldFor(message), 'roomId', 'free text alone still has the old word-matching behaviour');
  assert.equal(inventoryCorrectionFieldFor(message, 'ADD_BRAND'), 'brand');
  assert.equal(inventoryCorrectionFieldFor('anything at all', 'ADD_PURCHASE_DATE'), 'purchasedOn');
  assert.equal(inventoryCorrectionFieldFor('Correct the install date of this item.', 'NOT_AN_OUTCOME'), 'installedOn', 'an unknown outcome falls back to free text');
  assert.equal(inventoryCorrectionFieldFor('hello'), null);
  for (const mapping of MISSING_FACT_CAPTURES.filter((m) => m.operationId === 'INVENTORY_ITEM_CORRECT')) assert.equal(inventoryCorrectionFieldFor('x', mapping.outcomeKey), mapping.capture.field);
});

// ---- finalizer with the real inventory validator ------------------------------------------------------------------------

const clock = fixedSuggestedNextActionClock(NOW);
const availability = new Map([['INVENTORY_ITEM_CORRECT', null]]);
const finalize = (candidates, over = {}) => finalizeSuggestedNextActionsWithReport(
  { result: { status: 'COMPLETED', blocks: [], suggestions: ['Show my home inventory'], suggestedNextActionCandidates: candidates }, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId: 'INVENTORY_ITEM_CREATE', message: 'Add an item', ...over },
  { clock, loadOperationAvailability: async () => availability, loadExecutionExpiresAt: async () => null },
);
const withItems = async (rows, fn) => {
  const original = prisma.inventoryItem.findMany;
  let calls = 0;
  prisma.inventoryItem.findMany = async (args) => { calls += 1; return rows.filter((row) => args.where.id.in.includes(row.id) && (!args.where.propertyId || args.where.propertyId === row.propertyId)); };
  try { return await fn(() => calls); } finally { prisma.inventoryItem.findMany = original; }
};

test('the inventory entity validator is registered, and one batched query serves every candidate', async () => {
  assert.equal(typeof getSuggestedNextActionEntityValidator('INVENTORY_ITEM'), 'function');
  await withItems([{ id: 'item-1', propertyId: 'prop-1', updatedAt: UPDATED }], async (calls) => {
    const { result } = await finalize(inventoryMissingDetailCandidates(item(), { ...ctxArgs, limit: 4 }));
    assert.equal(calls(), 1, 'one inventory query for four candidates');
    assert.deepEqual(result.suggestedNextActions.map((a) => a.outcomeKey), ['ADD_BRAND', 'ADD_MODEL', 'ADD_PURCHASE_DATE', 'ADD_SERIAL_NUMBER'], 'tier-only: same tier orders by outcomeKey');
    for (const action of result.suggestedNextActions) {
      assert.ok(SuggestedNextActionSchema.safeParse(action).success);
      assert.equal(action.provenance.source, 'MISSING_DETAIL');
      assert.equal(action.provenance.sourceExecutionId, 'exec-1');
      assert.equal(action.entityContext.entityId, 'item-1');
    }
    assert.deepEqual(result.suggestions, [], 'newly governed results do not preserve raw-string fallbacks');
  });
});

test('an item that was deleted, moved to another property, or changed since the receipt is not offered', async () => {
  const candidates = inventoryMissingDetailCandidates(item(), ctxArgs);
  await withItems([], async () => assert.deepEqual((await finalize(candidates)).result.suggestedNextActions, [], 'deleted'));
  await withItems([{ id: 'item-1', propertyId: 'prop-2', updatedAt: UPDATED }], async () => assert.deepEqual((await finalize(candidates)).result.suggestedNextActions, [], 'other property'));
  await withItems([{ id: 'item-1', propertyId: 'prop-1', updatedAt: new Date(UPDATED.getTime() + 1000) }], async () => {
    const { result, report } = await finalize(candidates);
    assert.deepEqual(result.suggestedNextActions, [], 'edited after the receipt');
    assert.equal(report.diagnostics.rejections['FRESHNESS:CONTEXT_VERSION_STALE'], 3);
  });
});

test('a viewer cannot be offered a write: INVENTORY_ITEM_CORRECT unavailable by authorization drops every candidate', async () => {
  await withItems([{ id: 'item-1', propertyId: 'prop-1', updatedAt: UPDATED }], async () => {
    const { result, report } = await finalizeSuggestedNextActionsWithReport(
      { result: { status: 'COMPLETED', blocks: [], suggestions: [], suggestedNextActionCandidates: inventoryMissingDetailCandidates(item(), ctxArgs) }, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId: 'INVENTORY_ITEM_CREATE', message: 'Add an item' },
      { clock, loadOperationAvailability: async () => new Map([['INVENTORY_ITEM_CORRECT', 'AUTHORIZATION']]), loadExecutionExpiresAt: async () => null },
    );
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(report.diagnostics.rejections['AUTHORIZATION:ROLE_BELOW_FLOOR'], 3);
  });
});

test('the same outcome already completed this session is not offered again', async () => {
  const { suggestedNextActionSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
  const done = suggestedNextActionSemanticKeyHash({ operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', outcomeKey: 'ADD_BRAND' });
  await withItems([{ id: 'item-1', propertyId: 'prop-1', updatedAt: UPDATED }], async () => {
    const { result } = await finalize(inventoryMissingDetailCandidates(item(), ctxArgs), { completedSemanticKeyHashes: new Set([done]) });
    assert.deepEqual(result.suggestedNextActions.map((a) => a.outcomeKey), ['ADD_MODEL', 'ADD_PURCHASE_DATE']);
  });
});

// ---- wiring guards ---------------------------------------------------------------------------------------------------------

test('both inventory receipts nominate typed candidates and no longer emit item-ambiguous strings', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/recordConfirm.handler.ts'), 'utf8');
  assert.match(source, /inventoryMissingDetailCandidates\(\{ id: itemId, name: input\.name/);
  assert.match(source, /inventoryMissingDetailCandidates\(updated/);
  assert.doesNotMatch(source, /Set the purchase date for this inventory item|Update the brand of this inventory item/);
});

test('incomplete inventory reads nominate exact missing-record candidates instead of only generic starters', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/inventory.handler.ts'), 'utf8');
  assert.match(source, /const candidateItems = incompleteFocus \? shown : selectedItem \? \[selectedItem\] : \[\]/);
  assert.match(source, /sourceOperationId: 'INVENTORY_LOOKUP'/);
  assert.match(source, /suggestedNextActionCandidates\.length \? \{ suggestedNextActionCandidates \}/);
});

test('a verified selection carries its outcome into the launch context, and the correction handler reads it', () => {
  const create = readFileSync(resolve(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.match(create, /outcomeKey: action\.outcomeKey/);
  const handler = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/inventory.handler.ts'), 'utf8');
  assert.match(handler, /inventoryCorrectionFieldFor\(message, launchContext\?\.outcomeKey\)/);
});

test('a just-created item (no record read) still yields candidates, with no stale version stamped', () => {
  const candidates = inventoryMissingDetailCandidates({ id: 'new-1', name: 'Dishwasher', brand: 'Bosch', model: null }, ctxArgs);
  assert.deepEqual(candidates.map((c) => c.outcomeKey), ['ADD_PURCHASE_DATE', 'ADD_MODEL', 'ADD_SERIAL_NUMBER']);
  assert.ok(candidates.every((c) => c.entityContext.contextVersion === null && SuggestedNextActionCandidateSchema.safeParse(c).success));
});
