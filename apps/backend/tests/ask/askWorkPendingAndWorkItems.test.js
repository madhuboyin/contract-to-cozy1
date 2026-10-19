const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readPendingExecutionWork, pendingExecutionRow, pendingExecutionView } = require('../../src/services/ask/work/pendingExecutions.reader.ts');
const { createOperationalWorkItemReader, workItemLifecycleView, operationalWorkItemRow } = require('../../src/services/ask/work/operationalWorkItems.reader.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');
const { composeAskWorkPage, validateAskWorkProviders } = require('../../src/services/ask/askWork.service.ts');

const ctx = { userId: 'u1', propertyId: 'p1', role: 'CONTRIBUTOR' };
const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const exec = (id, status, day, extra = {}) => ({ id, sessionId: 's1', propertyId: 'p1', status, message: `Question ${id}`, operationId: 'MAINTENANCE_TASK_CREATE', contextVersion: 'ctx1', resultJson: null, updatedAt: at(day), expiresAt: null, ...extra });
const fail = () => { throw new Error('the Work GET must not write'); };

function installExecutions(rows) {
  const calls = [];
  prisma.askExecution = {
    findMany: async (args) => { calls.push(args); return rows; },
    update: fail, updateMany: fail, create: fail, delete: fail,
  };
  prisma.askExecutionEvent = { create: fail, createMany: fail };
  return calls;
}

test('pending executions: needs-you and waiting views, newest first, counts for both views, no writes', async () => {
  installExecutions([exec('e1', 'NEEDS_CONFIRMATION', 3), exec('e2', 'NEEDS_CLARIFICATION', 5), exec('e3', 'RUNNING', 4)]);
  const needs = await readPendingExecutionWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 10, status: null });
  assert.deepEqual(needs.rows.map((row) => row.workKey), ['execution:e2', 'execution:e1']);
  assert.equal(needs.total, 2);
  assert.deepEqual(needs.viewCounts, { NEEDS_YOU: 2, WAITING: 1 });
  const waiting = await readPendingExecutionWork(ctx, { view: 'WAITING', after: null, limit: 10, status: null });
  assert.deepEqual(waiting.rows.map((row) => row.workKey), ['execution:e3']);
  assert.equal(needs.rows[1].resume.kind, 'CONFIRMATION');
  assert.equal(needs.rows[0].resume.kind, 'CONVERSATION');
  assert.equal(needs.rows[0].resume.executionId, 'e2');
  assert.equal(needs.rows[0].resume.launch.contextVersion, 'ctx1');
});

test('pending executions: an expired interaction is hidden by its expiry without being expired', async () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 60_000).toISOString();
  installExecutions([
    exec('old', 'NEEDS_CONFIRMATION', 5, { resultJson: { confirmation: { expiresAt: past } } }),
    exec('live', 'NEEDS_CONFIRMATION', 4, { resultJson: { confirmation: { expiresAt: future } } }),
  ]);
  const page = await readPendingExecutionWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 10, status: null });
  assert.deepEqual(page.rows.map((row) => row.workKey), ['execution:live']);
  assert.equal(page.total, 1);
});

test('pending executions: scoped to the caller and the home, and filtered by row expiry in the query', async () => {
  const calls = installExecutions([]);
  await readPendingExecutionWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 10, status: null });
  assert.equal(calls[0].where.userId, 'u1');
  assert.equal(calls[0].where.propertyId, 'p1');
  assert.match(JSON.stringify(calls[0].where), /"expiresAt":\{"gt"/);
});

test('pending executions: keyset boundary resumes strictly after the previous page and status filters', async () => {
  installExecutions([exec('a', 'NEEDS_CONFIRMATION', 5), exec('b', 'NEEDS_CLARIFICATION', 5), exec('c', 'NEEDS_CONFIRMATION', 4)]);
  const first = await readPendingExecutionWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 2, status: null });
  assert.deepEqual(first.rows.map((row) => row.workKey), ['execution:a', 'execution:b']);
  const second = await readPendingExecutionWork(ctx, { view: 'NEEDS_YOU', after: { sortAt: first.rows[1].sortAt, workKey: first.rows[1].workKey }, limit: 2, status: null });
  assert.deepEqual(second.rows.map((row) => row.workKey), ['execution:c']);
  const filtered = await readPendingExecutionWork(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: 'NEEDS_CONFIRMATION' });
  assert.deepEqual(filtered.rows.map((row) => row.workKey), ['execution:a', 'execution:c']);
  assert.equal(filtered.total, 2);
  assert.equal(pendingExecutionView('RUNNING'), 'WAITING');
  assert.equal(pendingExecutionRow(exec('x', 'NEEDS_PROPERTY', 1), 'p1').nextAction.label, 'Select a home');
});

test('work item lifecycle view is derived from the canonical state and disposition', () => {
  assert.equal(workItemLifecycleView('CANDIDATE', null), null);
  assert.equal(workItemLifecycleView('ACCEPTED', null), 'NEEDS_YOU');
  assert.equal(workItemLifecycleView('REOPENED', null), 'NEEDS_YOU');
  assert.equal(workItemLifecycleView('IN_PROJECT', null), 'ACTIVE');
  assert.equal(workItemLifecycleView('BLOCKED', null), 'WAITING');
  assert.equal(workItemLifecycleView('REPORTED_COMPLETE', null), 'WAITING');
  assert.equal(workItemLifecycleView('SCHEDULED', null), 'SCHEDULED');
  assert.equal(workItemLifecycleView('VERIFIED', null), 'COMPLETED');
  assert.equal(workItemLifecycleView('CLOSED', null), 'COMPLETED');
  assert.equal(workItemLifecycleView('CLOSED', 'DISMISSED'), 'ARCHIVED');
});

const item = (id, state, day, extra = {}) => ({ id, propertyId: 'p1', state, disposition: null, title: `Item ${id}`, homeownerReason: 'Because', updatedAt: at(day), executions: [], ...extra });

function installWorkItems(rows) {
  prisma.operationalWorkSource = { findMany: async () => [] };
  prisma.operationalWorkExecution = { findMany: async () => [] };
  const calls = { findMany: [], count: [], groupBy: [] };
  prisma.operationalWorkItem = {
    findMany: async (args) => { calls.findMany.push(args); return rows.slice(0, args.take); },
    count: async (args) => { calls.count.push(args); return rows.length; },
    groupBy: async (args) => { calls.groupBy.push(args); return [{ state: 'ACCEPTED', disposition: null, _count: { _all: 2 } }, { state: 'CLOSED', disposition: null, _count: { _all: 1 } }, { state: 'CLOSED', disposition: 'DISMISSED', _count: { _all: 4 } }]; },
  };
  return calls;
}

test('work item provider: read-only query excludes suggestions and superseded items, and counts every view', async () => {
  const calls = installWorkItems([item('w1', 'ACCEPTED', 5)]);
  const reader = createOperationalWorkItemReader();
  const page = await reader(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  const where = JSON.stringify(calls.findMany[0].where);
  assert.match(where, /"propertyId":"p1"/);
  assert.match(where, /"supersededByWorkItemId":null/);
  assert.deepEqual(page.rows.map((row) => row.workKey), ['workItem:w1']);
  assert.equal(page.rows[0].nextAction.operationId, 'HOME_WORK_ITEM_COMMAND');
  assert.equal(page.rows[0].nextAction.allowed, true);
  assert.deepEqual(page.viewCounts, { NEEDS_YOU: 2, ACTIVE: 0, WAITING: 0, SCHEDULED: 0, COMPLETED: 1, ARCHIVED: 4 });
  assert.match(JSON.stringify(calls.groupBy[0].where), /"not":"CANDIDATE"/);
});

test('work item provider: a viewer sees the row but not an allowed next action', () => {
  const definition = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'OPERATIONAL_WORK_ITEMS');
  assert.equal(operationalWorkItemRow(item('w2', 'ACCEPTED', 2), 'VIEWER', definition).nextAction.allowed, false);
  assert.equal(operationalWorkItemRow(item('w3', 'VERIFIED', 2), 'OWNER', definition).nextAction, null);
  assert.equal(operationalWorkItemRow(item('w4', 'CANDIDATE', 2), 'OWNER', definition), null);
});

test('work item provider: aliases keep the canonical domain keys of its executions', () => {
  const definition = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'OPERATIONAL_WORK_ITEMS');
  const row = operationalWorkItemRow(item('w5', 'IN_PROJECT', 2, { executions: [{ executionType: 'PROJECT', executionEntityId: 'proj1' }, { executionType: 'CLAIM', executionEntityId: 'c1' }] }), 'OWNER', definition);
  assert.deepEqual(row.sourceAliases, ['project:proj1', 'claim:c1']);
});

test('work item provider: ownership exclusion switches on only when the canonical provider is connected', async () => {
  const connect = (ids) => ASK_WORK_PROVIDER_REGISTRY.map((entry) => ({ ...entry, reader: ids.includes(entry.id) ? { state: 'CONNECTED' } : { state: 'UNAVAILABLE', reason: 'test' } }));
  const none = installWorkItems([]);
  await createOperationalWorkItemReader(connect(['OPERATIONAL_WORK_ITEMS']))(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  assert.doesNotMatch(JSON.stringify(none.findMany[0].where), /"executionType"/);
  const some = installWorkItems([]);
  await createOperationalWorkItemReader(connect(['PROJECTS', 'CLAIMS', 'INCIDENTS']))(ctx, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  const where = JSON.stringify(some.findMany[0].where);
  assert.match(where, /"executionType":"PROJECT"/);
  assert.match(where, /"executionType":"CLAIM"/);
  assert.doesNotMatch(where, /"executionType":"GUIDANCE"/, 'guidance and incident ownership is decided by the owner\'s visible row, not by the link');
});

test('work item provider: resumes after a boundary from another provider at the same instant by key order', async () => {
  const reader = createOperationalWorkItemReader();
  const same = at(5);
  const earlier = installWorkItems([]);
  await reader(ctx, { view: 'NEEDS_YOU', after: { sortAt: same.toISOString(), workKey: 'execution:e1' }, limit: 5, status: null });
  assert.match(JSON.stringify(earlier.findMany[0].where), /"updatedAt":\{"lt"/);
  assert.doesNotMatch(JSON.stringify(earlier.findMany[0].where), /"in":\[\]/);
  const later = installWorkItems([]);
  await reader(ctx, { view: 'NEEDS_YOU', after: { sortAt: same.toISOString(), workKey: 'zzz:1' }, limit: 5, status: null });
  assert.match(JSON.stringify(later.findMany[0].where), /"in":\[\]/);
});

test('the connected providers are registered readers, and the page carries both with honest unavailable states for the rest', async () => {
  assert.deepEqual(validateAskWorkProviders(), []);
  installExecutions([exec('e1', 'NEEDS_CONFIRMATION', 3)]);
  installWorkItems([item('w1', 'ACCEPTED', 5)]);
  const page = await composeAskWorkPage(
    { userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING' },
    { view: 'NEEDS_YOU', limit: 10, after: null, workType: null, status: null },
    { PENDING_EXECUTIONS: require('../../src/services/ask/askWork.service.ts').ASK_WORK_PROVIDER_READERS.PENDING_EXECUTIONS, OPERATIONAL_WORK_ITEMS: require('../../src/services/ask/askWork.service.ts').ASK_WORK_PROVIDER_READERS.OPERATIONAL_WORK_ITEMS },
  );
  assert.deepEqual(page.rows.map((row) => row.workKey), ['workItem:w1', 'execution:e1']);
  assert.equal(page.providers.find((entry) => entry.providerId === 'PENDING_EXECUTIONS').state, 'AVAILABLE');
  assert.equal(page.providers.find((entry) => entry.providerId === 'CLAIMS').state, 'UNAVAILABLE');
  assert.equal(page.partial, true);
  assert.equal(page.total, null);
});
