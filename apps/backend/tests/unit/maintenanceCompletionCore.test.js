const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Slice 3a of docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md section 3.6: splitting the maintenance status write into an access check plus a
// private core must not weaken the public path. `updateTaskStatus` still refuses a viewer; the internal export used by the DIY completion adapters
// skips the second check (its authorization was verified in the completion transaction) but keeps the idempotency replay and the compare-and-swap.
const writes = [];
const task = { id: 'task-1', propertyId: 'prop-1', status: 'PENDING', title: 'Seal the deck', isRecurring: false, actionKey: null, frequency: null, nextDueDate: null, completionMetadata: null, updatedAt: new Date('2026-10-06T12:00:00Z') };
const state = { role: 'VIEWER', completionMetadata: null, status: 'PENDING' };
const fake = {
  propertyMaintenanceTask: {
    findUnique: async () => ({ ...task, status: state.status, completionMetadata: state.completionMetadata, property: { id: 'prop-1', homeownerProfile: {} } }),
    updateMany: async (args) => { writes.push(args); throw new Error('stop after the write (side effects are not under test)'); },
  },
  householdMember: { findUnique: async () => ({ role: state.role }) },
  property: { findFirst: async () => null },
};
const stub = (relative, exports) => { const resolved = require.resolve(relative); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; };
stub('../../src/lib/prisma.ts', { prisma: fake });
stub('../../src/lib/logger.ts', { logger: { info() {}, warn() {}, error() {}, debug() {} }, auditLog() {}, redactEmail: (value) => value });
const { PropertyMaintenanceTaskService, completeMaintenanceTaskForDiyOutbox } = require('../../src/services/PropertyMaintenanceTask.service.ts');

test('updateTaskStatus still refuses a viewer, and writes nothing', async () => {
  writes.length = 0; state.role = 'VIEWER';
  await assert.rejects(PropertyMaintenanceTaskService.updateTaskStatus('viewer', 'task-1', 'COMPLETED'), /does not have access to perform this action/);
  assert.equal(writes.length, 0);
});

test('updateTaskStatus lets a contributor through to the write', async () => {
  writes.length = 0; state.role = 'CONTRIBUTOR';
  await assert.rejects(PropertyMaintenanceTaskService.updateTaskStatus('contributor', 'task-1', 'COMPLETED', undefined, undefined, 'k'), /stop after the write/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].where.updatedAt.getTime(), task.updatedAt.getTime(), 'the compare-and-swap is intact');
});

test('the internal DIY export skips the second access check (authorization was verified in the completion transaction) but still does the compare-and-swap write', async () => {
  writes.length = 0; state.role = 'VIEWER'; // would be refused by the public path
  await assert.rejects(completeMaintenanceTaskForDiyOutbox('dana', 'task-1', 'COMPLETED', undefined, undefined, 'diy-project-completed:p1', { fulfillmentMode: 'DIY' }), /stop after the write/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].where.updatedAt.getTime(), task.updatedAt.getTime());
  assert.equal(writes[0].data.status, 'COMPLETED');
});

test('the internal export replays idempotently for the same key and writes nothing', async () => {
  writes.length = 0; state.role = 'VIEWER'; state.status = 'COMPLETED'; state.completionMetadata = { completionIdempotencyKey: 'diy-project-completed:p1' };
  const result = await completeMaintenanceTaskForDiyOutbox('dana', 'task-1', 'COMPLETED', undefined, undefined, 'diy-project-completed:p1', { fulfillmentMode: 'DIY' });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(writes.length, 0);
});
