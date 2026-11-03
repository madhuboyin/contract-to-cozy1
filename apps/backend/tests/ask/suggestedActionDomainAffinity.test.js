require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const affinity = require('../../src/services/ask/suggestedActions/suggestedActionDomainAffinity.ts');
const { selectExactFourSuggestedNextActions } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourPolicy.ts');
const registry = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { PROFILE_AREAS, PROFILE_AREA_OUTCOMES } = require('../../src/services/ask/suggestedActions/actionableProfileRegistry.ts');
const starters = require('../../src/services/ask/suggestedActions/starterCandidates.ts');

// Exact-four ordering (Change 2): domain affinity is a tiebreaker below materiality (profile), ownership/goal (opportunity) and
// rotation (starter). Pure policy tests over the real candidate shapes; no database, no handlers.

const PROPERTY = 'prop-1';
const NOW = Date.UTC(2026, 10, 2);
const noEntity = { propertyId: PROPERTY, entityType: null, entityId: null, contextVersion: null };
const signals = (over = {}) => ({ exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 2, sourceConfidence: 1, ...over });
const traits = { recovery: false, promotional: false, continuesPending: false };

const profile = (area, over = {}) => ({
  source: 'MISSING_DETAIL', sourceOperationId: null, label: `capture ${area}`, message: `Capture ${area} details`,
  operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', interactionType: 'START_WORKFLOW', outcomeKey: PROFILE_AREA_OUTCOMES[area],
  entityContext: noEntity, tier: 'DISCOVERY', slotClass: 'PROFILE_GAP', requiredFacts: [], reasonCodes: ['PROFILE_TEST'], signals: signals(), traits, ...over,
});
const OPPORTUNITIES = {
  capital: { operationId: 'CAPITAL_RESERVE_PLAN', outcomeKey: 'REVIEW_CAPITAL_OUTLOOK', label: 'capital', message: 'Show my capital reserve plan.' },
  warranty: { operationId: 'WARRANTY_LOOKUP', outcomeKey: 'REVIEW_EXPIRING_WARRANTIES', label: 'warranty', message: 'Show warranties expiring soon.' },
  inspection: { operationId: 'INSPECTION_FINDINGS', outcomeKey: 'REVIEW_OPEN_FINDINGS', label: 'inspection', message: 'Show my open inspection findings.' },
};
const opportunity = (name, over = {}) => ({
  source: 'PLATFORM_STATE', sourceOperationId: null, interactionType: 'CONVERSATION_CONTINUE', entityContext: noEntity, tier: 'DISCOVERY',
  slotClass: 'HOME_OPPORTUNITY', requiredFacts: [], reasonCodes: ['OPPORTUNITY_TEST'], signals: signals(), traits, ...OPPORTUNITIES[name], ...over,
});

const eligibility = (operationIds) => ({
  mode: 'NORMAL', sourcePropertyId: PROPERTY,
  operationAvailability: new Map(operationIds.map((id) => [id, null])),
  operationRequiresProperty: () => true, operationTargetEntityType: () => null,
  entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false,
  completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(), messageKey: (m) => m.toLowerCase(), currentOutcomeKeyHashes: new Set(),
});
const GRANT_ALL = { 'test.producer': { allowed: new Set(registry.SUGGESTED_NEXT_ACTION_SLOT_CLASSES), fallback: 'HOME_OPPORTUNITY', mayClaimCurrentResultOwnership: true, mayClaimActiveGoalMatch: true } };
const run = (list, currentOperationId, over = {}) => selectExactFourSuggestedNextActions({
  slotGrants: GRANT_ALL, nominations: new Map([['test.producer', list]]), actionableCompleteness: 0.5, currentOperationId, rotationNowMs: NOW,
  eligibility: eligibility([...new Set(list.map((candidate) => candidate.operationId))]), ...over,
});
const outcomes = (result) => result.selected.map((entry) => entry.candidate.outcomeKey);
const lifecycleKeyOf = (c) => registry.lifecycleKey({ operationId: c.operationId, outcomeKey: c.outcomeKey, entityType: null, entityId: null });

// ---- registry integrity ------------------------------------------------------------------------------------------------------

test('affinity registry: only registered operations, no LOCATION mapping, and every real candidate destination has a domain', () => {
  for (const operationId of Object.keys(affinity.OPERATION_DOMAINS)) assert.ok(ASK_OPERATION_DEFINITIONS[operationId], `${operationId} is not a registered operation`);
  for (const domain of Object.values(affinity.OPERATION_DOMAINS)) assert.ok(affinity.SUGGESTED_ACTION_DOMAINS.includes(domain));
  for (const [area, domains] of Object.entries(affinity.PROFILE_AREA_DOMAINS)) {
    assert.ok(PROFILE_AREAS.includes(area));
    assert.ok(domains.length > 0 && domains.every((domain) => affinity.SUGGESTED_ACTION_DOMAINS.includes(domain)));
  }
  assert.equal(affinity.PROFILE_AREA_DOMAINS.LOCATION, undefined, 'LOCATION is an unresolved registry asymmetry: no affinity is invented');
  const destinations = [...Object.values(OPPORTUNITIES).map((entry) => entry.operationId), 'SEASONAL_HOME_CARE', 'HOME_BASICS_GUIDE', 'HIRING_GUIDE', 'PROPERTY_SUMMARY'];
  for (const operationId of destinations) assert.ok(affinity.OPERATION_DOMAINS[operationId], `${operationId} has no domain`);
});

test('domainAffinity: unknown or missing current operation earns nothing, and LOCATION never matches', () => {
  assert.equal(affinity.domainAffinity(null, opportunity('warranty')), 0);
  assert.equal(affinity.domainAffinity('NOT_A_REAL_OPERATION', opportunity('warranty')), 0);
  assert.equal(affinity.domainAffinity('HOME_ACTIONS', opportunity('warranty')), 0, 'an unmapped current operation has no domain');
  assert.equal(affinity.domainAffinity('WARRANTY_UPDATE', opportunity('warranty')), 1);
  for (const current of ['MAINTENANCE_STATUS', 'INSPECTION_REPORTS', 'WARRANTY_UPDATE', 'CAPITAL_RESERVE_PLAN', 'RECALL_REVIEW', 'PROPERTY_SUMMARY', 'SEASONAL_HOME_CARE', 'HIRING_GUIDE']) {
    assert.equal(affinity.domainAffinity(current, profile('LOCATION')), 0, `LOCATION must not match from ${current}`);
  }
});

// ---- PROFILE_GAP: materiality -> affinity -> deterministic fallback -------------------------------------------------------------

test('PROFILE_GAP: equal materiality is ordered by affinity to the current operation, then deterministically', () => {
  const list = [profile('CORE'), profile('EXTERIOR'), profile('STRUCTURE')];
  assert.deepEqual(outcomes(run(list, 'MAINTENANCE_STATUS')), ['CAPTURE_EXTERIOR_DETAILS', 'CAPTURE_STRUCTURE_DETAILS', 'CAPTURE_CORE_DETAILS']);
  assert.deepEqual(outcomes(run(list, 'PROPERTY_SUMMARY')), ['CAPTURE_CORE_DETAILS', 'CAPTURE_EXTERIOR_DETAILS', 'CAPTURE_STRUCTURE_DETAILS']);
  // Unmapped current operation: the same order as no current operation at all (the shared deterministic order, outcome key ascending).
  const fallback = ['CAPTURE_CORE_DETAILS', 'CAPTURE_EXTERIOR_DETAILS', 'CAPTURE_STRUCTURE_DETAILS'];
  assert.deepEqual(outcomes(run(list, 'HOME_ACTIONS')), fallback);
  assert.deepEqual(outcomes(run(list, null)), fallback);
});

test('PROFILE_GAP: materiality always outranks affinity', () => {
  const list = [profile('EXTERIOR'), profile('CORE', { signals: signals({ materiality: 3 }) })];
  assert.deepEqual(outcomes(run(list, 'MAINTENANCE_STATUS')), ['CAPTURE_CORE_DETAILS', 'CAPTURE_EXTERIOR_DETAILS']);
});

test('PROFILE_GAP: LOCATION gains no affinity and sorts only by the deterministic fallback', () => {
  const list = [profile('STRUCTURE'), profile('LOCATION')];
  // LOCATION sorts after... by outcome key it precedes STRUCTURE; a maintenance context promotes STRUCTURE (affinity) but never LOCATION.
  assert.deepEqual(outcomes(run(list, 'HOME_ACTIONS')), ['CAPTURE_LOCATION_DETAILS', 'CAPTURE_STRUCTURE_DETAILS']);
  assert.deepEqual(outcomes(run(list, 'MAINTENANCE_STATUS')), ['CAPTURE_STRUCTURE_DETAILS', 'CAPTURE_LOCATION_DETAILS']);
});

// ---- HOME_OPPORTUNITY: ownership -> goal -> affinity -> materiality -> fallback -------------------------------------------------

test('HOME_OPPORTUNITY: affinity orders the three real candidates; an unmapped current operation keeps the deterministic order', () => {
  const list = [opportunity('capital'), opportunity('warranty'), opportunity('inspection')];
  // The unrelated-opportunity cap admits one, so the first-sorted candidate is the one selected.
  assert.deepEqual(outcomes(run(list, 'WARRANTY_UPDATE')), ['REVIEW_EXPIRING_WARRANTIES']);
  assert.deepEqual(outcomes(run(list, 'INSPECTION_REPORTS')), ['REVIEW_OPEN_FINDINGS']);
  assert.deepEqual(outcomes(run(list, 'REFINANCE_ANALYSIS')), ['REVIEW_CAPITAL_OUTLOOK']);
  assert.deepEqual(outcomes(run(list, 'HOME_ACTIONS')), ['REVIEW_CAPITAL_OUTLOOK']);
  assert.deepEqual(outcomes(run(list, null)), ['REVIEW_CAPITAL_OUTLOOK']);
});

test('HOME_OPPORTUNITY: granted ownership, then granted goal, outrank affinity; a denied claim does not', () => {
  // An owned candidate is not an "unrelated opportunity", so the cap admits both; the ORDER is what is asserted.
  const first = (list, current, over) => outcomes(run(list, current, over))[0];
  const list = (over) => [opportunity('capital', over), opportunity('warranty')];
  assert.equal(first(list({ signals: signals({ currentResultOwnership: true }) }), 'WARRANTY_UPDATE'), 'REVIEW_CAPITAL_OUTLOOK');
  assert.equal(first(list({ signals: signals({ activeGoalMatch: true }) }), 'WARRANTY_UPDATE'), 'REVIEW_CAPITAL_OUTLOOK');
  const denied = { 'test.producer': { ...GRANT_ALL['test.producer'], mayClaimCurrentResultOwnership: false } };
  assert.equal(first(list({ signals: signals({ currentResultOwnership: true }) }), 'WARRANTY_UPDATE', { slotGrants: denied }), 'REVIEW_EXPIRING_WARRANTIES',
    'a claim the producer grant denies is cleared and must not reorder');
  // Ownership outranks goal.
  const both = [opportunity('capital', { signals: signals({ activeGoalMatch: true }) }), opportunity('warranty', { signals: signals({ currentResultOwnership: true }) })];
  assert.equal(first(both, 'INSPECTION_REPORTS'), 'REVIEW_EXPIRING_WARRANTIES');
});

// ---- CURATED_STARTER: rotation -> affinity -> fallback ------------------------------------------------------------------------

const allStarters = () => [
  ...starters.seasonalHomeCareStarters(PROPERTY), ...starters.homeBasicsStarters(PROPERTY),
  ...starters.hiringGuideStarters(PROPERTY), ...starters.propertySummaryStarters(PROPERTY),
];
const starterRun = (currentOperationId, lastOffered = new Map()) => run(allStarters(), currentOperationId, { starterLastOfferedAtMs: lastOffered });

test('CURATED_STARTER: the seven real outcomes are all nominated and affinity breaks equal-rotation ties', () => {
  assert.equal(allStarters().length, 7);
  const seasonal = ['REVIEW_THIS_SEASON', 'PREPARE_NEXT_SEASON'];
  assert.deepEqual(new Set(outcomes(starterRun('SEASONAL_ITEM_COMMAND')).slice(0, 2)), new Set(seasonal));
  const record = outcomes(starterRun('HOME_RECORD_EXPORT')).slice(0, 2);
  assert.deepEqual(new Set(record), new Set(['REVIEW_HOME_SUMMARY', 'REVIEW_COMPLETENESS']));
  const guidance = outcomes(starterRun('GROUNDED_GUIDANCE')).slice(0, 3);
  assert.deepEqual(new Set(guidance), new Set(['REVIEW_SAFETY_BASICS', 'REVIEW_MONTHLY_ROUTINE', 'REVIEW_HIRING_CHECKLIST']));
});

test('CURATED_STARTER: an unmapped current operation keeps the deterministic order', () => {
  assert.deepEqual(outcomes(starterRun('HOME_ACTIONS')), outcomes(starterRun(null)));
});

test('CURATED_STARTER: least-recently-offered rotation outranks affinity', () => {
  const lastOffered = new Map(starters.seasonalHomeCareStarters(PROPERTY).map((candidate) => [lifecycleKeyOf(candidate), NOW - 1000]));
  const chosen = outcomes(starterRun('SEASONAL_ITEM_COMMAND', lastOffered));
  assert.ok(!chosen.includes('REVIEW_THIS_SEASON') && !chosen.includes('PREPARE_NEXT_SEASON'),
    'recently offered seasonal starters rotate out even though the current operation is seasonal');
});
