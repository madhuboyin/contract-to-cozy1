const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { maintenanceCompletionFields } = require('../../src/services/ask/handlers/maintenance.handler.ts');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-004 (v1.112): the completion capture is a short set of plain questions.
const tasks = [
  { id: 't1', title: 'Chimney cleaning and inspection', nextDueDate: new Date('2026-09-23T12:00:00Z') },
  { id: 't2', title: 'HVAC Furnace', nextDueDate: null },
];

test('every question has a plain prompt, and the task question comes first and is required', () => {
  const fields = maintenanceCompletionFields(tasks, false);
  assert.deepEqual(fields.map((field) => field.key), ['taskId', 'actualCostUsd']);
  assert.equal(fields[0].prompt, 'Which task did you complete?');
  assert.equal(fields[0].required, true);
  assert.equal(fields[1].prompt, 'Was there an actual cost?');
  assert.equal(fields[1].required, false);
  assert.ok(fields.every((field) => typeof field.prompt === 'string' && field.prompt.endsWith('?')));
});

test('the task options are the open tasks, with a due date only where one is recorded', () => {
  const [task] = maintenanceCompletionFields(tasks, false);
  assert.equal(task.inputSchema.options.length, 2);
  assert.match(task.inputSchema.options[0].label, /^Chimney cleaning and inspection · due /);
  assert.equal(task.inputSchema.options[1].label, 'HVAC Furnace');
  assert.equal(task.inputSchema.options[1].value, 't2');
});

test('the project follow-up outcome is asked only when the task is a project follow-up, and then it is required', () => {
  assert.equal(maintenanceCompletionFields(tasks, false).some((field) => field.key === 'outcomeHealth'), false);
  const withOutcome = maintenanceCompletionFields(tasks, true);
  const outcome = withOutcome.find((field) => field.key === 'outcomeHealth');
  assert.ok(outcome);
  assert.equal(outcome.required, true);
  assert.equal(outcome.prompt, 'How is it working now?');
  assert.deepEqual(outcome.inputSchema.options.map((option) => option.value), ['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED']);
});

test('at most 50 open tasks are offered', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, nextDueDate: null }));
  assert.equal(maintenanceCompletionFields(many, false)[0].inputSchema.options.length, 50);
});
