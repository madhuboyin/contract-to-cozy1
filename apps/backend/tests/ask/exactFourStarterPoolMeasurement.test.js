const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { evaluateAskOperationAvailability } = require('../../src/services/ask/support/answerGuards.ts');
const { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskAudiencePolicy } = require('../../src/services/ask/askAudiencePolicy.ts');
const { requiredAskTargetEntity } = require('../../src/services/ask/askEntityResolution.ts');
const { suggestionKey } = require('../../src/services/ask/askSuggestionPolicy.ts');
const outcomes = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { SUGGESTED_NEXT_ACTION_LIMITS } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { selectExactFourSuggestedNextActions } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourPolicy.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');
const { collectPresentationIdentities } = require('../../src/services/ask/suggestedActions/suggestedNextActionPresentationIdentities.ts');
const { suggestedNextActionSemanticKey, suggestedNextActionSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');

// ASK_COZY_EXACT_FOUR_OPPORTUNITY_INVENTORY section 4a: an ARITHMETIC MEASUREMENT of how many deterministic starters the exact-four row
// needs. It is NOT the activation gate. It runs the REAL availability function, eligibility rules and exact-four policy over role x
// operating mode x (one disabled operation) x prompt-history removals x (the current answer's outcome), with starters registered
// provisionally inside the test and removed afterward; production registries are untouched.
//
// A starter is an (operation, outcome, message) SPEC, so one operation can supply several starters. A disabled operation removes ALL of
// its starters at once; prompt history and the current outcome remove starters individually, and the adversarial choice is disjoint from the
// disabled group (the worst case).
//
// What it covers: operation availability, the prompt-history window, the current answer's outcome, and, by construction, a DROPPED
// opportunity producer (the row is built from starters alone, so urgent work, continuation, profile gaps and opportunities are all
// absent: the worst case).
//
// What it does NOT cover, and the activation gate must (see the inventory, section 4b):
//   - empty versus minimally seeded home data, and whether each starter really returns content there (readiness is an INPUT here: the
//     pool is assumed dependable, not measured);
//   - real producers and real handler results (so presentation identities from real blocks, and real message-routable current answers);
//   - actual cooldown, dismissal and lifecycle states (nothing here loads lifecycle rows);
//   - each starter's real content.

const PROPERTY = 'prop-1';
const HISTORY_WINDOW = 5;

// Real all-mode, VIEWER-floor, STANDARD-safety, read-only operations: the pool the hypothetical "dependable" starters come from.
const STRUCTURAL_POOL = Object.values(ASK_OPERATION_DEFINITIONS)
  .filter((d) => d.propertyRoleFloor === 'VIEWER' && d.safetyClass === 'STANDARD' && (d.family === 'RECORD_QUERY' || d.family === 'STATUS_SUMMARY') && d.requiresProperty)
  .filter((d) => { const p = getAskAudiencePolicy(d.operationId); return p && p.eligibleOperatingModes.length === 4 && p.unknownModeBehavior === 'ALLOW_GENERAL'; })
  .map((d) => d.operationId)
  // Hypothetical starters come only from operations with NO real outcome entry: the harness never touches a real entry (registerProvisional), so a
  // real starter source (SEASONAL_HOME_CARE, HOME_BASICS_GUIDE) or any operation with registered outcomes would be an unregistered, ineligible starter here.
  .sort();
const POOL_OPERATIONS = STRUCTURAL_POOL.filter((operationId) => !outcomes.SUGGESTED_ACTION_OUTCOMES[operationId]);

const outcomeFor = (operationId) => `OPEN_${operationId}`.slice(0, 79);
const messageFor = (operationId) => `Show me ${operationId.toLowerCase().replace(/_/g, ' ')}`;
/** One starter. `variant` makes a second, distinct starter (outcome and message) on the SAME operation, e.g. PROPERTY_SUMMARY's completeness focus. */
const REAL_PROPERTY_SUMMARY = {
  null: { outcomeKey: 'REVIEW_HOME_SUMMARY', message: 'Give me a summary of my home record' },
  REVIEW_COMPLETENESS: { outcomeKey: 'REVIEW_COMPLETENESS', message: 'How complete is my home record?' },
};
// PROPERTY_SUMMARY now has REAL registered starter outcomes (D-O4); the harness uses them rather than provisional ones.
const spec = (operationId, variant = null) => operationId === 'PROPERTY_SUMMARY' ? { operationId, ...REAL_PROPERTY_SUMMARY[variant] } : ({
  operationId,
  outcomeKey: variant ? `${variant}_${operationId}`.slice(0, 79) : outcomeFor(operationId),
  message: variant ? `${messageFor(operationId)} (${variant.toLowerCase().replace(/_/g, ' ')})` : messageFor(operationId),
});
const specKey = (starter) => `${starter.operationId}:${starter.outcomeKey}`;

/** `size` distinct-operation starters, from the real pool. */
const singletonPool = (size) => POOL_OPERATIONS.slice(0, size).map((op) => spec(op));
/** `size` starters where PROPERTY_SUMMARY supplies TWO (summary and completeness focus) and the rest are distinct operations. */
const groupedPool = (size) => [spec('PROPERTY_SUMMARY'), spec('PROPERTY_SUMMARY', 'REVIEW_COMPLETENESS'), ...POOL_OPERATIONS.filter((op) => op !== 'PROPERTY_SUMMARY').slice(0, size - 2).map((op) => spec(op))];

function registerProvisional(starters, { repeatable = false, promptHistoryExempt = false } = {}) {
  // Tracks exactly what THIS call added, so nested registrations cannot remove each other's entries.
  const added = [];
  for (const starter of starters) {
    const { operationId: op, outcomeKey } = starter;
    const existing = outcomes.SUGGESTED_ACTION_OUTCOMES[op];
    const record = { starter, outcome: false, repeatable: false, exempt: false };
    const real = Boolean(existing && !existing.__provisional); // a REAL outcome list is never edited, but the exemption and repeatable flags still apply to it
    if (real) { /* registered outcome already present */ }
    else if (!existing) { const list = [outcomeKey]; Object.defineProperty(list, '__provisional', { value: true }); outcomes.SUGGESTED_ACTION_OUTCOMES[op] = list; record.outcome = true; }
    else if (!existing.includes(outcomeKey)) { existing.push(outcomeKey); record.outcome = true; }
    // The measurement models a pool UNDER a stated rule set. A real approved starter (D-O4 activation) is repeatable and exempt in the live registry, so when
    // the run asks for the OLD rules (no exemption / not repeatable) those real entries are removed for the duration and restored afterwards.
    if (!repeatable && outcomes.REPEATABLE_OUTCOMES.has(specKey(starter))) { outcomes.REPEATABLE_OUTCOMES.delete(specKey(starter)); record.restoreRepeatable = true; }
    if (!promptHistoryExempt && outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.has(specKey(starter))) { outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.delete(specKey(starter)); record.restoreExempt = true; }
    if (repeatable && !outcomes.REPEATABLE_OUTCOMES.has(specKey(starter))) { outcomes.REPEATABLE_OUTCOMES.add(specKey(starter)); record.repeatable = true; }
    // The REAL starter-specific exemption (D-O10), registered for the duration of the test only.
    if (promptHistoryExempt && !outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.has(specKey(starter))) { outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.add(specKey(starter)); record.exempt = true; }
    added.push(record);
  }
  return () => {
    for (const record of added) {
      if (record.repeatable) outcomes.REPEATABLE_OUTCOMES.delete(specKey(record.starter));
      if (record.exempt) outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.delete(specKey(record.starter));
      if (record.restoreRepeatable) outcomes.REPEATABLE_OUTCOMES.add(specKey(record.starter));
      if (record.restoreExempt) outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.add(specKey(record.starter));
      if (!record.outcome) continue;
      const list = outcomes.SUGGESTED_ACTION_OUTCOMES[record.starter.operationId];
      if (list && list.__provisional) { const index = list.indexOf(record.starter.outcomeKey); if (index >= 0) list.splice(index, 1); if (list.length === 0) delete outcomes.SUGGESTED_ACTION_OUTCOMES[record.starter.operationId]; }
    }
  };
}

const starterCandidate = (starter) => ({
  source: 'CAPABILITY_RECOMMENDATION', sourceOperationId: null, label: `Open ${starter.operationId}`, message: starter.message, operationId: starter.operationId,
  interactionType: 'CONVERSATION_CONTINUE', outcomeKey: starter.outcomeKey, slotClass: 'CURATED_STARTER', tier: 'DISCOVERY', requiredFacts: [], reasonCodes: [],
  entityContext: { propertyId: PROPERTY, entityType: null, entityId: null, contextVersion: null },
  signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0.5 },
  traits: { recovery: false, promotional: false, continuesPending: false },
});

const ONBOARDING_BY_MODE = { UNKNOWN: null, BUYING: 'SHOPPING', OWNING: 'ESTABLISHED_OWNER', SELLING: 'PREPARING_TRANSFER' };

/** Runs the real availability function for a role and operating mode, with at most one OPERATION disabled. */
async function availabilityFor({ role, mode, disabled = null }) {
  const original = prisma.propertyOnboarding.findUnique;
  prisma.propertyOnboarding.findUnique = async () => (ONBOARDING_BY_MODE[mode] ? { ownershipState: ONBOARDING_BY_MODE[mode] } : null);
  try {
    const controls = { ...readAskOperationalControls(), audienceDiscoveryEnabled: true, operationEnabled: (id) => id !== disabled };
    return await evaluateAskOperationAvailability({ propertyId: PROPERTY, propertyAccess: { role }, controls });
  } finally { prisma.propertyOnboarding.findUnique = original; }
}

/**
 * One row, exactly as the exact-four policy would build it from the deterministic starters alone.
 *  - `disabled` is an OPERATION id: availability removes every starter on it at once.
 *  - `removedByHistory` starters (the last HISTORY_WINDOW completed messages plus the current message) are removed by the real prompt-history
 *    rule unless the real exemption is registered. The adversarial choice is disjoint from the disabled group.
 *  - `currentRemoval` models a populated current-outcome set: one more starter, disjoint from the others, is excluded by outcome.
 */
async function rowFor({ pool, role = 'VIEWER', mode = 'UNKNOWN', disabled = null, removedByHistory = 0, currentRemoval = false }) {
  const operationAvailability = await availabilityFor({ role, mode, disabled });
  const available = pool.filter((starter) => starter.operationId !== disabled);
  const historyRemoved = available.slice(0, removedByHistory);
  const currentStarter = currentRemoval ? available.slice(removedByHistory)[0] ?? null : null;
  const asked = new Set(historyRemoved.map((starter) => suggestionKey(starter.message)));
  const eligibility = {
    mode: 'NORMAL', sourcePropertyId: PROPERTY, operationAvailability,
    operationRequiresProperty: (id) => getAskOperationDefinition(id).requiresProperty, operationTargetEntityType: (id) => requiredAskTargetEntity(id),
    entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false, completedSemanticKeyHashes: new Set(),
    askedMessageKeys: asked, messageKey: suggestionKey,
    // The finalizer passes an EMPTY set today (guarded below). A populated set is the eligibility design's intent: never re-offer what the
    // answer just produced.
    currentOutcomeKeyHashes: new Set(currentStarter ? [suggestedNextActionSemanticKeyHash({ operationId: currentStarter.operationId, interactionType: 'CONVERSATION_CONTINUE', propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: currentStarter.outcomeKey })] : []),
  };
  // The policy truncates each producer's nominations to `perProducerCandidates` BEFORE eligibility, so a pool larger than the limit must come
  // from several producers; the requirement is measured independently of that cap (the cap itself is pinned by its own test below).
  const limit = SUGGESTED_NEXT_ACTION_LIMITS.perProducerCandidates;
  const nominations = new Map();
  const slotGrants = {};
  for (let offset = 0, producer = 0; offset < pool.length; offset += limit, producer += 1) {
    const id = `home-starters.curated${producer}`;
    nominations.set(id, pool.slice(offset, offset + limit).map(starterCandidate));
    slotGrants[id] = { allowed: new Set(['CURATED_STARTER']), fallback: 'CURATED_STARTER' };
  }
  const result = selectExactFourSuggestedNextActions({ nominations, eligibility, actionableCompleteness: 0.95, slotGrants });
  return { selected: result.selected.length, shortage: result.exactFour.shortage, reasons: result.exactFour.shortageReasons };
}

/** The supported-state matrix for a pool: role x mode x (no disabled operation | each distinct operation disabled) x history removals 0..6 x current. */
async function failingStates(pool, { withCurrentRemoval = false } = {}) {
  const failing = [];
  const operations = [...new Set(pool.map((starter) => starter.operationId))];
  const roles = withCurrentRemoval ? ['VIEWER'] : ['VIEWER', 'CONTRIBUTOR', 'OWNER'];
  const modes = withCurrentRemoval ? ['UNKNOWN', 'OWNING'] : ['UNKNOWN', 'BUYING', 'OWNING', 'SELLING'];
  for (const role of roles) for (const mode of modes) for (const disabled of [null, ...operations]) for (const currentRemoval of withCurrentRemoval ? [false, true] : [false]) {
    for (let removedByHistory = 0; removedByHistory <= Math.min(HISTORY_WINDOW + 1, pool.length); removedByHistory += 1) {
      const row = await rowFor({ pool, role, mode, disabled, removedByHistory, currentRemoval });
      if (row.shortage > 0) failing.push({ role, mode, disabled, currentRemoval, removedByHistory, selected: row.selected });
    }
  }
  return failing;
}

async function minimalPoolSize({ exempt = false, grouped = false, withCurrentRemoval = false } = {}) {
  const build = grouped ? groupedPool : singletonPool;
  const limit = grouped ? POOL_OPERATIONS.length + 1 : POOL_OPERATIONS.length;
  for (let size = grouped ? 4 : 4; size <= limit; size += 1) {
    const pool = build(size);
    const restore = registerProvisional(pool, { promptHistoryExempt: exempt });
    try { if ((await failingStates(pool, { withCurrentRemoval })).length === 0) return size; } finally { restore(); }
  }
  return null;
}

// ---- structural facts ---------------------------------------------------------------------------------------------------------------

test('presentation deduplication cannot remove a starter: a STRUCTURAL proof from the collector\'s guard, checked against seven representative shapes (not an exhaustive enumeration of block shapes)', () => {
  const collectorSource = fs.readFileSync(path.join(__dirname, '../../src/services/ask/suggestedActions/suggestedNextActionPresentationIdentities.ts'), 'utf8');
  assert.ok(/if \(Array\.isArray\(record\.actions\) && entityType && entityId\)/.test(collectorSource), 'the structural premise: identities are published only for a node that has BOTH an entity type and an id');
  const restore = registerProvisional([spec('PROPERTY_SUMMARY')]);
  try {
    const starterKey = suggestedNextActionSemanticKey({ operationId: 'PROPERTY_SUMMARY', interactionType: 'CONVERSATION_CONTINUE', propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: outcomeFor('PROPERTY_SUMMARY') });
    const action = { operationId: 'PROPERTY_SUMMARY', outcomeKey: outcomeFor('PROPERTY_SUMMARY'), interactionType: 'CONVERSATION_CONTINUE' };
    // Seven representative node shapes (with and without an entity, nested, in arrays). Representative, not exhaustive: the proof is the guard above.
    const shapes = [
      [{ entityType: 'INVENTORY_ITEM', id: 'item-1', actions: [action] }],
      [{ items: [{ entityType: 'WARRANTY', id: 'w-1', actions: [action, action] }] }],
      [{ actions: [action] }], [{ id: 'x', actions: [action] }], [{ entityType: 'INVENTORY_ITEM', actions: [action] }],
      [{ type: 'SUMMARY', actions: [{ ...action, entityType: null }] }], [],
    ];
    for (const blocks of shapes) {
      const identities = collectPresentationIdentities(blocks, PROPERTY);
      assert.equal(identities.has(starterKey), false, JSON.stringify(blocks));
      for (const identity of identities) assert.notEqual(JSON.parse(identity)[3], null, 'a published identity always carries an entity type');
    }
  } finally { restore(); }
});

test('D-O11: the finalizer populates the current-outcome set from the verified launch event (empty for a typed question), and the prompt-history rule still ignores repeatability', async () => {
  const finalizeSource = fs.readFileSync(path.join(__dirname, '../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts'), 'utf8');
  assert.ok(/currentOutcomeKeyHashes: await \(deps\.loadCurrentOutcomeKeyHashes \?\? loadCurrentOutcomeKeyHashes\)\(input\.executionId\)/.test(finalizeSource), 'currentOutcomeKeyHashes comes from the verified launch event');
  const executeSource = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/executeOperation.ts'), 'utf8');
  assert.ok(/take: 5,\s*\n\s*select: \{ message: true, operationId: true \}/.test(executeSource), 'the history window is the last 5 completed executions');
  // Executed: a REPEATABLE outcome whose stored message was asked recently is still suppressed by the prompt-history rule.
  const restore = registerProvisional([spec('HOME_STATUS_BOARD')], { repeatable: true });
  try {
    assert.equal(outcomes.isRepeatableOutcome('HOME_STATUS_BOARD', spec('HOME_STATUS_BOARD').outcomeKey), true);
    const availability = await availabilityFor({ role: 'VIEWER', mode: 'UNKNOWN' });
    const ctx = {
      mode: 'NORMAL', sourcePropertyId: PROPERTY, operationAvailability: availability, operationRequiresProperty: () => true, operationTargetEntityType: () => null,
      entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false, completedSemanticKeyHashes: new Set(),
      askedMessageKeys: new Set([suggestionKey(spec('HOME_STATUS_BOARD').message)]), messageKey: suggestionKey, currentOutcomeKeyHashes: new Set(),
    };
    const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
    const verdict = evaluateSuggestedNextActionEligibility(SuggestedNextActionCandidateSchema.parse(starterCandidate(spec('HOME_STATUS_BOARD'))), ctx);
    assert.equal(verdict.state, 'SUPPRESSED');
    assert.deepEqual(verdict.reasonCodes, ['EQUIVALENT_PROMPT_ASKED']);
  } finally { restore(); }
});

// ---- the matrix ----------------------------------------------------------------------------------------------------------------------

test('the real pool of all-mode, viewer, standard read operations is large enough to draw hypothetical starters from', () => {
  assert.ok(POOL_OPERATIONS.length >= 12, `pool has ${POOL_OPERATIONS.length}`); // 28 operations qualify structurally; HYPOTHETICAL for measurement only (many are data-dependent or typed-only)
  for (const op of ['PROPERTY_SUMMARY', 'HOME_STATUS_BOARD', 'MAINTENANCE_STATUS', 'MAINTENANCE_FORECAST']) assert.ok(STRUCTURAL_POOL.includes(op), `${op} qualifies structurally`);
});

test('mode and role do not change the verdict for all-mode viewer starters (CONTRIBUTOR and OWNER never have fewer)', async () => {
  const pool = singletonPool(5);
  const restore = registerProvisional(pool);
  try {
    const baseline = await rowFor({ pool, role: 'VIEWER', mode: 'UNKNOWN' });
    for (const role of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) for (const mode of ['UNKNOWN', 'BUYING', 'OWNING', 'SELLING']) {
      assert.equal((await rowFor({ pool, role, mode })).selected, baseline.selected, `${role} ${mode}`);
    }
  } finally { restore(); }
});

test('SHARED OPERATION: disabling one operation removes every starter on it at once, while prompt history removes starters individually', async () => {
  const pool = groupedPool(8); // PROPERTY_SUMMARY supplies two starters
  const restore = registerProvisional(pool);
  try {
    assert.equal(pool.filter((starter) => starter.operationId === 'PROPERTY_SUMMARY').length, 2);
    assert.notEqual(pool[0].outcomeKey, pool[1].outcomeKey, 'two distinct outcomes');
    assert.notEqual(pool[0].message, pool[1].message, 'two distinct messages');
    assert.equal((await rowFor({ pool })).selected, 4, 'pristine pool of 8');
    // Disabling PROPERTY_SUMMARY drops BOTH of its starters: 8 - 2 = 6 still reach four, but a pool of 5 would not.
    const small = groupedPool(5);
    const restoreSmall = registerProvisional(small);
    try {
      assert.equal((await rowFor({ pool: small, disabled: 'PROPERTY_SUMMARY' })).selected, 3, 'both summary starters vanish with the operation');
      assert.equal((await rowFor({ pool: small, disabled: 'DIY_PROJECTS' })).selected, 4, 'a singleton operation removes only one');
    } finally { restoreSmall(); }
    // History removes starters individually, by their own messages: removing one summary message leaves the other starter.
    assert.equal((await rowFor({ pool, removedByHistory: 1 })).selected, 4, 'one history removal of 8');
  } finally { restore(); }
});

test('STRUCTURAL CAP: a single producer\'s nominations are truncated to perProducerCandidates (12) before eligibility, so a starter pool above 12 must come from several producers', () => {
  assert.equal(SUGGESTED_NEXT_ACTION_LIMITS.perProducerCandidates, 12);
  const pool = singletonPool(14);
  const restore = registerProvisional(pool);
  try {
    const eligibility = {
      mode: 'NORMAL', sourcePropertyId: PROPERTY, operationAvailability: new Map(pool.map((starter) => [starter.operationId, null])),
      operationRequiresProperty: () => true, operationTargetEntityType: () => null, entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false,
      completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(), messageKey: suggestionKey, currentOutcomeKeyHashes: new Set(),
    };
    const result = selectExactFourSuggestedNextActions({
      nominations: new Map([['home-starters.curated', pool.map(starterCandidate)]]), eligibility, actionableCompleteness: 0.95,
      slotGrants: { 'home-starters.curated': { allowed: new Set(['CURATED_STARTER']), fallback: 'CURATED_STARTER' } },
    });
    assert.equal(result.diagnostics.nominated, 14);
    assert.equal(result.diagnostics.droppedOverProducerLimit, 2, 'the last two starters never reach eligibility');
  } finally { restore(); }
});

test('MEASUREMENT: four starters fail the arithmetic under a single disabled operation or any prior starter use', async () => {
  const pool = singletonPool(4);
  const restore = registerProvisional(pool);
  try {
    assert.equal((await rowFor({ pool })).shortage, 0, 'a pristine session reaches four');
    assert.equal((await rowFor({ pool, disabled: pool[1].operationId })).selected, 3, 'one disabled operation leaves three');
    assert.equal((await rowFor({ pool, removedByHistory: 1 })).selected, 3, 'one starter used in the last five turns leaves three');
    assert.equal((await rowFor({ pool, removedByHistory: 4 })).selected, 0, 'four starters used in a row leave none');
    assert.ok((await failingStates(pool)).length > 0, 'the invariant is RED for the four-starter pool');
  } finally { restore(); }
  const restoreExempt = registerProvisional(pool, { promptHistoryExempt: true });
  try {
    assert.ok((await failingStates(pool)).every((state) => state.disabled !== null), 'with the starter-specific exemption only the disabled-operation states fail');
  } finally { restoreExempt(); }
});

test('MEASUREMENT (distinct operations): current rules 11; exemption 5; with the current outcome excluded 12 and 6', async () => {
  assert.equal(await minimalPoolSize({}), 11);
  assert.equal(await minimalPoolSize({ exempt: true }), 5);
  assert.equal(await minimalPoolSize({ withCurrentRemoval: true }), 12);
  assert.equal(await minimalPoolSize({ exempt: true, withCurrentRemoval: true }), 6);
});

test('MEASUREMENT (PROPERTY_SUMMARY supplies TWO starters): the largest operation group removes two at once, so the pool grows by one: exemption 6; with the current outcome 7; current rules 12 and 13 (13 exceeds the per-producer cap of 12)', async () => {
  assert.equal(await minimalPoolSize({ exempt: true, grouped: true }), 6);
  assert.equal(await minimalPoolSize({ exempt: true, grouped: true, withCurrentRemoval: true }), 7);
  assert.equal(await minimalPoolSize({ grouped: true }), 12);
  assert.equal(await minimalPoolSize({ grouped: true, withCurrentRemoval: true }), 13);
});

test('SCOPE of a global prompt-history change: REPEATABLE_OUTCOMES holds four existing non-starter outcomes (plus the seven approved starters), which a rule keyed on repeatability would also change', () => {
  const nonStarter = [...outcomes.REPEATABLE_OUTCOMES].filter((key) => !outcomes.CURATED_STARTER_OUTCOME_KEYS.includes(key)).sort();
  assert.deepEqual(nonStarter, [
    'INVENTORY_LOOKUP:REVIEW_CURRENT_RECORD', 'MAINTENANCE_TASK_CREATE:RESTART_AFTER_EXPIRY', 'QUOTE_COMPARISON_CREATE:RESTART_AFTER_EXPIRY', 'REFINANCE_RATE_MONITOR:RESTART_AFTER_EXPIRY',
  ]);
  // The four existing outcomes are repeatable but NOT prompt-history exempt; the seven approved starters are BOTH.
  for (const key of nonStarter) assert.equal(outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.has(key), false, key);
  for (const key of outcomes.CURATED_STARTER_OUTCOME_KEYS) { assert.ok(outcomes.REPEATABLE_OUTCOMES.has(key), key); assert.ok(outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.has(key), key); }
  // Repeatable COMPLETION ("this may be done again") and recent-PROMPT deduplication ("this exact text was just asked") are different concepts.
});

test('every message-routable operation as the current answer: it removes a starter only when it is a starter, so the pool needs at most one extra', async () => {
  const pool = singletonPool(6);
  const restore = registerProvisional(pool, { promptHistoryExempt: true });
  try {
    const routable = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable).map((d) => d.operationId);
    assert.ok(routable.length > 60, `${routable.length} message-routable operations`);
    for (const current of routable) {
      const isStarter = pool.some((starter) => starter.operationId === current);
      const row = await rowFor({ pool, currentRemoval: isStarter });
      assert.equal(row.selected, Math.min(4, pool.length - (isStarter ? 1 : 0)), current); // a row never shows more than four
      assert.equal(row.shortage, 0, `${current} still reaches four`);
    }
  } finally { restore(); }
});
