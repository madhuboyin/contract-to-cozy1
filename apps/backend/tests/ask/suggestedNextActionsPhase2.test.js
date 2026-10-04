const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

const { SuggestedNextActionSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const registry = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { SuggestedNextActionCandidateSchema, materializeSuggestedNextAction, suggestedActionExpiry } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { evaluateSuggestedNextActionEligibility, ELIGIBILITY_RULE_ORDER } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');
const { scoreSuggestedNextActionCandidate, compareRanked } = require('../../src/services/ask/suggestedActions/suggestedNextActionRanking.ts');
const { deduplicateSuggestedNextActions } = require('../../src/services/ask/suggestedActions/suggestedNextActionDeduplication.ts');
const { selectSuggestedNextActions } = require('../../src/services/ask/suggestedActions/suggestedNextActionPolicy.ts');
const { finalizeSuggestedNextActionsWithReport, resolveSuggestedNextActionMode } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { resultCandidatesProducer } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');
const { collectPresentationIdentities } = require('../../src/services/ask/suggestedActions/suggestedNextActionPresentationIdentities.ts');
const { suggestedNextActionSemanticKey, suggestedNextActionSemanticKeyHash, deriveSuggestedNextActionId } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { registerSuggestedNextActionEntityValidator, resetSuggestedNextActionEntityValidatorsForTests } = require('../../src/services/ask/suggestedActions/suggestedNextActionEntityValidators.ts');
const { INVENTORY_CORRECTION_FIELDS, inventoryItemContextVersion } = require('../../src/services/ask/handlers/inventory.handler.ts');
const { roomContextVersion, homeEventContextVersion, warrantyContextVersion } = require('../../src/services/ask/handlers/homeRecordWrites.handler.ts');
const { maintenanceTaskVersion } = require('../../src/services/ask/handlers/maintenance.handler.ts');
const { radarStateContextVersion } = require('../../src/services/ask/handlers/homeEventRadar.handler.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Phase 2: registry, candidates, eligibility, ranking, deduplication, finalizer.

const NOW = new Date('2026-10-04T12:00:00.000Z');
const clock = fixedSuggestedNextActionClock(NOW);

const candidate = (over = {}) => ({
  producerId: 'test.producer', source: 'MISSING_DETAIL', sourceOperationId: 'INVENTORY_LOOKUP',
  label: 'Add the microwave brand', message: 'What brand is the microwave?',
  operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', outcomeKey: 'ADD_BRAND',
  entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: 'v1' },
  tier: 'RECORD_ACTION', requiredFacts: [], reasonCodes: ['FIELD_INCOMPLETE'],
  signals: { exactEntityMatch: true, currentResultOwnership: true, activeGoalMatch: false, materiality: 2, sourceConfidence: 0.8 },
  traits: { recovery: false, promotional: false, continuesPending: false },
  ...over,
});

function ctx(over = {}) {
  return {
    mode: 'NORMAL', sourcePropertyId: 'prop-1',
    operationAvailability: new Map([['INVENTORY_ITEM_CORRECT', null], ['CAPTURE_FACT_CONFIRM', null], ['HOME_ACTIONS', null]]),
    operationRequiresProperty: () => true,
    operationTargetEntityType: (op) => (op === 'INVENTORY_ITEM_CORRECT' ? 'INVENTORY_ITEM' : null),
    entities: new Map([['INVENTORY_ITEM:item-1', { exists: true, propertyId: 'prop-1', currentContextVersion: 'v1' }]]),
    validatedEntityTypes: new Set(['INVENTORY_ITEM']),
    pendingInteractionActive: false,
    completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(), messageKey: (m) => m.toLowerCase(), currentOutcomeKeyHashes: new Set(),
    ...over,
  };
}
const verdict = (c, over) => evaluateSuggestedNextActionEligibility(c, ctx(over));

// ---- registry --------------------------------------------------------------------------------------------------------

test('the registry validates: tiers cannot overlap after bounded adjustments, outcomes and capture mappings are consistent', () => {
  assert.deepEqual(registry.validateSuggestedNextActionRegistry(), []);
  const { TIER_BASE_SCORE: base } = registry;
  assert.ok(base.CONTINUE > base.RECORD_ACTION && base.RECORD_ACTION > base.RELATED && base.RELATED > base.DISCOVERY);
  assert.ok(base.DISCOVERY + registry.maxPositiveAdjustment() < base.RELATED + registry.maxNegativeAdjustment());
  assert.ok(base.RELATED + registry.maxPositiveAdjustment() < base.RECORD_ACTION + registry.maxNegativeAdjustment());
  assert.ok(base.RECORD_ACTION + registry.maxPositiveAdjustment() < base.CONTINUE + registry.maxNegativeAdjustment());
});

test('ranking policy constants are snapshot-pinned (change them deliberately, with the policy version)', () => {
  const snapshot = JSON.stringify({ v: registry.SUGGESTED_NEXT_ACTION_RANKING_POLICY_VERSION, tiers: registry.TIER_BASE_SCORE, w: registry.SCORE_WEIGHTS, min: registry.MIN_DISPLAY_SCORE, limits: registry.SUGGESTED_NEXT_ACTION_LIMITS, precedence: registry.SOURCE_PRECEDENCE, budget: registry.SUGGESTED_NEXT_ACTION_BUDGET, mode: registry.RANKING_MODE });
  assert.equal(createHash('sha256').update(snapshot).digest('hex').slice(0, 16), 'f593f954f4630f2c', `weights changed; bump SUGGESTED_NEXT_ACTION_RANKING_POLICY_VERSION and update this hash (got ${createHash('sha256').update(snapshot).digest('hex').slice(0, 16)})`);
});

test('every inventory missing-fact mapping resolves to a real correction field and the full correction field set is covered', () => {
  const mapped = registry.MISSING_FACT_CAPTURES.filter((m) => m.operationId === 'INVENTORY_ITEM_CORRECT').map((m) => m.capture.field).sort();
  assert.deepEqual(mapped, Object.keys(INVENTORY_CORRECTION_FIELDS).sort());
});

test('the freshness matrix names version helpers that still exist in the handlers (or an explicit requery rule)', () => {
  const exported = { inventoryItemContextVersion, roomContextVersion, maintenanceTaskVersion, warrantyContextVersion, homeEventContextVersion, radarStateContextVersion };
  for (const [entityType, strategy] of Object.entries(registry.DOMAIN_FRESHNESS_MATRIX)) {
    if (strategy.kind === 'REQUERY') { assert.ok(strategy.rule.length > 20, `${entityType} needs a stated requery rule`); continue; }
    if (strategy.versionFunction === 'inspectionFindingVersion') continue; // private to inspection.handler; matrix records the name
    assert.equal(typeof exported[strategy.versionFunction], 'function', `${entityType}: ${strategy.versionFunction} is not exported by its handler`);
  }
});

// ---- candidate -------------------------------------------------------------------------------------------------------

test('a candidate is schema-checked strictly and cannot declare its own state, score, id or expiry', () => {
  assert.ok(SuggestedNextActionCandidateSchema.safeParse(candidate()).success);
  for (const forged of [{ score: 9999 }, { id: 'v1.' + 'a'.repeat(32) }, { eligibility: { state: 'ELIGIBLE' } }, { expiresAt: '2030-01-01T00:00:00Z' }]) {
    assert.ok(!SuggestedNextActionCandidateSchema.safeParse(candidate(forged)).success, JSON.stringify(Object.keys(forged)));
  }
  assert.ok(!SuggestedNextActionCandidateSchema.safeParse(candidate({ outcomeKey: 'free text outcome' })).success);
});

test('materialization yields a contract-valid action with a deterministic id and registry TTL capped at the execution expiry', () => {
  const action = materializeSuggestedNextAction({ candidate: candidate(), sourceExecutionId: 'exec-1', eligibility: { state: 'ELIGIBLE', reasonCodes: [], missingFactKeys: [] }, score: 3500, now: NOW, executionExpiresAt: null });
  assert.ok(SuggestedNextActionSchema.safeParse(action).success);
  assert.equal(action.id, deriveSuggestedNextActionId('exec-1', { operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', outcomeKey: 'ADD_BRAND' }));
  assert.equal(action.expiresAt, new Date(NOW.getTime() + 30 * 60_000).toISOString(), 'MUTATE_RECORD default TTL');
  assert.equal(suggestedActionExpiry(candidate({ interactionType: 'CONVERSATION_CONTINUE' }), NOW, null).getTime(), NOW.getTime() + 24 * 3600_000);
  assert.equal(suggestedActionExpiry(candidate(), NOW, new Date(NOW.getTime() + 60_000)).getTime(), NOW.getTime() + 60_000, 'capped at the source execution expiry');
});

// ---- eligibility -----------------------------------------------------------------------------------------------------

test('a fully valid candidate is ELIGIBLE', () => {
  assert.deepEqual(verdict(candidate()), { state: 'ELIGIBLE', rule: null, reasonCodes: [], missingFactKeys: [] });
});

test('each rule fails with its own bounded reason code, in the plan order', () => {
  const op = (reason) => ({ operationAvailability: new Map([['INVENTORY_ITEM_CORRECT', reason]]) });
  const expect = (c, over, rule, code, state = 'UNAVAILABLE') => {
    const v = verdict(c, over);
    assert.equal(v.rule, rule); assert.equal(v.reasonCodes[0], code); assert.equal(v.state, state);
  };
  expect(candidate({ operationId: 'NOT_AN_OPERATION' }), {}, 'REGISTRY', 'OPERATION_NOT_REGISTERED');
  expect(candidate({ outcomeKey: 'ADD_UNICORN' }), {}, 'REGISTRY', 'OUTCOME_NOT_REGISTERED');
  expect(candidate(), op('BOUNDARY'), 'REGISTRY', 'OPERATION_IS_BOUNDARY');
  expect(candidate(), op('HEALTH'), 'HEALTH', 'OPERATION_UNHEALTHY');
  expect(candidate({ entityContext: { propertyId: null, entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: null } }), {}, 'PROPERTY_SCOPE', 'PROPERTY_REQUIRED');
  expect(candidate({ entityContext: { propertyId: 'prop-2', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: null } }), {}, 'PROPERTY_SCOPE', 'PROPERTY_MISMATCH');
  expect(candidate(), op('AUTHORIZATION'), 'AUTHORIZATION', 'ROLE_BELOW_FLOOR');
  expect(candidate(), op('AUDIENCE'), 'AUDIENCE', 'AUDIENCE_INAPPLICABLE');
  expect(candidate({ entityContext: { propertyId: 'prop-1', entityType: null, entityId: 'item-1', contextVersion: null } }), {}, 'ENTITY', 'ENTITY_TYPE_MISSING');
  expect(candidate({ entityContext: { propertyId: 'prop-1', entityType: 'ROOM', entityId: 'r1', contextVersion: null } }), {}, 'ENTITY', 'ENTITY_TYPE_UNSUPPORTED');
  expect(candidate(), { validatedEntityTypes: new Set() }, 'ENTITY', 'ENTITY_VALIDATOR_MISSING');
  expect(candidate(), { entities: new Map() }, 'ENTITY', 'ENTITY_NOT_FOUND');
  expect(candidate(), { entities: new Map([['INVENTORY_ITEM:item-1', { exists: false, propertyId: 'prop-1', currentContextVersion: 'v1' }]]) }, 'ENTITY', 'ENTITY_NOT_FOUND');
  expect(candidate(), { entities: new Map([['INVENTORY_ITEM:item-1', { exists: true, propertyId: 'prop-9', currentContextVersion: 'v1' }]]) }, 'ENTITY', 'ENTITY_PROPERTY_MISMATCH');
  expect(candidate({ entityContext: { propertyId: 'prop-1', entityType: null, entityId: null, contextVersion: null } }), {}, 'ENTITY', 'ENTITY_REQUIRED');
  expect(candidate(), { entities: new Map([['INVENTORY_ITEM:item-1', { exists: true, propertyId: 'prop-1', currentContextVersion: 'v2' }]]) }, 'FRESHNESS', 'CONTEXT_VERSION_STALE');
  expect(candidate({ requiredFacts: ['INVENTORY_ITEM_UNKNOWN_FACT'] }), {}, 'CONTEXT_READINESS', 'MISSING_FACT_WITHOUT_CAPTURE');
  expect(candidate({ requiredFacts: ['INVENTORY_ITEM_MODEL'] }), {}, 'CONTEXT_READINESS', 'MISSING_FACT_WITHOUT_CAPTURE'); // mapped to ADD_MODEL, candidate says ADD_BRAND
  expect(candidate(), { pendingInteractionActive: true }, 'INTERACTION_CONFLICT', 'PENDING_INTERACTION_ACTIVE', 'SUPPRESSED');
  expect(candidate(), { completedSemanticKeyHashes: new Set([suggestedNextActionSemanticKeyHash({ operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', outcomeKey: 'ADD_BRAND' })]) }, 'HISTORY', 'EQUIVALENT_COMPLETED', 'SUPPRESSED');
  expect(candidate(), { askedMessageKeys: new Set(['what brand is the microwave?']) }, 'HISTORY', 'EQUIVALENT_PROMPT_ASKED', 'SUPPRESSED');
  expect(candidate(), { mode: 'SAFE_RECOVERY_ONLY' }, 'SAFETY_BOUNDARY', 'SAFE_RECOVERY_ONLY', 'SUPPRESSED');
  assert.deepEqual(ELIGIBILITY_RULE_ORDER, ['REGISTRY', 'HEALTH', 'PROPERTY_SCOPE', 'AUTHORIZATION', 'AUDIENCE', 'ENTITY', 'FRESHNESS', 'CONTEXT_READINESS', 'INTERACTION_CONFLICT', 'HISTORY', 'SAFETY_BOUNDARY']);
});

test('an earlier rule wins when several would fail (order is part of the contract)', () => {
  const v = verdict(candidate({ entityContext: { propertyId: 'prop-2', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: 'stale' } }), { operationAvailability: new Map([['INVENTORY_ITEM_CORRECT', 'AUTHORIZATION']]), pendingInteractionActive: true });
  assert.equal(v.rule, 'PROPERTY_SCOPE');
});

test('NEEDS_CONTEXT only when every missing fact resolves through the registered mapping to this action\'s own operation and outcome', () => {
  const v = verdict(candidate({ requiredFacts: ['INVENTORY_ITEM_BRAND'] }));
  assert.equal(v.state, 'NEEDS_CONTEXT');
  assert.deepEqual(v.missingFactKeys, ['INVENTORY_ITEM_BRAND']);
});

test('an open interaction suppresses everything except an action that explicitly continues it', () => {
  assert.equal(verdict(candidate({ traits: { recovery: false, promotional: false, continuesPending: true } }), { pendingInteractionActive: true }).state, 'ELIGIBLE');
});

test('SAFE_RECOVERY_ONLY keeps only recovery, non-promotional candidates', () => {
  const safe = candidate({ traits: { recovery: true, promotional: false, continuesPending: false } });
  assert.equal(verdict(safe, { mode: 'SAFE_RECOVERY_ONLY' }).state, 'ELIGIBLE');
  assert.equal(verdict(candidate({ traits: { recovery: true, promotional: true, continuesPending: false } }), { mode: 'SAFE_RECOVERY_ONLY' }).state, 'SUPPRESSED');
});

test('the evaluator does not mutate the candidate or the context', () => {
  const c = candidate(); const x = ctx(); const before = JSON.stringify([c, [...x.entities]]);
  evaluateSuggestedNextActionEligibility(c, x);
  assert.equal(JSON.stringify([c, [...x.entities]]), before);
});

// ---- ranking ---------------------------------------------------------------------------------------------------------

test('WEIGHTED mode: tier order always holds regardless of signals: continuation > record action > related > discovery', () => {
  const best = { exactEntityMatch: true, currentResultOwnership: true, activeGoalMatch: true, materiality: 3, sourceConfidence: 1 };
  const worst = { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0 };
  const score = (tier, signals, extra = {}) => scoreSuggestedNextActionCandidate({ candidate: candidate({ tier, signals }), ready: true, mode: 'WEIGHTED', ...extra });
  const hardest = (tier) => ({ high: score(tier, best), low: score(tier, worst, { recentlyDone: true, repeatsAlreadyChosen: 9, ready: false }) });
  assert.ok(hardest('RECORD_ACTION').low > hardest('RELATED').high);
  assert.ok(hardest('CONTINUE').low > hardest('RECORD_ACTION').high);
  assert.ok(hardest('RELATED').low > hardest('DISCOVERY').high);
});

test('WEIGHTED mode: exact entity beats a generic domain action within a tier; ties break by the documented sequence', () => {
  const exact = { candidate: candidate(), score: scoreSuggestedNextActionCandidate({ candidate: candidate(), ready: true, mode: 'WEIGHTED' }) };
  const genericCandidate = candidate({ signals: { exactEntityMatch: false, currentResultOwnership: true, activeGoalMatch: false, materiality: 2, sourceConfidence: 0.8 }, entityContext: { propertyId: 'prop-1', entityType: null, entityId: null, contextVersion: null } });
  const generic = { candidate: genericCandidate, score: scoreSuggestedNextActionCandidate({ candidate: genericCandidate, ready: true, mode: 'WEIGHTED' }) };
  assert.ok(compareRanked(exact, generic) < 0);
  const a = { candidate: candidate({ source: 'ENTITY_ACTION' }), score: 100 };
  const b = { candidate: candidate({ source: 'CAPABILITY_RECOMMENDATION' }), score: 100 };
  assert.ok(compareRanked(a, b) < 0, 'producer precedence breaks an exact tie');
  const c = { candidate: candidate({ outcomeKey: 'ADD_MODEL' }), score: 100 };
  const d = { candidate: candidate({ outcomeKey: 'ADD_BRAND' }), score: 100 };
  assert.ok(compareRanked(d, c) < 0, 'then outcomeKey');
  const e = { candidate: candidate({ entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-2', contextVersion: null } }), score: 100 };
  const f = { candidate: candidate({ entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: null } }), score: 100 };
  assert.ok(compareRanked(f, e) < 0, 'then entity id');
  assert.equal(compareRanked(a, a), 0);
});

test('shipping default is TIER_ONLY: signals do not change a candidate score, only the tier does', () => {
  assert.equal(registry.RANKING_MODE, 'TIER_ONLY');
  const rich = candidate({ signals: { exactEntityMatch: true, currentResultOwnership: true, activeGoalMatch: true, materiality: 3, sourceConfidence: 1 } });
  const bare = candidate({ signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0 } });
  assert.equal(scoreSuggestedNextActionCandidate({ candidate: rich, ready: true }), registry.TIER_BASE_SCORE.RECORD_ACTION);
  assert.equal(scoreSuggestedNextActionCandidate({ candidate: bare, ready: false, recentlyDone: true, repeatsAlreadyChosen: 9 }), registry.TIER_BASE_SCORE.RECORD_ACTION);
});

test('TIER_ONLY ordering: tier first, then the fixed tie-break sequence, identical on every run', () => {
  const lists = [
    withEntity(0, { tier: 'DISCOVERY', outcomeKey: 'ADD_NOTES' }), withEntity(1, { tier: 'RELATED', outcomeKey: 'ADD_SERIAL_NUMBER' }),
    withEntity(2, { tier: 'RECORD_ACTION', outcomeKey: 'ADD_MODEL' }), withEntity(3, { tier: 'RECORD_ACTION', outcomeKey: 'ADD_BRAND' }),
  ];
  const run = (list) => selectSuggestedNextActions({ nominations: nominations(list), eligibility: ctx({ entities: modelEntities(4) }) }).selected.map((s) => `${s.candidate.tier}:${s.candidate.outcomeKey}`);
  const expected = ['RECORD_ACTION:ADD_BRAND', 'RECORD_ACTION:ADD_MODEL', 'RELATED:ADD_SERIAL_NUMBER', 'DISCOVERY:ADD_NOTES'];
  assert.deepEqual(run(lists), expected, 'same tier orders by operationId, then outcomeKey');
  assert.deepEqual(run([...lists].reverse()), expected);
});

// ---- deduplication ---------------------------------------------------------------------------------------------------

test('semantic duplicates from different sources collapse to the single best winner and merge non-sensitive reason codes', () => {
  const strong = candidate({ source: 'ENTITY_ACTION', label: 'Add brand', message: 'Add the brand', reasonCodes: ['FROM_ITEM_ACTION'] });
  const weak = candidate({ source: 'CAPABILITY_RECOMMENDATION', label: 'Completely different wording', message: 'Other words entirely', reasonCodes: ['FROM_CAPABILITY'], signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0.1 } });
  const ranked = [strong, weak].map((c) => ({ candidate: c, score: scoreSuggestedNextActionCandidate({ candidate: c, ready: true }) }));
  const { winners } = deduplicateSuggestedNextActions(ranked);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].candidate.source, 'ENTITY_ACTION');
  assert.deepEqual(winners[0].mergedReasonCodes, ['FROM_CAPABILITY']);
  assert.equal(winners[0].duplicatesMerged, 1);
});

test('identical wording on different entities is NOT a duplicate', () => {
  const a = candidate(); const b = candidate({ entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-2', contextVersion: null } });
  const { winners } = deduplicateSuggestedNextActions([a, b].map((c) => ({ candidate: c, score: 3000 })));
  assert.equal(winners.length, 2);
});

test('a rich card action that declares the same registered identity suppresses the compact duplicate', () => {
  const blocks = [{ type: 'GROUPED_LIST', id: 'g', sections: [{ id: 's', items: [{ id: 'item-1', entityType: 'INVENTORY_ITEM', actions: [
    { id: 'a1', operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', outcomeKey: 'ADD_BRAND', label: 'x', message: 'y' },
    { id: 'a2', operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'NAVIGATE', outcomeKey: 'ADD_MODEL' },
    { id: 'a3', operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD' },
    { id: 'a4', operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', outcomeKey: 'ADD_UNICORN' },
  ] }] }] }];
  const identities = collectPresentationIdentities(blocks, 'prop-1');
  assert.deepEqual([...identities], [suggestedNextActionSemanticKey({ operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', outcomeKey: 'ADD_BRAND' })], 'only a registered outcome on a compact interaction publishes an identity; nothing is inferred from label/message');
  const dedup = deduplicateSuggestedNextActions([{ candidate: candidate(), score: 3000 }], identities);
  assert.equal(dedup.winners.length, 0);
  assert.equal(dedup.suppressedByPresentation, 1);
});

// ---- policy ----------------------------------------------------------------------------------------------------------

const nominations = (...lists) => new Map(lists.map((list, i) => [`producer-${i}`, list]));
const modelEntities = (n) => new Map(Array.from({ length: n }, (_, i) => [`INVENTORY_ITEM:item-${i}`, { exists: true, propertyId: 'prop-1', currentContextVersion: 'v1' }]));
const withEntity = (i, over = {}) => candidate({ entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: `item-${i}`, contextVersion: 'v1' }, ...over });

test('never more than four actions', () => {
  const many = Array.from({ length: 10 }, (_, i) => withEntity(i, { outcomeKey: ['ADD_BRAND', 'ADD_MODEL', 'ADD_SERIAL_NUMBER', 'ADD_NOTES', 'ADD_CATEGORY'][i % 5] }));
  const result = selectSuggestedNextActions({ nominations: nominations(many), eligibility: ctx({ entities: modelEntities(10) }) });
  assert.equal(result.selected.length, 4);
  assert.equal(result.diagnostics.droppedByLimit, 6, 'extras are counted, not silently kept');
});

test('WEIGHTED mode: a weak discovery candidate is omitted rather than used as filler; one with real signal is kept', () => {
  const discovery = (signals, over = {}) => candidate({
    tier: 'DISCOVERY', source: 'CAPABILITY_RECOMMENDATION', operationId: 'CAPTURE_FACT_CONFIRM', outcomeKey: 'CAPTURE_PROPERTY_FACT',
    entityContext: { propertyId: 'prop-1', entityType: null, entityId: null, contextVersion: null },
    signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0, ...signals }, ...over,
  });
  const run = (c, rankingMode = 'WEIGHTED') => selectSuggestedNextActions({ nominations: nominations([c]), eligibility: ctx({ operationTargetEntityType: () => null }), rankingMode });
  const weak = run(discovery({ sourceConfidence: 0 }));
  assert.equal(weak.selected.length, 0);
  assert.equal(weak.diagnostics.belowMinimumScore, 1);
  assert.equal(run(discovery({ sourceConfidence: 0.5 })).selected.length, 1);
  assert.equal(run(discovery({ sourceConfidence: 0, currentResultOwnership: true })).selected.length, 1);
  assert.equal(run(discovery({ sourceConfidence: 0 }), 'TIER_ONLY').selected.length, 1, 'tier-only ships with no minimum score');
});

test('semantically identical nominations collapse to one action', () => {
  const same = Array.from({ length: 5 }, (_, i) => withEntity(0, { outcomeKey: 'ADD_BRAND', reasonCodes: [`R${i}A`], label: `Label ${i}`, message: `Message ${i}?` }));
  const result = selectSuggestedNextActions({ nominations: nominations(same), eligibility: ctx({ entities: modelEntities(1) }) });
  assert.equal(result.selected.length, 1);
  assert.equal(result.diagnostics.duplicatesMerged, 4);
});

test('active continuation outranks record completion, which outranks related, which outranks discovery', () => {
  const cont = withEntity(0, { tier: 'CONTINUE', outcomeKey: 'ADD_BRAND', traits: { recovery: false, promotional: false, continuesPending: true } });
  const record = withEntity(1, { tier: 'RECORD_ACTION', outcomeKey: 'ADD_MODEL' });
  const related = withEntity(2, { tier: 'RELATED', outcomeKey: 'ADD_SERIAL_NUMBER' });
  const discovery = withEntity(3, { tier: 'DISCOVERY', outcomeKey: 'ADD_NOTES' });
  const result = selectSuggestedNextActions({ nominations: nominations([discovery, related, record, cont]), eligibility: ctx({ entities: modelEntities(4), pendingInteractionActive: true }) });
  assert.deepEqual(result.selected.map((s) => s.candidate.tier), ['CONTINUE']);
  const calm = selectSuggestedNextActions({ nominations: nominations([discovery, related, record, { ...cont, traits: { recovery: false, promotional: false, continuesPending: false } }]), eligibility: ctx({ entities: modelEntities(4) }) });
  assert.deepEqual(calm.selected.map((s) => s.candidate.tier), ['CONTINUE', 'RECORD_ACTION', 'RELATED', 'DISCOVERY']);
});

test('at most one DISCOVERY action survives when a stronger action exists', () => {
  const stronger = withEntity(0, { tier: 'RECORD_ACTION', outcomeKey: 'ADD_BRAND' });
  const discoveries = [1, 2, 3].map((i) => withEntity(i, { tier: 'DISCOVERY', outcomeKey: ['ADD_MODEL', 'ADD_SERIAL_NUMBER', 'ADD_NOTES'][i - 1] }));
  const result = selectSuggestedNextActions({ nominations: nominations([stronger, ...discoveries]), eligibility: ctx({ entities: modelEntities(4) }) });
  assert.equal(result.selected.filter((s) => s.candidate.tier === 'DISCOVERY').length, 1);
  assert.equal(result.diagnostics.droppedByDiscoveryReserve, 2);
  const onlyDiscovery = selectSuggestedNextActions({ nominations: nominations(discoveries), eligibility: ctx({ entities: modelEntities(4) }) });
  assert.equal(onlyDiscovery.selected.length, 3, 'with nothing stronger, discovery is not capped by the reserve');
});

test('WEIGHTED mode: a diversity penalty prefers a different destination over a fourth action on the same operation', () => {
  const sameOp = [0, 1, 2].map((i) => withEntity(i, { tier: 'RELATED', outcomeKey: ['ADD_BRAND', 'ADD_MODEL', 'ADD_SERIAL_NUMBER'][i], signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0.5 } }));
  const other = candidate({ tier: 'RELATED', operationId: 'CAPTURE_FACT_CONFIRM', outcomeKey: 'CAPTURE_PROPERTY_FACT', entityContext: { propertyId: 'prop-1', entityType: null, entityId: null, contextVersion: null }, signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0.5 } });
  const result = selectSuggestedNextActions({ nominations: nominations([...sameOp, other]), eligibility: ctx({ entities: modelEntities(3) }), rankingMode: 'WEIGHTED' });
  const order = result.selected.map((s) => s.candidate.operationId);
  assert.ok(order.indexOf('CAPTURE_FACT_CONFIRM') < order.lastIndexOf('INVENTORY_ITEM_CORRECT'), `diverse destination should not be last: ${order}`);
});

test('invalid, over-limit and ineligible nominations are counted, not silently kept', () => {
  const valid = Array.from({ length: 14 }, (_, i) => withEntity(i % 4, { outcomeKey: 'ADD_BRAND' }));
  const result = selectSuggestedNextActions({ nominations: nominations([...valid, { garbage: true }].slice(0, 15), [withEntity(0, { outcomeKey: 'ADD_UNICORN' })]), eligibility: ctx({ entities: modelEntities(4) }) });
  assert.equal(result.diagnostics.droppedOverProducerLimit, 3, '15 nominated, 12 allowed');
  assert.equal(result.diagnostics.invalidCandidates, 0, 'the garbage entry was beyond the producer limit');
  assert.equal(result.diagnostics.rejections['REGISTRY:OUTCOME_NOT_REGISTERED'], 1);
  const garbage = selectSuggestedNextActions({ nominations: nominations([{ garbage: true }, 42, null]), eligibility: ctx() });
  assert.equal(garbage.diagnostics.invalidCandidates, 3);
  assert.equal(garbage.selected.length, 0);
});

test('the total candidate cap holds across producers', () => {
  const lists = Array.from({ length: 8 }, (_, p) => Array.from({ length: 12 }, (_, i) => withEntity(i, { producerId: `test.p${p}` })));
  const result = selectSuggestedNextActions({ nominations: new Map(lists.map((l, i) => [`p${i}`, l])), eligibility: ctx({ entities: modelEntities(12) }) });
  assert.equal(result.diagnostics.droppedOverTotalLimit, 96 - 60);
});

test('deterministic inputs always produce the same order (shuffled nominations, repeated runs)', () => {
  const pool = [0, 1, 2, 3, 4, 5].map((i) => withEntity(i, { outcomeKey: ['ADD_BRAND', 'ADD_MODEL', 'ADD_SERIAL_NUMBER', 'ADD_NOTES', 'ADD_CATEGORY', 'ADD_NAME'][i], tier: ['RECORD_ACTION', 'RELATED'][i % 2] }));
  const run = (list) => selectSuggestedNextActions({ nominations: nominations(list), eligibility: ctx({ entities: modelEntities(6) }) }).selected.map((s) => `${s.candidate.outcomeKey}:${s.score}`);
  const baseline = run(pool);
  assert.deepEqual(run([...pool].reverse()), baseline);
  assert.deepEqual(run([pool[3], pool[0], pool[5], pool[1], pool[4], pool[2]]), baseline);
  assert.deepEqual(run(pool), baseline);
});

// ---- finalizer -------------------------------------------------------------------------------------------------------

const baseResult = (over = {}) => ({ status: 'ANSWERED', blocks: [], suggestions: ['A legacy string'], ...over });
const finalizeInput = (result, over = {}) => ({ result, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId: 'INVENTORY_LOOKUP', message: 'Show my inventory', ...over });
const availability = new Map([['INVENTORY_ITEM_CORRECT', null]]);
function deps(over = {}) {
  const calls = { availability: 0, expires: 0, validator: 0 };
  return {
    calls,
    deps: {
      clock,
      loadOperationAvailability: async () => { calls.availability += 1; return availability; },
      loadExecutionExpiresAt: async () => { calls.expires += 1; return new Date(NOW.getTime() + 10 * 24 * 3600_000); },
      entityValidatorFor: (type) => (type === 'INVENTORY_ITEM' ? async (ids) => { calls.validator += 1; return new Map(ids.map((id) => [id, { exists: true, propertyId: 'prop-1', currentContextVersion: 'v1' }])); } : undefined),
      ...over,
    },
  };
}

test('with nothing nominated the finalizer issues no reads at all and returns an empty ledger', async () => {
  const { calls, deps: d } = deps();
  const { result, report } = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult()), d);
  assert.deepEqual(result.suggestedNextActions, []);
  assert.deepEqual(result.suggestions, ['A legacy string'], 'legacy strings pass through untouched');
  assert.deepEqual(calls, { availability: 0, expires: 0, validator: 0 });
  assert.equal(report.diagnostics, null);
});

test('the history loader is only invoked once something has been nominated', async () => {
  let loads = 0;
  const loader = async () => { loads += 1; return new Set(); };
  await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult(), { completedSemanticKeyHashes: loader }), deps().deps);
  assert.equal(loads, 0);
  await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult({ suggestedNextActionCandidates: [candidate()] }), { completedSemanticKeyHashes: loader }), deps().deps);
  assert.equal(loads, 1);
});

test('handler-attached candidates become contract-valid actions with deterministic ids; the internal candidate field never survives', async () => {
  const { calls, deps: d } = deps();
  const input = finalizeInput(baseResult({ suggestedNextActionCandidates: [candidate(), candidate({ entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-2', contextVersion: 'v1' } })] }));
  const { result } = await finalizeSuggestedNextActionsWithReport(input, d);
  assert.equal(result.suggestedNextActionCandidates, undefined);
  assert.equal(result.suggestedNextActions.length, 2);
  for (const action of result.suggestedNextActions) {
    assert.ok(SuggestedNextActionSchema.safeParse(action).success);
    assert.equal(action.provenance.sourceExecutionId, 'exec-1');
  }
  assert.equal(calls.validator, 1, 'one batched validator call for the single entity type, not one per candidate');
  assert.equal(calls.availability, 1);
  assert.equal(calls.expires, 1);
  const again = await finalizeSuggestedNextActionsWithReport(input, deps().deps);
  assert.deepEqual(again.result.suggestedNextActions, result.suggestedNextActions, 'same inputs + clock -> identical ledger');
});

test('a handler cannot smuggle a final typed action: only the finalizer mints them', async () => {
  const forged = { ...candidate(), id: 'v1.' + 'f'.repeat(32), eligibility: { state: 'ELIGIBLE' }, priority: { tier: 'CONTINUE', score: 99999 } };
  const { result } = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult({ suggestedNextActions: [forged], suggestedNextActionCandidates: [] })), deps().deps);
  assert.deepEqual(result.suggestedNextActions, []);
});

test('a throwing producer is dropped and counted; the answer and the other producers survive', async () => {
  const boom = { id: 'boom.producer', source: 'OPERATION_RESULT', essential: true, nominate: () => { throw new Error('boom'); } };
  const fine = { id: 'fine.producer', source: 'OPERATION_RESULT', essential: true, nominate: () => [candidate()] };
  const { result, report } = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult()), { ...deps().deps, producers: [boom, fine] });
  assert.deepEqual(report.droppedProducers, [{ producer: 'boom.producer', reason: 'ERROR' }]);
  assert.equal(result.suggestedNextActions.length, 1);
  assert.equal(result.status, 'ANSWERED');
});

test('over budget, nonessential producers are dropped first and essential ones still run', async () => {
  let t = 0;
  const essential = { id: 'essential.producer', source: 'OPERATION_RESULT', essential: true, nominate: () => { t += registry.SUGGESTED_NEXT_ACTION_BUDGET.pipelineMs + 1; return [candidate()]; } };
  const optional = { id: 'optional.producer', source: 'OPERATION_RESULT', essential: false, nominate: () => [candidate({ outcomeKey: 'ADD_MODEL' })] };
  const { result, report } = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult()), { ...deps().deps, producers: [optional, essential], nowMs: () => t });
  assert.deepEqual(report.droppedProducers, [{ producer: 'optional.producer', reason: 'BUDGET' }]);
  assert.equal(result.suggestedNextActions.length, 1);
});

test('a failing context load ships the safe answer with no typed actions and never throws', async () => {
  const { result, report } = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult({ suggestedNextActionCandidates: [candidate()] })), { ...deps().deps, loadOperationAvailability: async () => { throw new Error('db down'); } });
  assert.deepEqual(result.suggestedNextActions, []);
  assert.equal(report.contextFailed, true);
  assert.equal(result.status, 'ANSWERED');
});

test('an entity type with no registered validator, or a validator that fails, fails closed', async () => {
  const noValidator = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult({ suggestedNextActionCandidates: [candidate()] })), { ...deps().deps, entityValidatorFor: () => undefined });
  assert.deepEqual(noValidator.result.suggestedNextActions, []);
  assert.equal(noValidator.report.diagnostics.rejections['ENTITY:ENTITY_VALIDATOR_MISSING'], 1);
  const failing = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult({ suggestedNextActionCandidates: [candidate()] })), { ...deps().deps, entityValidatorFor: () => async () => { throw new Error('x'); } });
  assert.deepEqual(failing.result.suggestedNextActions, []);
});

test('action expiry is capped at the source execution expiry; history and the asked prompt suppress equivalents', async () => {
  const short = { ...deps().deps, loadExecutionExpiresAt: async () => new Date(NOW.getTime() + 60_000) };
  const { result } = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult({ suggestedNextActionCandidates: [candidate()] })), short);
  assert.equal(result.suggestedNextActions[0].expiresAt, new Date(NOW.getTime() + 60_000).toISOString());
  const completed = new Set([suggestedNextActionSemanticKeyHash({ operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', outcomeKey: 'ADD_BRAND' })]);
  const suppressed = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult({ suggestedNextActionCandidates: [candidate()] }), { completedSemanticKeyHashes: completed }), deps().deps);
  assert.deepEqual(suppressed.result.suggestedNextActions, []);
  const asked = await finalizeSuggestedNextActionsWithReport(finalizeInput(baseResult({ suggestedNextActionCandidates: [candidate()] }), { message: 'What brand is the microwave?' }), deps().deps);
  assert.deepEqual(asked.result.suggestedNextActions, []);
});

test('a result with an open confirmation or clarification offers only actions that continue it', async () => {
  const open = baseResult({ status: 'NEEDS_CONFIRMATION', confirmation: { confirmationId: 'c' }, suggestedNextActionCandidates: [candidate(), candidate({ outcomeKey: 'ADD_MODEL', traits: { recovery: false, promotional: false, continuesPending: true } })] });
  const { result } = await finalizeSuggestedNextActionsWithReport(finalizeInput(open), deps().deps);
  assert.deepEqual(result.suggestedNextActions.map((a) => a.outcomeKey), ['ADD_MODEL']);
});

test('mode: emergency/restricted boundaries and recovery statuses are SAFE_RECOVERY_ONLY', () => {
  assert.equal(resolveSuggestedNextActionMode({ status: 'ANSWERED', blocks: [] }, 'INVENTORY_LOOKUP'), 'NORMAL');
  assert.equal(resolveSuggestedNextActionMode({ status: 'ANSWERED', blocks: [] }, 'EMERGENCY_BOUNDARY'), 'SAFE_RECOVERY_ONLY');
  assert.equal(resolveSuggestedNextActionMode({ status: 'ANSWERED', blocks: [{ type: 'BOUNDARY', id: 'b', severity: 'EMERGENCY' }] }, 'HOME_ACTIONS'), 'SAFE_RECOVERY_ONLY');
  for (const status of ['UNAVAILABLE', 'EXPIRED', 'CANCELLED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'BLOCKED', 'NEEDS_PROPERTY']) assert.equal(resolveSuggestedNextActionMode({ status, blocks: [] }, null), 'SAFE_RECOVERY_ONLY', status);
  assert.equal(resolveSuggestedNextActionMode({ status: 'ANSWERED', blocks: [] }, null), 'NORMAL');
});

// ---- producers -------------------------------------------------------------------------------------------------------

test('the only producer passes handler-attached candidates through, and nothing else nominates', () => {
  assert.deepEqual(resultCandidatesProducer.nominate({ result: baseResult(), executionId: 'e', sourceOperationId: null, propertyId: null, message: 'm' }), []);
  assert.deepEqual(resultCandidatesProducer.nominate({ result: baseResult({ suggestedNextActionCandidates: [candidate()] }), executionId: 'e', sourceOperationId: null, propertyId: null, message: 'm' }).length, 1);
  assert.equal(require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts').SUGGESTED_NEXT_ACTION_PRODUCERS.length, 1);
});

test('entity types without a registered validator fail closed; only migrated domains have one', () => {
  const { getSuggestedNextActionEntityValidator } = require('../../src/services/ask/suggestedActions/suggestedNextActionEntityValidators.ts');
  require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
  assert.equal(typeof getSuggestedNextActionEntityValidator('INVENTORY_ITEM'), 'function', 'inventory is converted');
  assert.equal(typeof getSuggestedNextActionEntityValidator('INVENTORY_ROOM'), 'function', 'rooms are converted');
  assert.equal(typeof getSuggestedNextActionEntityValidator('MAINTENANCE_TASK'), 'function', 'maintenance is converted');
  assert.equal(typeof getSuggestedNextActionEntityValidator('WARRANTY'), 'function', 'warranties are converted');
  assert.equal(typeof getSuggestedNextActionEntityValidator('HOME_EVENT'), 'function', 'home events are converted');
  for (const unconverted of ['CLAIM']) assert.equal(getSuggestedNextActionEntityValidator(unconverted), undefined, unconverted);
  resetSuggestedNextActionEntityValidatorsForTests();
  assert.equal(getSuggestedNextActionEntityValidator('INVENTORY_ITEM'), undefined);
  registerSuggestedNextActionEntityValidator('INVENTORY_ITEM', async () => new Map());
  assert.equal(typeof getSuggestedNextActionEntityValidator('INVENTORY_ITEM'), 'function');
  resetSuggestedNextActionEntityValidatorsForTests();
});
