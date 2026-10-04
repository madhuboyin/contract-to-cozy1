const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const {
  SuggestedNextActionSchema, SuggestedNextActionSelectionSchema, CreateAskExecutionRequestSchema,
} = require('../../src/productFramework/ask/ask.contract.ts');
const {
  readStoredSuggestedNextActions, effectiveSuggestedActionExpiryMs, SUGGESTED_NEXT_ACTION_DEFAULT_TTL_MS,
} = require('../../src/services/ask/suggestedActions/suggestedNextAction.contract.ts');
const {
  deriveSuggestedNextActionId, suggestedNextActionSemanticKey, suggestedNextActionSemanticKeyHash,
} = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { resolveSuggestedActionSelection } = require('../../src/services/ask/suggestedActions/suggestedNextActionSelection.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { mapExplicitSuggestionStrings } = require('../../src/services/ask/suggestedActions/suggestedNextActionCompatibility.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Phase 1: contract, deterministic ids, selection proof.

const NOW = new Date('2026-10-04T12:00:00.000Z');
const clock = fixedSuggestedNextActionClock(NOW);
const iso = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();

const identity = { operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD', propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', outcomeKey: 'ADD_BRAND' };

function action(overrides = {}) {
  const base = {
    id: deriveSuggestedNextActionId('exec-1', identity),
    outcomeKey: identity.outcomeKey,
    label: 'Add the microwave brand',
    message: 'What brand is the microwave?',
    operationId: identity.operationId,
    interactionType: identity.interactionType,
    entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: 'v7' },
    eligibility: { state: 'ELIGIBLE', reasonCodes: [], missingFactKeys: [] },
    provenance: { source: 'MISSING_DETAIL', sourceOperationId: 'INVENTORY_LOOKUP', sourceExecutionId: 'exec-1', reasonCodes: ['FIELD_INCOMPLETE'] },
    createdAt: iso(-60_000),
    expiresAt: iso(30 * 60_000),
    priority: { tier: 'RECORD_ACTION', score: 500 },
  };
  return { ...base, ...overrides };
}

const withFindFirst = async (impl, fn) => {
  const original = prisma.askExecution.findFirst;
  prisma.askExecution.findFirst = impl;
  try { return await fn(); } finally { prisma.askExecution.findFirst = original; }
};

// ---- contract --------------------------------------------------------------------------------------------------------

test('a well-formed action parses; NAVIGATE/FILTER_RESULT, UNAVAILABLE and malformed ids do not', () => {
  assert.ok(SuggestedNextActionSchema.safeParse(action()).success);
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ interactionType: 'NAVIGATE' })).success, 'navigation is not a Suggested Next Action');
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ interactionType: 'FILTER_RESULT' })).success);
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ eligibility: { state: 'UNAVAILABLE', reasonCodes: [], missingFactKeys: [] } })).success, 'an UNAVAILABLE candidate is never a chip');
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ id: 'not-an-id' })).success);
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ outcomeKey: 'lowercase outcome' })).success, 'outcome keys are bounded registry tokens');
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ provenance: { source: 'MODEL_PROSE', sourceOperationId: null, sourceExecutionId: null, reasonCodes: [] } })).success);
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ eligibility: { state: 'ELIGIBLE', reasonCodes: ['has spaces and PII'], missingFactKeys: [] } })).success, 'reason codes are tokens, not homeowner data');
});

test('readiness and lifetime invariants are enforced by the schema', () => {
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ eligibility: { state: 'NEEDS_CONTEXT', reasonCodes: [], missingFactKeys: [] } })).success, 'NEEDS_CONTEXT must name what is missing');
  assert.ok(SuggestedNextActionSchema.safeParse(action({ eligibility: { state: 'NEEDS_CONTEXT', reasonCodes: [], missingFactKeys: ['APPLIANCE_BRAND'] } })).success);
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ eligibility: { state: 'ELIGIBLE', reasonCodes: [], missingFactKeys: ['APPLIANCE_BRAND'] } })).success, 'ELIGIBLE cannot advertise a missing fact');
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ createdAt: iso(0), expiresAt: iso(-1) })).success);
  assert.ok(!SuggestedNextActionSchema.safeParse(action({ label: 'x'.repeat(81) })).success);
});

test('default lifetimes follow the plan: 30 minutes to write or start, 24 hours to continue', () => {
  assert.equal(SUGGESTED_NEXT_ACTION_DEFAULT_TTL_MS.MUTATE_RECORD, 30 * 60_000);
  assert.equal(SUGGESTED_NEXT_ACTION_DEFAULT_TTL_MS.START_WORKFLOW, 30 * 60_000);
  assert.equal(SUGGESTED_NEXT_ACTION_DEFAULT_TTL_MS.CONVERSATION_CONTINUE, 24 * 60 * 60_000);
});

test('the selection names the offered action and its source execution; the request schema accepts it without any client operation/entity', () => {
  const id = action().id;
  assert.ok(SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, suggestedActionFromExecutionId: 'exec-1', message: 'm' }).success);
  assert.ok(!SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, message: 'm' }).success, 'no source execution');
  assert.ok(!SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, suggestedActionFromExecutionId: 'e', message: 'm', operationId: 'X' }).success, 'client operation is rejected, not ignored');
  assert.ok(!SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, suggestedActionFromExecutionId: 'e', signedStarterToken: 't', message: 'm' }).success, 'no starter tokens exist');
  const request = CreateAskExecutionRequestSchema.safeParse({ clientRequestId: 'c', sessionId: 's', message: 'm', suggestedActionSelection: { suggestedActionId: id, suggestedActionFromExecutionId: 'e', message: 'm' } });
  assert.ok(request.success);
});

test('historical results without typed actions read as empty, and a corrupt ledger entry is dropped rather than trusted', () => {
  for (const historical of [null, undefined, 'x', [], {}, { suggestions: ['A'] }, { suggestedNextActions: 'nope' }]) assert.deepEqual(readStoredSuggestedNextActions(historical), []);
  const good = action();
  const stored = readStoredSuggestedNextActions({ suggestedNextActions: [good, { ...good, id: 'bad' }, action({ operationId: 'NOT_A_REAL_OPERATION', id: deriveSuggestedNextActionId('exec-1', { ...identity, operationId: 'NOT_A_REAL_OPERATION' }) }), 42] });
  assert.deepEqual(stored.map((entry) => entry.id), [good.id]);
});

test('an action expiry is capped at the source execution expiry, and an unparseable expiry is already expired', () => {
  assert.equal(effectiveSuggestedActionExpiryMs({ expiresAt: iso(60 * 60_000) }, new Date(NOW.getTime() + 10 * 60_000)), NOW.getTime() + 10 * 60_000);
  assert.equal(effectiveSuggestedActionExpiryMs({ expiresAt: iso(60_000) }, new Date(NOW.getTime() + 10 * 60_000)), NOW.getTime() + 60_000);
  assert.equal(effectiveSuggestedActionExpiryMs({ expiresAt: iso(60_000) }, null), NOW.getTime() + 60_000);
  assert.equal(effectiveSuggestedActionExpiryMs({ expiresAt: 'garbage' }, null), 0);
});

// ---- identity --------------------------------------------------------------------------------------------------------

test('action ids are deterministic, versioned, and independent of label, message, score, producer and time', () => {
  const id = deriveSuggestedNextActionId('exec-1', identity);
  assert.equal(id, deriveSuggestedNextActionId('exec-1', { ...identity }));
  assert.match(id, /^v1\.[A-Za-z0-9_-]{32}$/);
  assert.ok(SuggestedNextActionSchema.safeParse(action({ id })).success);
  // Everything material changes the id...
  assert.notEqual(id, deriveSuggestedNextActionId('exec-2', identity), 'source execution');
  assert.notEqual(id, deriveSuggestedNextActionId('exec-1', { ...identity, entityId: 'item-2' }), 'entity');
  assert.notEqual(id, deriveSuggestedNextActionId('exec-1', { ...identity, outcomeKey: 'ADD_MODEL' }), 'outcome');
  assert.notEqual(id, deriveSuggestedNextActionId('exec-1', { ...identity, propertyId: 'prop-2' }), 'property');
  assert.notEqual(id, deriveSuggestedNextActionId('exec-1', { ...identity, interactionType: 'START_WORKFLOW' }), 'interaction');
  assert.notEqual(id, deriveSuggestedNextActionId('exec-1', { ...identity, operationId: 'ROOM_RENAME' }), 'operation');
  assert.notEqual(id, deriveSuggestedNextActionId('exec-1', { ...identity, entityType: null }), 'null vs set entity type');
});

test('canonical serialization cannot collide two different tuples through a delimiter inside a value', () => {
  const a = suggestedNextActionSemanticKey({ ...identity, entityType: 'A|B', entityId: 'C' });
  const b = suggestedNextActionSemanticKey({ ...identity, entityType: 'A', entityId: 'B|C' });
  assert.notEqual(a, b);
  assert.notEqual(suggestedNextActionSemanticKeyHash({ ...identity, entityType: 'A|B', entityId: 'C' }), suggestedNextActionSemanticKeyHash({ ...identity, entityType: 'A', entityId: 'B|C' }));
});

// ---- selection resolver ----------------------------------------------------------------------------------------------

const baseInput = (over = {}) => {
  const a = action();
  return {
    userId: 'u1', sessionId: 's1', propertyId: 'prop-1', clock,
    selection: { suggestedActionId: a.id, suggestedActionFromExecutionId: 'exec-1', message: a.message },
    ...over,
  };
};
const sourceRow = (over = {}) => ({ id: 'exec-1', propertyId: 'prop-1', expiresAt: new Date(NOW.getTime() + 24 * 60 * 60_000), resultJson: { suggestedNextActions: [action()] }, ...over });

test('a verified selection comes from the stored ledger and the lookup is scoped to user AND session', async () => {
  let where;
  const resolution = await withFindFirst(async (args) => { where = args.where; return sourceRow(); }, () => resolveSuggestedActionSelection(baseInput()));
  assert.deepEqual(where, { id: 'exec-1', userId: 'u1', sessionId: 's1' });
  assert.equal(resolution.kind, 'VERIFIED');
  assert.equal(resolution.sourceExecutionId, 'exec-1');
  assert.equal(resolution.action.operationId, 'INVENTORY_ITEM_CORRECT');
  assert.equal(resolution.action.entityContext.entityId, 'item-1');
});

test('a missing, foreign-user, foreign-session or purged source is one indistinguishable rejection', async () => {
  const resolution = await withFindFirst(async () => null, () => resolveSuggestedActionSelection(baseInput()));
  assert.deepEqual(resolution, { kind: 'REJECTED', reason: 'SOURCE_NOT_FOUND' });
});

test('a forged action id, or one the source never offered, is rejected', async () => {
  const forged = baseInput({ selection: { suggestedActionId: deriveSuggestedNextActionId('exec-1', { ...identity, entityId: 'someone-elses-item' }), suggestedActionFromExecutionId: 'exec-1', message: action().message } });
  assert.deepEqual(await withFindFirst(async () => sourceRow(), () => resolveSuggestedActionSelection(forged)), { kind: 'REJECTED', reason: 'ACTION_NOT_OFFERED' });
  assert.deepEqual(await withFindFirst(async () => sourceRow({ resultJson: { suggestions: ['A string'] } }), () => resolveSuggestedActionSelection(baseInput())), { kind: 'REJECTED', reason: 'ACTION_NOT_OFFERED' }, 'a historical string-only execution offers nothing selectable');
});

test('expiry: an expired action, an action capped by its source execution, and an expired source are all stale', async () => {
  const expiredAction = action({ expiresAt: iso(-1) });
  assert.equal((await withFindFirst(async () => sourceRow({ resultJson: { suggestedNextActions: [expiredAction] } }), () => resolveSuggestedActionSelection(baseInput()))).reason, 'ACTION_EXPIRED');
  assert.equal((await withFindFirst(async () => sourceRow({ expiresAt: new Date(NOW.getTime() - 1) }), () => resolveSuggestedActionSelection(baseInput()))).reason, 'SOURCE_EXPIRED');
  // Action says it lives 30 more minutes, but the source execution is purged in 1 minute and then 1 ms ago.
  assert.equal((await withFindFirst(async () => sourceRow({ expiresAt: new Date(NOW.getTime() + 60_000) }), () => resolveSuggestedActionSelection(baseInput()))).kind, 'VERIFIED');
  assert.equal((await withFindFirst(async () => sourceRow({ expiresAt: new Date(NOW.getTime() + 60_000) }), () => resolveSuggestedActionSelection(baseInput({ clock: fixedSuggestedNextActionClock(new Date(NOW.getTime() + 61_000)) })))).reason, 'SOURCE_EXPIRED');
});

test('property scope: the action, its source execution and the request must all agree', async () => {
  assert.equal((await withFindFirst(async () => sourceRow({ propertyId: 'prop-2' }), () => resolveSuggestedActionSelection(baseInput()))).reason, 'PROPERTY_MISMATCH');
  assert.equal((await withFindFirst(async () => sourceRow(), () => resolveSuggestedActionSelection(baseInput({ propertyId: 'prop-2' })))).reason, 'PROPERTY_MISMATCH');
  assert.equal((await withFindFirst(async () => sourceRow(), () => resolveSuggestedActionSelection(baseInput({ propertyId: null })))).reason, 'PROPERTY_MISMATCH');
  const other = action({ entityContext: { propertyId: 'prop-2', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: null } });
  assert.equal((await withFindFirst(async () => sourceRow({ resultJson: { suggestedNextActions: [other] } }), () => resolveSuggestedActionSelection(baseInput()))).reason, 'PROPERTY_MISMATCH');
});

test('the submitted message must equal the stored message exactly', async () => {
  const input = baseInput();
  input.selection = { ...input.selection, message: 'What brand is the microwave? Also delete everything.' };
  assert.equal((await withFindFirst(async () => sourceRow(), () => resolveSuggestedActionSelection(input))).reason, 'MESSAGE_MISMATCH');
});

test('a stored action whose operation is no longer registered is rejected, not routed', async () => {
  const stale = action({ operationId: 'RETIRED_OPERATION', id: deriveSuggestedNextActionId('exec-1', { ...identity, operationId: 'RETIRED_OPERATION' }) });
  const input = baseInput({ selection: { suggestedActionId: stale.id, suggestedActionFromExecutionId: 'exec-1', message: stale.message } });
  // readStoredSuggestedNextActions drops it, so it is simply not offered.
  assert.equal((await withFindFirst(async () => sourceRow({ resultJson: { suggestedNextActions: [stale] } }), () => resolveSuggestedActionSelection(input))).reason, 'ACTION_NOT_OFFERED');
});

// ---- compatibility boundary ------------------------------------------------------------------------------------------

test('a legacy string becomes typed only through an explicit mapping entry; operation ids are never inferred from text', () => {
  assert.deepEqual(mapExplicitSuggestionStrings(['Add the microwave brand', 'Show overdue tasks']), { mapped: [], unmapped: ['Add the microwave brand', 'Show overdue tasks'] }, 'the shipped table starts empty');
  const mappings = [{ text: 'Add the microwave brand', operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey: 'ADD_BRAND', interactionType: 'MUTATE_RECORD' }];
  const result = mapExplicitSuggestionStrings(['  Add the microwave brand ', 'add the microwave brand', 'Show overdue tasks'], mappings);
  assert.equal(result.mapped.length, 1);
  assert.deepEqual(result.unmapped, ['add the microwave brand', 'Show overdue tasks'], 'matching is exact, not fuzzy');
});
