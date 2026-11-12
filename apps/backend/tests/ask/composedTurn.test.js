const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { runComposedTurn, recordAttempt, recoverComposedTurn, refreshComposedTurn, reserveAttempt, retryExhaustedComposedTurn, exhaustedComponentKeys, hasRetryRequest } = require('../../src/services/ask/composition/runComposedTurn.ts');
const { replayComposite, isStoredComposite } = require('../../src/services/ask/composition/replayGate.ts');
const { childClientRequestId, componentKeyOf } = require('../../src/services/ask/composition/attempts.ts');
const { assembleComposite, projectForDelivery } = require('../../src/services/ask/composition/compositeResult.ts');

// ---- an in-memory stand-in for the slice of the Prisma client the runner uses ----
function fakeDb(rows = []) {
  const table = new Map(rows.map((r) => [r.id, { ...r }]));
  const events = [];
  const hooks = { beforeUpdateMany: null };
  const matches = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(row[k]) : row[k] === v));
  const db = {
    table, events, hooks,
    askExecution: {
      async findUnique({ where }) { const r = table.get(where.id); return r ? JSON.parse(JSON.stringify({ ...r, expiresAt: r.expiresAt })) && { ...r } : null; },
      async findMany({ where }) { return [...table.values()].filter((r) => matches(r, where)).map((r) => ({ ...r })); },
      async update({ where, data }) { const r = table.get(where.id); Object.assign(r, data); return { ...r }; },
      async updateMany({ where, data }) {
        if (hooks.beforeUpdateMany && hooks.beforeUpdateMany({ where, data, table })) return { count: 0 };
        const hit = [...table.values()].filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
    askExecutionEvent: { async create({ data }) { events.push(data); return data; } },
  };
  return db;
}

const NOW = new Date('2026-11-10T12:00:00Z');
const parentRow = (extra = {}) => ({ id: 'parent-1', userId: 'u1', clientRequestId: 'req-1', sessionId: 's1', propertyId: 'p1', status: 'RECEIVED', assemblyVersion: null, parametersJson: null, resultJson: null, reasonCode: null, expiresAt: new Date('2026-12-10T12:00:00Z'), ...extra });
const clauses = [
  { clause: 'How old is my roof?', operationId: 'INVENTORY_LOOKUP', confidence: 0.96 },
  { clause: 'What would a new roof cost?', operationId: 'ITEM_REPLACEMENT_COST', confidence: 0.95 },
];
const cost = (basis, min, max) => ({ key: 'item.replacementCost', itemKey: 'ROOF', basis, minCents: min, maxCents: max });
const summary = (id, title, actions = []) => ({ type: 'SUMMARY', id, title, body: title, tone: 'DEFAULT', actions });
const ANSWERS = {
  INVENTORY_LOOKUP: { status: 'ANSWERED', blocks: [summary('inventory-roof-profile', 'Your roof is about 7 years old', [{ id: 'add-inventory-item', label: 'Add an item', interactionType: 'START_WORKFLOW', message: 'Add an item', operationId: 'INVENTORY_ITEM_CREATE' }])], quantities: [cost('TODAY', 800_000, 1_500_000)], sources: [{ sourceType: 'InventoryItem', sourceId: 'inv-1' }] },
  ITEM_REPLACEMENT_COST: { status: 'ANSWERED', blocks: [summary('item-cost-summary', 'A new Roof is about $11,500 in today’s dollars'), { type: 'TABLE', id: 'item-cost-items', title: 'The item', columns: [{ key: 'today', label: 'Today’s dollars' }], rows: [{ id: 'r', values: { today: '$8,000–$15,000' } }], actions: [] }], quantities: [cost('TODAY', 800_000, 1_500_000), cost('WINDOW', 1_660_000, 3_120_000)], sources: [{ sourceType: 'HomeCapitalTimelineItem', sourceId: 'tl-1' }] },
};

/** A scripted createChild: `script(operationId, attemptNumber)` returns { status, throws? } overriding the default answer. */
function scriptedChildren(db, script = () => null) {
  const calls = [];
  let n = 0;
  const createChild = async (userId, request, accountRole, internal) => {
    const operationId = request.launchContext.operationId;
    const attempt = Number(request.clientRequestId.split(':attempt:')[1]);
    calls.push({ request, internal, operationId, attempt });
    const override = script(operationId, attempt) ?? {};
    if (override.throws) throw new Error('child failed before persisting');
    const base = ANSWERS[operationId];
    const status = override.status ?? base.status;
    const id = `child-${++n}`;
    db.table.set(id, { id, userId, clientRequestId: request.clientRequestId, status, parentExecutionId: internal.composition.parentExecutionId, parentRole: 'COMPONENT', reasonCode: override.reasonCode ?? null,
      resultJson: { blocks: status === 'ANSWERED' || status === 'READY_WITH_LIMITATIONS' ? base.blocks : [{ type: 'SUMMARY', id: 'x', title: 'Needs a detail', body: '', tone: 'DEFAULT', actions: [] }] }, parametersJson: status === 'ANSWERED' || status === 'READY_WITH_LIMITATIONS' ? { ...(status === 'ANSWERED' ? { quantities: base.quantities } : {}), sources: base.sources } : null, expiresAt: internal.composition.expiresAt });
    return { executionId: id, status };
  };
  return { createChild, calls };
}

const allowAll = async () => ({ propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true });
const run = (db, createChild, extra = {}) => runComposedTurn({ db, userId: 'u1', parent: db.table.get('parent-1'), message: 'how old is my roof and what would a new one cost', sessionId: 's1', propertyId: 'p1', clauses, createChild, loadAuthorizationView: allowAll, executionTimeoutMs: 30_000, now: () => NOW, ...extra });

test('a composed turn: two component children, one parent, one assembled response with one basis, no write offers', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild, calls } = scriptedChildren(db);
  const parent = await run(db, createChild);
  assert.equal(parent.status, 'ANSWERED');
  assert.equal(parent.reasonCode, undefined);
  // children: declared operation, deterministic key, the parent's expiresAt, linked to the parent
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.request.launchContext.surface, 'ASK_COMPOSED_COMPONENT');
    assert.equal(call.internal.composition.parentExecutionId, 'parent-1');
    assert.equal(call.internal.composition.expiresAt.getTime(), new Date('2026-12-10T12:00:00Z').getTime());
    assert.match(call.request.clientRequestId, /^ask-component:[0-9a-f]{24}:attempt:1$/);
  }
  // one response: answer-first, then both sections with section-prefixed ids; the write offer is withheld
  const blocks = parent.resultJson.blocks;
  assert.equal(blocks[0].id, 'composite-answer-first');
  assert.match(blocks[0].title, /7 years old/);
  assert.match(blocks[0].body, /replacement in today’s dollars: \$8,000–\$15,000/);
  assert.ok(blocks.some((b) => b.id === 's1-inventory-roof-profile'));
  assert.ok(blocks.some((b) => b.id === 's2-item-cost-summary'));
  assert.ok(!JSON.stringify(blocks).includes('add-inventory-item'), 'a composite never offers a write');
  // version: 0 at creation, +1 per recorded attempt (2), +1 for the final write
  assert.equal(parent.assemblyVersion, 5, '0 + 2 reservations + 2 completions + 1 composite write');
  assert.equal(parent.resultJson.composite.attempts.length, 2);
  assert.equal(parent.resultJson.composite.coverage, 'COMPLETE');
  assert.equal(parent.resultJson.composite.validationIssues.length, 0);
});

test('FR-PER-2: a retried parent request computes the same child keys', async () => {
  const keysOf = async () => { const db = fakeDb([parentRow()]); const s = scriptedChildren(db); await run(db, s.createChild); return s.calls.map((c) => c.request.clientRequestId).sort(); };
  assert.deepEqual(await keysOf(), await keysOf());
  const expected = childClientRequestId('req-1', componentKeyOf('INVENTORY_LOOKUP', { clause: 'how old is my roof?' }), 1);
  assert.ok((await keysOf()).includes(expected));
});

test('FR-PER-5/10/15: a retryable child is retried once; the successful attempt is selected and the parent reassembles once', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild, calls } = scriptedChildren(db, (op, attempt) => (op === 'ITEM_REPLACEMENT_COST' && attempt === 1 ? { status: 'FAILED_RETRYABLE', reasonCode: 'AskExecutionTimeoutError' } : null));
  const parent = await run(db, createChild);
  assert.equal(calls.filter((c) => c.operationId === 'ITEM_REPLACEMENT_COST').length, 2);
  assert.equal(parent.status, 'ANSWERED');
  assert.equal(parent.resultJson.composite.coverage, 'COMPLETE');
  const attempts = parent.resultJson.composite.attempts.filter((a) => a.componentKey.startsWith('ITEM_REPLACEMENT_COST'));
  assert.deepEqual(attempts.map((a) => [a.number, a.kind, a.status]), [[1, 'INITIAL', 'FAILED_RETRYABLE'], [2, 'RETRY', 'ANSWERED']]);
  assert.equal(parent.resultJson.composite.sections.find((s) => s.operationId === 'ITEM_REPLACEMENT_COST').attempt, 2);
});

test('D9: retries exhausted gives a partial composite (limited, coverage PARTIAL) with the timeout reason, the other section intact', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild, calls } = scriptedChildren(db, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { status: 'FAILED_RETRYABLE' } : null));
  const parent = await run(db, createChild);
  assert.equal(calls.filter((c) => c.operationId === 'ITEM_REPLACEMENT_COST').length, 2, 'one automatic retry only');
  assert.equal(parent.status, 'READY_WITH_LIMITATIONS');
  assert.equal(parent.reasonCode, 'COMPOSITE_PARTIAL');
  assert.equal(parent.resultJson.composite.coverage, 'PARTIAL');
  assert.equal(parent.resultJson.composite.notAnswered[0].reasonCode, 'AskExecutionTimeoutError');
  assert.ok(parent.resultJson.blocks.some((b) => b.id === 's1-inventory-roof-profile'));
  assert.ok(parent.resultJson.blocks.some((b) => b.id === 'composite-not-answered'));
});

test('FR-PER-16: near family expiration the retry is rejected, not extended, and the component converts to a terminal limitation', async () => {
  const db = fakeDb([parentRow({ expiresAt: new Date(NOW.getTime() + 10_000) })]);
  const { createChild, calls } = scriptedChildren(db, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { status: 'FAILED_RETRYABLE' } : null));
  const parent = await run(db, createChild);
  assert.equal(calls.filter((c) => c.operationId === 'ITEM_REPLACEMENT_COST').length, 1, 'no retry attempt was created');
  assert.equal(parent.resultJson.composite.coverage, 'PARTIAL');
  for (const call of calls) assert.ok(call.internal.composition.expiresAt <= new Date(NOW.getTime() + 10_000), 'no child outlives its parent');
});

test('a child that throws before persisting is a retryable failure, retried once, then a limitation', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild, calls } = scriptedChildren(db, (op) => (op === 'INVENTORY_LOOKUP' ? { throws: true } : null));
  const parent = await run(db, createChild);
  assert.equal(calls.filter((c) => c.operationId === 'INVENTORY_LOOKUP').length, 2);
  assert.equal(parent.resultJson.composite.coverage, 'PARTIAL');
  assert.ok(parent.resultJson.blocks.some((b) => b.id === 's1-item-cost-summary'));
});

test('neither part answered: one limited response, no composite sections', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild } = scriptedChildren(db, () => ({ status: 'FAILED_TERMINAL' }));
  const parent = await run(db, createChild);
  assert.equal(parent.status, 'READY_WITH_LIMITATIONS');
  assert.equal(parent.reasonCode, 'COMPOSITE_NONE_ANSWERED');
  assert.equal(parent.resultJson.composite.notAnswered.length, 2);
});

test('§6.2: an independent clarification gives a partial answer; both unresolved ask one clarification alone under the parent', async () => {
  const db1 = fakeDb([parentRow()]);
  const one = await run(db1, scriptedChildren(db1, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { status: 'NEEDS_CLARIFICATION' } : null)).createChild);
  assert.equal(one.resultJson.composite.coverage, 'PARTIAL');
  const db2 = fakeDb([parentRow()]);
  const both = await run(db2, scriptedChildren(db2, () => ({ status: 'NEEDS_CLARIFICATION', reasonCode: 'ASK_ROUTING_AMBIGUOUS' })).createChild);
  assert.equal(both.status, 'NEEDS_CLARIFICATION');
  assert.equal(both.resultJson.composite, undefined, 'a clarification is not a composite');
});

test('FR-AUT-2: property access lost before the composite becomes visible withholds everything', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild } = scriptedChildren(db);
  const parent = await run(db, createChild, { loadAuthorizationView: async () => ({ propertyAccess: false, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true }) });
  assert.equal(parent.status, 'UNAVAILABLE');
  assert.equal(parent.reasonCode, 'ASK_PROPERTY_NOT_FOUND');
  assert.ok(!JSON.stringify(parent.resultJson).includes('7 years old'), 'no section data is stored in the visible result');
  assert.ok(!JSON.stringify(parent.resultJson.blocks).includes('11,500'));
});

test('FR-AUT-3: a role that no longer reaches one operation redacts only that section', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild } = scriptedChildren(db);
  const parent = await run(db, createChild, { loadAuthorizationView: async () => ({ propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: (op) => op !== 'ITEM_REPLACEMENT_COST' }) });
  assert.equal(parent.resultJson.composite.coverage, 'PARTIAL');
  assert.ok(parent.resultJson.blocks.some((b) => b.id === 's1-inventory-roof-profile'));
  assert.ok(!JSON.stringify(parent.resultJson.blocks).includes('11,500'));
});

test('FR-PER-13: when the compare-and-set on the claimed version is lost, the loser reassembles against the new version and writes once', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild } = scriptedChildren(db);
  let lost = 0;
  db.hooks.beforeUpdateMany = ({ data, table }) => {
    if (data.resultJson && lost === 0) { lost += 1; table.get('parent-1').assemblyVersion += 1; return true; } // a concurrent mutation moved the version
    return false;
  };
  const parent = await run(db, createChild);
  assert.equal(lost, 1);
  assert.equal(parent.status, 'ANSWERED');
  assert.equal(db.events.filter((e) => e.eventType === 'COMPOSED_TURN_STARTED').length, 1);
  assert.equal(parent.assemblyVersion, 6, '0 + 2 reservations + 2 completions + 1 concurrent mutation + 1 winning composite write');
});

test('FR-PER-13: two simultaneous attempt completions both land in the attempt set', async () => {
  const db = fakeDb([parentRow({ assemblyVersion: 0, parametersJson: { composition: { attempts: [] } } })]);
  const a = { executionId: 'a', componentKey: 'K1', number: 1, kind: 'INITIAL', status: 'ANSWERED' };
  const b = { executionId: 'b', componentKey: 'K2', number: 1, kind: 'INITIAL', status: 'ANSWERED' };
  await Promise.all([recordAttempt(db, 'parent-1', a), recordAttempt(db, 'parent-1', b)]);
  const row = db.table.get('parent-1');
  assert.equal(row.parametersJson.composition.attempts.length, 2);
  assert.equal(row.assemblyVersion, 2);
  // a duplicate completion is a no-op and leaves the version unchanged
  await recordAttempt(db, 'parent-1', a);
  assert.equal(db.table.get('parent-1').assemblyVersion, 2);
});

test('FR-PER-13: a composite parent with a null version is an invariant failure', async () => {
  const db = fakeDb([parentRow({ assemblyVersion: null })]);
  await assert.rejects(() => recordAttempt(db, 'parent-1', { executionId: 'a', componentKey: 'K', number: 1, kind: 'INITIAL', status: 'RUNNING' }), /no assembly version/);
});

// ---- replay (FR-PER-6, §6.10) ----
async function storedComposite() {
  const db = fakeDb([parentRow()]);
  return run(db, scriptedChildren(db).createChild);
}

test('FR-PER-6: replay applies the CURRENT authorization to the complete composite; the stored domain answer is not recomputed', async () => {
  const stored = await storedComposite();
  assert.equal(isStoredComposite(stored), true);
  assert.deepEqual(await replayComposite(stored, { propertyAccess: false, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true }), { kind: 'WITHHELD' });
  const same = await replayComposite(stored, { propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true });
  assert.equal(same.kind, 'DELIVER');
  assert.equal(same.status, 'ANSWERED');
  assert.deepEqual(same.delivered.blocks, stored.resultJson.blocks, 'unchanged authorization delivers the same projection');
  const redacted = await replayComposite(stored, { propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: (op) => op !== 'ITEM_REPLACEMENT_COST' });
  assert.equal(redacted.kind, 'DELIVER');
  assert.equal(redacted.status, 'READY_WITH_LIMITATIONS');
  assert.ok(!JSON.stringify(redacted.delivered.blocks).includes('11,500'), 'a redacted section is gone from the delivered projection');
  assert.ok(redacted.delivered.blocks.some((b) => b.id === 's1-inventory-roof-profile'));
  assert.equal(redacted.delivered.composite.coverage, 'PARTIAL');
  assert.equal(stored.parametersJson.composition.assembled.composite.sections.length, 2, 'the complete composite is unchanged in the parent');
  assert.deepEqual(await replayComposite({ resultJson: { blocks: [] } }, { propertyAccess: false, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => false }), { kind: 'UNCHANGED' });
});

test('FR-PER-6: a section hidden at first assembly reappears when its authorization is restored; so does a fully withheld composite', async () => {
  const hideCost = { propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: (op) => op !== 'ITEM_REPLACEMENT_COST' };
  const db = fakeDb([parentRow()]);
  const partial = await run(db, scriptedChildren(db).createChild, { loadAuthorizationView: async () => hideCost });
  assert.ok(!JSON.stringify(partial.resultJson.blocks).includes('11,500'), 'hidden at assembly');
  assert.equal(partial.parametersJson.composition.assembled.composite.sections.length, 2, 'but the durable composite keeps both sections');
  const restored = await replayComposite(partial, { propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true });
  assert.equal(restored.kind, 'DELIVER');
  assert.equal(restored.status, 'ANSWERED');
  assert.ok(JSON.stringify(restored.delivered.blocks).includes('11,500'), 'the section is back');
  assert.equal(restored.delivered.composite.coverage, 'COMPLETE');
  // Fully withheld at assembly (access lost): the stored result has no sections, yet later reads still run the composite gate.
  const dbW = fakeDb([parentRow()]);
  const withheld = await run(dbW, scriptedChildren(dbW).createChild, { loadAuthorizationView: async () => ({ propertyAccess: false, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true }) });
  assert.equal(withheld.status, 'UNAVAILABLE');
  assert.equal(isStoredComposite(withheld), true, 'a withheld composite is still a stored composite, so it is never read around the gate');
  assert.deepEqual(await replayComposite(withheld, { propertyAccess: false, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true }), { kind: 'WITHHELD' });
  const back = await replayComposite(withheld, { propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true });
  assert.equal(back.kind, 'DELIVER');
  assert.ok(JSON.stringify(back.delivered.blocks).includes('11,500'));
});

// ---- retention (FR-PER-14) ----
test('FR-PER-14: retention deletes a composite and its component children together, and orphans are found by role AND a missing parent', async () => {
  const { prisma } = require('../../src/lib/prisma.ts');
  const { purgeExpiredAskExecutions, purgeOrphanedComponentChildren } = require('../../src/services/ask/askRetention.service.ts');
  const calls = [];
  const original = { findMany: prisma.askExecution.findMany, deleteMany: prisma.askExecution.deleteMany, tx: prisma.$transaction };
  prisma.askExecution.findMany = async (args) => { calls.push(['findMany', args.where]); return args.where.expiresAt ? [{ id: 'parent-1' }] : []; };
  prisma.askExecution.deleteMany = async (args) => { calls.push(['deleteMany', args.where]); return { count: 1 }; };
  prisma.$transaction = async (ops) => Promise.all(ops);
  try {
    const removed = await purgeExpiredAskExecutions(new Date('2026-12-11T00:00:00Z'));
    assert.equal(removed, 2);
    const deletes = calls.filter(([kind]) => kind === 'deleteMany').map(([, where]) => where);
    assert.deepEqual(deletes[0], { parentRole: 'COMPONENT', parentExecutionId: { in: ['parent-1'] } });
    assert.deepEqual(deletes[1], { id: { in: ['parent-1'] } });
    calls.length = 0;
    prisma.askExecution.findMany = async (args) => { calls.push(['findMany', args.where]); return [{ id: 'orphan-1' }]; };
    assert.equal(await purgeOrphanedComponentChildren(), 1);
    assert.deepEqual(calls[0][1], { parentRole: 'COMPONENT', parentExecutionId: null });
    assert.deepEqual(calls[1][1], { id: { in: ['orphan-1'] }, parentRole: 'COMPONENT', parentExecutionId: null });
  } finally {
    prisma.askExecution.findMany = original.findMany; prisma.askExecution.deleteMany = original.deleteMany; prisma.$transaction = original.tx;
  }
});

test('the stored composite is a valid Ask response: it maps to ordinary blocks, with no children and no schema fallback', async () => {
  const { mapPersistedExecution, ASK_SCHEMA_FALLBACK_BLOCK_ID } = require('../../src/services/ask/askHandlerSupport.ts');
  const db = fakeDb([parentRow({ createdAt: NOW, updatedAt: NOW, message: 'how old is my roof and what would a new one cost', operationId: null, operationVersion: null, intentFamily: null, contextVersion: null, completedAt: NOW, errorCode: null, launchContextJson: null, skillId: null, skillVersion: null, continuesExecutionId: null })]);
  const parent = await run(db, scriptedChildren(db).createChild);
  const response = mapPersistedExecution(parent, { id: 'p1', label: '94 Ashford Dr' });
  assert.ok(!response.blocks.some((b) => b.id === ASK_SCHEMA_FALLBACK_BLOCK_ID), 'the composite passed the response schema');
  assert.equal(response.status, 'ANSWERED');
  assert.deepEqual(response.childExecutions, [], 'component children are not delivered as separate transcript items');
  assert.equal(response.blocks[0].id, 'composite-answer-first');
  assert.ok(response.blocks.length >= 4);
});

test('a settled composite persists the governed Suggested Next Actions returned for the parent execution', async () => {
  const db = fakeDb([parentRow()]);
  const parent = await run(db, scriptedChildren(db).createChild, {
    finalizeResult: async (result) => ({
      ...result,
      suggestedNextActionsGoverned: true,
      suggestedNextActionsStatus: { state: 'READY', shownCount: 1, expectedCount: 4, reasonCodes: [] },
      suggestedNextActions: [{ id: 'parent-next-1', label: 'Review the capital outlook' }],
    }),
  });
  assert.equal(parent.resultJson.suggestedNextActionsGoverned, true);
  assert.deepEqual(parent.resultJson.suggestedNextActionsStatus, { state: 'READY', shownCount: 1, expectedCount: 4, reasonCodes: [] });
  assert.deepEqual(parent.resultJson.suggestedNextActions, [{ id: 'parent-next-1', label: 'Review the capital outlook' }]);
});

test('a limited composite does not claim that both parts were answered', () => {
  const limited = assembleComposite({
    outcomes: Object.entries(ANSWERS).map(([operationId, entry], index) => ({
      clause: clauses[index].clause,
      operationId,
      executionId: `limited-${index}`,
      attempt: 1,
      status: 'READY_WITH_LIMITATIONS',
      blocks: entry.blocks,
      quantities: [],
      sources: entry.sources,
      componentKey: `limited-${index}`,
      selectionReason: 'ONLY_TERMINAL_LIMITED',
    })),
    dated: false,
  });
  const envelope = require('../../src/services/ask/composition/runComposedTurn.ts').compositeEnvelope(limited, projectForDelivery(limited), [], []);
  assert.match(envelope.blocks[0].body, /limits of what is recorded/);
  assert.doesNotMatch(envelope.blocks[0].body, /answered below/);
});

test('§10: a part that cannot be answered is stated plainly with capability discovery, and the notice is a valid Ask response', async () => {
  const { mapPersistedExecution, ASK_SCHEMA_FALLBACK_BLOCK_ID } = require('../../src/services/ask/askHandlerSupport.ts');
  const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
  const db = fakeDb([parentRow({ createdAt: NOW, updatedAt: NOW, message: 'x', operationId: null, operationVersion: null, intentFamily: null, contextVersion: null, completedAt: NOW, errorCode: null, launchContextJson: null, skillId: null, skillVersion: null, continuesExecutionId: null })]);
  const parent = await run(db, scriptedChildren(db, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { status: 'FAILED_TERMINAL' } : null)).createChild);
  const notice = parent.resultJson.blocks.find((b) => b.id === 'composite-not-answered');
  assert.match(notice.body, /could not be answered right now/);
  const action = notice.actions[0];
  assert.equal(action.operationId, 'CAPABILITY_DISCOVERY');
  assert.equal(resolveAskOperation(action.message).operationId, 'CAPABILITY_DISCOVERY', 'the action asks something the router maps to capability discovery');
  const response = mapPersistedExecution(parent, { id: 'p1', label: 'Home' });
  assert.ok(!response.blocks.some((b) => b.id === ASK_SCHEMA_FALLBACK_BLOCK_ID));
  // no general-knowledge answer is ever offered for the unanswered part
  assert.ok(!JSON.stringify(parent.resultJson.blocks).toLowerCase().includes('typically costs'));
});

// ---- review round: clarification, reservation, recovery, refresh, pending, retry margin -------------------------------------------------------------
const keyOf = (c) => componentKeyOf(c.operationId, { clause: c.clause.trim().replace(/\s+/g, ' ').toLowerCase() });
/** createChild that is idempotent on clientRequestId, like createAskExecution: the same id returns the same child. */
function idempotentChildren(db, script = () => null) {
  const inner = scriptedChildren(db, script);
  const seen = new Map();
  const createChild = async (userId, request, role, internal) => {
    if (seen.has(request.clientRequestId)) return seen.get(request.clientRequestId);
    const response = await inner.createChild(userId, request, role, internal);
    seen.set(request.clientRequestId, response);
    return response;
  };
  return { createChild, calls: inner.calls };
}
const resume = (db, createChild, fn, extra = {}) => fn({ db, userId: 'u1', parent: db.table.get('parent-1'), message: 'how old is my roof and what would a new one cost', sessionId: 's1', propertyId: 'p1', createChild, loadAuthorizationView: allowAll, executionTimeoutMs: 30_000, now: () => NOW, ...extra });

test('an independent clarification keeps its own focused question beside the answered section', async () => {
  const db = fakeDb([parentRow()]);
  const parent = await run(db, scriptedChildren(db, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { status: 'NEEDS_CLARIFICATION' } : null)).createChild);
  const blocks = parent.resultJson.blocks;
  assert.ok(blocks.some((b) => b.id === 's1-inventory-roof-profile'), 'the answered part is shown');
  assert.ok(blocks.some((b) => b.id === 'x' && b.title === 'Needs a detail'), 'the clarification question is shown, not lost');
  const note = blocks.find((b) => b.id === 'composite-not-answered');
  assert.equal(note.title, 'One part needs a detail');
  assert.deepEqual(note.actions, [], 'a clarification is not a failure: no capability-discovery action');
});

test('FR-PER-13: two overlapping reservations for one component get distinct numbers', async () => {
  const db = fakeDb([parentRow({ assemblyVersion: 0, parametersJson: { composition: { attempts: [] } } })]);
  const [a, b] = await Promise.all([1, 2].map(() => reserveAttempt(db, 'parent-1', 'K', 'REFRESH', (n) => `cid-${n}`, { now: NOW, executionTimeoutMs: 30_000 })));
  assert.notEqual(a.number, b.number);
  assert.deepEqual(db.table.get('parent-1').parametersJson.composition.attempts.map((x) => x.number).sort(), [1, 2]);
});

test('FR-PER-16: a retry is admitted against the parent’s current row and needs two timeouts of margin', async () => {
  const soon = parentRow({ assemblyVersion: 0, parametersJson: { composition: { attempts: [] } }, expiresAt: new Date(NOW.getTime() + 45_000) });
  const db = fakeDb([soon]);
  assert.equal(await reserveAttempt(db, 'parent-1', 'K', 'RETRY', (n) => `c${n}`, { now: NOW, executionTimeoutMs: 30_000 }), null, '45s left is under two 30s timeouts');
  assert.deepEqual(db.table.get('parent-1').parametersJson.composition.attempts, [], 'nothing was reserved');
  assert.ok(await reserveAttempt(db, 'parent-1', 'K', 'INITIAL', (n) => `c${n}`, { now: NOW, executionTimeoutMs: 30_000 }), 'an initial attempt is never gated by the retry margin');
});

test('FR-PER-4: an interrupted composite is recovered on the same parent: the answered part is kept, only the reserved one runs, then it reassembles', async () => {
  const [inv, cst] = clauses;
  const db = fakeDb([parentRow({ status: 'RUNNING', assemblyVersion: 3, parametersJson: { composition: { clauses, attempts: [
    { executionId: 'child-a', componentKey: keyOf(inv), number: 1, kind: 'INITIAL', status: 'ANSWERED' },
    { executionId: `unstarted:${childClientRequestId('req-1', keyOf(cst), 1)}`, componentKey: keyOf(cst), number: 1, kind: 'INITIAL', status: 'RUNNING' },
  ] } } })]);
  db.table.set('child-a', { id: 'child-a', userId: 'u1', status: 'ANSWERED', resultJson: { blocks: ANSWERS.INVENTORY_LOOKUP.blocks }, parametersJson: { quantities: ANSWERS.INVENTORY_LOOKUP.quantities }, reasonCode: null });
  const { createChild, calls } = idempotentChildren(db);
  const parent = await resume(db, createChild, recoverComposedTurn);
  assert.equal(calls.length, 1, 'only the missing component ran');
  assert.equal(calls[0].operationId, 'ITEM_REPLACEMENT_COST');
  assert.equal(calls[0].attempt, 1, 'the reserved attempt number is reused, so the child key is the same one');
  assert.equal(parent.status, 'ANSWERED');
  assert.equal(parent.resultJson.composite.attempts.length, 2, 'the authoritative attempt set was kept, not reset');
  assert.ok(db.events.some((e) => e.eventType === 'COMPOSED_TURN_RECOVERED'));
});

test('recovery of a parent with no stored clauses is an invariant failure, never a guess', async () => {
  const db = fakeDb([parentRow({ status: 'RUNNING', assemblyVersion: 1, parametersJson: { composition: { attempts: [] } } })]);
  await assert.rejects(resume(db, idempotentChildren(db).createChild, recoverComposedTurn), /no stored clauses/);
});

test('refresh reruns every component as a REFRESH attempt and reassembles; a limited refresh never replaces a better stored answer', async () => {
  const db = fakeDb([parentRow()]);
  let refreshing = false;
  const { createChild } = idempotentChildren(db, (op) => (refreshing && op === 'ITEM_REPLACEMENT_COST' ? { status: 'READY_WITH_LIMITATIONS' } : null));
  await run(db, createChild);
  refreshing = true;
  const refreshed = await resume(db, createChild, refreshComposedTurn);
  const attempts = refreshed.resultJson.composite.attempts;
  assert.equal(attempts.filter((a) => a.kind === 'REFRESH').length, 2, 'every selected component was refreshed');
  const cost = refreshed.resultJson.composite.sections.find((sec) => sec.operationId === 'ITEM_REPLACEMENT_COST');
  assert.equal(cost.attempt, 1, 'the earlier ANSWERED attempt is preserved over a limited refresh');
  const inventory = refreshed.resultJson.composite.sections.find((sec) => sec.operationId === 'INVENTORY_LOOKUP');
  assert.equal(inventory.attempt, 2, 'a refresh that is as good supersedes');
  assert.ok(db.events.some((e) => e.eventType === 'COMPOSED_TURN_REFRESHED'));
});

test('a still-running child leaves the parent non-terminal instead of becoming a limitation', async () => {
  const db = fakeDb([parentRow()]);
  const parent = await run(db, scriptedChildren(db, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { status: 'RUNNING' } : null)).createChild);
  assert.equal(parent.status, 'RUNNING');
  assert.equal(parent.resultJson, null, 'nothing terminal was stored');
  assert.ok(db.events.some((e) => e.eventType === 'COMPOSITE_PENDING'));
});

// ---- FR-AUT-1 through the real runner ----
test('FR-AUT-1: a component whose operation left its sources undeclared is redacted at assembly, never delivered', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild } = scriptedChildren(db);
  const wrapped = async (...args) => {
    const response = await createChild(...args);
    if (args[1].launchContext.operationId === 'ITEM_REPLACEMENT_COST') { const row = db.table.get(response.executionId); row.parametersJson = { quantities: ANSWERS.ITEM_REPLACEMENT_COST.quantities }; }
    return response;
  };
  const parent = await run(db, wrapped);
  assert.equal(parent.resultJson.composite.coverage, 'PARTIAL');
  assert.ok(!JSON.stringify(parent.resultJson.blocks).includes('11,500'), 'the undeclared section is not delivered');
  assert.ok(parent.resultJson.blocks.some((b) => b.id === 's1-inventory-roof-profile'));
});

test('FR-AUT-1: the operation’s own verdict on a source record redacts only its section, with the sources stored as ids', async () => {
  const db = fakeDb([parentRow()]);
  const parent = await run(db, scriptedChildren(db).createChild, { loadAuthorizationView: async () => ({ propertyAccess: true, isOperationAuthorized: () => true, authorizeSources: async (op) => (op === 'INVENTORY_LOOKUP' ? 'REDACT_SECTION' : 'AUTHORIZED') }) });
  assert.ok(!JSON.stringify(parent.resultJson.blocks).includes('7 years old'));
  assert.ok(JSON.stringify(parent.resultJson.blocks).includes('11,500'));
  assert.deepEqual(parent.resultJson.composite.sections[0].sources, [{ sourceType: 'HomeCapitalTimelineItem', sourceId: 'tl-1' }]);
});

// ---- review round 3 ----
test('FR-PER-15(f): each section stores its component key and why its attempt was selected', async () => {
  const db = fakeDb([parentRow()]);
  const parent = await run(db, scriptedChildren(db).createChild);
  assert.deepEqual(parent.resultJson.composite.sections.map((sec) => sec.selectionReason), ['LOWEST_SUCCESSFUL', 'LOWEST_SUCCESSFUL']);
  assert.ok(parent.resultJson.composite.sections.every((sec) => typeof sec.componentKey === 'string' && sec.componentKey.includes('|')));
  assert.ok(parent.resultJson.composite.sections.every((sec) => sec.executionId && sec.attempt === 1), 'the selected attempt id and number are stored');
});

test('FR-PER-16: after the automatic retry is exhausted, a manual retry reruns only that component on the same parent and reassembles', async () => {
  const db = fakeDb([parentRow()]);
  let failing = true;
  const { createChild, calls } = idempotentChildren(db, (op) => (op === 'ITEM_REPLACEMENT_COST' && failing ? { throws: true } : null));
  const partial = await run(db, createChild);
  assert.equal(partial.reasonCode, 'COMPOSITE_PARTIAL');
  assert.equal(partial.status, 'READY_WITH_LIMITATIONS');
  assert.equal(exhaustedComponentKeys(db.table.get('parent-1')).length, 1, 'the exhausted component is detected on a limited, partial parent');
  failing = false;
  const before = calls.length;
  const retried = await resume(db, createChild, retryExhaustedComposedTurn);
  assert.equal(calls.length - before, 1, 'only the exhausted component ran');
  assert.equal(retried.status, 'ANSWERED');
  assert.equal(retried.resultJson.composite.coverage, 'COMPLETE');
  const costAttempts = retried.resultJson.composite.attempts.filter((a) => a.componentKey.startsWith('ITEM_REPLACEMENT_COST'));
  assert.deepEqual(costAttempts.map((a) => [a.number, a.kind]), [[1, 'INITIAL'], [2, 'RETRY'], [3, 'RETRY']]);
  assert.equal(retried.resultJson.composite.sections.find((sec) => sec.operationId === 'ITEM_REPLACEMENT_COST').attempt, 3);
  assert.equal(exhaustedComponentKeys(db.table.get('parent-1')).length, 0);
  assert.ok(db.events.some((e) => e.eventType === 'COMPOSED_TURN_RETRIED'));
});

test('FR-PER-16: a manual retry near family expiration is refused ("ask again"), reserving nothing', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild } = idempotentChildren(db, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { throws: true } : null));
  await run(db, createChild);
  const row = db.table.get('parent-1');
  const attemptsBefore = row.parametersJson.composition.attempts.length;
  row.expiresAt = new Date(NOW.getTime() + 45_000);
  assert.equal(await resume(db, createChild, retryExhaustedComposedTurn), 'TOO_NEAR_EXPIRATION');
  assert.equal(db.table.get('parent-1').parametersJson.composition.attempts.length, attemptsBefore);
  await assert.rejects(resume(fakeDb([parentRow({ assemblyVersion: 0, parametersJson: { composition: { attempts: [], clauses } } })]), createChild, retryExhaustedComposedTurn), /no exhausted component/);
});

// ---- review round 4: retry idempotency, selection for every component ----
test('FR-PER-10: the same manual retry delivered twice (concurrently, then again later) reserves one attempt and runs one child', async () => {
  const db = fakeDb([parentRow()]);
  let failing = true;
  const { createChild, calls } = idempotentChildren(db, (op) => (op === 'ITEM_REPLACEMENT_COST' && failing ? { throws: true } : null));
  await run(db, createChild);
  failing = false;
  const before = calls.length;
  const [a, b] = await Promise.all([1, 2].map(() => resume(db, createChild, retryExhaustedComposedTurn, { requestKey: 'retry-req-1' })));
  assert.ok(a && b);
  assert.equal(calls.length - before, 1, 'one child ran for two concurrent deliveries');
  const attempts = db.table.get('parent-1').parametersJson.composition.attempts.filter((x) => x.componentKey.startsWith('ITEM_REPLACEMENT_COST'));
  assert.equal(attempts.filter((x) => x.requestKey === 'retry-req-1').length, 1, 'one attempt carries the request key');
  assert.equal(hasRetryRequest(db.table.get('parent-1'), 'retry-req-1'), true);
  // A later duplicate, after the component is no longer exhausted, returns the parent as it stands rather than failing.
  const later = await resume(db, createChild, retryExhaustedComposedTurn, { requestKey: 'retry-req-1' });
  assert.equal(later.status, 'ANSWERED');
  assert.equal(calls.length - before, 1);
  // A different request key is a different retry: with nothing exhausted it is refused.
  await assert.rejects(resume(db, createChild, retryExhaustedComposedTurn, { requestKey: 'retry-req-2' }), /no exhausted component/);
});

const internalSelection = (row) => row.parametersJson.composition.selection;

test('FR-PER-15(f): the parent stores selection for every component; a component with no selectable attempt is PENDING with a null selection and its latest attempt kept as evidence', async () => {
  const dbF = fakeDb([parentRow()]);
  const failed = await run(dbF, scriptedChildren(dbF, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { throws: true } : null)).createChild);
  const f = internalSelection(failed);
  assert.equal(f.length, 2, 'one entry per component, answered or not');
  const answered = f.find((e) => e.operationId === 'INVENTORY_LOOKUP');
  assert.deepEqual([answered.selectionReason, answered.state, answered.selectedAttemptNumber], ['LOWEST_SUCCESSFUL', 'ANSWERED', 1]);
  const lost = f.find((e) => e.operationId === 'ITEM_REPLACEMENT_COST');
  assert.equal(lost.selectedAttemptId, null, 'a retryable-failed component has no selected attempt');
  assert.equal(lost.selectionReason, null, 'and no selection reason outside the FRD contract');
  assert.equal(lost.state, 'PENDING');
  assert.deepEqual([lost.latestAttemptStatus, lost.latestAttemptNumber], ['FAILED_RETRYABLE', 2], 'the latest attempt is kept separately as audit evidence');
  const dbC = fakeDb([parentRow()]);
  const clarifying = await run(dbC, scriptedChildren(dbC, (op) => (op === 'ITEM_REPLACEMENT_COST' ? { status: 'NEEDS_CLARIFICATION' } : null)).createChild);
  const c = internalSelection(clarifying).find((e) => e.operationId === 'ITEM_REPLACEMENT_COST');
  assert.deepEqual([c.selectedAttemptId, c.selectionReason, c.state], [null, null, 'CLARIFICATION'], 'a clarification is never selected as a terminal-limited attempt');
  assert.equal(c.latestAttemptStatus, 'NEEDS_CLARIFICATION', 'its attempt is kept as evidence');
  const dbN = fakeDb([parentRow()]);
  const none = await run(dbN, scriptedChildren(dbN, () => ({ status: 'FAILED_TERMINAL' })).createChild);
  assert.ok(internalSelection(none).every((e) => e.selectionReason === 'ONLY_TERMINAL_LIMITED' && e.state === 'FAILED'));
  for (const row of [failed, clarifying, none]) for (const e of internalSelection(row)) assert.ok(['LOWEST_SUCCESSFUL', 'EXPLICIT_REFRESH', 'ONLY_TERMINAL_LIMITED', null].includes(e.selectionReason), `only FRD reasons: ${e.selectionReason}`);
});

test('FR-PER-6: the delivered envelope carries no attempt or selection evidence for a redacted component, at assembly and on replay; the parent keeps all of it', async () => {
  const redactInventory = { propertyAccess: true, isOperationAuthorized: (op) => op !== 'INVENTORY_LOOKUP', authorizeSources: async () => 'AUTHORIZED' };
  const db = fakeDb([parentRow()]);
  const parent = await run(db, scriptedChildren(db).createChild, { loadAuthorizationView: async () => redactInventory });
  const delivered = JSON.stringify(parent.resultJson);
  assert.ok(!delivered.includes('INVENTORY_LOOKUP'), 'no operation id of the redacted component in what is delivered');
  assert.ok(!delivered.includes('how old is my roof'), 'no component key or normalized clause text of the redacted component');
  assert.ok(!parent.resultJson.composite.attempts.some((a) => a.componentKey.startsWith('INVENTORY_LOOKUP')));
  assert.ok(!parent.resultJson.selection.some((e) => e.operationId === 'INVENTORY_LOOKUP'));
  assert.equal(internalSelection(parent).length, 2, 'the stored parent keeps the complete selection');
  assert.equal(parent.parametersJson.composition.attempts.filter((a) => a.componentKey.startsWith('INVENTORY_LOOKUP')).length, 1, 'and the complete attempt set');
  // On replay: a fully delivered composite, then a later redaction.
  const dbFull = fakeDb([parentRow()]);
  const full = await run(dbFull, scriptedChildren(dbFull).createChild);
  assert.equal(full.resultJson.selection.length, 2);
  const replay = await replayComposite(full, redactInventory);
  assert.equal(replay.kind, 'DELIVER');
  const replayed = JSON.stringify(replay.delivered);
  assert.ok(!replayed.includes('INVENTORY_LOOKUP') && !replayed.includes('how old is my roof'));
  assert.equal(replay.delivered.selection.length, 1);
  assert.equal(replay.delivered.composite.attempts.length, 1);
  // A fully withheld composite delivers no evidence at all.
  const dbW = fakeDb([parentRow()]);
  const withheld = await run(dbW, scriptedChildren(dbW).createChild, { loadAuthorizationView: async () => ({ propertyAccess: false, isOperationAuthorized: () => true, authorizeSources: async () => 'AUTHORIZED' }) });
  assert.deepEqual(withheld.resultJson.composite.attempts, []);
  assert.deepEqual(withheld.resultJson.selection, []);
});

test('FR-DEC-4a / Amendment A: a deferred part is stored on the parent, named in the answer, and named again after recovery', async () => {
  const db = fakeDb([parentRow()]);
  const { createChild, calls } = scriptedChildren(db);
  const deferred = [{ clause: 'Should I repair or replace my roof?', reason: 'NOT_COMPOSABLE', operationId: 'REPLACEMENT_GUIDANCE' }];
  const parent = await run(db, createChild, { deferred });
  assert.equal(calls.length, 2, 'only the composable parts run; the deferred part creates no child');
  assert.ok(calls.every((c) => c.operationId !== 'REPLACEMENT_GUIDANCE'));
  assert.equal(parent.status, 'READY_WITH_LIMITATIONS');
  assert.equal(parent.resultJson.composite.coverage, 'PARTIAL');
  const note = parent.resultJson.blocks.find((b) => b.id === 'composite-not-answered');
  assert.ok(note, 'the deferred part is named');
  assert.match(note.body, /repair or replace my roof/i);
  assert.match(note.body, /Ask it separately/);
  // the plan is persisted (FR-PER-17): the stored parent carries the deferred part
  assert.deepEqual(db.table.get('parent-1').parametersJson.composition.deferred, deferred);
  // recovery re-reads the stored plan and names the same part
  const again = await recoverComposedTurn({ db, userId: 'u1', parent: db.table.get('parent-1'), message: 'm', sessionId: 's1', propertyId: 'p1', createChild, loadAuthorizationView: allowAll, executionTimeoutMs: 30_000, now: () => NOW });
  assert.match(again.resultJson.blocks.find((b) => b.id === 'composite-not-answered').body, /repair or replace my roof/i);
});
