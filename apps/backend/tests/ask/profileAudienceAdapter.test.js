const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { SaleCaseStatus, BuyerJourneyStatus, BuyerJourneyStage } = require('@prisma/client');
const adapter = require('../../src/services/ask/suggestedActions/profileAudienceAdapter.ts');
const registry = require('../../src/services/ask/suggestedActions/actionableProfileRegistry.ts');

// ASK_COZY_EXACT_FOUR_REGISTRY_PACKET D12 / step 7: audiences come only from governed workflow state.

const journey = (over = {}) => ({ status: 'ACTIVE', stage: 'DUE_DILIGENCE', completedAt: null, cancelledAt: null, handoffCompletedAt: null, transitionedToRecurringAt: null, ...over });
const NOW = new Date('2026-10-04T12:00:00Z');

function fakeDb({ buyer = null, sale = null, failBuyer = false, failSale = false } = {}) {
  const calls = [];
  return {
    calls,
    db: {
      homeBuyerChecklist: { async findUnique(args) { calls.push(['homeBuyerChecklist', args]); if (failBuyer) throw new Error('db down'); return buyer; } },
      propertySaleCase: { async findUnique(args) { calls.push(['propertySaleCase', args]); if (failSale) throw new Error('db down'); return sale; } },
    },
  };
}

// ---- pure rules ------------------------------------------------------------------------------------------------------------------

test('buyer journey: only an ACTIVE, pre-closing, unfinished, uncancelled, un-handed-off journey activates BUYER', () => {
  assert.equal(adapter.isBuyerJourneyActive(journey()), true);
  assert.equal(adapter.isBuyerJourneyActive(null), false);
  for (const status of ['PAUSED', 'CANCELLED', 'HANDED_OFF', 'ARCHIVED']) assert.equal(adapter.isBuyerJourneyActive(journey({ status })), false, status);
  for (const field of ['completedAt', 'cancelledAt', 'handoffCompletedAt', 'transitionedToRecurringAt']) {
    assert.equal(adapter.isBuyerJourneyActive(journey({ [field]: NOW })), false, field);
  }
});

test('buyer stage: the audience stops at CLOSED; every post-closing stage and any unclassified stage is excluded', () => {
  for (const stage of ['EXPLORING', 'OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP']) assert.equal(adapter.isBuyerJourneyActive(journey({ stage })), true, stage);
  for (const stage of ['CLOSED', 'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'HANDED_OFF', 'SOME_FUTURE_STAGE', '', undefined]) {
    assert.equal(adapter.isBuyerJourneyActive(journey({ stage })), false, String(stage));
  }
  // Even an ACTIVE, otherwise clean journey is inactive after closing.
  assert.equal(adapter.isBuyerJourneyActive(journey({ status: 'ACTIVE', stage: 'MOVE_IN' })), false);
  assert.deepEqual([...adapter.BUYER_ACTIVE_STAGES].sort(), ['CLOSING_PREP', 'DUE_DILIGENCE', 'EXPLORING', 'OFFER_CONTRACT']);
});

test('sale case: preparing, listed and under contract are live; closed and cancelled are over', () => {
  for (const status of ['PREPARING', 'LISTED', 'UNDER_CONTRACT']) assert.equal(adapter.isSaleCaseActive({ status }), true, status);
  for (const status of ['CLOSED', 'CANCELLED', 'UNKNOWN_FUTURE_STATUS']) assert.equal(adapter.isSaleCaseActive({ status }), false, status);
  assert.equal(adapter.isSaleCaseActive(null), false);
});

test('the rules match the real Prisma enums: every status is classified, nothing new slips in unnoticed', () => {
  assert.deepEqual(Object.values(SaleCaseStatus).sort(), ['CANCELLED', 'CLOSED', 'LISTED', 'PREPARING', 'UNDER_CONTRACT']);
  assert.deepEqual([...adapter.LIVE_SALE_CASE_STATUSES].sort(), ['LISTED', 'PREPARING', 'UNDER_CONTRACT']);
  assert.deepEqual(Object.values(BuyerJourneyStatus).sort(), ['ACTIVE', 'ARCHIVED', 'CANCELLED', 'HANDED_OFF', 'PAUSED']);
  const allStages = Object.values(BuyerJourneyStage).sort();
  assert.deepEqual(allStages, ['CLOSED', 'CLOSING_PREP', 'DAYS_31_TO_90', 'DUE_DILIGENCE', 'EXPLORING', 'FIRST_30_DAYS', 'HANDED_OFF', 'MOVE_IN', 'OFFER_CONTRACT']);
  for (const stage of adapter.BUYER_ACTIVE_STAGES) assert.ok(allStages.includes(stage), `${stage} is a real stage`);
});

// ---- adapter -------------------------------------------------------------------------------------------------------------------------

test('audience state: neither, buyer, seller, and both (union, sorted) with bounded reasons', async () => {
  const cases = [
    [{}, [], []],
    [{ buyer: journey() }, ['BUYER'], ['BUYER_JOURNEY_ACTIVE']],
    [{ sale: { status: 'LISTED' } }, ['SELLER'], ['SALE_CASE_ACTIVE']],
    [{ buyer: journey(), sale: { status: 'PREPARING' } }, ['BUYER', 'SELLER'], ['BUYER_JOURNEY_ACTIVE', 'SALE_CASE_ACTIVE']],
    [{ buyer: journey({ status: 'HANDED_OFF' }), sale: { status: 'CLOSED' } }, [], []],
    [{ buyer: journey({ stage: 'MOVE_IN' }) }, [], []],
    [{ buyer: journey({ stage: 'CLOSED' }), sale: { status: 'LISTED' } }, ['SELLER'], ['SALE_CASE_ACTIVE']],
  ];
  for (const [seed, audiences, reasons] of cases) {
    const result = await adapter.loadProfileAudienceState('p1', fakeDb(seed).db);
    assert.deepEqual(result, { audiences, reasons, ok: true }, JSON.stringify(seed));
  }
});

test('two unique-key reads in parallel, scoped to the property, selecting only workflow state', async () => {
  const { db, calls } = fakeDb({ buyer: journey() });
  await adapter.loadProfileAudienceState('prop-9', db);
  assert.deepEqual(calls.map(([model]) => model).sort(), ['homeBuyerChecklist', 'propertySaleCase']);
  for (const [, args] of calls) assert.deepEqual(args.where, { propertyId: 'prop-9' });
  const select = Object.fromEntries(calls);
  assert.deepEqual(Object.keys(select.homeBuyerChecklist.select).sort(), ['cancelledAt', 'completedAt', 'handoffCompletedAt', 'stage', 'status', 'transitionedToRecurringAt']);
  assert.deepEqual(Object.keys(select.propertySaleCase.select), ['status']);
});

test('a failed lookup is never guessed: that audience stays inactive, the other still resolves, and ok is false', async () => {
  const buyerDown = await adapter.loadProfileAudienceState('p1', fakeDb({ failBuyer: true, sale: { status: 'LISTED' } }).db);
  assert.deepEqual(buyerDown, { audiences: ['SELLER'], reasons: ['SALE_CASE_ACTIVE'], ok: false });
  const saleDown = await adapter.loadProfileAudienceState('p1', fakeDb({ failSale: true, buyer: journey() }).db);
  assert.deepEqual(saleDown, { audiences: ['BUYER'], reasons: ['BUYER_JOURNEY_ACTIVE'], ok: false });
  const bothDown = await adapter.loadProfileAudienceState('p1', fakeDb({ failBuyer: true, failSale: true }).db);
  assert.deepEqual(bothDown, { audiences: [], reasons: [], ok: false });
});

// ---- integration with the registry ---------------------------------------------------------------------------------------------------

test('adapter output feeds the completeness function: an activated audience grows the denominator and is named in the version', async () => {
  const baseKeys = registry.ACTIONABLE_PROFILE_FACTS.filter((entry) => entry.audience === 'ALL').map((entry) => entry.factKey);
  const facts = Object.fromEntries(baseKeys.map((key) => [key, { state: 'KNOWN', value: true }]));
  const compute = async (seed) => {
    const state = await adapter.loadProfileAudienceState('p1', fakeDb(seed).db);
    return registry.computeActionableCompleteness({ facts, activeAudiences: state.audiences });
  };
  const none = await compute({});
  const buyer = await compute({ buyer: journey() });
  const both = await compute({ buyer: journey(), sale: { status: 'UNDER_CONTRACT' } });
  assert.equal(none.fraction, 1);
  assert.equal(none.denominatorVersion, 'actionable-profile-1:BASE');
  assert.equal(buyer.denominatorVersion, 'actionable-profile-1:BUYER');
  assert.ok(buyer.fraction < none.fraction, 'activation can lower completeness (legitimate)');
  assert.equal(both.denominatorVersion, 'actionable-profile-1:BUYER+SELLER');
  assert.ok(both.fraction < buyer.fraction);
  // The activation that ended: a closed sale case returns the home to the base denominator.
  const ended = await compute({ sale: { status: 'CLOSED' } });
  assert.equal(ended.denominatorVersion, 'actionable-profile-1:BASE');
});

// ---- governance guard ----------------------------------------------------------------------------------------------------------------

test('governance: executable code reads only the two workflow tables; no speculative or generic signal can be added silently', () => {
  const file = path.join(__dirname, '../../src/services/ask/suggestedActions/profileAudienceAdapter.ts');
  const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const models = [...code.matchAll(/\bdb\.(\w+)\.\w+\(/g)].map((match) => match[1]).sort();
  assert.deepEqual(models, ['homeBuyerChecklist', 'propertySaleCase'], 'exactly the two governed workflow tables');
  for (const forbidden of [
    'decisionThread', 'DecisionThread', 'askExecution', 'propertyOnboarding', 'ownershipState', 'dwellingType', 'ownershipForm', 'propertyUse',
    'occupancyStatus', 'GOAL', 'sellHoldRent', 'SELL_HOLD_RENT', 'prisma.property.', 'timeframe',
  ]) assert.ok(!code.includes(forbidden), `the adapter must not reference ${forbidden}`);
  // The documented exclusions stay documented (the comment is the audit trail for the owner's rule).
  const raw = fs.readFileSync(file, 'utf8');
  for (const excluded of ['DecisionThread', 'ownershipState', 'speculative intent']) assert.ok(raw.includes(excluded), `exclusion for ${excluded} stays documented`);
});

// ---- uncertainty must propagate ------------------------------------------------------------------------------------------------------

const { selectExactFourSuggestedNextActions } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourPolicy.ts');
const { exactFourOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourDiagnostics.ts');

test('a failed audience lookup is carried into completeness as audienceUncertain; a clean lookup is not uncertain', async () => {
  const facts = {};
  const clean = await adapter.loadProfileAudienceState('p1', fakeDb({ buyer: journey() }).db);
  const down = await adapter.loadProfileAudienceState('p1', fakeDb({ failBuyer: true }).db);
  const wired = (state) => registry.computeActionableCompleteness({ facts, activeAudiences: state.audiences, audienceUncertain: !state.ok });
  assert.equal(wired(clean).audienceUncertain, false);
  assert.equal(wired(down).audienceUncertain, true);
  assert.equal(registry.computeActionableCompleteness({ facts, activeAudiences: [] }).audienceUncertain, false, 'defaults to certain');
});

test('exact-four: an uncertain audience is not treated as at or above 90%, so profile capture still leads and the uncertainty is reported', () => {
  const cand = (label, slotClass, over = {}) => ({
    source: 'MISSING_DETAIL', sourceOperationId: 'INVENTORY_LOOKUP', label, message: `Message ${label}`, operationId: 'INVENTORY_ITEM_CORRECT',
    interactionType: 'MUTATE_RECORD', outcomeKey: label === 'gap' ? 'ADD_BRAND' : 'ADD_MODEL', slotClass, tier: 'RELATED', requiredFacts: [], reasonCodes: [],
    entityContext: { propertyId: 'p1', entityType: 'INVENTORY_ITEM', entityId: label === 'gap' ? 'item-1' : 'item-2', contextVersion: 'v1' },
    signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 1, sourceConfidence: 0.5 },
    traits: { recovery: false, promotional: false, continuesPending: false }, ...over,
  });
  const eligibility = {
    mode: 'NORMAL', sourcePropertyId: 'p1', operationAvailability: new Map([['INVENTORY_ITEM_CORRECT', null]]), operationRequiresProperty: () => true,
    operationTargetEntityType: () => 'INVENTORY_ITEM',
    entities: new Map(['item-1', 'item-2'].map((id) => [`INVENTORY_ITEM:${id}`, { exists: true, propertyId: 'p1', currentContextVersion: 'v1' }])),
    validatedEntityTypes: new Set(['INVENTORY_ITEM']), pendingInteractionActive: false, completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(),
    messageKey: (m) => m.toLowerCase(), currentOutcomeKeyHashes: new Set(),
  };
  const run = (over) => selectExactFourSuggestedNextActions({
    nominations: new Map([['t.p', [cand('gap', 'PROFILE_GAP'), cand('opp', 'HOME_OPPORTUNITY')]]]), eligibility, actionableCompleteness: 0.95,
    slotGrants: { 't.p': { allowed: new Set(['PROFILE_GAP', 'HOME_OPPORTUNITY']), fallback: 'HOME_OPPORTUNITY' } }, ...over,
  });
  const certain = run({});
  assert.deepEqual(certain.selected.map((e) => e.candidate.label), ['opp', 'gap'], 'a certain 95% home lets the opportunity lead');
  assert.equal(certain.exactFour.audienceUncertain, false);
  const uncertain = run({ audienceUncertain: true });
  assert.deepEqual(uncertain.selected.map((e) => e.candidate.label), ['gap', 'opp'], 'uncertain: profile capture leads');
  assert.equal(uncertain.exactFour.audienceUncertain, true);
  assert.equal(uncertain.exactFour.belowCompletenessThreshold, true);
  assert.ok(exactFourOutcome(uncertain.exactFour).reasons.includes('AUDIENCE_UNCERTAIN'), 'reported even though the row was filled');
  assert.ok(!exactFourOutcome(certain.exactFour).reasons.includes('AUDIENCE_UNCERTAIN'));
});

test('governance: wiring guidance in the adapter names the propagation contract (audienceUncertain: !state.ok)', () => {
  const raw = fs.readFileSync(path.join(__dirname, '../../src/services/ask/suggestedActions/profileAudienceAdapter.ts'), 'utf8');
  assert.ok(raw.includes('audienceUncertain: !state.ok'));
  assert.ok(raw.includes('BUYER_ACTIVE_STAGES'));
});
