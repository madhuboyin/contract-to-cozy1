const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { maintenanceCalmCopy } = require('../../src/services/ask/handlers/maintenance.handler.ts');

// ASK_COZY_INLINE_WORKSPACE_FRD IW-CALM-001/011 (v1.111).
const counts = (overrides = {}) => ({ overdueCount: 0, dueSoonCount: 0, openCount: 0, unscheduledCount: 0, hiddenCompletedCount: 0, ...overrides });

test('the headline states overdue and due-soon work in one sentence', () => {
  assert.equal(maintenanceCalmCopy(counts({ overdueCount: 8, dueSoonCount: 1, openCount: 9 })).headline, '8 tasks are overdue, and 1 more is due in the next 30 days.');
  assert.equal(maintenanceCalmCopy(counts({ overdueCount: 1, dueSoonCount: 3, openCount: 4 })).headline, '1 task is overdue, and 3 more are due in the next 30 days.');
  assert.equal(maintenanceCalmCopy(counts({ overdueCount: 2, openCount: 2 })).headline, '2 tasks are overdue.');
  assert.equal(maintenanceCalmCopy(counts({ dueSoonCount: 1, openCount: 1 })).headline, '1 task is due in the next 30 days.');
});

test('with nothing overdue or due soon, the headline says so instead of implying urgency', () => {
  assert.equal(maintenanceCalmCopy(counts({ openCount: 5 })).headline, '5 open tasks, none overdue or due soon.');
  assert.equal(maintenanceCalmCopy(counts({ openCount: 1 })).headline, '1 open task, none overdue or due soon.');
  assert.equal(maintenanceCalmCopy(counts()).headline, 'No open maintenance tasks.');
});

test('completed work is described once, as hidden, and never inside the headline', () => {
  const copy = maintenanceCalmCopy(counts({ overdueCount: 8, dueSoonCount: 1, openCount: 9, hiddenCompletedCount: 8 }));
  assert.equal(copy.supportLine, '8 completed tasks are hidden.');
  assert.ok(!/completed/.test(copy.headline));
  assert.equal(maintenanceCalmCopy(counts({ overdueCount: 1, openCount: 1, hiddenCompletedCount: 1 })).supportLine, '1 completed task is hidden.');
});

test('the supporting line is omitted when there is nothing to add, and notes combine in a fixed order', () => {
  assert.equal(maintenanceCalmCopy(counts({ overdueCount: 1, openCount: 1 })).supportLine, undefined);
  assert.equal(
    maintenanceCalmCopy(counts({ overdueCount: 1, openCount: 4, unscheduledCount: 3, hiddenCompletedCount: 2 })).supportLine,
    '3 open tasks have no due date. 2 completed tasks are hidden.',
  );
});
