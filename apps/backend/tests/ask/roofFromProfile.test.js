const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

// Review screenshot (2026-11-09): "how old is my roof and how much does a new roof cost" answered "I don't have a roof recorded for your home yet ... Show my
// home inventory". The roof is on the home profile (year and type), not a tracked item, so the home does have a roof on record.
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const { replacementGuidanceResult } = require('../../src/services/ask/handlers/miscHandlers.handler.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const QUESTION = 'how old is my roof and how much does a new roof cost';

function stub({ profile, items = [] }) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  prisma.inventoryItem.findMany = async () => items;
  prisma.property.findUnique = async () => profile;
}

test('a roof on the home profile is answered with its age, planned life and the timeline roof cost, and no inventory button', async () => {
  stub({ profile: { roofReplacementYear: 2008, roofType: 'ASPHALT_SHINGLE' }, items: [{ id: 'i1', name: 'Dishwasher', category: 'APPLIANCE' }] });
  const result = await replacementGuidanceResult('u1', 'p1', QUESTION, null, 'e1');
  assert.equal(result.reasonCode, 'REPAIR_REPLACE_ROOF_FROM_PROFILE');
  const summary = result.blocks[0];
  assert.match(summary.title, /Your roof is about \d+ years old/);
  assert.match(summary.body, /from 2008 \(asphalt shingle\)/);
  assert.match(summary.body, /about 25 years/);
  assert.match(summary.body, /\$8,000 to \$15,000/);
  assert.match(summary.body, /not a quote/);
  assert.deepEqual(summary.actions, [], 'the roof is not an inventory item, so no inventory button');
  assert.doesNotMatch(JSON.stringify(result), /home inventory/i);
});

test('the profile-roof answer passes the answer-trust checks for the original question', async () => {
  stub({ profile: { roofReplacementYear: 2008, roofType: null } });
  const result = await replacementGuidanceResult('u1', 'p1', QUESTION, null, 'e1');
  const checked = validateAskAnswerTrustPipeline({
    question: QUESTION, operationId: 'REPLACEMENT_GUIDANCE', propertyId: 'p1', semanticEnabled: false,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('REPLACEMENT_GUIDANCE')]),
  });
  assert.equal(checked.result.blocks[0].id, 'repair-replace-roof-profile');
});

test('a roof past its planned life says so and is marked as a caution', async () => {
  stub({ profile: { roofReplacementYear: 1995, roofType: null } });
  const result = await replacementGuidanceResult('u1', 'p1', QUESTION, null, 'e1');
  assert.match(result.blocks[0].body, /which has already passed/);
  assert.equal(result.blocks[0].tone, 'CAUTION');
});

test('with no roof year on the profile the original not-recorded answer is unchanged', async () => {
  stub({ profile: { roofReplacementYear: null, roofType: null }, items: [{ id: 'i1', name: 'Dishwasher', category: 'APPLIANCE' }] });
  const result = await replacementGuidanceResult('u1', 'p1', QUESTION, null, 'e1');
  assert.equal(result.reasonCode, 'REPAIR_REPLACE_ITEM_NOT_IN_HOME_RECORD');
});

// "how old is my roof" on its own goes to the inventory read, which had the same gap (a home with items but no roof item, or no items at all).
const inventoryService = require('../../src/services/inventory.service.ts').InventoryService;
const { inventoryLookupResult } = require('../../src/services/ask/handlers/inventory.handler.ts');
test('the inventory read answers "how old is my roof" from the profile when no roof item is tracked', async () => {
  for (const items of [[], [{ id: 'i1', name: 'Dishwasher', category: 'APPLIANCE', updatedAt: new Date(), status: 'ACTIVE' }]]) {
    stub({ profile: { roofReplacementYear: 2008, roofType: 'ASPHALT_SHINGLE' } });
    inventoryService.prototype.listItems = async () => items;
    const result = await inventoryLookupResult('u1', 'p1', 'how old is my roof');
    assert.equal(result.reasonCode, 'INVENTORY_ROOF_FROM_PROFILE', `items=${items.length}`);
    assert.match(result.blocks[0].body, /from 2008/);
    assert.doesNotMatch(JSON.stringify(result), /home inventory/i);
  }
});
