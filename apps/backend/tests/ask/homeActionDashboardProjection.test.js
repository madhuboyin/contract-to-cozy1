const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  projectHomeActionDashboardSections,
  dashboardSectionRepresentativeActions,
} = require('../../src/services/homeActionDashboardProjection.ts');

function action(id, priority, coverageSubject = null) {
  return {
    id,
    priority,
    source: { kind: coverageSubject ? 'GUIDANCE' : 'MAINTENANCE' },
    governance: { safetyTier: coverageSubject ? 'REGULATED_COVERAGE' : 'LOW_CONSEQUENCE' },
    recommendedAction: coverageSubject ? `Confirm coverage for ${coverageSubject}` : id,
  };
}

test('projects the same independently capped dashboard sections and collapses coverage corrections', () => {
  const actions = [
    action('now-1', 'NOW'),
    action('coverage-1', 'SOON', 'Furnace'),
    action('coverage-2', 'SOON', 'Water heater'),
    action('soon-2', 'SOON'),
    action('soon-hidden', 'SOON'),
    action('plan-1', 'PLAN'),
    action('consider-1', 'CONSIDER'),
    action('plan-2', 'PLAN'),
    action('plan-hidden', 'PLAN'),
  ];

  const projection = projectHomeActionDashboardSections(actions);
  assert.deepEqual(projection.attention, [
    { kind: 'ACTION', actionIds: ['now-1'] },
    { kind: 'COVERAGE_CORRECTION_GROUP', actionIds: ['coverage-1', 'coverage-2'] },
    { kind: 'ACTION', actionIds: ['soon-2'] },
  ]);
  assert.deepEqual(projection.planAhead, [
    { kind: 'ACTION', actionIds: ['plan-1'] },
    { kind: 'ACTION', actionIds: ['consider-1'] },
    { kind: 'ACTION', actionIds: ['plan-2'] },
  ]);
  assert.deepEqual(
    dashboardSectionRepresentativeActions(actions, projection.attention).map((item) => item.id),
    ['now-1', 'coverage-1', 'soon-2'],
  );
});
