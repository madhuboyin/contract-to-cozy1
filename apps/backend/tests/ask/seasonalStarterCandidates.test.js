const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The seasonal starters as typed candidates (inventory D-O4/D-O16). Pure and UNWIRED: this pins the nominations, the grant and the registry
// state; it does not add a producer to the finalizer, and the D-O10 exemption stays empty until D-O4 is approved.

const { seasonalHomeCareStarters, STARTER_SEASONAL_PRODUCER_ID } = require('../../src/services/ask/suggestedActions/starterCandidates.ts');
const outcomes = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { PRODUCER_SLOT_GRANTS, resolveGrantedSlotClass } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');
const { suggestionKey } = require('../../src/services/ask/askSuggestionPolicy.ts');
const { SUGGESTED_NEXT_ACTION_PRODUCERS } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');

test('two starters, distinct outcomes and messages on ONE operation, both declared CURATED_STARTER with no entity', () => {
  const starters = seasonalHomeCareStarters('p1');
  assert.equal(starters.length, 2);
  assert.deepEqual(starters.map((s) => s.outcomeKey), ['REVIEW_THIS_SEASON', 'PREPARE_NEXT_SEASON']);
  assert.equal(new Set(starters.map((s) => s.message)).size, 2);
  for (const starter of starters) {
    assert.equal(starter.operationId, 'SEASONAL_HOME_CARE');
    assert.equal(starter.slotClass, 'CURATED_STARTER');
    assert.equal(starter.entityContext.entityType, null);
    assert.equal(starter.entityContext.entityId, null);
    assert.equal(starter.entityContext.propertyId, 'p1');
    assert.doesNotThrow(() => SuggestedNextActionCandidateSchema.parse(starter));
    assert.equal(Object.hasOwn(starter, 'producerId'), false, 'identity is the nominations key, never a field');
  }
});

test('the outcomes are registered, the registry validates, and both starters are approved: prompt-history exempt AND repeatable (D-O4)', () => {
  assert.deepEqual(outcomes.SUGGESTED_ACTION_OUTCOMES.SEASONAL_HOME_CARE, ['REVIEW_THIS_SEASON', 'PREPARE_NEXT_SEASON']);
  assert.deepEqual(outcomes.validateSuggestedNextActionRegistry(), []);
  for (const key of ['SEASONAL_HOME_CARE:REVIEW_THIS_SEASON', 'SEASONAL_HOME_CARE:PREPARE_NEXT_SEASON']) { assert.ok(outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.has(key)); assert.ok(outcomes.REPEATABLE_OUTCOMES.has(key)); }
});

test('the grant lets the starter producer occupy CURATED_STARTER only; any other claimed class falls back and is denied', () => {
  assert.equal(STARTER_SEASONAL_PRODUCER_ID, 'starter.seasonal-home-care');
  assert.ok(PRODUCER_SLOT_GRANTS[STARTER_SEASONAL_PRODUCER_ID]);
  const [starter] = seasonalHomeCareStarters('p1');
  assert.deepEqual(resolveGrantedSlotClass(starter, STARTER_SEASONAL_PRODUCER_ID), { slotClass: 'CURATED_STARTER', denied: false });
  assert.deepEqual(resolveGrantedSlotClass({ ...starter, slotClass: 'URGENT_WORK' }, STARTER_SEASONAL_PRODUCER_ID), { slotClass: 'HOME_OPPORTUNITY', denied: true });
  assert.equal(PRODUCER_SLOT_GRANTS[STARTER_SEASONAL_PRODUCER_ID].mayClaimCurrentResultOwnership, undefined);
});

test('WIRED: the finalizer producer registry nominates the seasonal starters', () => {
  assert.ok(SUGGESTED_NEXT_ACTION_PRODUCERS.some((p) => p.id === STARTER_SEASONAL_PRODUCER_ID));
});

test('real eligibility: the starters are eligible when available, and a recently asked starter is NOT suppressed (the D-O10 exemption)', () => {
  const [starter] = seasonalHomeCareStarters('p1');
  const ctx = (asked) => ({
    mode: 'NORMAL', sourcePropertyId: 'p1', operationAvailability: new Map([['SEASONAL_HOME_CARE', null]]),
    operationRequiresProperty: () => true, operationTargetEntityType: () => null, entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false,
    completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(asked ? [suggestionKey(starter.message)] : []), messageKey: suggestionKey, currentOutcomeKeyHashes: new Set(),
  });
  assert.equal(evaluateSuggestedNextActionEligibility(starter, ctx(false)).state, 'ELIGIBLE');
  assert.equal(evaluateSuggestedNextActionEligibility(starter, ctx(true)).state, 'ELIGIBLE');
});
