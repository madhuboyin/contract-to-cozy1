const test = require('node:test');
const assert = require('node:assert/strict');
const { operationalWorkSnoozeDays } = require('../../src/services/ask/operationalWorkSnooze.ts');

test('inline Operational Work snooze choices map to their declared intervals', () => {
  assert.equal(operationalWorkSnoozeDays('Snooze this work item until tomorrow.'), 1);
  assert.equal(operationalWorkSnoozeDays('Snooze this work item for one week.'), 7);
  assert.equal(operationalWorkSnoozeDays('Snooze this work item for two weeks.'), 14);
  assert.equal(operationalWorkSnoozeDays('Snooze this work item until next month.'), 30);
  assert.equal(operationalWorkSnoozeDays('Snooze this work item.'), 14);
});
