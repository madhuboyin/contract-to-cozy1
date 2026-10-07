const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { SuggestedNextActionCandidateSchema, candidateIdentityFields } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { selectSuggestedNextActions, candidateSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionPolicy.ts');
const { selectExactFourSuggestedNextActions, resolveExactFourExemption } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourPolicy.ts');
const { exactFourOutcome, recordExactFourDiagnostics } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourDiagnostics.ts');
const registry = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { SUGGESTED_NEXT_ACTION_LIMITS } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { suggestedNextActionSemanticKey } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { askSuggestedActionsExactFourTotal, askSuggestedActionsExactFourReasonsTotal } = require('../../src/lib/metrics.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Appendix C.15, step 1: the pure exact-four policy and its diagnostics.

const lcKey = (c) => registry.lifecycleKey({ operationId: c.operationId, outcomeKey: c.outcomeKey, entityType: c.entityContext.entityType, entityId: c.entityContext.entityId });
const OUTCOMES = ['ADD_BRAND', 'ADD_MODEL', 'ADD_SERIAL_NUMBER', 'ADD_NOTES', 'ADD_CATEGORY', 'ADD_CONDITION'];
const ITEMS = Array.from({ length: 12 }, (_, i) => `item-${i + 1}`);

let seq = 0;
/** A valid, eligible typed candidate. Each call is semantically distinct (own entity), so deduplication never merges them. */
function mk(slotClass, over = {}) {
  seq += 1;
  const item = ITEMS[seq % ITEMS.length];
  return {
    source: 'MISSING_DETAIL', sourceOperationId: 'INVENTORY_LOOKUP',
    label: `Add detail ${seq}`, message: `Add detail number ${seq}`,
    operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', outcomeKey: OUTCOMES[seq % OUTCOMES.length],
    entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: item, contextVersion: 'v1' },
    tier: 'RELATED', slotClass, requiredFacts: [], reasonCodes: ['TEST_REASON'],
    signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 1, sourceConfidence: 0.5 },
    traits: { recovery: false, promotional: false, continuesPending: false },
    ...over,
  };
}
const named = (id, slotClass, over = {}) => mk(slotClass, { label: id, message: `Message for ${id}`, ...over });

function ctx(over = {}) {
  return {
    mode: 'NORMAL', sourcePropertyId: 'prop-1',
    operationAvailability: new Map([['INVENTORY_ITEM_CORRECT', null]]),
    operationRequiresProperty: () => true,
    operationTargetEntityType: () => 'INVENTORY_ITEM',
    entities: new Map(ITEMS.map((id) => [`INVENTORY_ITEM:${id}`, { exists: true, propertyId: 'prop-1', currentContextVersion: 'v1' }])),
    validatedEntityTypes: new Set(['INVENTORY_ITEM']),
    pendingInteractionActive: false,
    completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(), messageKey: (m) => m.toLowerCase(), currentOutcomeKeyHashes: new Set(),
    ...over,
  };
}
const ALL = registry.SUGGESTED_NEXT_ACTION_SLOT_CLASSES;
const GRANT_ALL = { 'test.producer': { allowed: new Set(ALL), fallback: 'HOME_OPPORTUNITY', mayClaimCurrentResultOwnership: true, mayClaimActiveGoalMatch: true } };
const run = (list, over = {}) => selectExactFourSuggestedNextActions({
  slotGrants: GRANT_ALL, nominations: new Map([['test.producer', list]]), eligibility: ctx(over.eligibility), actionableCompleteness: 0.5, ...over, ...(over.eligibility ? { eligibility: ctx(over.eligibility) } : {}),
});
const labels = (result) => result.selected.map((entry) => entry.candidate.label);

// ---- registry ----------------------------------------------------------------------------------------------------------

test('exact-four registry: the count matches the display limit and every slot class resolves', () => {
  assert.equal(registry.EXACT_FOUR.count, SUGGESTED_NEXT_ACTION_LIMITS.maxShown);
  assert.equal(registry.EXACT_FOUR.count, 4);
  assert.equal(registry.EXACT_FOUR.completenessThreshold, 0.9);
  assert.equal(registry.EXACT_FOUR.maxUnrelatedOpportunities, 1);
  for (const slotClass of registry.COOLDOWN_EXEMPT_SLOT_CLASSES) assert.ok(registry.SUGGESTED_NEXT_ACTION_SLOT_CLASSES.includes(slotClass));
  for (const slotClass of registry.OPPORTUNITY_SLOT_CLASSES) assert.ok(registry.SUGGESTED_NEXT_ACTION_SLOT_CLASSES.includes(slotClass));
  assert.equal(new Set(registry.SUGGESTED_NEXT_ACTION_SLOT_CLASSES).size, 7);
});

test('slot class: explicit wins; otherwise derived; urgent work and starters are never inferred', () => {
  const base = { source: 'OPERATION_RESULT', tier: 'RELATED', traits: { continuesPending: false }, entityContext: { entityId: null } };
  const resolve = (over) => registry.resolveSuggestedNextActionSlotClass({ ...base, ...over });
  assert.equal(resolve({ slotClass: 'URGENT_WORK' }), 'URGENT_WORK');
  assert.equal(resolve({ tier: 'CONTINUE' }), 'CONTINUE_WORK');
  assert.equal(resolve({ traits: { continuesPending: true } }), 'CONTINUE_WORK');
  assert.equal(resolve({ source: 'PENDING_WORK' }), 'CONTINUE_WORK');
  assert.equal(resolve({ source: 'MISSING_DETAIL', entityContext: { entityId: 'x' } }), 'EXACT_RECORD');
  assert.equal(resolve({ source: 'MISSING_DETAIL' }), 'PROFILE_GAP');
  assert.equal(resolve({ tier: 'RECORD_ACTION' }), 'EXACT_RECORD');
  assert.equal(resolve({ source: 'ENTITY_ACTION' }), 'EXACT_RECORD');
  assert.equal(resolve({ source: 'CAPABILITY_RECOMMENDATION' }), 'GOVERNED_CAPABILITY');
  assert.equal(resolve({ source: 'ACTIVE_GOAL' }), 'HOME_OPPORTUNITY');
  assert.equal(resolve({}), 'HOME_OPPORTUNITY');
});

test('candidate schema accepts a registered slotClass, stays optional, and rejects an unknown one', () => {
  assert.equal(SuggestedNextActionCandidateSchema.safeParse(mk('PROFILE_GAP')).success, true);
  const { slotClass: _omit, ...without } = mk('PROFILE_GAP');
  assert.equal(SuggestedNextActionCandidateSchema.safeParse(without).success, true);
  assert.equal(SuggestedNextActionCandidateSchema.safeParse(mk('MADE_UP')).success, false);
});

// ---- applicability -------------------------------------------------------------------------------------------------------

test('exemptions: recovery mode, a pending interaction and a property-less turn keep the existing policy and report EXEMPT', () => {
  for (const [over, reason] of [
    [{ mode: 'SAFE_RECOVERY_ONLY' }, 'SAFE_RECOVERY_ONLY'],
    [{ pendingInteractionActive: true }, 'PENDING_INTERACTION'],
    [{ sourcePropertyId: null }, 'NO_PROPERTY'],
  ]) {
    assert.equal(resolveExactFourExemption(ctx(over)), reason);
    const list = [mk('PROFILE_GAP'), mk('HOME_OPPORTUNITY'), mk('EXACT_RECORD')];
    const eligibility = ctx(over);
    const exact = selectExactFourSuggestedNextActions({ nominations: new Map([['t', list]]), eligibility, actionableCompleteness: 0.1 });
    const existing = selectSuggestedNextActions({ nominations: new Map([['t', list]]), eligibility });
    assert.deepEqual(exact.exactFour, { policyVersion: registry.SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION, applicability: 'EXEMPT', exemptReason: reason });
    assert.deepEqual(exact.selected.map((e) => e.candidate.label), existing.selected.map((e) => e.candidate.label));
    assert.ok(exact.selected.length < 4 || reason === undefined, 'exempt states are never padded to four');
  }
});

test('a normal property-scoped answer is not exempt', () => {
  assert.equal(resolveExactFourExemption(ctx()), null);
});

// ---- selection order -----------------------------------------------------------------------------------------------------

test('below 90%: current work, urgent work and the exact record come first, then profile gaps fill the rest', () => {
  const result = run([
    named('gap-a', 'PROFILE_GAP'), named('gap-b', 'PROFILE_GAP'), named('gap-c', 'PROFILE_GAP'),
    named('record', 'EXACT_RECORD'), named('urgent', 'URGENT_WORK'), named('continue', 'CONTINUE_WORK'),
  ]);
  assert.deepEqual(labels(result).slice(0, 3), ['continue', 'urgent', 'record']);
  assert.equal(result.selected.length, 4);
  assert.equal(result.exactFour.shortage, 0);
  assert.deepEqual(result.exactFour.selectedBySlot, { CONTINUE_WORK: 1, URGENT_WORK: 1, EXACT_RECORD: 1, PROFILE_GAP: 1 });
});

test('below 90% (acceptance example): three profile gaps plus one strongly relevant opportunity', () => {
  const result = run([
    named('system-fact', 'PROFILE_GAP', { signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 3, sourceConfidence: 0.5 } }),
    named('safety-fact', 'PROFILE_GAP', { signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 2, sourceConfidence: 0.5 } }),
    named('mortgage-fact', 'PROFILE_GAP'),
    named('low-gap', 'PROFILE_GAP', { signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0.5 } }),
    named('opportunity', 'HOME_OPPORTUNITY', { signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: true, materiality: 1, sourceConfidence: 0.9 } }),
  ]);
  assert.deepEqual(labels(result), ['system-fact', 'safety-fact', 'mortgage-fact', 'opportunity']);
  assert.equal(result.exactFour.opportunityReserved, true);
  assert.equal(result.exactFour.belowCompletenessThreshold, true);
});

test('below 90%: a weak opportunity does not displace profile capture; no reserve when only one position is open', () => {
  const weak = run([named('g1', 'PROFILE_GAP'), named('g2', 'PROFILE_GAP'), named('g3', 'PROFILE_GAP'), named('g4', 'PROFILE_GAP'), named('weak-opp', 'HOME_OPPORTUNITY')]);
  assert.deepEqual([...labels(weak)].sort(), ['g1', 'g2', 'g3', 'g4']);
  assert.equal(weak.exactFour.opportunityReserved, false);
  const strong = { signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: true, materiality: 1, sourceConfidence: 0.5 } };
  const oneOpen = run([named('c1', 'CONTINUE_WORK'), named('u1', 'URGENT_WORK'), named('r1', 'EXACT_RECORD'), named('g1', 'PROFILE_GAP'), named('opp', 'HOME_OPPORTUNITY', strong)]);
  assert.deepEqual(labels(oneOpen), ['c1', 'u1', 'r1', 'g1']);
  assert.equal(oneOpen.exactFour.opportunityReserved, false);
});

test('below 90%: if the reserved opportunity or gaps run short the other fills the position', () => {
  const result = run([named('only-gap', 'PROFILE_GAP'), named('opp-a', 'HOME_OPPORTUNITY'), named('cap-b', 'GOVERNED_CAPABILITY'), named('starter', 'CURATED_STARTER')]);
  assert.deepEqual(labels(result), ['only-gap', 'opp-a', 'starter']);
  assert.equal(result.exactFour.shortage, 1);
});

test('at or above 90%: opportunities and capabilities outrank profile gaps; stronger current work still leads', () => {
  const result = run([
    named('gap', 'PROFILE_GAP'), named('cap', 'GOVERNED_CAPABILITY', { source: 'CAPABILITY_RECOMMENDATION' }), named('opp', 'HOME_OPPORTUNITY'), named('record', 'EXACT_RECORD'),
    named('record-2', 'EXACT_RECORD'),
  ], { actionableCompleteness: 0.95 });
  assert.deepEqual([...labels(result).slice(0, 2)].sort(), ['record', 'record-2']);
  assert.deepEqual(labels(result).slice(2), ['opp', 'gap']); // the second unrelated opportunity (cap) is dropped by the one-unrelated cap
  assert.equal(result.exactFour.belowCompletenessThreshold, false);
});

test('exactly 90% counts as at-threshold, not below', () => {
  const result = run([named('gap', 'PROFILE_GAP'), named('opp', 'HOME_OPPORTUNITY')], { actionableCompleteness: 0.9 });
  assert.deepEqual(labels(result), ['opp', 'gap']);
});

test('unknown completeness fails profile-first, is reported even on a full row, and is named on a shortage', () => {
  const gaps = [named('g1', 'PROFILE_GAP'), named('g2', 'PROFILE_GAP'), named('g3', 'PROFILE_GAP'), named('g4', 'PROFILE_GAP')];
  const weakOpp = named('opp', 'HOME_OPPORTUNITY');
  const full = run([...gaps, weakOpp], { actionableCompleteness: null });
  assert.deepEqual([...labels(full)].sort(), ['g1', 'g2', 'g3', 'g4']);
  assert.equal(full.exactFour.belowCompletenessThreshold, true);
  assert.equal(full.exactFour.completenessUnknown, true);
  assert.equal(exactFourOutcome(full.exactFour).result, 'FULL');
  assert.ok(exactFourOutcome(full.exactFour).reasons.includes('COMPLETENESS_UNKNOWN'));
  const known = run([...gaps, weakOpp], { actionableCompleteness: 0.95 });
  assert.equal(known.exactFour.completenessUnknown, false);
  assert.ok(labels(known).includes('opp'), 'a known complete home lets the opportunity lead the gaps');
  const short = run([named('gap', 'PROFILE_GAP')], { actionableCompleteness: null });
  assert.deepEqual(short.exactFour.shortageReasons, ['COMPLETENESS_UNKNOWN']);
});

// ---- opportunity discipline ----------------------------------------------------------------------------------------------

test('at most one opportunity unrelated to the current answer; the rest of the row comes from other sources', () => {
  const result = run([
    named('opp-1', 'HOME_OPPORTUNITY'), named('opp-2', 'HOME_OPPORTUNITY'), named('cap-1', 'GOVERNED_CAPABILITY'),
    named('gap-1', 'PROFILE_GAP'), named('starter-1', 'CURATED_STARTER'), named('starter-2', 'CURATED_STARTER'),
  ], { actionableCompleteness: 0.95 });
  const opportunities = result.selected.filter((e) => ['HOME_OPPORTUNITY', 'GOVERNED_CAPABILITY'].includes(e.candidate.slotClass));
  assert.equal(opportunities.length, 1);
  assert.equal(result.selected.length, 4);
});

test('opportunities owned by the current answer are not counted against the unrelated cap', () => {
  const owned = { signals: { exactEntityMatch: false, currentResultOwnership: true, activeGoalMatch: false, materiality: 1, sourceConfidence: 0.5 } };
  const result = run([named('own-1', 'HOME_OPPORTUNITY', owned), named('own-2', 'HOME_OPPORTUNITY', owned), named('own-3', 'HOME_OPPORTUNITY', owned), named('unrelated', 'HOME_OPPORTUNITY'), named('unrelated-2', 'GOVERNED_CAPABILITY')], { actionableCompleteness: 0.95 });
  assert.equal(result.selected.length, 4);
  assert.deepEqual([...labels(result)].sort(), ['own-1', 'own-2', 'own-3', 'unrelated']);
});

test('curated starters are used only when stronger inventories cannot reach four', () => {
  const full = run([named('a', 'EXACT_RECORD'), named('b', 'EXACT_RECORD'), named('c', 'PROFILE_GAP'), named('d', 'PROFILE_GAP'), named('starter', 'CURATED_STARTER')]);
  assert.ok(!labels(full).includes('starter'));
  const short = run([named('a', 'EXACT_RECORD'), named('starter', 'CURATED_STARTER'), named('starter-2', 'CURATED_STARTER')]);
  assert.equal(labels(short)[0], 'a');
  assert.deepEqual([...labels(short)].sort(), ['a', 'starter', 'starter-2']);
});

// ---- deduplication, cooldown, history ------------------------------------------------------------------------------------

test('a visible card/row action with the same semantic destination suppresses the compact candidate', () => {
  const duplicate = named('create-task', 'EXACT_RECORD');
  const others = [named('x1', 'PROFILE_GAP'), named('x2', 'PROFILE_GAP'), named('x3', 'PROFILE_GAP'), named('x4', 'PROFILE_GAP')];
  const key = suggestedNextActionSemanticKey(candidateIdentityFields(duplicate));
  const result = run([duplicate, ...others], { presentationIdentities: new Set([key]) });
  assert.ok(!labels(result).includes('create-task'));
  assert.equal(result.selected.length, 4);
  assert.equal(result.diagnostics.suppressedByPresentation, 1);
});

test('equivalent candidates are merged and fill one position', () => {
  const a = named('same', 'PROFILE_GAP');
  const b = { ...a, label: 'Same, different words', message: 'Different words' };
  const result = run([a, b]);
  assert.equal(result.selected.length, 1);
  assert.equal(result.diagnostics.duplicatesMerged, 1);
});

test('cooldown suppresses opportunity, profile, capability and starter candidates but never current work, urgent work or the exact record', () => {
  const list = [
    named('cont', 'CONTINUE_WORK'), named('urg', 'URGENT_WORK'), named('rec', 'EXACT_RECORD'), named('gap', 'PROFILE_GAP'),
    named('opp', 'HOME_OPPORTUNITY'), named('cap', 'GOVERNED_CAPABILITY'), named('start', 'CURATED_STARTER'),
  ];
  const cooldown = new Set(list.map(lcKey));
  const result = run(list, { cooldownLifecycleKeys: cooldown });
  assert.deepEqual(labels(result), ['cont', 'urg', 'rec']);
  assert.equal(result.diagnostics.rejections['COOLDOWN:SUPPRESSED'], 4);
  assert.deepEqual(result.exactFour.shortageReasons, ['COOLDOWN_SUPPRESSED']);
});

test('a cooled-down duplicate never shadows an equivalent exempt candidate', () => {
  const rec = named('record', 'EXACT_RECORD');
  const cooledTwin = { ...rec, label: 'Twin', message: 'Twin message', slotClass: 'HOME_OPPORTUNITY', tier: 'CONTINUE' };
  const cooldown = new Set([lcKey(rec)]);
  const result = run([cooledTwin, rec], { cooldownLifecycleKeys: cooldown });
  assert.deepEqual(labels(result), ['record']);
});

test('history suppression still applies: an already-completed outcome is not offered to fill a position', () => {
  const done = named('done', 'PROFILE_GAP');
  const hash = candidateSemanticKeyHash(SuggestedNextActionCandidateSchema.parse(done));
  const result = run([done, named('fresh', 'PROFILE_GAP')], { eligibility: { completedSemanticKeyHashes: new Set([hash]) } });
  assert.deepEqual(labels(result), ['fresh']);
  assert.deepEqual(result.exactFour.shortageReasons, ['INELIGIBLE']);
});

test('ineligible candidates are never used to pad', () => {
  const unregistered = named('bad', 'PROFILE_GAP', { outcomeKey: 'NOT_A_REAL_OUTCOME' });
  const staleEntity = named('stale', 'PROFILE_GAP', { entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: 'old' } });
  const result = run([unregistered, staleEntity, 'a string suggestion', { label: 'raw' }]);
  assert.equal(result.selected.length, 0);
  assert.equal(result.exactFour.shortage, 4);
  assert.deepEqual(result.exactFour.shortageReasons, ['INVALID_CANDIDATES', 'INELIGIBLE']);
});

// ---- diagnostics ---------------------------------------------------------------------------------------------------------

test('shortage diagnostics: bounded reasons in registry order, no candidate data', () => {
  const none = run([]);
  assert.equal(none.exactFour.shortage, 4);
  assert.deepEqual(none.exactFour.shortageReasons, ['NO_CANDIDATES']);
  const upstream = run([], { upstreamShortageReasons: ['CONTEXT_FAILED', 'PRODUCER_DROPPED'] });
  assert.deepEqual(upstream.exactFour.shortageReasons, ['NO_CANDIDATES', 'PRODUCER_DROPPED', 'CONTEXT_FAILED']);
  for (const reason of upstream.exactFour.shortageReasons) assert.ok(registry.EXACT_FOUR_SHORTAGE_REASONS.includes(reason));
  const capped = run([named('o1', 'HOME_OPPORTUNITY'), named('o2', 'HOME_OPPORTUNITY')], { actionableCompleteness: 0.95 });
  assert.deepEqual(capped.exactFour.shortageReasons, ['OPPORTUNITY_CAP']);
  assert.equal(JSON.stringify(none.exactFour).includes('Message'), false);
});

test('a full row reports no shortage and no reasons', () => {
  const result = run([named('a', 'EXACT_RECORD'), named('b', 'PROFILE_GAP'), named('c', 'PROFILE_GAP'), named('d', 'PROFILE_GAP')]);
  assert.equal(result.exactFour.shortage, 0);
  assert.deepEqual(result.exactFour.shortageReasons, []);
  assert.equal(exactFourOutcome(result.exactFour).result, 'FULL');
});

test('outcome mapping and metric recording: one outcome per execution, reasons counted separately', async () => {
  askSuggestedActionsExactFourTotal.reset();
  askSuggestedActionsExactFourReasonsTotal.reset();
  const full = run([named('a', 'EXACT_RECORD'), named('b', 'PROFILE_GAP'), named('c', 'PROFILE_GAP'), named('d', 'PROFILE_GAP')]);
  const degraded = run([], { upstreamShortageReasons: ['PRODUCER_DROPPED', 'CONTEXT_FAILED'] });
  const exempt = selectExactFourSuggestedNextActions({ nominations: new Map(), eligibility: ctx({ mode: 'SAFE_RECOVERY_ONLY' }), actionableCompleteness: 0.5 });
  assert.deepEqual(recordExactFourDiagnostics(full.exactFour), { result: 'FULL', reasons: [] });
  const sample = recordExactFourDiagnostics(degraded.exactFour);
  assert.equal(sample.result, 'DEGRADED');
  assert.deepEqual(sample.reasons.sort(), ['CONTEXT_FAILED', 'NO_CANDIDATES', 'PRODUCER_DROPPED']);
  assert.deepEqual(recordExactFourDiagnostics(exempt.exactFour), { result: 'EXEMPT', reasons: ['SAFE_RECOVERY_ONLY'] });
  const totals = (await askSuggestedActionsExactFourTotal.get()).values;
  const total = (result) => totals.find((v) => v.labels.result === result)?.value;
  assert.equal(total('FULL'), 1);
  assert.equal(total('DEGRADED'), 1, 'one degraded execution is one increment even with three reasons');
  assert.equal(total('EXEMPT'), 1);
  const reasons = (await askSuggestedActionsExactFourReasonsTotal.get()).values;
  assert.equal(reasons.filter((v) => v.labels.result === 'DEGRADED').length, 3);
  assert.equal(reasons.filter((v) => v.labels.result === 'FULL').length, 0);
});

// ---- review findings: server-owned grants, why-now, completeness --------------------------------------------------------

test('a producer cannot self-promote into a protected slot: an ungranted class is demoted, counted and cooldown-eligible', () => {
  const grants = { 'test.producer': { allowed: new Set(['HOME_OPPORTUNITY', 'PROFILE_GAP']), fallback: 'HOME_OPPORTUNITY' } };
  const liar = named('self-urgent', 'URGENT_WORK', { source: 'CAPABILITY_RECOMMENDATION', tier: 'CONTINUE', traits: { recovery: false, promotional: false, continuesPending: true } });
  const honest = named('real-gap', 'PROFILE_GAP');
  const result = run([liar, honest], { slotGrants: grants, actionableCompleteness: 0.95 });
  assert.equal(result.exactFour.slotClassDenied, 1);
  assert.equal(result.exactFour.selectedBySlot.URGENT_WORK, undefined);
  assert.equal(result.exactFour.selectedBySlot.HOME_OPPORTUNITY, 1);
  // Demoted, so it is an ordinary opportunity: cooldown applies and the unrelated-opportunity cap counts it.
  const cooldown = new Set([lcKey(liar)]);
  const cooled = run([liar, honest], { slotGrants: grants, cooldownLifecycleKeys: cooldown, actionableCompleteness: 0.95 });
  assert.deepEqual(labels(cooled), ['real-gap']);
  const second = named('second-opp', 'HOME_OPPORTUNITY');
  const capped = run([liar, second], { slotGrants: grants, actionableCompleteness: 0.95 });
  assert.equal(capped.selected.length, 1);
  assert.equal(exactFourOutcome(result.exactFour).reasons.includes('SLOT_CLASS_DENIED'), true);
});

test('tier, trait and source claims cannot promote either: they only choose among the classes the producer is granted', () => {
  const grants = { 'test.producer': { allowed: new Set(['HOME_OPPORTUNITY']), fallback: 'HOME_OPPORTUNITY' } };
  const claims = [
    named('tier-claim', 'HOME_OPPORTUNITY', { slotClass: undefined, tier: 'CONTINUE', source: 'OPERATION_RESULT' }),
    named('pending-claim', 'HOME_OPPORTUNITY', { slotClass: undefined, source: 'PENDING_WORK' }),
    named('entity-claim', 'HOME_OPPORTUNITY', { slotClass: undefined, source: 'ENTITY_ACTION', tier: 'RECORD_ACTION' }),
  ];
  const result = run(claims, { slotGrants: grants, actionableCompleteness: 0.95 });
  assert.equal(result.exactFour.slotClassDenied, 3);
  assert.equal(result.selected.length, 1, 'all three demoted to opportunities, so the one-unrelated cap applies');
});

test('production grants: the result producer may continue and fix records but not claim urgent work or starters; unknown producers are opportunities only', () => {
  const result = registry.PRODUCER_SLOT_GRANTS['operation-result.candidates'];
  assert.deepEqual([...result.allowed].sort(), ['CONTINUE_WORK', 'EXACT_RECORD', 'HOME_OPPORTUNITY']);
  assert.equal(result.mayClaimCurrentResultOwnership, true);
  assert.notEqual(result.mayClaimActiveGoalMatch, true, 'the result producer has no goal source');
  assert.equal(result.ownershipRequiresRegisteredRelationship, true, 'a shared transport producer needs a registered relationship, not a blanket grant');
  const probe = (producerId, slotClass) => registry.resolveGrantedSlotClass({ slotClass, source: 'OPERATION_RESULT', tier: 'RELATED', traits: { continuesPending: false }, entityContext: { entityId: null } }, producerId);
  assert.deepEqual(probe('operation-result.candidates', 'EXACT_RECORD'), { slotClass: 'EXACT_RECORD', denied: false });
  assert.deepEqual(probe('operation-result.candidates', 'URGENT_WORK'), { slotClass: 'HOME_OPPORTUNITY', denied: true });
  assert.deepEqual(probe('operation-result.candidates', 'CURATED_STARTER'), { slotClass: 'HOME_OPPORTUNITY', denied: true });
  assert.deepEqual(probe('made.up.producer', 'EXACT_RECORD'), { slotClass: 'HOME_OPPORTUNITY', denied: true });
  assert.deepEqual(probe(undefined, 'PROFILE_GAP'), { slotClass: 'HOME_OPPORTUNITY', denied: true });
});

test('confidence alone never reserves the opportunity slot; a contextual signal does, and confidence only qualifies it', () => {
  const gaps = [named('g1', 'PROFILE_GAP'), named('g2', 'PROFILE_GAP'), named('g3', 'PROFILE_GAP'), named('g4', 'PROFILE_GAP')];
  const signals = (over) => ({ signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 1, sourceConfidence: 0.99, ...over } });
  const confidentOnly = run([...gaps, named('opp', 'HOME_OPPORTUNITY', signals({}))]);
  assert.equal(confidentOnly.exactFour.opportunityReserved, false);
  assert.ok(!labels(confidentOnly).includes('opp'));
  const lowConfidenceGoal = run([...gaps, named('opp', 'HOME_OPPORTUNITY', signals({ activeGoalMatch: true, sourceConfidence: 0.2 }))]);
  assert.equal(lowConfidenceGoal.exactFour.opportunityReserved, false, 'a signal below the confidence qualifier is not strong');
  for (const [name, over, extra] of [['goal', { activeGoalMatch: true }, {}], ['owned', { currentResultOwnership: true }, {}], ['whyNow', {}, { reasonCodes: ['WHY_NOW_TEST_SIGNAL'] }]]) {
    const result = run([...gaps, named('opp', 'HOME_OPPORTUNITY', { ...signals(over), ...extra })], { whyNowReasons: new Set(['WHY_NOW_TEST_SIGNAL']) });
    assert.equal(result.exactFour.opportunityReserved, true, name);
    assert.ok(labels(result).includes('opp'), name);
  }
  const unregisteredReason = run([...gaps, named('opp', 'HOME_OPPORTUNITY', { ...signals({}), reasonCodes: ['WHY_NOW_TEST_SIGNAL'] })]);
  assert.equal(unregisteredReason.exactFour.opportunityReserved, false, 'only registered why-now tokens count');
  assert.deepEqual([...registry.REGISTERED_WHY_NOW_REASONS].sort(), [
    'WHY_NOW_CAPITAL_ITEMS_UPCOMING', 'WHY_NOW_OPEN_FINDINGS', 'WHY_NOW_WARRANTY_EXPIRING',
  ]);
});

// ---- determinism ---------------------------------------------------------------------------------------------------------

test('selection is deterministic regardless of nomination order', () => {
  const list = [
    named('c1', 'CONTINUE_WORK'), named('g1', 'PROFILE_GAP'), named('g2', 'PROFILE_GAP', { signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 3, sourceConfidence: 0.5 } }),
    named('g3', 'PROFILE_GAP'), named('o1', 'HOME_OPPORTUNITY', { signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: true, materiality: 1, sourceConfidence: 0.9 } }),
  ];
  const forward = labels(run(list));
  assert.deepEqual(labels(run([...list].reverse())), forward);
  assert.deepEqual(labels(run([list[3], list[0], list[4], list[2], list[1]])), forward);
});

test('the existing at-most-four policy is unchanged by the pool extraction', () => {
  const list = [named('a', 'EXACT_RECORD', { tier: 'RECORD_ACTION' }), named('b', 'PROFILE_GAP')];
  const result = selectSuggestedNextActions({ nominations: new Map([['t', list]]), eligibility: ctx() });
  assert.deepEqual(result.selected.map((e) => e.candidate.label), ['a', 'b']);
  assert.ok(result.selected.length <= 4);
});

test('producer identity is the nominations key and is not part of the candidate contract', () => {
  const grants = {
    'privileged.producer': { allowed: new Set(['URGENT_WORK', 'EXACT_RECORD', 'HOME_OPPORTUNITY']), fallback: 'HOME_OPPORTUNITY' },
    'plain.producer': { allowed: new Set(['HOME_OPPORTUNITY']), fallback: 'HOME_OPPORTUNITY' },
  };
  const urgent = named('urgent', 'URGENT_WORK');
  const input = (key, list) => ({ slotGrants: grants, nominations: new Map([[key, list]]), eligibility: ctx(), actionableCompleteness: 0.95 });
  // The same candidate is demoted under an unprivileged key and keeps its class under the privileged one: the grant follows the key.
  const demoted = selectExactFourSuggestedNextActions(input('plain.producer', [urgent]));
  assert.equal(demoted.exactFour.slotClassDenied, 1);
  assert.equal(demoted.exactFour.selectedBySlot.URGENT_WORK, undefined);
  assert.equal(demoted.selected[0].producerId, 'plain.producer');
  const kept = selectExactFourSuggestedNextActions(input('privileged.producer', [urgent]));
  assert.equal(kept.exactFour.slotClassDenied, 0);
  assert.equal(kept.exactFour.selectedBySlot.URGENT_WORK, 1);
  assert.equal(kept.selected[0].producerId, 'privileged.producer');
  // A candidate that tries to name a producer is not a valid candidate at all (strict schema), so it can never claim a grant.
  assert.equal(SuggestedNextActionCandidateSchema.safeParse({ ...urgent, producerId: 'privileged.producer' }).success, false);
  assert.equal('producerId' in SuggestedNextActionCandidateSchema.shape, false);
  const forged = selectExactFourSuggestedNextActions(input('plain.producer', [{ ...urgent, producerId: 'privileged.producer' }]));
  assert.equal(forged.selected.length, 0);
  assert.equal(forged.diagnostics.invalidCandidates, 1);
  // Cooldown exemption also follows the key.
  const cooled = (key) => selectExactFourSuggestedNextActions({ ...input(key, [urgent]), cooldownLifecycleKeys: new Set([lcKey(urgent)]) });
  assert.equal(cooled('plain.producer').selected.length, 0);
  assert.equal(cooled('privileged.producer').selected.length, 1);
  // The legacy at-most-four policy carries the same bound identity.
  const legacy = selectSuggestedNextActions({ nominations: new Map([['plain.producer', [urgent]]]), eligibility: ctx() });
  assert.equal(legacy.selected[0].producerId, 'plain.producer');
});

// ---- review: ownership/goal are producer claims; completion applies to every class; starter rotation --------------------------------

const claim = (over) => ({ signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 1, sourceConfidence: 0.9, ...over } });
const noClaims = { 'test.producer': { allowed: new Set(ALL), fallback: 'HOME_OPPORTUNITY' } };

test('ownership and goal claims count only when the producer grant allows them; a denied claim is cleared and counted', () => {
  const gaps = [named('g1', 'PROFILE_GAP'), named('g2', 'PROFILE_GAP'), named('g3', 'PROFILE_GAP'), named('g4', 'PROFILE_GAP')];
  for (const [label, over] of [['ownership', { currentResultOwnership: true }], ['goal', { activeGoalMatch: true }]]) {
    // No grant: the claim is cleared, so the opportunity is not strong and does not take the reserved slot.
    const denied = run([...gaps, named('opp', 'HOME_OPPORTUNITY', claim(over))], { slotGrants: noClaims });
    assert.equal(denied.exactFour.signalClaimsDenied, 1, label);
    assert.equal(denied.exactFour.opportunityReserved, false, label);
    assert.ok(!labels(denied).includes('opp'), label);
    assert.ok(exactFourOutcome(denied.exactFour).reasons.includes('SIGNAL_CLAIM_DENIED'), label);
    // Granted: honored.
    const granted = run([...gaps, named('opp', 'HOME_OPPORTUNITY', claim(over))]);
    assert.equal(granted.exactFour.signalClaimsDenied, 0, label);
    assert.equal(granted.exactFour.opportunityReserved, true, label);
  }
});

test('a denied ownership claim cannot dodge the unrelated-opportunity cap, and the evaluated output says so (lifecycle input)', () => {
  const owned = claim({ currentResultOwnership: true });
  const list = [named('o1', 'HOME_OPPORTUNITY', owned), named('o2', 'HOME_OPPORTUNITY', owned), named('o3', 'HOME_OPPORTUNITY', owned)];
  const withGrant = run(list, { actionableCompleteness: 0.95 });
  assert.equal(withGrant.selected.length, 3, 'granted ownership is uncapped');
  assert.ok(withGrant.evaluated.every((entry) => entry.currentResultOwnership === true));
  const without = run(list, { slotGrants: noClaims, actionableCompleteness: 0.95 });
  assert.equal(without.selected.length, 1, 'ungranted claims are cleared, so the one-unrelated cap applies');
  assert.equal(without.exactFour.signalClaimsDenied, 3);
  assert.equal(without.evaluated.length, without.selected.length, 'evaluated is aligned with selected');
  assert.equal(without.evaluated[0].currentResultOwnership, false, 'the lifecycle gets the evaluated value, not the raw claim');
  assert.equal(without.selected[0].candidate.signals.currentResultOwnership, true, 'the raw candidate claim is untouched');
});

test('completed outcomes are suppressed in EVERY class (offer cooldown still spares the exempt ones)', () => {
  const list = [named('cont', 'CONTINUE_WORK'), named('urg', 'URGENT_WORK'), named('rec', 'EXACT_RECORD'), named('gap', 'PROFILE_GAP'), named('opp', 'HOME_OPPORTUNITY'), named('start', 'CURATED_STARTER')];
  const keys = new Set(list.map(lcKey));
  const cooled = run(list, { cooldownLifecycleKeys: keys, actionableCompleteness: 0.5 });
  assert.deepEqual([...labels(cooled)].sort(), ['cont', 'rec', 'urg'], 'cooldown spares exempt classes only');
  const completed = run(list, { completedLifecycleKeys: keys, actionableCompleteness: 0.5 });
  assert.equal(completed.selected.length, 0, 'completion suppresses all seven, including urgent work and the exact record');
  assert.equal(completed.diagnostics.rejections['COMPLETED:SUPPRESSED'], 6);
  assert.deepEqual(completed.exactFour.shortageReasons, ['COOLDOWN_SUPPRESSED']);
});

test('curated starter rotation is soft: least recently offered first, never offered before stale before recent, and the oldest still fills the row', () => {
  const NOW_MS = Date.parse('2026-10-04T12:00:00Z');
  const D = 24 * 3600 * 1000;
  const starters = ['s-never', 's-old', 's-mid', 's-recent'].map((id) => named(id, 'CURATED_STARTER'));
  const offered = new Map([[lcKey(starters[1]), NOW_MS - 20 * D], [lcKey(starters[2]), NOW_MS - 8 * D], [lcKey(starters[3]), NOW_MS - 1 * D]]);
  const need2 = run([named('rec', 'EXACT_RECORD'), named('gap', 'PROFILE_GAP'), ...starters], { starterLastOfferedAtMs: offered, rotationNowMs: NOW_MS });
  assert.deepEqual(labels(need2).slice(2), ['s-never', 's-old'], 'never offered, then the least recently offered');
  assert.equal(need2.exactFour.startersWithinRotationWindow, 0, 'enough starters outside the 7-day window');
  const need4 = run(starters, { starterLastOfferedAtMs: offered, rotationNowMs: NOW_MS });
  assert.deepEqual(labels(need4), ['s-never', 's-old', 's-mid', 's-recent'], 'a recently offered starter still fills the row rather than creating a shortage');
  assert.equal(need4.exactFour.shortage, 0);
  assert.equal(need4.exactFour.startersWithinRotationWindow, 1, 'the one inside the window is reported');
  const same = run(starters, {});
  assert.equal(same.selected.length, 4, 'without rotation data the shared deterministic order applies');
});

// ---- review: ownership needs a registered relationship, not a shared-producer grant ------------------------------------------------

const fs = require('node:fs');
const nodePath = require('node:path');
const { SUGGESTED_ACTION_OUTCOMES } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

test('result-producer ownership holds only when the TRUSTED current operation owns the outcome; a handler-set sourceOperationId is not proof', () => {
  const gaps = [named('g1', 'PROFILE_GAP'), named('g2', 'PROFILE_GAP'), named('g3', 'PROFILE_GAP'), named('g4', 'PROFILE_GAP')];
  const brand = (over = {}) => named('brand', 'EXACT_RECORD', {
    source: 'OPERATION_RESULT', sourceOperationId: 'INVENTORY_ITEM_CORRECT', operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey: 'ADD_BRAND',
    entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: 'v1' }, ...claim({ currentResultOwnership: true }), ...over,
  });
  // Production grants (no override): the shared producer id.
  const real = (candidates, currentOperationId) => selectExactFourSuggestedNextActions({
    nominations: new Map([['operation-result.candidates', candidates]]), eligibility: ctx(), actionableCompleteness: 0.95, currentOperationId,
  });
  const owned = real([brand()], 'INVENTORY_ITEM_CORRECT');
  assert.equal(owned.exactFour.signalClaimsDenied, 0);
  assert.equal(owned.evaluated[0].currentResultOwnership, true);
  const owned2 = real([brand()], 'INVENTORY_ITEM_CREATE');
  assert.equal(owned2.evaluated[0].currentResultOwnership, true, 'creating an item also owns its missing-detail follow-ups');
  for (const [label, op] of [['unrelated operation', 'WARRANTY_CORRECT'], ['no trusted operation', null], ['undefined', undefined], ['lookalike', 'INVENTORY_ITEM_CORRECT_X']]) {
    const denied = real([brand()], op);
    assert.equal(denied.exactFour.signalClaimsDenied, 1, label);
    assert.equal(denied.evaluated[0].currentResultOwnership, false, label);
  }
  // The candidate's own sourceOperationId (handler-controlled) claims the right operation, but the trusted one decides.
  const forged = real([brand({ sourceOperationId: 'INVENTORY_ITEM_CORRECT' })], 'ROOM_CREATE');
  assert.equal(forged.evaluated[0].currentResultOwnership, false);
  // A denied claim loses every benefit: it counts against the one-unrelated cap and cannot take the reserved slot.
  const opp = (id) => named(id, 'HOME_OPPORTUNITY', { source: 'OPERATION_RESULT', ...claim({ currentResultOwnership: true }) });
  const two = real([opp('o1'), opp('o2')], 'WARRANTY_CORRECT');
  assert.equal(two.selected.length, 1, 'ungranted ownership is capped as an unrelated opportunity');
  const reserved = selectExactFourSuggestedNextActions({
    nominations: new Map([['operation-result.candidates', [opp('strong')]], ['x', gaps]]), eligibility: ctx(), actionableCompleteness: 0.5, currentOperationId: 'WARRANTY_CORRECT',
    slotGrants: { 'operation-result.candidates': { allowed: new Set(['HOME_OPPORTUNITY']), fallback: 'HOME_OPPORTUNITY', mayClaimCurrentResultOwnership: true, ownershipRequiresRegisteredRelationship: true }, x: { allowed: new Set(ALL), fallback: 'PROFILE_GAP' } },
  });
  assert.equal(reserved.exactFour.opportunityReserved, false, 'a denied ownership claim cannot reserve the opportunity slot');
});

test('ownership relationships: every owned outcome is a registered outcome of an operation that exists, and every source operation is a real handler call site', () => {
  const handlerSource = ['inventory', 'homeRecordWrites', 'maintenance', 'warranties', 'recordConfirm', 'captureConfirm']
    .map((name) => fs.readFileSync(nodePath.join(__dirname, `../../src/services/ask/handlers/${name}.handler.ts`), 'utf8')).join('\n');
  const PLATFORM_RECOVERY = new Set(['MAINTENANCE_TASK_CREATE', 'REFINANCE_RATE_MONITOR', 'QUOTE_COMPARISON_CREATE', 'INVENTORY_LOOKUP']);
  for (const [sourceOperation, owned] of Object.entries(registry.RESULT_OWNERSHIP_RELATIONSHIPS)) {
    assert.ok(sourceOperation in ASK_OPERATION_DEFINITIONS, `${sourceOperation} is a registered operation`);
    assert.ok(owned.length > 0);
    for (const entry of owned) {
      const [operationId, outcomeKey] = entry.split(':');
      assert.ok(operationId in ASK_OPERATION_DEFINITIONS, `${entry}: target operation exists`);
      assert.ok((SUGGESTED_ACTION_OUTCOMES[operationId] ?? []).includes(outcomeKey), `${entry} is a registered outcome`);
    }
    if (!PLATFORM_RECOVERY.has(sourceOperation)) assert.ok(handlerSource.includes(`sourceOperationId: '${sourceOperation}'`), `${sourceOperation} is a real handler call site`);
  }
  assert.equal(registry.currentOperationOwnsOutcome('INVENTORY_ITEM_CORRECT', { operationId: 'HOME_EVENT_CORRECT', outcomeKey: 'ADD_AMOUNT' }), false);
  assert.equal(registry.currentOperationOwnsOutcome('HOME_EVENT_CORRECT', { operationId: 'HOME_EVENT_CORRECT', outcomeKey: 'ADD_AMOUNT' }), true);
  assert.equal(registry.currentOperationOwnsOutcome('MADE_UP_OPERATION', { operationId: 'HOME_EVENT_CORRECT', outcomeKey: 'ADD_AMOUNT' }), false);
});

test('the real handler candidate builders satisfy the relationship registry for the operations that call them (no legitimate ownership is lost)', () => {
  const { inventoryMissingDetailCandidates, roomAddItemCandidates } = require('../../src/services/ask/handlers/inventory.handler.ts');
  const item = { id: 'item-1', name: 'Dishwasher', updatedAt: new Date('2026-10-04T00:00:00Z') };
  const missing = inventoryMissingDetailCandidates(item, { propertyId: 'prop-1', sourceOperationId: 'INVENTORY_ITEM_CORRECT' });
  assert.ok(missing.length > 0);
  for (const candidate of missing) {
    assert.equal(candidate.signals.currentResultOwnership, true);
    for (const op of ['INVENTORY_ITEM_CORRECT', 'INVENTORY_ITEM_CREATE']) assert.equal(registry.currentOperationOwnsOutcome(op, candidate), true, `${op} owns ${candidate.outcomeKey}`);
  }
  const rooms = roomAddItemCandidates({ id: 'room-1', name: 'Kitchen', updatedAt: new Date() }, { propertyId: 'prop-1', sourceOperationId: 'ROOM_CREATE' });
  for (const candidate of rooms) for (const op of ['ROOM_CREATE', 'ROOM_RENAME']) assert.equal(registry.currentOperationOwnsOutcome(op, candidate), true, `${op} owns ${candidate.outcomeKey}`);
});
