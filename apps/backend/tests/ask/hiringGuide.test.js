const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// HIRING_GUIDE (exact-four starter source, inventory D-O4; owner decided October 5, 2026 to build a fourth operation): non-routable, skill-less,
// launch-only, authored. The CONTENT is a draft for product review.

const registry = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const captured = {};
const originalRegister = registry.registerCapabilityHandler;
registry.registerCapabilityHandler = (key, handler) => { captured[key] = handler; return originalRegister(key, handler); };
require('../../src/services/ask/handlers/hiringGuide.handler.ts');
registry.registerCapabilityHandler = originalRegister;

const { buildHiringGuideResult, HIRING_GUIDE_MESSAGE } = require('../../src/services/ask/support/hiringGuide.ts');
const { ASK_OPERATION_DEFINITIONS, resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskAudiencePolicy } = require('../../src/services/ask/askAudiencePolicy.ts');
const { KNOWN_UNGOVERNED_OPERATIONS, validateSkillOperationGovernanceCoverage } = require('../../src/services/intelligence/skillOperationGovernance.contract.ts');
const { validateAskInteractionCoverageMatrix } = require('../../src/services/ask/askInteractionCoverageMatrix.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const outcomes = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const exactFour = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { hiringGuideStarters, STARTER_HIRING_GUIDE_PRODUCER_ID } = require('../../src/services/ask/suggestedActions/starterCandidates.ts');

test('registered as a non-routable, skill-less, deterministic, viewer-floor, standard-safety read for every operating mode', () => {
  const definition = ASK_OPERATION_DEFINITIONS.HIRING_GUIDE;
  assert.equal(definition.messageRoutable, false);
  assert.equal(definition.executionMode, 'DETERMINISTIC');
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.safetyClass, 'STANDARD');
  assert.equal(getAskAudiencePolicy('HIRING_GUIDE').eligibleOperatingModes.length, 4);
  assert.ok(KNOWN_UNGOVERNED_OPERATIONS.includes('HIRING_GUIDE'));
  assert.deepEqual(validateSkillOperationGovernanceCoverage({ skillCoversOperation: () => false }).filter((i) => /HIRING_GUIDE/.test(i)), []);
  assert.deepEqual(validateAskInteractionCoverageMatrix(), []);
});

test('routing is untouched: no message resolves to the new operation, and quote comparison still routes where it did', () => {
  for (const message of [HIRING_GUIDE_MESSAGE, 'how do I vet a contractor', 'hiring a contractor checklist', 'Compare these contractor bids']) {
    assert.notEqual(resolveAskOperation(message).operationId, 'HIRING_GUIDE', message);
  }
  assert.equal(resolveAskOperation('Compare these contractor bids').operationId, 'QUOTE_COMPARISON_REVIEW');
});

test('EXECUTED through the registered canonical call: authored content, valid blocks, a boundary, no property data and no legal or place-specific claim', async () => {
  const handler = captured['hiring-guide.read'];
  assert.equal(typeof handler, 'function');
  const result = await handler({ userId: 'u1', propertyId: 'p1', message: HIRING_GUIDE_MESSAGE });
  assert.equal(result.status, 'ANSWERED');
  assert.deepEqual(result.blocks.map((b) => b.type), ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']);
  for (const block of result.blocks) assert.doesNotThrow(() => AskPresentationBlockSchema.parse(block), block.id);
  assert.equal(result.blocks[1].sections[0].items.length, 6);
  assert.match(result.blocks[2].body, /not legal advice/);
  assert.match(result.blocks[2].body, /differ by location/);
  assert.deepEqual(buildHiringGuideResult(), await handler({ userId: 'u9', propertyId: 'other', message: 'anything' }), 'identical for every user, property and message');
});

test('starter: ONE typed CURATED_STARTER candidate (a single strong outcome), registered, granted CURATED_STARTER only, dismissible', () => {
  const [starter, ...rest] = hiringGuideStarters('p1');
  assert.equal(rest.length, 0);
  assert.equal(starter.operationId, 'HIRING_GUIDE'); assert.equal(starter.outcomeKey, 'REVIEW_HIRING_CHECKLIST'); assert.equal(starter.slotClass, 'CURATED_STARTER');
  assert.deepEqual(outcomes.SUGGESTED_ACTION_OUTCOMES.HIRING_GUIDE, ['REVIEW_HIRING_CHECKLIST']);
  assert.deepEqual(outcomes.validateSuggestedNextActionRegistry(), []);
  assert.deepEqual([...exactFour.PRODUCER_SLOT_GRANTS[STARTER_HIRING_GUIDE_PRODUCER_ID].allowed], ['CURATED_STARTER']);
  assert.deepEqual(exactFour.dismissalReasonsFor('HIRING_GUIDE', 'REVIEW_HIRING_CHECKLIST'), ['NOT_NOW', 'NOT_RELEVANT']);
});
