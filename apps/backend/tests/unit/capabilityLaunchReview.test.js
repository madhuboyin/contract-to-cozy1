const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  buildCapabilityLaunchReviews,
} = require('../../src/services/releaseGate.service.ts');
const {
  getToolDiscoveryAvailability,
} = require('../../src/services/toolDiscoveryAvailability.service.ts');

function passingGates(availability) {
  const checkedAt = '2026-07-24T00:00:00.000Z';
  return canonicalCapabilityRegistry.capabilities.map((capability) => {
    const rollout = availability.rollouts[capability.governance.rolloutKey];
    return {
      toolKey: capability.governance.rolloutKey,
      label: capability.presentation.label,
      cohort: rollout.cohort,
      rolloutPct: rollout.rolloutPct,
      pass: true,
      issues: [],
      activeIncidentCount: 0,
      checkedAt,
    };
  });
}

function launchAvailability(extraEnv = {}) {
  return getToolDiscoveryAvailability('launch-reviewer', {
    TOOL_DISCOVERY_RELEASE_MODE: 'REAL_USER_LAUNCH',
    TOOL_DISCOVERY_ENABLED: 'true',
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
    ...extraEnv,
  });
}

test('CAP-901 reviews every canonical capability exactly once', () => {
  const availability = launchAvailability();
  const reviews = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    availability,
    passingGates(availability),
  );

  assert.equal(reviews.length, canonicalCapabilityRegistry.capabilities.length);
  assert.equal(new Set(reviews.map((review) => review.capabilityId)).size, reviews.length);
  assert.equal(
    reviews.every((review) => review.state === 'READY'),
    true,
  );
});

test('CAP-901 distinguishes intentional holds from launch blockers', () => {
  const availability = launchAvailability({
    TOOL_DISCOVERY_DISABLED_IDS: 'material-specs',
    TOOL_DISCOVERY_BROKEN_ROUTE_IDS: 'plant-advisor',
    TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS: 'home-digital-will',
  });
  const gates = passingGates(availability).map((gate) =>
    gate.toolKey === 'DIY'
      ? {
          ...gate,
          pass: false,
          issues: ['1 active incidents in last 24h'],
          activeIncidentCount: 1,
        }
      : gate);
  const reviews = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    availability,
    gates,
  );
  const byId = new Map(reviews.map((review) => [review.capabilityId, review]));

  assert.equal(byId.get('material-specs').state, 'HELD');
  assert.deepEqual(byId.get('material-specs').blockers, ['CAPABILITY_DISABLED']);
  assert.equal(byId.get('plant-advisor').state, 'BLOCKED');
  assert.deepEqual(byId.get('plant-advisor').blockers, ['ROUTE_UNAVAILABLE']);
  assert.equal(byId.get('home-digital-will').state, 'BLOCKED');
  assert.deepEqual(
    byId.get('home-digital-will').blockers,
    ['RELEASE_GATE_BLOCKED'],
  );
  assert.equal(byId.get('diy').state, 'BLOCKED');
  assert.deepEqual(byId.get('diy').blockers, ['INCIDENT_GATE_FAILED']);
  assert.equal(byId.get('home-event-radar').state, 'READY');
});

test('CAP-901 marks disabled rollout as held and global policy failure as blocked', () => {
  const availability = launchAvailability();
  const disabledRolloutAvailability = {
    ...availability,
    rollouts: {
      ...availability.rollouts,
      MATERIAL_SPECS: {
        enabled: false,
        cohort: 'DISABLED',
        rolloutPct: 0,
      },
    },
  };
  const held = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    disabledRolloutAvailability,
    passingGates(disabledRolloutAvailability),
  ).find((review) => review.capabilityId === 'material-specs');
  assert.equal(held.state, 'HELD');
  assert.deepEqual(held.blockers, ['ROLLOUT_DISABLED']);

  const invalid = launchAvailability({
    TOOL_DISCOVERY_DISABLED_IDS: 'unknown-capability',
  });
  const blocked = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    invalid,
    passingGates(invalid),
  );
  assert.equal(
    blocked.every((review) =>
      review.state === 'BLOCKED'
      && review.blockers.includes('CONFIGURATION_INVALID')),
    true,
  );
});
