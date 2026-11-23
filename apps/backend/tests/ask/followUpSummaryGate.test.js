const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { resolveAskFollowUpMessage } = require('../../src/services/ask/askFollowUpContext.ts');
const { evaluateContinuationContext } = require('../../src/services/ask/conversationSummary.ts');

// BICC-CTX-001/003: the conversation summary gates continuation. A follow-up does not resolve against a result from a home the person has left.
const NOW = new Date();
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000);
const turn = (id, propertyId, minutes, extra = {}) => ({ id, status: 'ANSWERED', operationId: 'MAINTENANCE_STATUS', propertyId, createdAt: minutesAgo(minutes), parametersJson: null, launchContextJson: null, resultJson: { blocks: [] }, message: 'What maintenance is due?', ...extra });

function stub(rows) {
  const original = { findMany: prisma.askExecution.findMany, findFirst: prisma.askExecution.findFirst, events: prisma.askExecutionEvent.findMany };
  const queries = [];
  prisma.askExecution.findMany = async (args) => { queries.push(['summary', args]); return rows.filter((r) => !r.parentExecutionId).sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ ...r })); };
  prisma.askExecution.findFirst = async (args) => {
    queries.push(['prior', args]);
    const candidates = rows.filter((r) => (args.where.propertyId === undefined || r.propertyId === args.where.propertyId) && (!args.where.id || r.id === args.where.id)).sort((a, b) => b.createdAt - a.createdAt);
    return candidates[0] ? { ...candidates[0] } : null;
  };
  prisma.askExecutionEvent.findMany = async () => [];
  return { queries, restore: () => { prisma.askExecution.findMany = original.findMany; prisma.askExecution.findFirst = original.findFirst; prisma.askExecutionEvent.findMany = original.events; } };
}
const checks = (overrides = {}) => ({
  propertyAccessible: async () => true,
  existingEntityIds: async (type, ids) => new Set(ids),
  expiredExecutionIds: async () => new Set(),
  ...overrides,
});
const resolve = (extra = {}) => resolveAskFollowUpMessage({ sessionId: 's1', userId: 'u1', propertyId: 'p2', message: 'Only show urgent', continuationChecks: checks(), ...extra });

test('after switching homes, a follow-up does not resolve against the other home and the person is told', async () => {
  // p2 has an older turn; the latest settled result belongs to p1 (the home the person just left)
  const s = stub([turn('old-p2', 'p2', 40), turn('latest-p1', 'p1', 2)]);
  try {
    const out = await resolve();
    assert.equal(out.sourceExecutionId, null, 'it did not continue from an older turn of this home');
    assert.equal(out.effectiveMessage, 'Only show urgent');
    assert.deepEqual(out.contextReset.reasons, ['PROPERTY_SWITCH']);
    assert.match(out.contextReset.disclosure, /switched homes/);
    assert.equal(s.queries.some(([name]) => name === 'prior'), false, 'no prior lookup ran once the gate blocked');
  } finally { s.restore(); }
});

test('on the same home a follow-up continues exactly as before', async () => {
  const s = stub([turn('p2-latest', 'p2', 2), turn('p2-older', 'p2', 30)]);
  try {
    const out = await resolve();
    assert.equal(out.contextReset ?? null, null);
    assert.equal(out.sourceExecutionId, 'p2-latest');
    assert.equal(out.forcedOperationId, 'MAINTENANCE_STATUS');
  } finally { s.restore(); }
});

test('a declared control is pinned to its own execution and bypasses the gate', async () => {
  const s = stub([turn('pinned-p2', 'p2', 50), turn('latest-p1', 'p1', 2)]);
  try {
    const out = await resolve({ declaredSourceExecutionId: 'pinned-p2' });
    assert.equal(out.contextReset ?? null, null);
    assert.equal(out.sourceExecutionId, 'pinned-p2');
    assert.equal(s.queries.some(([name]) => name === 'summary'), false, 'no summary read for a pinned control');
  } finally { s.restore(); }
});

test('without a user the gate is skipped and the existing behaviour applies', async () => {
  const s = stub([turn('p2-latest', 'p2', 2), turn('latest-p1', 'p1', 1)]);
  try {
    const out = await resolve({ userId: null });
    assert.equal(out.sourceExecutionId, 'p2-latest');
    assert.equal(s.queries.some(([name]) => name === 'summary'), false);
  } finally { s.restore(); }
});

test('a message that is not a follow-up never reads the summary', async () => {
  const s = stub([turn('latest-p1', 'p1', 1)]);
  try {
    const out = await resolve({ message: 'How old is my roof?' });
    assert.equal(out.sourceExecutionId, null);
    assert.equal(s.queries.length, 0);
  } finally { s.restore(); }
});

test('the summary read is scoped to the user and the session', async () => {
  const s = stub([turn('p2-latest', 'p2', 2)]);
  try {
    await resolve();
    const [, summaryQuery] = s.queries.find(([name]) => name === 'summary');
    assert.deepEqual(summaryQuery.where, { sessionId: 's1', userId: 'u1', parentExecutionId: null });
  } finally { s.restore(); }
});

test('the gate itself: no selected home means nothing to switch from, and an unknown history blocks nothing', async () => {
  const s = stub([turn('latest-p1', 'p1', 1)]);
  try {
    const none = await evaluateContinuationContext({ userId: 'u1', sessionId: 's1', propertyId: null }, prisma);
    assert.equal(none.blocked, false);
    const empty = stub([]);
    try { assert.equal((await evaluateContinuationContext({ userId: 'u1', sessionId: 's1', propertyId: 'p2' }, prisma)).blocked, false); } finally { empty.restore(); }
  } finally { s.restore(); }
});

test('an old switch outside the recency window is not a reason to block', async () => {
  const s = stub([turn('p2-latest', 'p2', 5), turn('ancient-p1', 'p1', 600)]);
  try {
    const out = await resolve();
    assert.equal(out.contextReset ?? null, null);
    assert.equal(out.sourceExecutionId, 'p2-latest');
  } finally { s.restore(); }
});

// BICC-CTX-002: "complete it" resolves by the canonical task id, not by matching a title.
const list = (items) => ({ blocks: [{ type: 'GROUPED_LIST', id: 'l', title: 'Tasks', sections: [{ id: 's', title: 'Open', count: items.length, items }], actions: [], filters: [] }] });
const task = (id, title) => ({ id, title, entityType: 'MAINTENANCE_TASK', meta: [] });

test('a single listed task is completed by its canonical id: no title is matched and the message is untouched', async () => {
  const s = stub([turn('t1', 'p2', 2, { resultJson: list([task('task-9', 'Clean gutters')]) })]);
  try {
    const out = await resolve({ message: 'Now complete it' });
    assert.equal(out.forcedOperationId, 'MAINTENANCE_TASK_COMPLETE');
    assert.deepEqual(out.suppliedInput, { taskId: 'task-9' });
    assert.equal(out.effectiveMessage, 'Now complete it', 'the title was not written into the message');
    assert.equal(out.sourceExecutionId, 't1');
  } finally { s.restore(); }
});

test('several listed tasks name nothing: "complete it" is not guessed', async () => {
  const s = stub([turn('t1', 'p2', 2, { resultJson: list([task('a', 'Clean gutters'), task('b', 'Service furnace')]) })]);
  try {
    const out = await resolve({ message: 'Now complete it' });
    assert.equal(out.forcedOperationId, null);
    assert.equal(out.suppliedInput, null);
  } finally { s.restore(); }
});

test('reschedule, update, cancel, archive, reopen and mark resolve by the canonical id too, and keep the person\'s own words', async () => {
  for (const message of ['Reschedule it to Friday', 'Update it to urgent', 'Cancel it', 'Archive it', 'Reopen it', 'Mark it urgent']) {
    const s = stub([turn('t1', 'p2', 2, { resultJson: list([task('task-9', 'Clean gutters')]) })]);
    try {
      const out = await resolve({ message });
      assert.equal(out.forcedOperationId, 'MAINTENANCE_TASK_UPDATE', message);
      assert.deepEqual(out.launchEntity, { entityType: 'MAINTENANCE_TASK', entityId: 'task-9' }, message);
      assert.equal(out.effectiveMessage, message, 'no title is written into the message, so a date or priority in it is still read');
      assert.equal(out.suppliedInput, null);
      assert.equal(out.sourceExecutionId, 't1');
    } finally { s.restore(); }
  }
});

test('complete still wins over the update verbs, and a non-task entity is never targeted by id', async () => {
  const one = stub([turn('t1', 'p2', 2, { resultJson: list([task('task-9', 'Clean gutters')]) })]);
  try {
    const out = await resolve({ message: 'Mark it complete' });
    assert.equal(out.forcedOperationId, 'MAINTENANCE_TASK_COMPLETE');
    assert.deepEqual(out.suppliedInput, { taskId: 'task-9' });
    assert.equal(out.launchEntity ?? null, null);
  } finally { one.restore(); }
  const other = stub([turn('t1', 'p2', 2, { resultJson: list([{ id: 'w-1', title: 'Roof warranty', entityType: 'WARRANTY', meta: [] }]) })]);
  try {
    const out = await resolve({ message: 'Reschedule it' });
    assert.equal(out.forcedOperationId, null);
    assert.equal(out.launchEntity ?? null, null);
  } finally { other.restore(); }
});

test('the canonical entity becomes launch context only when the client declared none', () => {
  const { withFollowUpEntity } = require('../../src/services/ask/askFollowUpContext.ts');
  const entity = { entityType: 'MAINTENANCE_TASK', entityId: 'task-9' };
  assert.deepEqual(withFollowUpEntity({ surface: 'ASK_FOLLOW_UP', sourceExecutionId: 't1' }, entity), { surface: 'ASK_FOLLOW_UP', sourceExecutionId: 't1', entityType: 'MAINTENANCE_TASK', entityId: 'task-9' });
  assert.deepEqual(withFollowUpEntity({ surface: 'ASK_PAGE', entityId: 'declared-1' }, entity), { surface: 'ASK_PAGE', entityId: 'declared-1' }, 'a declared entity is authoritative');
  assert.equal(withFollowUpEntity(undefined, entity), undefined, 'a safety turn has no launch context');
  assert.deepEqual(withFollowUpEntity({ surface: 'X' }, null), { surface: 'X' });
});

test('the id path needs the summary to agree: without a user it falls back to the existing behaviour', async () => {
  const s = stub([turn('t1', 'p2', 2, { resultJson: list([task('task-9', 'Clean gutters')]) })]);
  try {
    const out = await resolve({ message: 'Now complete it', userId: null });
    assert.equal(out.suppliedInput, null);
    assert.match(out.effectiveMessage, /Clean gutters/);
  } finally { s.restore(); }
});

test('the singular-entity reader returns typed ids only and none for lists, tables or an unidentified row', () => {
  const { singularEntityOf, digestFromRow } = require('../../src/services/ask/conversationSummary.ts');
  assert.deepEqual(singularEntityOf(list([task('x', 'T')])), { entityType: 'MAINTENANCE_TASK', entityId: 'x' });
  assert.equal(singularEntityOf(list([task('x', 'T'), task('y', 'U')])), null);
  assert.equal(singularEntityOf(list([{ id: 'x', title: 'T', meta: [] }])), null, 'a row with no entity type names nothing');
  assert.equal(singularEntityOf({ blocks: [{ type: 'SUMMARY', title: 'T', body: 'secret' }] }), null);
  assert.equal(singularEntityOf(null), null);
  const digest = digestFromRow({ id: 'e', status: 'ANSWERED', operationId: 'MAINTENANCE_STATUS', propertyId: 'p2', createdAt: new Date(), resultJson: list([task('task-9', 'Clean gutters')]) });
  assert.deepEqual(digest.entities, [{ entityType: 'MAINTENANCE_TASK', entityId: 'task-9' }]);
  assert.doesNotMatch(JSON.stringify(digest), /Clean gutters/);
});

// BICC-CTX-003: the live checks supply access loss, deletion and expiry to the reconciliation.
test('a home the person can no longer reach reads as access lost, not a switch', async () => {
  const s = stub([turn('old-p2', 'p2', 40), turn('latest-p1', 'p1', 2)]);
  try {
    const out = await resolve({ continuationChecks: checks({ propertyAccessible: async (id) => id !== 'p1' }) });
    assert.deepEqual(out.contextReset.reasons, ['ACCESS_LOST']);
    assert.match(out.contextReset.disclosure, /no longer available to you/);
    assert.equal(out.sourceExecutionId, null);
  } finally { s.restore(); }
});

test('the single task the last answer named was deleted: nothing is done, nothing is matched by title, and the person is told', async () => {
  const s = stub([turn('t1', 'p2', 2, { resultJson: list([task('task-9', 'Clean gutters')]) })]);
  try {
    for (const message of ['Now complete it', 'Reschedule it to Friday']) {
      const out = await resolve({ message, continuationChecks: checks({ existingEntityIds: async (type, ids) => new Set(ids.filter((id) => id !== 'task-9')) }) });
      assert.equal(out.forcedOperationId, null, message);
      assert.equal(out.suppliedInput, null);
      assert.equal(out.effectiveMessage, message, 'the title is not written into the message');
      assert.deepEqual(out.contextReset.reasons, ['ENTITY_DELETED']);
      assert.match(out.contextReset.disclosure, /no longer on this home/);
    }
  } finally { s.restore(); }
});

test('the existence check is scoped to the home and asked only for the entities the summary carries', async () => {
  const s = stub([turn('t1', 'p2', 2, { resultJson: list([task('task-9', 'Clean gutters')]) })]);
  const asked = [];
  try {
    await resolve({ message: 'Now complete it', continuationChecks: checks({ existingEntityIds: async (type, ids, property) => { asked.push([type, [...ids], property]); return new Set(ids); } }) });
    assert.deepEqual(asked, [['MAINTENANCE_TASK', ['task-9'], 'p2']]);
  } finally { s.restore(); }
});

test('a listed inventory item is updated by its canonical id as a review (the write still needs confirmation)', async () => {
  const s = stub([turn('i1', 'p2', 2, { operationId: 'INVENTORY_LOOKUP', resultJson: list([{ id: 'item-3', title: 'Furnace', entityType: 'INVENTORY_ITEM', meta: [] }]) })]);
  try {
    const out = await resolve({ message: 'Update it' });
    assert.equal(out.forcedOperationId, 'INVENTORY_ITEM_CORRECT');
    assert.deepEqual(out.launchEntity, { entityType: 'INVENTORY_ITEM', entityId: 'item-3' });
    assert.equal(out.effectiveMessage, 'Update it');
  } finally { s.restore(); }
});

test('an inventory item is never targeted by a verb that does not apply to it, nor when two are listed or it was deleted', async () => {
  const one = stub([turn('i1', 'p2', 2, { operationId: 'INVENTORY_LOOKUP', resultJson: list([{ id: 'item-3', title: 'Furnace', entityType: 'INVENTORY_ITEM', meta: [] }]) })]);
  try {
    assert.equal((await resolve({ message: 'Cancel it' })).forcedOperationId, null);
    const gone = await resolve({ message: 'Update it', continuationChecks: checks({ existingEntityIds: async () => new Set() }) });
    assert.equal(gone.forcedOperationId, null);
    assert.deepEqual(gone.contextReset.reasons, ['ENTITY_DELETED']);
  } finally { one.restore(); }
  const two = stub([turn('i1', 'p2', 2, { operationId: 'INVENTORY_LOOKUP', resultJson: list([{ id: 'a', title: 'Furnace', entityType: 'INVENTORY_ITEM', meta: [] }, { id: 'b', title: 'Boiler', entityType: 'INVENTORY_ITEM', meta: [] }]) })]);
  try { assert.equal((await resolve({ message: 'Update it' })).forcedOperationId, null); } finally { two.restore(); }
});

test('the real checks are scoped to the user and the home', async () => {
  const { buildContinuationChecks } = require('../../src/services/ask/askFollowUpContext.ts');
  const real = buildContinuationChecks('u1');
  const calls = [];
  const originals = { task: prisma.propertyMaintenanceTask.findMany, item: prisma.inventoryItem.findMany, exec: prisma.askExecution.findMany };
  prisma.propertyMaintenanceTask.findMany = async (args) => { calls.push(['task', args]); return [{ id: 'task-9' }]; };
  prisma.inventoryItem.findMany = async (args) => { calls.push(['item', args]); return []; };
  prisma.askExecution.findMany = async (args) => { calls.push(['exec', args]); return [{ id: 'e-old' }]; };
  try {
    assert.deepEqual([...await real.existingEntityIds('MAINTENANCE_TASK', ['task-9', 'task-x'], 'p2')], ['task-9']);
    assert.deepEqual([...await real.existingEntityIds('INVENTORY_ITEM', ['i'], 'p2')], []);
    assert.deepEqual([...await real.existingEntityIds('WARRANTY', ['w'], 'p2')], ['w'], 'an unknown type is assumed to exist');
    assert.deepEqual([...await real.expiredExecutionIds(['e-old', 'e-new'])], ['e-old']);
    assert.deepEqual(calls[0][1].where, { id: { in: ['task-9', 'task-x'] }, propertyId: 'p2' });
    assert.deepEqual(calls[1][1].where, { id: { in: ['i'] }, propertyId: 'p2' });
    assert.deepEqual(calls[2][1].where, { id: { in: ['e-old', 'e-new'] }, userId: 'u1', status: 'EXPIRED' });
  } finally { prisma.propertyMaintenanceTask.findMany = originals.task; prisma.inventoryItem.findMany = originals.item; prisma.askExecution.findMany = originals.exec; }
});
