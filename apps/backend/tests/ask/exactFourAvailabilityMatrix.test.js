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
const { selectExactFourSuggestedNextActions } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourPolicy.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');
const { collectPresentationIdentities } = require('../../src/services/ask/suggestedActions/suggestedNextActionPresentationIdentities.ts');
const { suggestedNextActionSemanticKey, suggestedNextActionSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');

// ASK_COZY_EXACT_FOUR_OPPORTUNITY_INVENTORY section 4: the behavior-level availability invariant. Measures, with the REAL eligibility
// rules, availability function and exact-four policy, how many deterministic starters the row needs. The starters themselves are
// PROVISIONAL (registered inside the test and removed afterward); nothing here changes production registries.
//
// Removal mechanisms measured (all code-read from the finalizer path and then executed here):
//   1. operation availability (health / role / audience), including a single disabled operation;
//   2. the prompt-history rule: the message of any of the last 5 completed executions in the session, plus the current message, is
//      suppressed (`recentCompletedMessages` take: 5, plus `input.message`), and that rule does NOT consult repeatability;
//   3. completed semantic history (not applied to repeatable outcomes);
//   4. presentation deduplication (structurally cannot match an entity-less starter, proven below).

const PROPERTY = 'prop-1';
const HISTORY_WINDOW = 5;

// Real all-mode, VIEWER-floor, STANDARD-safety, read-only operations: the pool the hypothetical "dependable" starters come from.
const POOL_OPERATIONS = Object.values(ASK_OPERATION_DEFINITIONS)
  .filter((d) => d.propertyRoleFloor === 'VIEWER' && d.safetyClass === 'STANDARD' && (d.family === 'RECORD_QUERY' || d.family === 'STATUS_SUMMARY') && d.requiresProperty)
  .filter((d) => { const p = getAskAudiencePolicy(d.operationId); return p && p.eligibleOperatingModes.length === 4 && p.unknownModeBehavior === 'ALLOW_GENERAL'; })
  .map((d) => d.operationId)
  .sort();

const outcomeFor = (operationId) => `OPEN_${operationId}`.slice(0, 79);
const messageFor = (operationId) => `Show me ${operationId.toLowerCase().replace(/_/g, ' ')}`;

function registerProvisional(operationIds) {
  const added = [];
  for (const op of operationIds) {
    if (outcomes.SUGGESTED_ACTION_OUTCOMES[op]) continue; // never touch a real entry
    outcomes.SUGGESTED_ACTION_OUTCOMES[op] = [outcomeFor(op)];
    outcomes.REPEATABLE_OUTCOMES.add(`${op}:${outcomeFor(op)}`);
    added.push(op);
  }
  return () => { for (const op of added) { delete outcomes.SUGGESTED_ACTION_OUTCOMES[op]; outcomes.REPEATABLE_OUTCOMES.delete(`${op}:${outcomeFor(op)}`); } };
}

const starterCandidate = (operationId) => ({
  source: 'CAPABILITY_RECOMMENDATION', sourceOperationId: null, label: `Open ${operationId}`, message: messageFor(operationId), operationId,
  interactionType: 'CONVERSATION_CONTINUE', outcomeKey: outcomeFor(operationId), slotClass: 'CURATED_STARTER', tier: 'DISCOVERY', requiredFacts: [], reasonCodes: [],
  entityContext: { propertyId: PROPERTY, entityType: null, entityId: null, contextVersion: null },
  signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0.5 },
  traits: { recovery: false, promotional: false, continuesPending: false },
});

const ONBOARDING_BY_MODE = { UNKNOWN: null, BUYING: 'SHOPPING', OWNING: 'ESTABLISHED_OWNER', SELLING: 'PREPARING_TRANSFER' };

/** Runs the real availability function for a role and operating mode, with at most one operation disabled. */
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
 * `removedByHistory` = starters whose stored message is among the last HISTORY_WINDOW completed messages or the current message.
 * `promptHistoryRespectsRepeatable` models the proposed rule change (what-if); production does not apply it.
 */
async function rowFor({ pool, role = 'VIEWER', mode = 'UNKNOWN', disabled = null, removedByHistory = 0, promptHistoryRespectsRepeatable = false, currentOperation = null }) {
  const operationAvailability = await availabilityFor({ role, mode, disabled });
  const recent = pool.slice(0, removedByHistory).map(messageFor);
  const repeatable = (op) => outcomes.isRepeatableOutcome(op, outcomeFor(op));
  const asked = new Set(pool.slice(0, removedByHistory).filter((op) => !(promptHistoryRespectsRepeatable && repeatable(op))).map((op) => suggestionKey(messageFor(op))));
  const eligibility = {
    mode: 'NORMAL', sourcePropertyId: PROPERTY, operationAvailability,
    operationRequiresProperty: (id) => getAskOperationDefinition(id).requiresProperty, operationTargetEntityType: (id) => requiredAskTargetEntity(id),
    entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false, completedSemanticKeyHashes: new Set(),
    askedMessageKeys: asked, messageKey: suggestionKey,
    // The finalizer passes an EMPTY set today (guarded below). `currentOperation` models the eligibility design's intent: never re-offer the outcome the
    // answer just produced. It is the extra removal a populated set would add.
    currentOutcomeKeyHashes: new Set(currentOperation ? [suggestedNextActionSemanticKeyHash({ operationId: currentOperation, interactionType: 'CONVERSATION_CONTINUE', propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: outcomeFor(currentOperation) })] : []),
  };
  assert.ok(recent.length <= pool.length);
  const result = selectExactFourSuggestedNextActions({
    nominations: new Map([['home-starters.curated', pool.map(starterCandidate)]]), eligibility, actionableCompleteness: 0.95,
    slotGrants: { 'home-starters.curated': { allowed: new Set(['CURATED_STARTER']), fallback: 'CURATED_STARTER' } },
  });
  return { selected: result.selected.length, shortage: result.exactFour.shortage, reasons: result.exactFour.shortageReasons };
}

/** The supported-state matrix for a pool: role x mode x (no disabled op | each op disabled) x history removals 0..6. */
async function failingStates(pool, options = {}) {
  const failing = [];
  const { withCurrentOperation = false, ...rowOptions } = options;
  // Role and mode were shown independent for all-mode viewer starters, so the (larger) current-operation enumeration uses a reduced set.
  const roles = withCurrentOperation ? ['VIEWER'] : ['VIEWER', 'CONTRIBUTOR', 'OWNER'];
  const modes = withCurrentOperation ? ['UNKNOWN', 'OWNING'] : ['UNKNOWN', 'BUYING', 'OWNING', 'SELLING'];
  for (const role of roles) {
    for (const mode of modes) {
      for (const disabled of [null, ...pool]) {
        for (const currentOperation of withCurrentOperation ? [null, ...pool] : [null]) {
          for (let removedByHistory = 0; removedByHistory <= Math.min(HISTORY_WINDOW + 1, pool.length); removedByHistory += 1) {
            const row = await rowFor({ pool, role, mode, disabled, removedByHistory, currentOperation, ...rowOptions });
            if (row.shortage > 0) failing.push({ role, mode, disabled, currentOperation, removedByHistory, selected: row.selected });
          }
        }
      }
    }
  }
  return failing;
}

// ---- structural facts ---------------------------------------------------------------------------------------------------------------

test('presentation deduplication can NEVER remove a starter: identities need an entity, a starter has none', () => {
  const restore = registerProvisional(['PROPERTY_SUMMARY']);
  try {
    const starterKey = suggestedNextActionSemanticKey({ operationId: 'PROPERTY_SUMMARY', interactionType: 'CONVERSATION_CONTINUE', propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: outcomeFor('PROPERTY_SUMMARY') });
    const action = { operationId: 'PROPERTY_SUMMARY', outcomeKey: outcomeFor('PROPERTY_SUMMARY'), interactionType: 'CONVERSATION_CONTINUE' };
    // Every node shape a block can have: with and without an entity, nested, in arrays.
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

test('the finalizer passes an EMPTY current-outcome set and the prompt-history rule ignores repeatability (so the current answer and recent starters are removed by message text only)', async () => {
  const finalizeSource = fs.readFileSync(path.join(__dirname, '../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts'), 'utf8');
  assert.ok(/currentOutcomeKeyHashes: new Set\(\)/.test(finalizeSource), 'currentOutcomeKeyHashes is never populated');
  const executeSource = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/executeOperation.ts'), 'utf8');
  assert.ok(/take: 5,\s*\n\s*select: \{ message: true, operationId: true \}/.test(executeSource), 'the history window is the last 5 completed executions');
  // Executed: a REPEATABLE outcome whose stored message was asked recently is still suppressed by the prompt-history rule.
  const restore = registerProvisional(['PROPERTY_SUMMARY']);
  try {
    assert.equal(outcomes.isRepeatableOutcome('PROPERTY_SUMMARY', outcomeFor('PROPERTY_SUMMARY')), true);
    const availability = await availabilityFor({ role: 'VIEWER', mode: 'UNKNOWN' });
    const ctx = {
      mode: 'NORMAL', sourcePropertyId: PROPERTY, operationAvailability: availability, operationRequiresProperty: () => true, operationTargetEntityType: () => null,
      entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false, completedSemanticKeyHashes: new Set(),
      askedMessageKeys: new Set([suggestionKey(messageFor('PROPERTY_SUMMARY'))]), messageKey: suggestionKey, currentOutcomeKeyHashes: new Set(),
    };
    const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
    const verdict = evaluateSuggestedNextActionEligibility(SuggestedNextActionCandidateSchema.parse(starterCandidate('PROPERTY_SUMMARY')), ctx);
    assert.equal(verdict.state, 'SUPPRESSED');
    assert.deepEqual(verdict.reasonCodes, ['EQUIVALENT_PROMPT_ASKED']);
  } finally { restore(); }
});

// ---- the matrix ----------------------------------------------------------------------------------------------------------------------

test('the real pool of all-mode, viewer, standard read operations is large enough to draw hypothetical starters from', () => {
  assert.ok(POOL_OPERATIONS.length >= 12, `pool has ${POOL_OPERATIONS.length}`); // 28 operations qualify structurally; HYPOTHETICAL for measurement only (many are data-dependent or typed-only)
  for (const op of ['PROPERTY_SUMMARY', 'HOME_STATUS_BOARD', 'MAINTENANCE_STATUS', 'MAINTENANCE_FORECAST']) assert.ok(POOL_OPERATIONS.includes(op), `${op} qualifies`);
});

test('mode and role do not change the verdict for all-mode viewer starters (CONTRIBUTOR and OWNER never have fewer)', async () => {
  const pool = ['PROPERTY_SUMMARY', 'HOME_STATUS_BOARD', 'MAINTENANCE_STATUS', 'MAINTENANCE_FORECAST', 'HOME_CHANGE_SUMMARY'];
  const restore = registerProvisional(pool);
  try {
    const baseline = await rowFor({ pool, role: 'VIEWER', mode: 'UNKNOWN' });
    for (const role of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) for (const mode of ['UNKNOWN', 'BUYING', 'OWNING', 'SELLING']) {
      assert.equal((await rowFor({ pool, role, mode })).selected, baseline.selected, `${role} ${mode}`);
    }
  } finally { restore(); }
});

test('MEASUREMENT: the four dependable starters (S1 to S4) fail the invariant under a single disabled operation or any prior starter use', async () => {
  const pool = ['PROPERTY_SUMMARY', 'HOME_STATUS_BOARD', 'MAINTENANCE_STATUS', 'MAINTENANCE_FORECAST'];
  const restore = registerProvisional(pool);
  try {
    assert.equal((await rowFor({ pool })).shortage, 0, 'a pristine session reaches four');
    assert.equal((await rowFor({ pool, disabled: 'HOME_STATUS_BOARD' })).selected, 3, 'one disabled operation leaves three');
    assert.equal((await rowFor({ pool, removedByHistory: 1 })).selected, 3, 'one starter used in the last five turns leaves three');
    assert.equal((await rowFor({ pool, removedByHistory: 4 })).selected, 0, 'four starters used in a row leave none');
    const failing = await failingStates(pool);
    assert.ok(failing.length > 0, 'the invariant is RED for the four-starter pool');
    // ...and the same with the proposed rule change, because disabling one operation alone leaves three.
    assert.ok((await failingStates(pool, { promptHistoryRespectsRepeatable: true })).every((s) => s.disabled !== null), 'with the rule change only the disabled-operation states fail');
  } finally { restore(); }
});

async function minimalPoolSize(options) {
  for (let size = 4; size <= POOL_OPERATIONS.length; size += 1) {
    const pool = POOL_OPERATIONS.slice(0, size);
    const restore = registerProvisional(pool);
    try { if ((await failingStates(pool, options)).length === 0) return size; } finally { restore(); }
  }
  return null;
}

test('MEASUREMENT: minimal deterministic pool under CURRENT rules = 4 + 6 history removals + 1 disabled operation = 11', async () => {
  // History removes up to 6 distinct starters (the last 5 completed messages plus the current one), a disabled operation removes 1.
  assert.equal(await minimalPoolSize({}), 11);
});

test('MEASUREMENT: if the prompt-history rule respected repeatability, the minimal pool would be 4 + 1 disabled operation = 5', async () => {
  assert.equal(await minimalPoolSize({ promptHistoryRespectsRepeatable: true }), 5);
});

test('MEASUREMENT: if the finalizer also excluded the current answer\'s own outcome, the minimal pool grows by one: 6 with the rule change, 12 under the current rules', async () => {
  // 4 fallbacks + 1 disabled operation + 1 current answer (distinct from the disabled one in the worst case).
  assert.equal(await minimalPoolSize({ promptHistoryRespectsRepeatable: true, withCurrentOperation: true }), 6);
  // Current rules: 4 + 6 history + 1 disabled + 1 current = 12, which exceeds what can be proven dependable (only about four starters are).
  assert.equal(await minimalPoolSize({ withCurrentOperation: true }), 12);
});
