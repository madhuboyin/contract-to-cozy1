const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Slice 4a of docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 3.1: the governed maintenance writers request reconciliation of linked DIY
// projects INSIDE the transaction that completes the task, keyed by a unique occurrence id stored on the task. The real maintenance service against a
// fake client whose transaction callback is observable. Atomicity itself (a failed insert rolling the completion back) is proven on Postgres in slice 4c.
const log = [];
const state = { role: 'CONTRIBUTOR', status: 'PENDING', metadata: null, linked: [], casCount: 1, failEmit: false, events: [] };
const baseTask = () => ({ id: 'task-1', propertyId: 'prop-1', status: state.status, title: 'Seal the deck', isRecurring: true, frequency: 'QUARTERLY', actionKey: null, nextDueDate: new Date('2026-10-20T00:00:00Z'),
  completionMetadata: state.metadata, lastUpdateIdempotencyKey: null, updatedAt: new Date('2026-10-06T12:00:00Z'), property: { id: 'prop-1', homeownerProfile: {} } });
const fake = {
  propertyMaintenanceTask: {
    findUnique: async () => baseTask(),
    updateMany: async (args) => { log.push(['cas', args]); return { count: state.casCount }; },
    findUniqueOrThrow: async () => { throw new Error('stop after the transaction (side effects are not under test)'); },
  },
  householdMember: { findUnique: async () => (state.role ? { role: state.role } : null) },
  property: { findFirst: async () => null },
  diyProject: { findMany: async (args) => { log.push(['lookup', args]); return state.linked.map((id) => ({ id })); } },
  domainEvent: {
    findUnique: async ({ where }) => state.events.find((event) => event.idempotencyKey === where.idempotencyKey) ?? null,
    create: async ({ data }) => { log.push(['emit', data]); if (state.failEmit) throw new Error('outbox insert failed'); state.events.push(data); return data; },
  },
  $transaction: async (work) => { log.push(['tx:begin']); const result = await work(fake); log.push(['tx:commit']); return result; },
};
const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
stub('../../src/lib/prisma.ts', { prisma: fake });
stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {}, debug() {} }, auditLog() {}, redactEmail: (value) => value });
const { PropertyMaintenanceTaskService, completeMaintenanceTaskForDiyOutbox } = require('../../src/services/PropertyMaintenanceTask.service.ts');
const { planDiyTaskReconciliation, DIY_RECONCILE_PROJECT_CAP } = require('../../src/services/diy/diyTaskReconciliationRequest.ts');

const reset = (patch = {}) => { log.length = 0; state.events.length = 0; Object.assign(state, { role: 'CONTRIBUTOR', status: 'PENDING', metadata: null, linked: [], casCount: 1, failEmit: false }, patch); };
const complete = (details, key = 'k1') => PropertyMaintenanceTaskService.updateTaskStatus('dana', 'task-1', 'COMPLETED', undefined, undefined, key, details);
const stopped = /stop after the transaction/;
const names = () => log.map(([name]) => name);

test('with an open linked project: ONE transaction holds the lookup, the compare-and-swap (carrying the occurrence id) and then the event; the snapshot says what the completion said', async () => {
  reset({ linked: ['pA', 'pB'] });
  await assert.rejects(complete({ fulfillmentMode: 'PROVIDER', completedAt: new Date('2026-10-06T12:00:00Z') }), stopped);
  assert.deepEqual(names(), ['tx:begin', 'lookup', 'cas', 'emit', 'tx:commit']);
  const cas = log.find(([n]) => n === 'cas')[1];
  const event = state.events[0];
  assert.match(cas.data.completionMetadata.reconciliationOccurrenceId, /^[0-9a-f-]{36}$/);
  assert.equal(cas.data.completionMetadata.completionIdempotencyKey, 'k1', 'the existing completion metadata is preserved');
  assert.deepEqual([event.type, event.propertyId, event.userId], ['DIY_TASK_COMPLETED_RECONCILE', 'prop-1', 'dana']);
  assert.equal(event.idempotencyKey, `diy-task-reconcile:task-1:${cas.data.completionMetadata.reconciliationOccurrenceId}`);
  assert.deepEqual({ ...event.payload, occurrenceId: 'x', completedAt: typeof event.payload.completedAt }, {
    taskId: 'task-1', propertyId: 'prop-1', occurrenceId: 'x', actorUserId: 'dana', completedAt: 'string', fulfillmentMode: 'PROVIDER', completionKey: 'k1', projectIds: ['pA', 'pB'],
  });
  assert.equal(event.payload.occurrenceId, cas.data.completionMetadata.reconciliationOccurrenceId);
});

test('the lookup is the indexed reverse lookup: this property, this task, open projects only, capped, oldest first', async () => {
  reset({ linked: ['pA'] });
  await assert.rejects(complete({ fulfillmentMode: 'DIY' }), stopped);
  const lookup = log.find(([n]) => n === 'lookup')[1];
  assert.deepEqual(lookup.where, { maintenanceTaskId: 'task-1', propertyId: 'prop-1', status: { in: ['PLANNING', 'IN_PROGRESS'] } });
  assert.deepEqual([lookup.take, lookup.orderBy], [DIY_RECONCILE_PROJECT_CAP, { createdAt: 'asc' }]);
  assert.equal(DIY_RECONCILE_PROJECT_CAP, 25);
});

test('no linked open project: no occurrence id, no event, and the write is exactly what it was before', async () => {
  reset({ linked: [] });
  await assert.rejects(complete({ fulfillmentMode: 'DIY' }), stopped);
  assert.deepEqual(names(), ['tx:begin', 'lookup', 'cas', 'tx:commit']);
  assert.equal(log.find(([n]) => n === 'cas')[1].data.completionMetadata.reconciliationOccurrenceId, undefined);
  assert.equal(state.events.length, 0);
});

test('not a transition into completed (already completed under another key): no lookup, no event', async () => {
  reset({ linked: ['pA'], status: 'COMPLETED', metadata: { completionIdempotencyKey: 'someone-else' } });
  await assert.rejects(complete({ fulfillmentMode: 'DIY' }, 'k2'), stopped);
  assert.ok(!names().includes('lookup') && !names().includes('emit'));
});

test('a LOST compare-and-swap emits nothing', async () => {
  reset({ linked: ['pA'], casCount: 0 });
  await assert.rejects(complete({ fulfillmentMode: 'DIY' }), /changed by a concurrent update/);
  assert.ok(!names().includes('emit'));
});

test('a failing event insert fails the completion (it would roll the transaction back; proven on Postgres in 4c)', async () => {
  reset({ linked: ['pA'], failEmit: true });
  await assert.rejects(complete({ fulfillmentMode: 'DIY' }), /outbox insert failed/);
  assert.deepEqual(names().slice(-2), ['cas', 'emit'], 'the commit never happens');
  assert.ok(!names().includes('tx:commit'));
});

test('RECURRING: the same completion date supplied for two cycles gives two distinct occurrence ids and keys, and the second does not collide', async () => {
  const sameDate = new Date('2026-10-06T12:00:00Z');
  reset({ linked: ['pA'] });
  await assert.rejects(complete({ fulfillmentMode: 'DIY', completedAt: sameDate }, 'cycle-1'), stopped);
  state.status = 'PENDING'; state.metadata = null; // the next cycle: the task is open again
  await assert.rejects(complete({ fulfillmentMode: 'DIY', completedAt: sameDate }, 'cycle-2'), stopped);
  assert.equal(state.events.length, 2);
  assert.notEqual(state.events[0].idempotencyKey, state.events[1].idempotencyKey);
  assert.notEqual(state.events[0].payload.occurrenceId, state.events[1].payload.occurrenceId);
  assert.equal(state.events[0].payload.completedAt, state.events[1].payload.completedAt, 'identical dates did not collide');
});

test('the in-transaction access check: a viewer is refused by the public path (before the write), and the plan helper refuses an unverified actor but not a verified one', async () => {
  reset({ role: 'VIEWER', linked: ['pA'] });
  await assert.rejects(complete({ fulfillmentMode: 'DIY' }), /does not have access/);
  assert.ok(!names().includes('cas'));
  reset({ role: null, linked: ['pA'] });
  await assert.rejects(planDiyTaskReconciliation(fake, { taskId: 'task-1', propertyId: 'prop-1', actorUserId: 'ghost', accessVerifiedElsewhere: false }), /does not have access/);
  const planned = await planDiyTaskReconciliation(fake, { taskId: 'task-1', propertyId: 'prop-1', actorUserId: 'ghost', accessVerifiedElsewhere: true });
  assert.deepEqual(planned.projectIds, ['pA']);
});

test('the internal DIY export skips the in-transaction check (authorized when the project completed) but still requests reconciliation for OTHER open projects on the task', async () => {
  reset({ role: 'VIEWER', linked: ['pOther'] });
  await assert.rejects(completeMaintenanceTaskForDiyOutbox('dana', 'task-1', 'COMPLETED', undefined, undefined, 'diy-project-completed:p1', { fulfillmentMode: 'DIY' }), stopped);
  assert.equal(state.events.length, 1);
  assert.deepEqual([state.events[0].payload.fulfillmentMode, state.events[0].payload.projectIds], ['DIY', ['pOther']]);
});

test('the internal export puts its options in the eighth position whatever the caller omits', async () => {
  reset({ role: 'VIEWER', linked: ['pOther'] });
  await assert.rejects(completeMaintenanceTaskForDiyOutbox('dana', 'task-1', 'COMPLETED'), stopped); // only three arguments
  assert.equal(state.events.length, 1, 'the access exemption still applied, so the options reached the right parameter');
});

test('updateTask with a status patch to COMPLETED requests reconciliation too, with an UNKNOWN mode and no completion key', async () => {
  reset({ linked: ['pA'] });
  await assert.rejects(PropertyMaintenanceTaskService.updateTask('dana', 'task-1', { status: 'COMPLETED' }), stopped);
  assert.deepEqual(names(), ['tx:begin', 'lookup', 'cas', 'emit', 'tx:commit']);
  assert.deepEqual([state.events[0].payload.fulfillmentMode, state.events[0].payload.completionKey], [null, null]);
  assert.match(log.find(([n]) => n === 'cas')[1].data.completionMetadata.reconciliationOccurrenceId, /^[0-9a-f-]{36}$/);
  reset({ linked: ['pA'] });
  await assert.rejects(PropertyMaintenanceTaskService.updateTask('dana', 'task-1', { title: 'Renamed' }), stopped);
  assert.ok(!names().includes('lookup'), 'a non-status edit never looks');
});
