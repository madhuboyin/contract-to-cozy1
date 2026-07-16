const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  deriveChecklistProgress,
  isDismissibleSeasonalPriority,
} = require('../../src/utils/seasonalProgress.ts');

test('dismissed items leave the denominator', () => {
  const progress = deriveChecklistProgress([
    { status: 'COMPLETED' },
    { status: 'ADDED' },
    { status: 'RECOMMENDED' },
    { status: 'RECOMMENDED' },
    { status: 'ADDED' },
    { status: 'DISMISSED' },
    { status: 'DISMISSED' },
  ]);
  assert.equal(progress.completedTasks, 1);
  assert.equal(progress.activeTotalTasks, 5);
  assert.equal(progress.dismissedTasks, 2);
  assert.equal(progress.isFullyCompleted, false);
});

test('completing every non-dismissed item fully completes the checklist', () => {
  const progress = deriveChecklistProgress([
    { status: 'COMPLETED' },
    { status: 'COMPLETED' },
    { status: 'DISMISSED' },
  ]);
  assert.equal(progress.completedTasks, 2);
  assert.equal(progress.activeTotalTasks, 2);
  assert.equal(progress.isFullyCompleted, true);
});

test('an all-dismissed checklist is not fully completed', () => {
  const progress = deriveChecklistProgress([
    { status: 'DISMISSED' },
    { status: 'DISMISSED' },
  ]);
  assert.equal(progress.activeTotalTasks, 0);
  assert.equal(progress.isFullyCompleted, false);
});

test('reactivating a dismissed item re-enters the denominator', () => {
  const before = deriveChecklistProgress([
    { status: 'COMPLETED' },
    { status: 'DISMISSED' },
  ]);
  assert.equal(before.isFullyCompleted, true);

  const after = deriveChecklistProgress([
    { status: 'COMPLETED' },
    { status: 'RECOMMENDED' },
  ]);
  assert.equal(after.activeTotalTasks, 2);
  assert.equal(after.isFullyCompleted, false);
});

test('only non-critical priorities are dismissible', () => {
  assert.equal(isDismissibleSeasonalPriority('CRITICAL'), false);
  assert.equal(isDismissibleSeasonalPriority('RECOMMENDED'), true);
  assert.equal(isDismissibleSeasonalPriority('OPTIONAL'), true);
  assert.equal(isDismissibleSeasonalPriority(null), true);
});
