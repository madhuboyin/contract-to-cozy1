const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// HOME_BASICS_GUIDE (exact-four starter source, inventory D-O4; owner approved the authored-content read, October 5, 2026): a non-routable,
// skill-less, launch-only read of authored, evergreen guidance. The CONTENT is a draft for product and safety review.

const registry = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const captured = {};
const originalRegister = registry.registerCapabilityHandler;
registry.registerCapabilityHandler = (key, handler) => { captured[key] = handler; return originalRegister(key, handler); };
require('../../src/services/ask/handlers/homeBasics.handler.ts');
registry.registerCapabilityHandler = originalRegister;

const { buildHomeBasicsResult, homeBasicsFocus, HOME_BASICS_SAFETY_MESSAGE, HOME_BASICS_MONTHLY_MESSAGE } = require('../../src/services/ask/support/homeBasicsGuide.ts');
const { ASK_OPERATION_DEFINITIONS, resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskAudiencePolicy } = require('../../src/services/ask/askAudiencePolicy.ts');
const { KNOWN_UNGOVERNED_OPERATIONS, validateSkillOperationGovernanceCoverage } = require('../../src/services/intelligence/skillOperationGovernance.contract.ts');
const { validateAskInteractionCoverageMatrix } = require('../../src/services/ask/askInteractionCoverageMatrix.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const outcomes = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const exactFour = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { homeBasicsStarters, seasonalHomeCareStarters, STARTER_HOME_BASICS_PRODUCER_ID } = require('../../src/services/ask/suggestedActions/starterCandidates.ts');
const { SUGGESTED_NEXT_ACTION_PRODUCERS } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');

test('registered as a non-routable, skill-less, deterministic, viewer-floor, standard-safety read for every operating mode', () => {
  const definition = ASK_OPERATION_DEFINITIONS.HOME_BASICS_GUIDE;
  assert.equal(definition.messageRoutable, false);
  assert.equal(definition.executionMode, 'DETERMINISTIC');
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.safetyClass, 'STANDARD');
  assert.equal(getAskAudiencePolicy('HOME_BASICS_GUIDE').eligibleOperatingModes.length, 4);
  assert.ok(KNOWN_UNGOVERNED_OPERATIONS.includes('HOME_BASICS_GUIDE'));
  assert.deepEqual(validateSkillOperationGovernanceCoverage({ skillCoversOperation: () => false }).filter((i) => /HOME_BASICS_GUIDE/.test(i)), []);
  assert.deepEqual(validateAskInteractionCoverageMatrix(), []);
});

test('no message resolves to the new operation (routing is untouched)', () => {
  for (const message of [HOME_BASICS_SAFETY_MESSAGE, HOME_BASICS_MONTHLY_MESSAGE, 'home safety basics', 'monthly home routine', 'What should I check at home?']) {
    assert.notEqual(resolveAskOperation(message).operationId, 'HOME_BASICS_GUIDE', message);
  }
});

test('EXECUTED through the registered canonical call: both starter messages return distinct authored content, valid blocks, a boundary, and no property data', async () => {
  const handler = captured['home-basics.guide'];
  assert.equal(typeof handler, 'function');
  const safety = await handler({ userId: 'u1', propertyId: 'p1', message: HOME_BASICS_SAFETY_MESSAGE });
  const monthly = await handler({ userId: 'u1', propertyId: 'p1', message: HOME_BASICS_MONTHLY_MESSAGE });
  for (const result of [safety, monthly]) {
    assert.equal(result.status, 'ANSWERED');
    assert.deepEqual(result.blocks.map((b) => b.type), ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']);
    for (const block of result.blocks) assert.doesNotThrow(() => AskPresentationBlockSchema.parse(block), block.id);
    assert.ok(result.blocks[1].sections[0].items.length >= 4);
    assert.match(result.blocks[2].body, /not an assessment of your home/);
  }
  assert.notDeepEqual(safety.blocks[1].sections[0].items.map((i) => i.id), monthly.blocks[1].sections[0].items.map((i) => i.id));
  assert.equal(homeBasicsFocus(HOME_BASICS_SAFETY_MESSAGE), 'SAFETY_BASICS');
  assert.equal(homeBasicsFocus(HOME_BASICS_MONTHLY_MESSAGE), 'MONTHLY_ROUTINE');
});

test('the authored content makes no claim about the home and defers to manufacturers, codes and utilities', () => {
  for (const focus of ['SAFETY_BASICS', 'MONTHLY_ROUTINE']) {
    const text = JSON.stringify(buildHomeBasicsResult(focus));
    assert.doesNotMatch(text, /\byour (?:roof|furnace|water heater|hvac) is\b/i, 'no assertion about the home');
    assert.match(text, /manufacturer/i);
    assert.match(text, /not an assessment/i);
  }
  assert.match(JSON.stringify(buildHomeBasicsResult('SAFETY_BASICS')), /smell gas, leave the home/);
});

test('starters: two typed CURATED_STARTER candidates on one operation, outcomes registered, CURATED_STARTER-only grant, dismissible, registered with the finalizer', () => {
  const starters = homeBasicsStarters('p1');
  assert.deepEqual(starters.map((s) => s.outcomeKey), ['REVIEW_SAFETY_BASICS', 'REVIEW_MONTHLY_ROUTINE']);
  for (const starter of starters) {
    assert.equal(starter.operationId, 'HOME_BASICS_GUIDE'); assert.equal(starter.slotClass, 'CURATED_STARTER'); assert.equal(starter.entityContext.entityId, null);
    assert.deepEqual(exactFour.dismissalReasonsFor(starter.operationId, starter.outcomeKey), ['NOT_NOW', 'NOT_RELEVANT']);
  }
  assert.deepEqual(outcomes.SUGGESTED_ACTION_OUTCOMES.HOME_BASICS_GUIDE, ['REVIEW_SAFETY_BASICS', 'REVIEW_MONTHLY_ROUTINE']);
  assert.deepEqual(outcomes.validateSuggestedNextActionRegistry(), []);
  assert.ok(outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.has('HOME_BASICS_GUIDE:REVIEW_SAFETY_BASICS') && outcomes.REPEATABLE_OUTCOMES.has('HOME_BASICS_GUIDE:REVIEW_SAFETY_BASICS'), 'approved: exempt AND repeatable');
  assert.deepEqual([...exactFour.PRODUCER_SLOT_GRANTS[STARTER_HOME_BASICS_PRODUCER_ID].allowed], ['CURATED_STARTER']);
  assert.ok(SUGGESTED_NEXT_ACTION_PRODUCERS.some((p) => p.id === STARTER_HOME_BASICS_PRODUCER_ID), 'the starter producer is registered');
});

test('SUPPLY ARITHMETIC (inventory 4a): PROPERTY_SUMMARY x2 + SEASONAL x2 + HOME_BASICS x2 = 6 starters on three operations; the largest group is 2, so a typed question needs 4 + 2 = 6 (7 for a launched answer, D-O11)', () => {
  const supply = 2 /* PROPERTY_SUMMARY, not yet a candidate producer */ + seasonalHomeCareStarters('p1').length + homeBasicsStarters('p1').length;
  const largestGroup = 2;
  assert.equal(supply, 6);
  assert.ok(supply >= 4 + largestGroup, 'a typed question is satisfied');
  assert.ok(supply < 4 + largestGroup + 1, 'a launched answer is still one short: a further distinct-operation starter is needed');
});
