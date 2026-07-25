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

function approvedGovernance() {
  return new Map(canonicalCapabilityRegistry.capabilities.map((capability) => [
    capability.id,
    {
      capabilityId: capability.id,
      manifestVersion: capability.version,
      policyVersion: capability.governance.policyVersion,
      requiredRoles: ['PRODUCT'],
      approvedRoles: ['PRODUCT'],
      rejectedRoles: [],
      missingRoles: [],
      ready: true,
    },
  ]));
}

function reviewOptions(overrides = {}) {
  return {
    governanceReadiness: approvedGovernance(),
    enforceHumanPolicyApprovals: true,
    governanceReviewSourceAvailable: true,
    ...overrides,
  };
}

test('CAP-901 reviews every canonical capability exactly once', () => {
  const availability = launchAvailability();
  const reviews = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    availability,
    passingGates(availability),
    reviewOptions(),
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
    reviewOptions(),
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
    reviewOptions(),
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
    reviewOptions(),
  );
  assert.equal(
    blocked.every((review) =>
      review.state === 'BLOCKED'
      && review.blockers.includes('CONFIGURATION_INVALID')),
    true,
  );
});

test('CAP-902 human policy enforcement blocks missing and rejected reviews', () => {
  const availability = launchAvailability();
  const governanceReadiness = approvedGovernance();
  governanceReadiness.set('material-specs', {
    ...governanceReadiness.get('material-specs'),
    approvedRoles: [],
    missingRoles: ['PRODUCT'],
    ready: false,
  });
  governanceReadiness.set('plant-advisor', {
    ...governanceReadiness.get('plant-advisor'),
    approvedRoles: [],
    rejectedRoles: ['PRODUCT'],
    missingRoles: ['PRODUCT'],
    ready: false,
  });
  const reviews = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    availability,
    passingGates(availability),
    reviewOptions({ governanceReadiness }),
  );
  const byId = new Map(reviews.map((review) => [review.capabilityId, review]));

  assert.equal(byId.get('material-specs').state, 'BLOCKED');
  assert.ok(
    byId.get('material-specs').blockers.includes('GOVERNANCE_APPROVAL_MISSING'),
  );
  assert.equal(byId.get('plant-advisor').state, 'BLOCKED');
  assert.ok(
    byId.get('plant-advisor').blockers.includes('GOVERNANCE_APPROVAL_REJECTED'),
  );
});

test('CAP-902 advisory or unavailable approval policy fails launch review closed', () => {
  const availability = launchAvailability();
  const gates = passingGates(availability);
  const advisory = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    availability,
    gates,
    reviewOptions({ enforceHumanPolicyApprovals: false }),
  );
  assert.equal(
    advisory.every((review) =>
      review.blockers.includes('HUMAN_POLICY_APPROVALS_NOT_ENFORCED')),
    true,
  );

  const unavailable = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    availability,
    gates,
    reviewOptions({ governanceReviewSourceAvailable: false }),
  );
  assert.equal(
    unavailable.every((review) =>
      review.blockers.includes('GOVERNANCE_REVIEW_SOURCE_UNAVAILABLE')),
    true,
  );
});
