const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { maintenanceUpdateAction, maintenanceUpdateSubject } = require('../../src/services/ask/handlers/maintenance.handler');
const { MaintenanceTaskUpdateInputSchema } = require('../../src/services/ask/support/commandInputs');

test('the Remove CTA message maps to the DELETE action, Cancel stays ARCHIVE', () => {
  assert.equal(maintenanceUpdateAction('Remove this maintenance task.'), 'DELETE');
  assert.equal(maintenanceUpdateAction('Delete the chimney task'), 'DELETE');
  assert.equal(maintenanceUpdateAction('Cancel this maintenance task.'), 'ARCHIVE');
  assert.equal(maintenanceUpdateAction('Reschedule this maintenance task.'), 'RESCHEDULE');
});

test('remove/delete are not treated as part of the task subject', () => {
  assert.equal(maintenanceUpdateSubject('Remove the chimney cleaning task'), 'the chimney cleaning');
});

test('the update input accepts DELETE without a date', () => {
  assert.equal(MaintenanceTaskUpdateInputSchema.parse({ taskId: 't1', action: 'DELETE' }).action, 'DELETE');
});
