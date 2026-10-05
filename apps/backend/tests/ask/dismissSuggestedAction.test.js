const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The dismissal control for Suggested Next Actions (owner approved October 5, 2026; supported bound: 30 active dismissals per user and
// property). Fakes only; no database. Not wired into any surface.

const { dismissSuggestedAction, DismissSuggestedActionError } = require('../../src/services/ask/suggestedActions/dismissSuggestedAction.ts');
const { enforceDismissalCap, recordSuggestedActionDismissal } = require('../../src/services/ask/suggestedActions/askSuggestedActionLifecycle.service.ts');
const registry = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { SuggestedNextActionSchema, DismissSuggestedActionSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const NOW = new Date('2026-10-05T12:00:00.000Z');
const storedAction = (over = {}) => SuggestedNextActionSchema.parse({
  id: 'v1.AAAAAAAAAAAAAAAAAAAA', outcomeKey: 'REVIEW_THIS_SEASON', label: 'Home care for this season', message: 'What home care should I do this season?',
  operationId: 'SEASONAL_HOME_CARE', interactionType: 'CONVERSATION_CONTINUE',
  entityContext: { propertyId: 'p1', entityType: null, entityId: null, contextVersion: null },
  eligibility: { state: 'ELIGIBLE', reasonCodes: [], missingFactKeys: [] },
  provenance: { source: 'CAPABILITY_RECOMMENDATION', sourceOperationId: null, sourceExecutionId: 'e1', reasonCodes: [] },
  createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(), priority: { tier: 'DISCOVERY', score: 1000 },
  ...over,
});
const deps = (action, over = {}) => {
  const calls = { record: [], cap: [] };
  return {
    calls,
    deps: {
      loadExecution: async (userId, executionId) => (executionId === 'e1' && userId === 'u1' ? { propertyId: 'p1', resultJson: { suggestedNextActions: action ? [action] : [] } } : null),
      hasPropertyAccess: async () => true,
      record: async (input) => { calls.record.push(input); return true; },
      enforceCap: async (userId, propertyId) => { calls.cap.push([userId, propertyId]); return 0; },
      ...over,
    },
  };
};
const code = async (promise) => { try { await promise; return null; } catch (error) { assert.ok(error instanceof DismissSuggestedActionError, String(error)); return error.code; } };
const input = (over = {}) => ({ userId: 'u1', executionId: 'e1', actionId: 'v1.AAAAAAAAAAAAAAAAAAAA', reason: 'NOT_NOW', now: NOW, ...over });

test('the supported bound is 30 and the request schema accepts only a reason', () => {
  assert.equal(registry.SUPPORTED_DISMISSALS_PER_PROPERTY, 30);
  assert.deepEqual(DismissSuggestedActionSchema.safeParse({ reason: 'NOT_NOW' }).success, true);
  assert.equal(DismissSuggestedActionSchema.safeParse({ reason: 'NOT_NOW', operationId: 'X' }).success, false, 'no client operation or entity');
  assert.equal(DismissSuggestedActionSchema.safeParse({ reason: 'FOREVER' }).success, false);
});

test('a starter may be dismissed Not now (no fingerprint) or Not relevant (a fixed versioned fingerprint), resolved from the stored offer', async () => {
  const a = deps(storedAction());
  await dismissSuggestedAction(input({ reason: 'NOT_NOW' }), a.deps);
  assert.deepEqual(a.calls.record[0].identity, { operationId: 'SEASONAL_HOME_CARE', outcomeKey: 'REVIEW_THIS_SEASON', entityType: null, entityId: null });
  assert.equal(a.calls.record[0].propertyId, 'p1');
  assert.equal(a.calls.record[0].contextFingerprint, null);
  const b = deps(storedAction());
  await dismissSuggestedAction(input({ reason: 'NOT_RELEVANT' }), b.deps);
  assert.equal(b.calls.record[0].contextFingerprint, 'STARTER:SEASONAL_HOME_CARE:REVIEW_THIS_SEASON:v1');
  assert.deepEqual(b.calls.cap, [['u1', 'p1']], 'the cap is enforced after a successful dismissal');
});

test('refusals: unknown execution, action not offered, property mismatch, no access, not dismissible, reason not allowed, write failure', async () => {
  assert.equal(await code(dismissSuggestedAction(input({ executionId: 'other' }), deps(storedAction()).deps)), 'EXECUTION_NOT_FOUND');
  assert.equal(await code(dismissSuggestedAction(input({ userId: 'u2' }), deps(storedAction()).deps)), 'EXECUTION_NOT_FOUND');
  assert.equal(await code(dismissSuggestedAction(input({ actionId: 'v1.BBBBBBBBBBBBBBBBBBBB' }), deps(storedAction()).deps)), 'ACTION_NOT_OFFERED');
  assert.equal(await code(dismissSuggestedAction(input(), deps(storedAction({ entityContext: { propertyId: 'p2', entityType: null, entityId: null, contextVersion: null } })).deps)), 'ACCESS_DENIED');
  assert.equal(await code(dismissSuggestedAction(input(), deps(storedAction(), { hasPropertyAccess: async () => false }).deps)), 'ACCESS_DENIED');
  const exactRecord = storedAction({ operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey: 'ADD_BRAND', entityContext: { propertyId: 'p1', entityType: 'INVENTORY_ITEM', entityId: 'i1', contextVersion: 'v1' } });
  assert.equal(await code(dismissSuggestedAction(input(), deps(exactRecord).deps)), 'NOT_DISMISSIBLE');
  const profile = storedAction({ operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', outcomeKey: 'CAPTURE_CORE_DETAILS' });
  assert.equal(await code(dismissSuggestedAction(input({ reason: 'NOT_RELEVANT' }), deps(profile).deps)), 'REASON_NOT_ALLOWED');
  assert.equal(await code(dismissSuggestedAction(input({ reason: 'NOT_NOW' }), deps(profile).deps)), null, 'a profile gap may be put off');
  const failing = deps(storedAction(), { record: async () => false });
  assert.equal(await code(dismissSuggestedAction(input(), failing.deps)), 'WRITE_FAILED');
  assert.deepEqual(failing.calls.cap, [], 'no cap enforcement after a failed write');
});

// A fake of the lifecycle delegate faithful to what enforceDismissalCap uses: filter, order, skip, and conditional updateMany.
function fakeDb(rows) {
  const matches = (row, where) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
    if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k]);
    return row[k] === v;
  });
  return {
    rows,
    askSuggestedActionLifecycle: {
      async findMany(args) {
        let out = rows.filter((r) => matches(r, args.where));
        out = [...out].sort((a, b) => (b.dismissedAt - a.dismissedAt) || a.id.localeCompare(b.id));
        return out.slice(args.skip ?? 0);
      },
      async updateMany(args) { let n = 0; for (const r of rows) if (matches(r, args.where)) { Object.assign(r, args.data); n += 1; } return { count: n }; },
      async upsert() { return {}; },
    },
  };
}
const dismissedRow = (i, reason = 'NOT_NOW', userId = 'u1', propertyId = 'p1') => ({
  id: `r${String(i).padStart(3, '0')}`, userId, propertyId, dismissalReason: reason, dismissedAt: new Date(NOW.getTime() + i * 1000), contextFingerprint: reason === 'NOT_RELEVANT' ? 'fp' : null,
  suppressedUntil: reason === 'NOT_NOW' ? new Date(NOW.getTime() + 30 * 86_400_000) : null,
});

test('cap: at 30 active dismissals nothing is lifted; the 31st and 32nd lift the OLDEST two, clearing dismissal state and a "not now" suppression', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => dismissedRow(i, i % 2 ? 'NOT_RELEVANT' : 'NOT_NOW'));
  const db = fakeDb(rows);
  assert.equal(await enforceDismissalCap('u1', 'p1', db), 0);
  rows.push(dismissedRow(30), dismissedRow(31, 'NOT_RELEVANT'));
  assert.equal(await enforceDismissalCap('u1', 'p1', db), 2);
  const lifted = rows.filter((r) => r.dismissalReason === null).map((r) => r.id).sort();
  assert.deepEqual(lifted, ['r000', 'r001'], 'the two oldest by dismissedAt');
  for (const row of rows.filter((r) => r.dismissalReason === null)) {
    assert.equal(row.dismissedAt, null); assert.equal(row.contextFingerprint, null); assert.equal(row.suppressedUntil, null);
  }
  assert.equal(rows.filter((r) => r.dismissalReason !== null).length, 30);
  assert.equal(await enforceDismissalCap('u1', 'p1', db), 0, 'idempotent');
});

test('cap is per user AND property: other users and other properties are never touched', async () => {
  const mine = Array.from({ length: 32 }, (_, i) => dismissedRow(i));
  const others = [...Array.from({ length: 35 }, (_, i) => dismissedRow(100 + i, 'NOT_NOW', 'u2', 'p1')), ...Array.from({ length: 35 }, (_, i) => dismissedRow(200 + i, 'NOT_NOW', 'u1', 'p9'))];
  const db = fakeDb([...mine, ...others]);
  assert.equal(await enforceDismissalCap('u1', 'p1', db), 2);
  assert.equal(others.filter((r) => r.dismissalReason === null).length, 0);
});

test('cap fails open: a read or write failure lifts nothing and never throws', async () => {
  const broken = { askSuggestedActionLifecycle: { findMany: async () => { throw new Error('db down'); }, updateMany: async () => ({ count: 0 }), upsert: async () => ({}) } };
  assert.equal(await enforceDismissalCap('u1', 'p1', broken), 0);
});

test('the real recordSuggestedActionDismissal still refuses NOT_RELEVANT without a fingerprint, so a starter dismissal always carries one', async () => {
  const db = fakeDb([]);
  assert.equal(await recordSuggestedActionDismissal({ userId: 'u1', propertyId: 'p1', identity: { operationId: 'SEASONAL_HOME_CARE', outcomeKey: 'REVIEW_THIS_SEASON', entityType: null, entityId: null }, reason: 'NOT_RELEVANT', now: NOW }, db), false);
  assert.equal(await recordSuggestedActionDismissal({ userId: 'u1', propertyId: 'p1', identity: { operationId: 'SEASONAL_HOME_CARE', outcomeKey: 'REVIEW_THIS_SEASON', entityType: null, entityId: null }, reason: 'NOT_RELEVANT', now: NOW, contextFingerprint: registry.starterDismissalFingerprint('SEASONAL_HOME_CARE', 'REVIEW_THIS_SEASON') }, db), true);
});

test('route and controller: registered under the execution, 401 without a user, 400 for a bad body or action id, and the error mapping', async () => {
  const routes = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/routes/ask.routes.ts'), 'utf8');
  assert.match(routes, /router\.post\('\/ask\/executions\/:executionId\/suggested-actions\/:actionId\/dismiss', postDismissSuggestedAction\)/);
  const { postDismissSuggestedAction } = require('../../src/controllers/ask.controller.ts');
  const res = () => { const r = { statusCode: null, body: null, status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  let r = res(); await postDismissSuggestedAction({ body: { reason: 'NOT_NOW' }, params: { executionId: 'e1', actionId: 'v1.AAAAAAAAAAAAAAAAAAAA' } }, r, () => {});
  assert.equal(r.statusCode, 401);
  r = res(); await postDismissSuggestedAction({ user: { userId: 'u1' }, body: { reason: 'NOT_NOW', extra: 1 }, params: { executionId: 'e1', actionId: 'v1.AAAAAAAAAAAAAAAAAAAA' } }, r, () => {});
  assert.equal(r.statusCode, 400);
  r = res(); await postDismissSuggestedAction({ user: { userId: 'u1' }, body: { reason: 'NOT_NOW' }, params: { executionId: 'e1', actionId: 'not-an-id' } }, r, () => {});
  assert.equal(r.statusCode, 400);
});
