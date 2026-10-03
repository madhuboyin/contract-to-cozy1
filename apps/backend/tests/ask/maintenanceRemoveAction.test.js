const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { maintenanceSnoozedUntil, maintenanceUpdateAction, maintenanceUpdateRecurrence, maintenanceUpdateServiceCategory, maintenanceUpdateSubject } = require('../../src/services/ask/handlers/maintenance.handler');
const { MaintenanceTaskUpdateInputSchema } = require('../../src/services/ask/support/commandInputs');

test('the Remove CTA message maps to the DELETE action, Cancel stays ARCHIVE', () => {
  assert.equal(maintenanceUpdateAction('Remove this maintenance task.'), 'DELETE');
  assert.equal(maintenanceUpdateAction('Delete the chimney task'), 'DELETE');
  assert.equal(maintenanceUpdateAction('Cancel this maintenance task.'), 'ARCHIVE');
  assert.equal(maintenanceUpdateAction('Reschedule this maintenance task.'), 'RESCHEDULE');
});

test('maintenance reminder snooze is explicit, bounded, and does not masquerade as rescheduling', () => {
  const now = new Date('2026-10-02T12:00:00.000Z');
  assert.equal(maintenanceUpdateAction('Snooze reminders for this maintenance task for one week.'), 'SNOOZE');
  assert.equal(maintenanceSnoozedUntil('Snooze reminders for this maintenance task for one week.', now), '2026-10-09');
  assert.equal(maintenanceUpdateAction('Resume reminders for this maintenance task.'), 'UNSNOOZE');
  assert.equal(maintenanceSnoozedUntil('Resume reminders for this maintenance task.', now), null);
  assert.equal(MaintenanceTaskUpdateInputSchema.parse({ taskId: 't1', action: 'SNOOZE', snoozedUntil: '2026-10-09' }).snoozedUntil, '2026-10-09');
  assert.throws(() => MaintenanceTaskUpdateInputSchema.parse({ taskId: 't1', action: 'SNOOZE' }));
});

test('remove/delete are not treated as part of the task subject', () => {
  assert.equal(maintenanceUpdateSubject('Remove the chimney cleaning task'), 'the chimney cleaning');
});

test('the update input accepts DELETE without a date', () => {
  assert.equal(MaintenanceTaskUpdateInputSchema.parse({ taskId: 't1', action: 'DELETE' }).action, 'DELETE');
});

test('governed maintenance edits parse recurrence and service category without weakening schema validation', () => {
  assert.deepEqual(maintenanceUpdateRecurrence('Set recurrence to every six months.'), { isRecurring: true, frequency: 'SEMI_ANNUALLY' });
  assert.deepEqual(maintenanceUpdateRecurrence('Make this a one-time task.'), { isRecurring: false, frequency: null });
  assert.equal(maintenanceUpdateServiceCategory('Set service category to appliance repair.'), 'APPLIANCE_REPAIR');
  assert.equal(MaintenanceTaskUpdateInputSchema.parse({ taskId: 't1', action: 'EDIT', isRecurring: true, frequency: 'WEEKLY', serviceCategory: 'HVAC' }).frequency, 'WEEKLY');
  assert.throws(() => MaintenanceTaskUpdateInputSchema.parse({ taskId: 't1', action: 'EDIT', isRecurring: true }));
  assert.throws(() => MaintenanceTaskUpdateInputSchema.parse({ taskId: 't1', action: 'EDIT', isRecurring: false, frequency: 'MONTHLY' }));
});
