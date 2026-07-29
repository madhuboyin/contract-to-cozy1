const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Operations Slice 3: maintenanceTaskSourceAdapter is the first real
// use of the raw-record WorkItemSourceAdapter<TSourceRecord> contract
// Slice 1 built. Pure — no prisma/ioredis mocking needed.

const {
  maintenanceTaskSourceAdapter,
  resolveMaintenanceTaskWorkKey,
} = require('../../src/modules/homeOperations/adapters/maintenanceTask.adapter.ts');

function taskFixture(overrides = {}) {
  return {
    id: 'task-1',
    propertyId: 'property-1',
    title: 'Replace HVAC filter',
    description: 'Monthly filter swap.',
    status: 'PENDING',
    actionKey: null,
    priority: 'MEDIUM',
    riskLevel: null,
    inventoryItemId: null,
    nextDueDate: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('a cancelled task with no prior work item proposes nothing', () => {
  const proposed = maintenanceTaskSourceAdapter.propose(taskFixture({ status: 'CANCELLED' }), 'property-1');
  assert.equal(proposed, null);
});

test('subject is INVENTORY_ITEM when the task has an inventory item, else PROPERTY', () => {
  const withItem = maintenanceTaskSourceAdapter.propose(taskFixture({ inventoryItemId: 'inv-1' }), 'property-1');
  assert.deepEqual(withItem.subject, { type: 'INVENTORY_ITEM', id: 'inv-1' });

  const withoutItem = maintenanceTaskSourceAdapter.propose(taskFixture({ inventoryItemId: null }), 'property-1');
  assert.deepEqual(withoutItem.subject, { type: 'PROPERTY', id: 'property-1' });
});

test('obligationSlug prefers actionKey over the task id when present', () => {
  const withActionKey = maintenanceTaskSourceAdapter.propose(
    taskFixture({ actionKey: 'property-1:ACTION_CENTER:hvac' }),
    'property-1',
  );
  assert.equal(withActionKey.occurrence.obligationSlug, 'maintenance-property-1:ACTION_CENTER:hvac');

  const withoutActionKey = maintenanceTaskSourceAdapter.propose(taskFixture({ actionKey: null }), 'property-1');
  assert.equal(withoutActionKey.occurrence.obligationSlug, 'maintenance-task-task-1');
});

test('two tasks sharing the same actionKey resolve to the same workKey', () => {
  const a = maintenanceTaskSourceAdapter.propose(taskFixture({ id: 'task-a', actionKey: 'property-1:ACTION_CENTER:hvac' }), 'property-1');
  const b = maintenanceTaskSourceAdapter.propose(taskFixture({ id: 'task-b', actionKey: 'property-1:ACTION_CENTER:hvac' }), 'property-1');
  const keyA = resolveMaintenanceTaskWorkKey(taskFixture({ id: 'task-a', actionKey: 'property-1:ACTION_CENTER:hvac' }), 'property-1');
  const keyB = resolveMaintenanceTaskWorkKey(taskFixture({ id: 'task-b', actionKey: 'property-1:ACTION_CENTER:hvac' }), 'property-1');
  assert.equal(keyA, keyB);
  assert.equal(a.occurrence.obligationSlug, b.occurrence.obligationSlug);
});

test('priority maps URGENT/HIGH/MEDIUM/LOW to NOW/SOON/PLAN/CONSIDER', () => {
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ priority: 'URGENT' }), 'property-1').priority, 'NOW');
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ priority: 'HIGH' }), 'property-1').priority, 'SOON');
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ priority: 'MEDIUM' }), 'property-1').priority, 'PLAN');
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ priority: 'LOW' }), 'property-1').priority, 'CONSIDER');
});

test('safetyTier is graded, not a binary CRITICAL-vs-everything-else collapse', () => {
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ riskLevel: 'CRITICAL' }), 'property-1').safetyTier, 'SAFETY_EMERGENCY');
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ riskLevel: 'HIGH' }), 'property-1').safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ riskLevel: 'ELEVATED' }), 'property-1').safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ riskLevel: 'MODERATE' }), 'property-1').safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ riskLevel: 'LOW' }), 'property-1').safetyTier, 'LOW_CONSEQUENCE');
  assert.equal(maintenanceTaskSourceAdapter.propose(taskFixture({ riskLevel: null }), 'property-1').safetyTier, 'LOW_CONSEQUENCE');
});

test('source role is EXECUTION, distinct from the recommendation-stage TRIGGER role', () => {
  const proposed = maintenanceTaskSourceAdapter.propose(taskFixture(), 'property-1');
  assert.equal(proposed.source.sourceType, 'MAINTENANCE');
  assert.equal(proposed.source.sourceRole, 'EXECUTION');
  assert.equal(proposed.source.sourceEntityId, 'task-1');
});

test('title/homeownerReason/dueAt are copied straight from the task', () => {
  const proposed = maintenanceTaskSourceAdapter.propose(taskFixture(), 'property-1');
  assert.equal(proposed.title, 'Replace HVAC filter');
  assert.equal(proposed.homeownerReason, 'Monthly filter swap.');
  assert.equal(proposed.dueAt.toISOString(), '2026-08-01T00:00:00.000Z');
});

test('a task with no description falls back to a generic reason', () => {
  const proposed = maintenanceTaskSourceAdapter.propose(taskFixture({ description: null }), 'property-1');
  assert.equal(proposed.homeownerReason, 'A maintenance task is tracked for your home.');
});
