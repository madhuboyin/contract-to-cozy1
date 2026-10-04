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
  deriveSuggestedNextActionId, deriveLandingStarterActionId, suggestedNextActionSemanticKey, suggestedNextActionSemanticKeyHash,
} = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const {
  signStarterToken, verifyStarterToken, readSigningKeyring, isStarterSigningConfigured, resetSigningDiagnosticsForTests, STARTER_TOKEN_TTL_MS,
} = require('../../src/services/ask/suggestedActions/suggestedNextActionSigner.ts');
const { resolveSuggestedActionSelection } = require('../../src/services/ask/suggestedActions/suggestedNextActionSelection.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { mapExplicitSuggestionStrings } = require('../../src/services/ask/suggestedActions/suggestedNextActionCompatibility.ts');
const { suppressRepeatedSuggestedNextActions } = require('../../src/services/ask/askSuggestionPolicy.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Phase 1: contract, deterministic ids, selection proof, starter signing.

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

const SECRET = 'a'.repeat(40);
const env = { ASK_SUGGESTED_ACTION_SIGNING_SECRET: SECRET, ASK_SUGGESTED_ACTION_SIGNING_KEY_VERSION: '1' };

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

test('the selection carries exactly one proof, and the request schema accepts it without any client operation/entity', () => {
  const id = action().id;
  assert.ok(SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, suggestedActionFromExecutionId: 'exec-1', message: 'm' }).success);
  assert.ok(SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, signedStarterToken: 'tok', message: 'm' }).success);
  assert.ok(!SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, message: 'm' }).success, 'no proof');
  assert.ok(!SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, suggestedActionFromExecutionId: 'e', signedStarterToken: 't', message: 'm' }).success, 'two proofs');
  assert.ok(!SuggestedNextActionSelectionSchema.safeParse({ suggestedActionId: id, suggestedActionFromExecutionId: 'e', message: 'm', operationId: 'X' }).success, 'client operation is rejected, not ignored');
  const request = CreateAskExecutionRequestSchema.safeParse({ clientRequestId: 'c', sessionId: 's', message: 'm', suggestedActionSelection: { suggestedActionId: id, suggestedActionFromExecutionId: 'e', message: 'm' } });
  assert.ok(request.success);
  assert.equal(request.data.suggestedActionSelection.signedStarterToken, null);
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

test('a landing-starter id comes from the registered starter identity, not from user or session', () => {
  const fields = { operationId: 'HOME_ACTIONS', interactionType: 'CONVERSATION_CONTINUE', propertyId: 'prop-1', outcomeKey: 'REVIEW_PRIORITIES' };
  const id = deriveLandingStarterActionId('starter.priorities', fields);
  assert.equal(id, deriveLandingStarterActionId('starter.priorities', { ...fields }));
  assert.notEqual(id, deriveLandingStarterActionId('starter.other', fields));
  assert.notEqual(id, deriveSuggestedNextActionId('starter.priorities', { ...fields, entityType: null, entityId: null }), 'a starter id is not interchangeable with an execution-ledger id');
  assert.ok(SuggestedNextActionSchema.safeParse(action({ id })).success);
});

// ---- signer ----------------------------------------------------------------------------------------------------------

const expectation = (overrides = {}) => ({ userId: 'u1', sessionId: 's1', propertyId: 'prop-1', clientRequestId: 'crid-1', actionId: 'v1.' + 'a'.repeat(32), now: NOW, ...overrides });
const mint = (overrides = {}, e = env) => signStarterToken({ userId: 'u1', sessionId: 's1', propertyId: 'prop-1', starterRegistryId: 'starter.priorities', actionId: 'v1.' + 'a'.repeat(32), clientRequestId: 'crid-1', now: NOW, ...overrides }, e);

test('a starter token round-trips and carries its starter identity', () => {
  const token = mint();
  const verified = verifyStarterToken(token, expectation(), env);
  assert.equal(verified.ok, true);
  assert.equal(verified.claims.stid, 'starter.priorities');
  assert.equal(verified.claims.exp - verified.claims.iat, STARTER_TOKEN_TTL_MS);
  assert.equal(STARTER_TOKEN_TTL_MS, 15 * 60_000);
});

test('every scope binding is enforced: user, session, property, request id, action, and expiry', () => {
  const token = mint();
  const reason = (overrides) => verifyStarterToken(token, expectation(overrides), env).reason;
  assert.equal(reason({ userId: 'u2' }), 'USER_MISMATCH');
  assert.equal(reason({ sessionId: 's2' }), 'SESSION_MISMATCH');
  assert.equal(reason({ propertyId: 'prop-2' }), 'PROPERTY_MISMATCH');
  assert.equal(reason({ propertyId: null }), 'PROPERTY_MISMATCH');
  assert.equal(reason({ clientRequestId: 'crid-2' }), 'REQUEST_ID_MISMATCH', 'a changed request id invalidates the token');
  assert.equal(reason({ actionId: 'v1.' + 'b'.repeat(32) }), 'ACTION_MISMATCH');
  assert.equal(reason({ now: new Date(NOW.getTime() + STARTER_TOKEN_TTL_MS) }), 'EXPIRED');
  assert.equal(reason({ now: new Date(NOW.getTime() + STARTER_TOKEN_TTL_MS - 1) }), undefined);
  assert.equal(verifyStarterToken(mint({ propertyId: null }), expectation({ propertyId: null }), env).ok, true, 'a property-less starter binds null');
});

test('tampering, truncation, a different secret and garbage are all rejected', () => {
  const token = mint();
  const [payload, signature] = token.split('.');
  const forgedClaims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  forgedClaims.uid = 'u2';
  const forged = `${Buffer.from(JSON.stringify(forgedClaims)).toString('base64url')}.${signature}`;
  assert.equal(verifyStarterToken(forged, expectation({ userId: 'u2' }), env).reason, 'BAD_SIGNATURE');
  assert.equal(verifyStarterToken(`${payload}.${signature.slice(0, -2)}`, expectation(), env).reason, 'BAD_SIGNATURE');
  assert.equal(verifyStarterToken(token, expectation(), { ...env, ASK_SUGGESTED_ACTION_SIGNING_SECRET: 'b'.repeat(40) }).reason, 'BAD_SIGNATURE');
  for (const garbage of ['', 'x', 'a.b.c', '.', 'a.', '.b', '%%%.%%%']) assert.ok(['MALFORMED', 'BAD_SIGNATURE'].includes(verifyStarterToken(garbage, expectation(), env).reason), garbage);
});

test('a token minted for a different purpose cannot verify even when correctly signed with the same secret', () => {
  const { createHmac } = require('node:crypto');
  const claims = { p: 'something-else', kv: '1', rv: '1', uid: 'u1', sid: 's1', pid: 'prop-1', stid: 'x', aid: 'v1.' + 'a'.repeat(32), crid: 'crid-1', iat: NOW.getTime(), exp: NOW.getTime() + 1000 };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const token = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
  assert.equal(verifyStarterToken(token, expectation(), env).reason, 'WRONG_PURPOSE');
});

test('a token cannot claim a lifetime longer than one token lifetime, even correctly signed', () => {
  const { createHmac } = require('node:crypto');
  const claims = { p: 'ask-suggested-action-starter', kv: '1', rv: '1', uid: 'u1', sid: 's1', pid: 'prop-1', stid: 'x', aid: 'v1.' + 'a'.repeat(32), crid: 'crid-1', iat: NOW.getTime(), exp: NOW.getTime() + 24 * 60 * 60_000 };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const token = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
  assert.equal(verifyStarterToken(token, expectation(), env).reason, 'EXPIRED');
});

test('rotation: the previous key verifies old tokens, the active key signs new ones, an unknown version is rejected', () => {
  const oldEnv = { ASK_SUGGESTED_ACTION_SIGNING_SECRET: 'o'.repeat(40), ASK_SUGGESTED_ACTION_SIGNING_KEY_VERSION: '1' };
  const rotated = {
    ASK_SUGGESTED_ACTION_SIGNING_SECRET: 'n'.repeat(40), ASK_SUGGESTED_ACTION_SIGNING_KEY_VERSION: '2',
    ASK_SUGGESTED_ACTION_SIGNING_SECRET_PREVIOUS: 'o'.repeat(40), ASK_SUGGESTED_ACTION_SIGNING_KEY_VERSION_PREVIOUS: '1',
  };
  const oldToken = mint({}, oldEnv);
  assert.equal(verifyStarterToken(oldToken, expectation(), rotated).ok, true, 'previous key still honored');
  const newToken = mint({}, rotated);
  assert.equal(JSON.parse(Buffer.from(newToken.split('.')[0], 'base64url').toString()).kv, '2');
  assert.equal(verifyStarterToken(newToken, expectation(), rotated).ok, true);
  assert.equal(verifyStarterToken(oldToken, expectation(), { ...rotated, ASK_SUGGESTED_ACTION_SIGNING_SECRET_PREVIOUS: undefined }).reason, 'UNKNOWN_KEY_VERSION', 'previous key dropped');
  // The 15-minute claim lifetime still caps an old-key token during the overlap.
  assert.equal(verifyStarterToken(oldToken, expectation({ now: new Date(NOW.getTime() + STARTER_TOKEN_TTL_MS + 1) }), rotated).reason, 'EXPIRED');
});

test('missing, short, or template-placeholder secrets degrade instead of throwing: signing returns null, verification rejects', () => {
  for (const bad of [{}, { ASK_SUGGESTED_ACTION_SIGNING_SECRET: '' }, { ASK_SUGGESTED_ACTION_SIGNING_SECRET: 'short' }, { ASK_SUGGESTED_ACTION_SIGNING_SECRET: 'replace-with-openssl-rand-hex-32' }, { ASK_SUGGESTED_ACTION_SIGNING_SECRET: 'changeme-use-openssl-rand-hex-32' }, { ASK_SUGGESTED_ACTION_SIGNING_SECRET: SECRET, ASK_SUGGESTED_ACTION_SIGNING_KEY_VERSION: 'bad version!' }]) {
    resetSigningDiagnosticsForTests();
    assert.equal(isStarterSigningConfigured(bad), false);
    assert.equal(readSigningKeyring(bad).active, null);
    assert.equal(mint({}, bad), null);
    assert.equal(verifyStarterToken(mint(), expectation(), bad).reason, 'NOT_CONFIGURED');
  }
  assert.equal(isStarterSigningConfigured(env), true);
});

test('the secret is dedicated: JWT_SECRET alone never enables starter signing', () => {
  assert.equal(isStarterSigningConfigured({ JWT_SECRET: 'j'.repeat(64) }), false);
});

// ---- selection resolver ----------------------------------------------------------------------------------------------

const baseInput = (over = {}) => {
  const a = action();
  return {
    userId: 'u1', sessionId: 's1', propertyId: 'prop-1', clientRequestId: 'crid-9', clock, env,
    selection: { suggestedActionId: a.id, suggestedActionFromExecutionId: 'exec-1', signedStarterToken: null, message: a.message },
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
  const forged = baseInput({ selection: { suggestedActionId: deriveSuggestedNextActionId('exec-1', { ...identity, entityId: 'someone-elses-item' }), suggestedActionFromExecutionId: 'exec-1', signedStarterToken: null, message: action().message } });
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
  const input = baseInput({ selection: { suggestedActionId: stale.id, suggestedActionFromExecutionId: 'exec-1', signedStarterToken: null, message: stale.message } });
  // readStoredSuggestedNextActions drops it, so it is simply not offered.
  assert.equal((await withFindFirst(async () => sourceRow({ resultJson: { suggestedNextActions: [stale] } }), () => resolveSuggestedActionSelection(input))).reason, 'ACTION_NOT_OFFERED');
});

test('a starter proof is verified without a database read, and never becomes a VERIFIED execution action', async () => {
  const actionId = 'v1.' + 'a'.repeat(32);
  const token = mint({ clientRequestId: 'crid-9' });
  const input = baseInput({ selection: { suggestedActionId: actionId, suggestedActionFromExecutionId: null, signedStarterToken: token, message: 'm' } });
  let reads = 0;
  const resolution = await withFindFirst(async () => { reads += 1; return null; }, () => resolveSuggestedActionSelection(input));
  assert.equal(reads, 0);
  assert.deepEqual(resolution, { kind: 'STARTER_PROOF_VERIFIED', starterActionId: actionId, starterRegistryId: 'starter.priorities' });
  // Wrong request id (the token binds the preallocated clientRequestId) and no configured secret both reject.
  assert.equal((await resolveSuggestedActionSelection({ ...input, clientRequestId: 'crid-other' })).reason, 'STARTER_REQUEST_ID_MISMATCH');
  assert.equal((await resolveSuggestedActionSelection({ ...input, env: {} })).reason, 'STARTER_NOT_CONFIGURED');
});

// ---- history suppression ---------------------------------------------------------------------------------------------

test('typed history suppression matches registered semantic identity, never label or message', () => {
  const kept = action({ id: deriveSuggestedNextActionId('exec-2', { ...identity, entityId: 'item-2' }), entityContext: { propertyId: 'prop-1', entityType: 'INVENTORY_ITEM', entityId: 'item-2', contextVersion: null } });
  const completed = action({ id: deriveSuggestedNextActionId('exec-2', identity), label: 'A completely different label', message: 'Different words, same outcome' });
  const result = { status: 'ANSWERED', blocks: [], suggestions: [], suggestedNextActions: [completed, kept] };
  const hashes = new Set([suggestedNextActionSemanticKeyHash(identity)]);
  assert.deepEqual(suppressRepeatedSuggestedNextActions(result, hashes).suggestedNextActions.map((a) => a.entityContext.entityId), ['item-2']);
  assert.equal(suppressRepeatedSuggestedNextActions(result, new Set()), result, 'no history: result returned untouched');
  assert.equal(suppressRepeatedSuggestedNextActions({ ...result, suggestedNextActions: undefined }, hashes).suggestedNextActions, undefined);
});

// ---- compatibility boundary ------------------------------------------------------------------------------------------

test('a legacy string becomes typed only through an explicit mapping entry; operation ids are never inferred from text', () => {
  assert.deepEqual(mapExplicitSuggestionStrings(['Add the microwave brand', 'Show overdue tasks']), { mapped: [], unmapped: ['Add the microwave brand', 'Show overdue tasks'] }, 'the shipped table starts empty');
  const mappings = [{ text: 'Add the microwave brand', operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey: 'ADD_BRAND', interactionType: 'MUTATE_RECORD' }];
  const result = mapExplicitSuggestionStrings(['  Add the microwave brand ', 'add the microwave brand', 'Show overdue tasks'], mappings);
  assert.equal(result.mapped.length, 1);
  assert.deepEqual(result.unmapped, ['add the microwave brand', 'Show overdue tasks'], 'matching is exact, not fuzzy');
});
