const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  flattenMovingTimeline,
  movingTaskActionKey,
  MOVING_TIMELINE_PERIODS,
} = require('../../src/services/movingConciergeTask.service.ts');

function plan() {
  const timeline = Object.fromEntries(MOVING_TIMELINE_PERIODS.map((period) => [period, []]));
  timeline.weeks4Before = [{
    id: '4w_2', title: 'Schedule utilities', description: 'Set service dates.',
    category: 'UTILITIES', dueDate: '2026-09-01T00:00:00.000Z', priority: 'CRITICAL',
    estimatedTime: '2 hours', completed: false, tips: [],
  }];
  timeline.movingDay = [{
    id: 'canonical-task-id', sourceTaskId: 'md_1', title: 'Oversee movers', description: 'Be present.',
    category: 'MOVING', dueDate: '2026-09-15T00:00:00.000Z', priority: 'HIGH',
    estimatedTime: 'All day', completed: true, tips: [],
  }];
  return { timeline };
}

test('moving timeline flattening keeps stable source identity after canonical IDs replace generated IDs', () => {
  const refs = flattenMovingTimeline(plan());
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((ref) => ref.sourceTaskId), ['4w_2', 'md_1']);
  assert.equal(refs[0].period, 'weeks4Before');
  assert.equal(refs[1].task.id, 'canonical-task-id');
});

test('moving task action keys are deterministic per timeline slot and safe for checklist uniqueness', () => {
  assert.equal(
    movingTaskActionKey('weeks4Before', '4W / Utility #2'),
    'buyer:moving-concierge:weeks4Before:4w-utility-2',
  );
  assert.equal(movingTaskActionKey('movingDay', 'md_1'), movingTaskActionKey('movingDay', 'md_1'));
});

test('Moving Concierge completion writes canonical buyer tasks instead of the legacy completedTasks column', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/movingConcierge.service.ts'), 'utf8');
  const canonical = readFileSync(resolve(__dirname, '../../src/services/movingConciergeTask.service.ts'), 'utf8');
  const updateSection = source.slice(source.indexOf('async updateCompletedTasks'), source.indexOf('async deleteMovingPlan'));
  assert.match(updateSection, /updateCanonicalMovingCompletion/);
  assert.doesNotMatch(updateSection, /completedTasks:\s*completedTaskIds/);
  assert.match(canonical, /phase: 'MOVE_IN'/);
  assert.match(canonical, /checklistSection: 'MOVE_POSSESSION'/);
  assert.match(canonical, /sourceEntityType: MOVING_CONCIERGE_SOURCE_ENTITY/);
});
