const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { buildMaintenanceImportanceResult, maintenanceImportanceFacts } = require('../../src/services/ask/support/maintenanceImportance');
const { calendarAwareTimeZone } = require('../../src/services/ask/askFormatting');

const task = (overrides = {}) => ({
  title: 'Chimney cleaning and inspection', description: 'Professional chimney sweep and safety inspection', source: 'SEASONAL', priority: 'URGENT',
  riskLevel: null, status: 'PENDING', nextDueDate: new Date('2026-09-23T00:00:00.000Z'), isRecurring: false, frequency: null,
  estimatedCost: null, assetType: null, isSeasonal: true, updatedAt: new Date('2026-09-16T12:00:00.000Z'), ...overrides,
});
const now = new Date('2026-10-01T15:00:00.000Z');

test('the answer is built only from the task record and never mentions other home items', () => {
  const result = buildMaintenanceImportanceResult(task(), now, 'America/New_York');
  const summary = result.blocks.find((block) => block.id === 'maintenance-task-importance');
  assert.equal(result.status, 'ANSWERED');
  assert.match(summary.body, /seasonal checklist/);
  assert.match(summary.body, /urgent priority/);
  assert.match(summary.body, /8 days overdue \(it was due Sep 23, 2026\)/);
  assert.match(summary.body, /Task notes: Professional chimney sweep and safety inspection/);
  assert.doesNotMatch(summary.body, /Heating system|Furnace|carbon monoxide|home record includes/i);
  assert.equal(result.blocks.find((block) => block.type === 'EVIDENCE').items.length, 1);
});

test('without notes it says the record gives no reason instead of guessing', () => {
  const result = buildMaintenanceImportanceResult(task({ description: null, source: 'USER_CREATED', priority: null }), now, 'UTC');
  assert.match(result.blocks[0].body, /no notes explaining why this matters/);
  assert.match(result.blocks[0].body, /You added this task yourself/);
});

test('a completed task is not described as overdue; recurrence, asset and cost are included', () => {
  const facts = maintenanceImportanceFacts(task({ status: 'COMPLETED', isRecurring: true, frequency: 'SEMI_ANNUALLY', assetType: 'HVAC_FURNACE', estimatedCost: 8500 }), now, 'UTC');
  assert.ok(!facts.some((fact) => /overdue/.test(fact)));
  assert.ok(facts.includes('It repeats semi annually.'));
  assert.ok(facts.includes('It is linked to your hvac furnace.'));
  assert.ok(facts.includes('The estimated cost is $8,500.'));
});

test('a UTC-midnight due date keeps its calendar day in a western property timezone', () => {
  const due = new Date('2026-09-23T00:00:00.000Z');
  assert.equal(calendarAwareTimeZone(due, 'America/New_York'), 'UTC');
  assert.equal(calendarAwareTimeZone(new Date('2026-09-23T14:30:00.000Z'), 'America/New_York'), 'America/New_York');
});
