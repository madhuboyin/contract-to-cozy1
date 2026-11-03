require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { prisma } = require('../../src/lib/prisma.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const completion = require('../../src/services/ask/suggestedActions/suggestedActionCompletion.ts');
const history = require('../../src/services/ask/suggestedActions/suggestedNextActionHistory.ts');
const { ensureGovernedCaptureResult } = require('../../src/services/ask/execution/askCapture.ts');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-02T12:00:00.000Z');

function stub(target, name, fn) { const original = target[name]; target[name] = fn; return () => { target[name] = original; }; }

// ---- Gap 2: what counts as a settled answer ------------------------------------------------------------------------------------------------

test('a settled answer retires its chip: ANSWERED, COMPLETED, or READY_WITH_LIMITATIONS with nothing left to ask; an open capture, clarification or confirmation does not', () => {
  assert.equal(completion.isSettledForCompletion({ status: 'ANSWERED' }), true);
  assert.equal(completion.isSettledForCompletion({ status: 'COMPLETED' }), true);
  assert.equal(completion.isSettledForCompletion({ status: 'READY_WITH_LIMITATIONS' }), true, 'a finished answer with caveats');
  assert.equal(completion.isSettledForCompletion({ status: 'READY_WITH_LIMITATIONS', captureRequests: [{ captureKey: 'k' }] }), false);
  assert.equal(completion.isSettledForCompletion({ status: 'READY_WITH_LIMITATIONS', clarification: { question: 'which?' } }), false);
  assert.equal(completion.isSettledForCompletion({ status: 'READY_WITH_LIMITATIONS', confirmation: { title: 't' } }), false);
  for (const status of ['NEEDS_CONFIRMATION', 'NEEDS_CONTEXT', 'NEEDS_ENTITY', 'NOT_APPLICABLE', 'FAILED_TERMINAL', 'EXPIRED']) assert.equal(completion.isSettledForCompletion({ status }), false, status);
  assert.equal(completion.storedResultHasOpenCaptureRequests({ captureRequests: [{}] }), true);
  assert.equal(completion.storedResultHasOpenCaptureRequests({ captureRequests: [] }), false);
  assert.equal(completion.storedResultHasOpenCaptureRequests(null), false);
});

test('completing a later request (confirmation or capture) marks the lifecycle row of the chip that launched it, resolved from the stored ledger', async () => {
  const lifecycleWrites = [];
  const restore = [
    stub(prisma.askExecutionEvent, 'findFirst', async ({ where }) => (where.executionId === 'exec-confirm'
      ? { metadataJson: { suggestedActionId: 'v1.abcdefghijklmnopqrstu', sourceExecutionId: 'exec-source' } } : null)),
    stub(prisma.askExecution, 'findFirst', async ({ where }) => (where.id === 'exec-source' && where.userId === 'u1' ? {
      resultJson: { suggestedNextActions: [{
        id: 'v1.abcdefghijklmnopqrstu', label: 'Add the brand', message: 'Add the brand of this item.', operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey: 'ADD_BRAND',
        interactionType: 'MUTATE_RECORD',
        entityContext: { propertyId: PROPERTY, entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: null },
        eligibility: { state: 'ELIGIBLE', reasonCodes: [], missingFactKeys: [] },
        provenance: { source: 'OPERATION_RESULT', sourceOperationId: null, sourceExecutionId: 'exec-source', reasonCodes: [] },
        createdAt: '2026-11-02T12:00:00.000Z', expiresAt: '2030-01-01T00:00:00.000Z', priority: { tier: 'CONTINUE', score: 100 },
      }] },
    } : null)),
    stub(prisma.askSuggestedActionLifecycle, 'updateMany', async (args) => { lifecycleWrites.push(args); return { count: 1 }; }),
  ];
  try {
    assert.equal(await completion.recordSelectedSuggestedActionCompletion({ userId: 'u1', executionId: 'exec-confirm', status: 'COMPLETED' }), true);
    assert.equal(lifecycleWrites.length, 1);
    assert.deepEqual(
      { operationId: lifecycleWrites[0].where.operationId, outcomeKey: lifecycleWrites[0].where.outcomeKey, entityType: lifecycleWrites[0].where.entityType, entityId: lifecycleWrites[0].where.entityId, propertyId: lifecycleWrites[0].where.propertyId },
      { operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey: 'ADD_BRAND', entityType: 'INVENTORY_ITEM', entityId: 'item-1', propertyId: PROPERTY },
    );
    assert.ok(lifecycleWrites[0].data.completedAt instanceof Date);

    lifecycleWrites.length = 0;
    assert.equal(await completion.recordSelectedSuggestedActionCompletion({ userId: 'u1', executionId: 'exec-typed-question', status: 'COMPLETED' }), false, 'an execution not launched from a chip records nothing');
    assert.equal(await completion.recordSelectedSuggestedActionCompletion({ userId: 'someone-else', executionId: 'exec-confirm', status: 'COMPLETED' }), false, 'another user\'s ledger is never read');
    assert.equal(lifecycleWrites.length, 0);
  } finally { restore.forEach((fn) => fn()); }
});

test('a failing completion write never throws', async () => {
  const restore = [stub(prisma.askExecutionEvent, 'findFirst', async () => { throw new Error('db down'); })];
  try { assert.equal(await completion.recordSelectedSuggestedActionCompletion({ userId: 'u1', executionId: 'e', status: 'COMPLETED' }), false); } finally { restore.forEach((fn) => fn()); }
});

// ---- Gap 2: session history ---------------------------------------------------------------------------------------------------------------

test('an unfinished capture is not "completed" session history, but the current execution\'s own selection and a finished caveated answer are', async () => {
  const event = (executionId, status, captures, hash) => ({ executionId, metadataJson: { semanticKeyHash: hash }, execution: { status, resultJson: { captureRequests: captures } } });
  const restore = [stub(prisma.askExecutionEvent, 'findMany', async () => [
    event('earlier-abandoned-capture', 'READY_WITH_LIMITATIONS', [{ captureKey: 'k' }], 'hash-abandoned'),
    event('earlier-finished-caveated', 'READY_WITH_LIMITATIONS', [], 'hash-caveated'),
    event('earlier-answered', 'ANSWERED', [], 'hash-answered'),
    event('current', 'READY_WITH_LIMITATIONS', [{ captureKey: 'k' }], 'hash-current'),
  ])];
  try {
    const hashes = await history.loadCompletedSuggestedActionKeyHashes({ executionId: 'current', sessionId: 's1', userId: 'u1' });
    assert.deepEqual([...hashes].sort(), ['hash-answered', 'hash-caveated', 'hash-current']);
  } finally { restore.forEach((fn) => fn()); }
});

test('recent completed messages come from the session, excluding the current execution, and fail to an empty list', async () => {
  let seen;
  let restore = stub(prisma.askExecution, 'findMany', async (args) => { seen = args; return [{ message: 'What maintenance is pending?' }]; });
  try {
    assert.deepEqual(await history.loadRecentCompletedMessages({ sessionId: 's1', userId: 'u1', excludeExecutionId: 'now' }), ['What maintenance is pending?']);
    assert.equal(seen.where.id.not, 'now');
    assert.equal(seen.where.sessionId, 's1');
    assert.equal(seen.take, 5);
  } finally { restore(); }
  restore = stub(prisma.askExecution, 'findMany', async () => { throw new Error('db down'); });
  try { assert.deepEqual(await history.loadRecentCompletedMessages({ sessionId: 's1', userId: 'u1', excludeExecutionId: 'now' }), []); } finally { restore(); }
});

// ---- Gap 3: capture results reach the finalizer ----------------------------------------------------------------------------------------------

function captureDeps() {
  const offers = [];
  return {
    offers,
    deps: {
      clock: { now: () => NOW },
      loadOperationAvailability: async () => new Map(Object.keys(ASK_OPERATION_DEFINITIONS).map((id) => [id, null])),
      loadExecutionExpiresAt: async () => new Date(NOW.getTime() + 24 * 3600_000),
      loadCurrentOutcomeKeyHashes: async () => new Set(),
      loadLifecycleState: async () => ({ cooldownKeys: new Set(), completedKeys: new Set(), lastOfferedAtMs: new Map(), ok: true }),
      loadActionableCompleteness: async () => ({ fraction: 1, audienceUncertain: false }),
      loadActionableProfileState: async () => ({ denominatorVersion: 'v', audiences: [], audienceUncertain: false, fraction: 1, knownWeight: 1, totalWeight: 1, unresolved: [], unresolvedByArea: {} }),
      loadUrgentHomeActionState: async () => ({ nowCount: 0 }),
      loadHomeOpportunityState: async () => ({ contextVersion: 'v1', capitalItemsUpcoming: false, warrantyExpiring: false, openFindings: false }),
      loadActivePlanState: async () => ({ sellHoldRentActive: false }),
      recordOffers: async (input) => { offers.push(input); return { attempted: input.offers.length, ok: true }; },
      recordImpressions: () => {}, recordSuppression: () => {},
    },
  };
}
const execution = { id: 'exec-capture', sessionId: 's1', propertyId: PROPERTY, operationId: 'HOME_DEADLINE_MONITOR', message: 'Remind me about the water heater service' };

test('a direct-handler capture result with no governed row is finalized: governed actions, offers recorded, handler candidates no longer discarded', async () => {
  const { deps, offers } = captureDeps();
  const restore = [
    stub(prisma.askExecution, 'findMany', async () => []),
    stub(prisma.askExecutionEvent, 'findMany', async () => []),
  ];
  try {
    const raw = { status: 'COMPLETED', blocks: [], suggestions: [] };
    const governed = await ensureGovernedCaptureResult('u1', execution, raw, deps);
    assert.equal(governed.suggestedNextActionsGoverned, true);
    assert.ok(governed.suggestedNextActionsStatus, 'a status is reported');
    assert.ok((governed.suggestedNextActions ?? []).length > 0, 'a settled capture result carries next actions');
    assert.equal(offers.length, 1, 'the offered chips are recorded in the lifecycle');
  } finally { restore.forEach((fn) => fn()); }
});

test('an already governed result is returned untouched, a pending capture result gets no unrelated chips, and a finalizer failure keeps the original result', async () => {
  const { deps } = captureDeps();
  const restore = [stub(prisma.askExecution, 'findMany', async () => []), stub(prisma.askExecutionEvent, 'findMany', async () => [])];
  try {
    const already = { status: 'COMPLETED', blocks: [], suggestions: [], suggestedNextActionsGoverned: true, suggestedNextActions: [] };
    assert.equal(await ensureGovernedCaptureResult('u1', execution, already, deps), already);

    const pending = await ensureGovernedCaptureResult('u1', execution, { status: 'NEEDS_ENTITY', blocks: [], suggestions: [] }, deps);
    assert.deepEqual(pending.suggestedNextActions ?? [], [], 'a result waiting on the homeowner owns the turn');

    const broken = { status: 'COMPLETED', blocks: [], suggestions: [] };
    const kept = await ensureGovernedCaptureResult('u1', execution, broken, { ...deps, loadOperationAvailability: async () => { throw new Error('boom'); } });
    assert.ok(kept.status === 'COMPLETED', 'the original result survives a finalizer failure');
  } finally { restore.forEach((fn) => fn()); }
});

test('the capture persistence point governs the result before saving, and confirmation passes recent messages and records completion', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const capture = fs.readFileSync(path.resolve(__dirname, '../../src/services/ask/execution/askCapture.ts'), 'utf8');
  assert.match(capture, /result = await ensureGovernedCaptureResult\(userId, execution, result\);\n[^]*?const saved = await prisma\.\$transaction/, 'governed immediately before the single persistence transaction');
  assert.match(capture, /isSettledForCompletion\(result\)\) await recordSelectedSuggestedActionCompletion/);
  const confirm = fs.readFileSync(path.resolve(__dirname, '../../src/services/ask/execution/askConfirm.ts'), 'utf8');
  assert.match(confirm, /recentCompletedMessages: await loadRecentCompletedMessages\(/);
  assert.match(confirm, /isSettledForCompletion\(\{ status: saved\.status \}\)\) await recordSelectedSuggestedActionCompletion/);
});
