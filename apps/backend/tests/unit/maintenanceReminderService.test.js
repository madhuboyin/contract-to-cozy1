// apps/backend/tests/unit/maintenanceReminderService.test.js
//
// WKR-001: the previous worker-side maintenance-reminders job read legacy
// ChecklistItem rows and only logged that a reminder was "sent" — it never
// created a notification. This tests the canonical replacement
// (maintenanceReminder.service.ts), which sources PropertyMaintenanceTask
// rows and creates real notifications via NotificationService.create.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ tasks, existingUpdateShouldFail = false, createImpl, reconcileImpl } = {}) {
  const updateCalls = [];
  const reconciliationCalls = [];
  const prismaMock = {
    propertyMaintenanceTask: {
      findMany: async () => tasks,
      update: async (args) => {
        updateCalls.push(args);
        if (existingUpdateShouldFail) throw new Error('update failed');
        return { id: args.where.id };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };

  const createCalls = [];
  let createReturnValue = { id: 'notification-1' };
  const notificationServicePath = require.resolve('../../src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: {
      NotificationService: {
        create: async (input) => {
          createCalls.push(input);
          if (createImpl) return createImpl(input);
          return createReturnValue;
        },
      },
    },
  };

  const reconciliationServicePath = require.resolve('../../src/services/maintenanceTaskCanonicalReconciliation.service.ts');
  require.cache[reconciliationServicePath] = {
    id: reconciliationServicePath,
    filename: reconciliationServicePath,
    loaded: true,
    exports: {
      reconcileMaintenanceTaskWork: async (taskId) => {
        reconciliationCalls.push(taskId);
        if (reconcileImpl) return reconcileImpl(taskId);
      },
    },
  };

  const askContinuationPath = require.resolve('../../src/services/ask/askNotificationContinuation.service.ts');
  require.cache[askContinuationPath] = {
    id: askContinuationPath,
    filename: askContinuationPath,
    loaded: true,
    exports: { createAskNotificationContinuation: async () => null },
  };

  const servicePath = require.resolve('../../src/services/maintenanceReminder.service.ts');
  delete require.cache[servicePath];
  return {
    service: require(servicePath),
    getCreateCalls: () => createCalls,
    getUpdateCalls: () => updateCalls,
    getReconciliationCalls: () => reconciliationCalls,
    setCreateReturnValue: (v) => {
      createReturnValue = v;
    },
  };
}

function task(overrides = {}) {
  return {
    id: 'task-1',
    propertyId: 'property-1',
    title: 'Replace HVAC filter',
    status: 'PENDING',
    nextDueDate: new Date('2026-07-20T00:00:00.000Z'),
    remindedForDueDate: null,
    assignedToUserId: null,
    actionKey: 'property-1:TEMPLATE:hvac-filter',
    property: { homeownerProfile: { userId: 'user-1' } },
    ...overrides,
  };
}

test('reconciles canonical work before creating a governed notification for a due task', async () => {
  delete process.env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED;
  const now = new Date('2026-07-19T00:00:00.000Z');
  const { service, getCreateCalls, getUpdateCalls, getReconciliationCalls } = loadService({ tasks: [task()] });

  const result = await service.processMaintenanceReminders({ now });

  assert.equal(result.examined, 1);
  assert.equal(result.notified, 1);
  assert.equal(result.skipped, 0);
  assert.deepEqual(getReconciliationCalls(), ['task-1']);

  const calls = getCreateCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 'user-1');
  assert.equal(calls[0].entityType, 'PROPERTY_MAINTENANCE_TASK');
  assert.equal(calls[0].entityId, 'task-1');
  assert.equal(
    calls[0].actionUrl,
    '/dashboard/maintenance?propertyId=property-1&taskId=task-1&from=notification',
  );
  // due tomorrow (1 day out) is within the material-deadline window
  assert.equal(calls[0].category, 'MATERIAL_DEADLINE');
  assert.equal(calls[0].urgency, 'MATERIAL');

  const updates = getUpdateCalls();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.id, 'task-1');
  assert.equal(updates[0].data.remindedForDueDate.toISOString(), task().nextDueDate.toISOString());
});

test('uses routine category/urgency for a task due well outside the material window', async () => {
  const now = new Date('2026-07-01T00:00:00.000Z');
  const { service, getCreateCalls } = loadService({
    tasks: [task({ nextDueDate: new Date('2026-07-20T00:00:00.000Z') })],
  });

  await service.processMaintenanceReminders({ now });

  const calls = getCreateCalls();
  assert.equal(calls[0].category, 'MAINTENANCE');
  assert.equal(calls[0].urgency, 'ROUTINE');
});

test('delivers an assigned task reminder to the household assignee', async () => {
  const { service, getCreateCalls } = loadService({
    tasks: [task({ assignedToUserId: 'household-user-2' })],
  });

  await service.processMaintenanceReminders({
    now: new Date('2026-07-19T00:00:00.000Z'),
  });

  assert.equal(getCreateCalls()[0].userId, 'household-user-2');
});

test('skips a task already reminded for its current due date (idempotency)', async () => {
  const dueDate = new Date('2026-07-20T00:00:00.000Z');
  const { service, getCreateCalls } = loadService({
    tasks: [task({ nextDueDate: dueDate, remindedForDueDate: dueDate })],
  });

  const result = await service.processMaintenanceReminders({ now: new Date('2026-07-19T00:00:00.000Z') });

  assert.equal(result.notified, 0);
  assert.equal(result.skipped, 1);
  assert.equal(getCreateCalls().length, 0);
});

test('reminds again when a recurring task is rescheduled to a new due date', async () => {
  const oldDue = new Date('2026-06-20T00:00:00.000Z');
  const newDue = new Date('2026-08-20T00:00:00.000Z');
  const { service, getCreateCalls } = loadService({
    tasks: [task({ nextDueDate: newDue, remindedForDueDate: oldDue })],
  });

  const result = await service.processMaintenanceReminders({
    now: new Date('2026-08-15T00:00:00.000Z'),
    horizonDays: 30,
  });

  assert.equal(result.notified, 1);
  assert.equal(getCreateCalls().length, 1);
});

test('skips tasks with no resolvable homeowner userId', async () => {
  const { service, getCreateCalls } = loadService({
    tasks: [task({ property: { homeownerProfile: null } })],
  });

  const result = await service.processMaintenanceReminders({ now: new Date('2026-07-19T00:00:00.000Z') });

  assert.equal(result.skipped, 1);
  assert.equal(getCreateCalls().length, 0);
});

test('threads WORKER_OUTBOUND_NOTIFICATIONS_ENABLED into transportEnabled', async () => {
  process.env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED = 'true';
  const { service, getCreateCalls } = loadService({ tasks: [task()] });

  await service.processMaintenanceReminders({ now: new Date('2026-07-19T00:00:00.000Z') });

  assert.equal(getCreateCalls()[0].transportEnabled, true);
  delete process.env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED;
});

test('WKR-008: isolates a per-task failure instead of aborting the whole run', async () => {
  const tasks = [
    task({ id: 'task-1', propertyId: 'property-1' }),
    task({ id: 'task-2', propertyId: 'property-2', property: { homeownerProfile: { userId: 'user-2' } } }),
  ];
  const { service, getCreateCalls, getUpdateCalls } = loadService({
    tasks,
    createImpl: async (input) => {
      if (input.entityId === 'task-1') throw new Error('boom');
      return { id: 'notification-2' };
    },
  });

  const result = await service.processMaintenanceReminders({ now: new Date('2026-07-19T00:00:00.000Z') });

  assert.equal(result.examined, 2);
  assert.equal(result.notified, 1);
  assert.equal(result.failed, 1);
  assert.equal(getCreateCalls().length, 2);
  // task-1 failed before its stamping update; task-2 succeeded and got stamped.
  assert.equal(getUpdateCalls().length, 1);
  assert.equal(getUpdateCalls()[0].where.id, 'task-2');
});

test('WKR-008: rejects the run when every task fails, instead of reporting false success', async () => {
  const { service } = loadService({
    tasks: [task()],
    createImpl: async () => {
      throw new Error('notification service unavailable');
    },
  });

  await assert.rejects(
    () => service.processMaintenanceReminders({ now: new Date('2026-07-19T00:00:00.000Z') }),
    /All 1 task\(s\) failed/,
  );
});

test('does not notify when canonical work reconciliation fails', async () => {
  const { service, getCreateCalls, getUpdateCalls } = loadService({
    tasks: [task()],
    reconcileImpl: async () => { throw new Error('work reconciliation unavailable'); },
  });

  await assert.rejects(
    () => service.processMaintenanceReminders({ now: new Date('2026-07-19T00:00:00.000Z') }),
    /All 1 task\(s\) failed/,
  );
  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 0);
});
