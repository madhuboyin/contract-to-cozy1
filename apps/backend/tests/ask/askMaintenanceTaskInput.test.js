const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  extractMaintenanceTaskTitle,
  isMeaningfulMaintenanceTaskTitle,
} = require('../../src/services/ask/askMaintenanceTaskInput.ts');

test('generic maintenance creation requests do not become task titles', () => {
  const requests = [
    'i want to create a maintenance task',
    'I would like to add a maintenance task.',
    'I’d like to create a task',
    'Can you create a maintenance task?',
    'Help me schedule maintenance',
    'Create another maintenance task',
  ];
  for (const request of requests) assert.equal(extractMaintenanceTaskTitle(request), undefined, request);
});

test('specific maintenance creation requests retain the actual work', () => {
  assert.equal(extractMaintenanceTaskTitle('Create a maintenance task to change the HVAC filter'), 'Change the HVAC filter');
  assert.equal(extractMaintenanceTaskTitle('Can you add a task to clean the dryer vent next week?'), 'Clean the dryer vent');
  assert.equal(extractMaintenanceTaskTitle('Schedule gutter cleaning tomorrow'), 'Gutter cleaning');
});

test('the confirmation boundary rejects generic titles', () => {
  assert.equal(isMeaningfulMaintenanceTaskTitle('Maintenance task'), false);
  assert.equal(isMeaningfulMaintenanceTaskTitle('Change the HVAC filter'), true);
});
