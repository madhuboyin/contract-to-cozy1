const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

// Review screenshot (2026-11-07): "how is my water heater doing? will it be good for next few years" was left to the generic fallback. The repair-or-replace
// answer is the verdict for one item (keep, repair, replace soon); the existing wording covered "keep using", "still good" and "worth repairing" but not a
// health check or a longevity question.

const owner = Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY') && !definition.operationId.startsWith('BUYER_')).map((definition) => definition.operationId);
const decide = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1', eligibleOperationIds: owner });
const op = (message) => decide(message).operation.operationId;

test('a health check or longevity question about a named item reaches the repair-or-replace answer', () => {
  for (const message of [
    'how is my water heater doing? will it be good for next few years',
    'how is my furnace doing',
    "how's my roof holding up",
    'how is my dryer looking',
    'will my dishwasher last another 5 years',
    'will the microwave be good for the next few years',
    'how many more years does my fridge have left',
    'how long until my water heater needs replacing',
    'is my washing machine going to last',
    'how is my hvac doing',
  ]) {
    const decision = decide(message);
    assert.equal(decision.stage, 'DETERMINISTIC', message);
    assert.equal(decision.operation.operationId, 'REPLACEMENT_GUIDANCE', message);
  }
});

test('the same words without a named item are not taken by the repair-or-replace answer', () => {
  for (const message of ['how is my mortgage doing', 'how is the weather doing', 'how many years left on my warranty', 'how many years old is my roof', 'how is my kitchen looking', 'will it last', 'how is my dishwasher rated']) {
    assert.notEqual(op(message), 'REPLACEMENT_GUIDANCE', message);
  }
});

test('the existing keep-or-replace wording and the neighbouring routes are unchanged', () => {
  assert.equal(op('is my water heater still good'), 'REPLACEMENT_GUIDANCE');
  assert.equal(op('can i keep using my old dishwasher'), 'REPLACEMENT_GUIDANCE');
  assert.equal(op('do i need a new roof'), 'REPLACEMENT_GUIDANCE');
  assert.equal(op('which of my appliances are most likely to fail'), 'APPLIANCE_FAILURE_RISK');
  assert.equal(op('show me the history of my washing machine repairs'), 'INVENTORY_LOOKUP');
  assert.equal(op('what is the model number of my dishwasher'), 'INVENTORY_LOOKUP');
});

// Handler behaviour (audit Phase 1): the router sends microwave/oven/stove/... questions here, so the handler must resolve them too.
// Only the not-found / ambiguous outcomes are exercised: a single matched item continues into a DB-backed property-context lookup.
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/miscHandlers.handler.ts');

const item = (id, name, assetType) => ({ id, name, category: 'APPLIANCE', assetType, brand: 'GE', model: 'X1', condition: 'GOOD', installedOn: null, purchasedOn: null, expectedExpiryDate: null, updatedAt: new Date('2026-01-01T00:00:00Z') });
async function replacement(message, items) {
  const originalFind = prisma.inventoryItem.findMany;
  const originalProperty = prisma.property.findUnique;
  const originalAccess = propertyAccessService.resolvePropertyAccess;
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  prisma.inventoryItem.findMany = async () => items;
  prisma.property.findUnique = async () => ({ roofReplacementYear: null, roofType: null });
  try {
    return await capabilityInvoke('REPLACEMENT_GUIDANCE', { userId: 'u1', propertyId: 'p1', sessionId: 's1', executionId: 'e1', message });
  } finally {
    prisma.inventoryItem.findMany = originalFind;
    prisma.property.findUnique = originalProperty;
    propertyAccessService.resolvePropertyAccess = originalAccess;
  }
}

test('an unrecorded item is named as the user spoke it', async () => {
  assert.equal((await replacement('Do I need a new stove?', [])).blocks[0].title, 'I don’t have a stove recorded for your home yet');
  assert.equal((await replacement('Do I need a new microwave?', [])).blocks[0].title, 'I don’t have a microwave recorded for your home yet');
  assert.equal((await replacement('Do I need a new garage door?', [])).blocks[0].title, 'I don’t have a garage door recorded for your home yet');
  assert.equal((await replacement('Do I need a new roof?', [])).blocks[0].title, 'I don’t have a roof recorded for your home yet');
});

test('HVAC wording keeps its own branch ahead of the shared aliases', async () => {
  assert.equal((await replacement('Should I replace my furnace?', [])).blocks[0].title, 'I don’t have an HVAC system recorded for your home yet');
});

test('two recorded microwaves ask which one; multi-word names are matched', async () => {
  const result = await replacement('Is my microwave still good?', [item('a', 'Kitchen Microwave', 'MICROWAVE'), item('b', 'Basement Microwave', 'MICROWAVE')]);
  assert.equal(result.reasonCode, 'MULTIPLE_REPAIR_REPLACE_ITEMS');
  assert.equal(result.blocks[0].sections[0].count, 2);
});

// External review P2: the router sends "ac" / "a/c unit" here (itemKeepOrReplacePattern), so the handler's HVAC branch must take them too, and an item
// named by brand and model must still match its asset type ("WATER_HEATER" is the words "water heater").
test('an AC question with no HVAC recorded says so, like the other HVAC wording', async () => {
  for (const message of ['Is my AC still good?', 'Will my AC unit be good for the next few years?', 'Do I need a new a/c unit?']) {
    assert.equal(op(message), 'REPLACEMENT_GUIDANCE', message);
    assert.equal((await replacement(message, [])).blocks[0].title, 'I don’t have an HVAC system recorded for your home yet', message);
  }
});

test('an item named by brand and model is found by its asset type', async () => {
  const heater = (id, name) => ({ ...item(id, name, 'WATER_HEATER'), category: 'PLUMBING', brand: 'Rheem', model: 'XE50' });
  const result = await replacement('Is my water heater still good?', [heater('a', 'Rheem Performance 50 Gal'), heater('b', 'Garage Rheem')]);
  assert.equal(result.reasonCode, 'MULTIPLE_REPAIR_REPLACE_ITEMS');
  assert.equal(result.blocks[0].sections[0].count, 2);
});
