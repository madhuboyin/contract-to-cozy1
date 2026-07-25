const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  runCapabilityKillSwitchDrill,
} = require('../../src/services/capabilityKillSwitchDrill.ts');
const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');

test('CAP-907 exercises per-capability and global kill switches with restoration', () => {
  const report = runCapabilityKillSwitchDrill({
    env: {},
    now: new Date('2026-07-25T12:00:00.000Z'),
  });

  assert.equal(report.contractVersion, 'capability-kill-switch-drill-v1');
  assert.equal(report.checkedAt, '2026-07-25T12:00:00.000Z');
  assert.equal(report.registryVersion, canonicalCapabilityRegistry.version);
  assert.equal(report.capabilityCount, canonicalCapabilityRegistry.capabilities.length);
  assert.equal(report.baseline.releaseReady, true);
  assert.deepEqual(report.baseline.releaseBlockers, []);
  assert.equal(report.perCapability.length, report.capabilityCount);
  assert.equal(report.perCapability.every((result) => result.passed), true);
  assert.equal(report.global.suppressedCapabilityCount, report.capabilityCount);
  assert.equal(report.global.catalogCapabilityCount, 0);
  assert.deepEqual(report.global.decisionReasons, ['DISCOVERY_DISABLED']);
  assert.deepEqual(report.restoration, {
    passed: true,
    decisionsRestored: true,
    catalogRestored: true,
  });
  assert.equal(report.passed, true);
});

test('CAP-907 fails when registry rollout parity is not launch-ready', () => {
  const incompleteRegistry = {
    ...canonicalCapabilityRegistry,
    capabilities: canonicalCapabilityRegistry.capabilities.slice(0, 1),
  };
  const report = runCapabilityKillSwitchDrill({
    env: {},
    registry: incompleteRegistry,
  });

  assert.equal(report.baseline.releaseReady, false);
  assert.ok(report.baseline.releaseBlockers.includes('ROLLOUT_KEYS_UNKNOWN'));
  assert.equal(report.passed, false);
});
