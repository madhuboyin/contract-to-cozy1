const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { canonicalCapabilityRegistry, matchCapabilityGoal } = require('../../src/productFramework/capabilities/index.ts');
const { capabilityResult, messageNamesCapability } = require('../../src/services/ask/support/capabilityDiscovery.ts');

// Review screenshot (2026-11-07): "is there a tool for me to record my bedroom color and other details" answered "Quick Document Scan is not available here" —
// a tool the homeowner never named, chosen because the matcher read the verb "record" as the noun for paperwork, with the available tools hidden behind it.

const goal = (message) => matchCapabilityGoal({ registry: canonicalCapabilityRegistry, goal: message, limit: 5 }).matches.map((match) => match.capabilityId);
const adapterFor = (availableIds) => {
  const available = new Set(availableIds);
  return {
    resolve: (id) => ({ capabilityId: id, available: available.has(id), reason: available.has(id) ? null : 'ROLLOUT_DISABLED', rollout: null, policyApplied: true }),
    listAvailable: () => canonicalCapabilityRegistry.capabilities.filter((capability) => available.has(capability.id)),
  };
};
const cards = (result) => result.blocks.flatMap((block) => (block.capabilities ?? []).map((capability) => capability.label));

test('"record my …" is the verb: it no longer sends a goal to Documents, and Material Specs is found for finishes', () => {
  assert.ok(!goal('is there a tool for me to record my bedroom color and other details').includes('documents'));
  assert.ok(goal('is there a tool for me to record my bedroom color and other details').slice(0, 3).includes('material-specs'));
  assert.equal(goal('record my paint colors and materials')[0], 'material-specs');
});

test('"record" as the noun for paperwork, and document wording, still reach Documents', () => {
  assert.equal(goal('record my warranty documents')[0], 'documents');
  assert.equal(goal('where can i store my documents')[0] === 'documents' || goal('where can i store my documents')[0] === 'home-records', true);
  assert.ok(goal('where can i store my documents').includes('documents'));
  assert.ok(goal('keep my records organized').includes('documents'));
  assert.ok(goal('scan a document').includes('documents'));
});

test('a tool is "named" only by its label or a reviewed alias, not by keywords', () => {
  const documents = canonicalCapabilityRegistry.getById('documents');
  assert.equal(messageNamesCapability('is there a tool for quick document scan', documents), true);
  assert.equal(messageNamesCapability('can i scan a document', documents), true);
  assert.equal(messageNamesCapability('is there a tool for me to record my bedroom color and other details', documents), false);
  assert.equal(messageNamesCapability('where can i keep my paperwork', documents), false);
});

test('a keyword-top tool the homeowner never named is not reported as unavailable; the available tools are shown', async () => {
  const result = await capabilityResult('user-1', null, 'is there a tool for me to record my bedroom color and other details', { availability: adapterFor(['home-records', 'material-specs', 'property-brief']) });
  assert.notEqual(result.status, 'UNAVAILABLE');
  assert.doesNotMatch(result.blocks[0].title, /not available here/);
  assert.ok(cards(result).includes('Material Specs'), cards(result).join(','));
});

test('a tool that is named and genuinely unavailable is still reported as unavailable', async () => {
  const result = await capabilityResult('user-1', null, 'is there a tool for quick document scan', { availability: adapterFor(['material-specs']) });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.blocks[0].title, 'Quick Document Scan is not available here');
});

test('when something available matches as well as a named unavailable tool, the available one is shown (unchanged)', async () => {
  const result = await capabilityResult('user-1', null, 'is there a tool for quick document scan', { availability: adapterFor(['home-records', 'material-specs']) });
  assert.notEqual(result.status, 'UNAVAILABLE');
  assert.ok(cards(result).includes('Home Records'));
});
