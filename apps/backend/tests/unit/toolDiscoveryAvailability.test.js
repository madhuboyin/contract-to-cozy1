const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  getToolDiscoveryAvailability,
} = require('../../src/services/toolDiscoveryAvailability.service.ts');

test('tool discovery defaults to beta-open release-gate enforcement', () => {
  const result = getToolDiscoveryAvailability('beta-user', {});
  assert.equal(result.enabled, true);
  assert.equal(result.enforceReleaseGates, false);
  assert.deepEqual(result.disabledToolIds, []);
});

test('tool discovery flags can disable discovery and individual tool ids', () => {
  const result = getToolDiscoveryAvailability('beta-user', {
    TOOL_DISCOVERY_ENABLED: 'false',
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
    TOOL_DISCOVERY_DISABLED_IDS: 'home-event-radar, coverage-options,home-event-radar',
  });
  assert.equal(result.enabled, false);
  assert.equal(result.enforceReleaseGates, true);
  assert.deepEqual(result.disabledToolIds, ['coverage-options', 'home-event-radar']);
});

test('tool discovery exposes the existing cohort registry', () => {
  const result = getToolDiscoveryAvailability('beta-user', {});
  assert.ok(result.rollouts.HOME_EVENT_RADAR);
  assert.equal(typeof result.rollouts.HOME_EVENT_RADAR.enabled, 'boolean');
  assert.equal(typeof result.rollouts.HOME_EVENT_RADAR.rolloutPct, 'number');
  assert.ok(result.rollouts.COVERAGE_OPTIONS);
  assert.ok(result.rollouts.PROJECT_TRACKER);
  assert.ok(result.rollouts.VISUAL_INSPECTOR);
});
