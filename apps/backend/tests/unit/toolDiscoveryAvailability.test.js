const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  createToolDiscoveryCapabilityAvailabilityAdapter,
  getToolDiscoveryAvailability,
} = require('../../src/services/toolDiscoveryAvailability.service.ts');
const {
  createToolCapabilityRegistry,
} = require('../../src/productFramework/index.ts');

function capability() {
  return {
    id: 'material-specs',
    version: 1,
    owner: 'Homeowner Product',
    presentation: {
      label: 'Material Specs',
      shortDescription: 'Track finishes and products.',
      longDescription: 'Keep a durable record of finishes, products, and supplier details.',
      iconName: 'layers',
      intentAliases: [],
      outcomeCategory: 'UNDERSTAND_HOME',
      badges: [],
    },
    productFramework: {
      primaryJob: 'STAY_AHEAD',
      secondaryJobs: [],
      primaryDestination: 'HOME_RECORD',
      homeownerOutcome: 'Find the exact material used in a home.',
      expectedTimeToValue: '2–5 minutes',
      livingHomeRecordReads: [],
      livingHomeRecordWrites: ['material-specification'],
    },
    destination: {
      routeTemplate: '/dashboard/properties/[id]/materials',
      routeAliases: [],
      navTarget: 'tool:material-specs',
      acceptedContext: ['PROPERTY'],
      workflowOnly: false,
    },
    recommendation: {
      mode: 'CATALOG_ONLY',
      sourceKinds: [],
      jobs: [],
      triggerFamilies: [],
      recommendationDefinitionCodes: [],
      reasonTemplates: {},
      expectedOutcome: 'Create a reusable material record.',
      readinessRequirements: [],
      baseScore: 0,
      explicitRelatedCapabilityIds: [],
      maxImpressionsPer30Days: 0,
      cooldownDaysAfterDismissal: 0,
    },
    governance: {
      safetyTier: 'LOW_CONSEQUENCE',
      policyVersion: 'phase0-v1',
      rolloutKey: 'MATERIAL_SPECS',
      releaseStage: 'ACTIVE',
      commercialAction: false,
    },
    lifecycle: {
      expectedOutput: 'A saved material specification.',
      completionKind: 'ARTIFACT_CREATED',
      completionSignal: 'material_specification_saved',
      outputEntityTypes: ['MaterialSpec'],
    },
  };
}

test('tool discovery defaults to fail-closed real-user launch mode', () => {
  const result = getToolDiscoveryAvailability('beta-user', {});
  assert.equal(result.releaseMode, 'REAL_USER_LAUNCH');
  assert.equal(result.failureMode, 'LAUNCH_FAIL_CLOSED');
  assert.equal(result.releaseReady, false);
  assert.deepEqual(result.releaseBlockers, ['RELEASE_GATES_NOT_ENFORCED']);
  assert.equal(result.enabled, true);
  assert.equal(result.enforceReleaseGates, false);
  assert.deepEqual(result.disabledToolIds, []);
  assert.equal(result.registryVersionMatches, true);
  assert.deepEqual(result.rolloutKeyParity, {
    valid: true,
    missingKeys: [],
    unknownKeys: [],
  });
});

test('internal beta behavior requires an explicit release mode', () => {
  const registry = createToolCapabilityRegistry([capability()]);
  const env = {
    TOOL_DISCOVERY_RELEASE_MODE: 'INTERNAL_BETA',
    TOOL_DISCOVERY_ENABLED: 'true',
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'false',
  };
  const result = getToolDiscoveryAvailability('beta-user', env, registry);
  const adapter = createToolDiscoveryCapabilityAvailabilityAdapter(
    registry,
    { env },
  );

  assert.equal(result.releaseMode, 'INTERNAL_BETA');
  assert.equal(result.failureMode, 'BETA_FAIL_OPEN');
  assert.equal(result.releaseReady, false);
  assert.equal(adapter.resolve('material-specs', 'beta-user').available, true);
});

test('invalid release mode fails closed and is operationally visible', () => {
  const registry = createToolCapabilityRegistry([capability()]);
  const env = {
    TOOL_DISCOVERY_RELEASE_MODE: 'preview',
    TOOL_DISCOVERY_ENABLED: 'true',
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
  };
  const result = getToolDiscoveryAvailability('launch-user', env, registry);
  const adapter = createToolDiscoveryCapabilityAvailabilityAdapter(
    registry,
    { env },
  );

  assert.equal(result.releaseMode, 'REAL_USER_LAUNCH');
  assert.equal(result.failureMode, 'LAUNCH_FAIL_CLOSED');
  assert.equal(result.configurationValid, false);
  assert.deepEqual(
    result.invalidConfigurationEntries,
    ['TOOL_DISCOVERY_RELEASE_MODE'],
  );
  assert.ok(result.releaseBlockers.includes('CONFIGURATION_INVALID'));
  assert.equal(
    adapter.resolve('material-specs', 'launch-user').reason,
    'CONFIGURATION_INVALID',
  );
});

test('malformed launch booleans fail closed instead of using permissive fallbacks', () => {
  const registry = createToolCapabilityRegistry([capability()]);
  const env = {
    TOOL_DISCOVERY_RELEASE_MODE: 'REAL_USER_LAUNCH',
    TOOL_DISCOVERY_ENABLED: 'enabled',
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'yes',
  };
  const result = getToolDiscoveryAvailability('launch-user', env, registry);
  const adapter = createToolDiscoveryCapabilityAvailabilityAdapter(
    registry,
    { env },
  );

  assert.equal(result.configurationValid, false);
  assert.deepEqual(result.invalidConfigurationEntries, [
    'TOOL_DISCOVERY_ENABLED',
    'ENFORCE_TOOL_DISCOVERY_RELEASE_GATES',
  ]);
  assert.equal(
    adapter.resolve('material-specs', 'launch-user').reason,
    'CONFIGURATION_INVALID',
  );
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

test('containment lists reject unknown capability ids', () => {
  const result = getToolDiscoveryAvailability('launch-user', {
    TOOL_DISCOVERY_RELEASE_MODE: 'REAL_USER_LAUNCH',
    TOOL_DISCOVERY_ENABLED: 'true',
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
    TOOL_DISCOVERY_DISABLED_IDS: 'material-specs,missing-disabled',
    TOOL_DISCOVERY_BROKEN_ROUTE_IDS: 'missing-route',
    TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS: 'missing-gate',
  });

  assert.deepEqual(result.unknownDisabledToolIds, ['missing-disabled']);
  assert.deepEqual(result.unknownBrokenRouteToolIds, ['missing-route']);
  assert.deepEqual(result.unknownReleaseGateBlockedToolIds, ['missing-gate']);
  assert.equal(result.configurationValid, false);
  assert.deepEqual(result.invalidConfigurationEntries, [
    'TOOL_DISCOVERY_DISABLED_IDS',
    'TOOL_DISCOVERY_BROKEN_ROUTE_IDS',
    'TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS',
  ]);
  assert.ok(result.releaseBlockers.includes('CONFIGURATION_INVALID'));
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

test('tool discovery availability service supplies the capability adapter', () => {
  const registry = createToolCapabilityRegistry([capability()]);
  const adapter = createToolDiscoveryCapabilityAvailabilityAdapter(registry, {
    env: {
      TOOL_DISCOVERY_ENABLED: 'true',
      ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'false',
    },
  });

  assert.equal(
    adapter.resolve('material-specs', 'beta-user').reason,
    'RELEASE_GATES_NOT_ENFORCED',
  );
  assert.equal(adapter.resolve('unknown-tool', 'beta-user').reason, 'UNKNOWN_CAPABILITY');
});

test('CAP-704 operational controls fail closed for route, gate, registry, and manifest mismatches', () => {
  const registry = createToolCapabilityRegistry([capability()]);
  const scenarios = [
    {
      env: {
        TOOL_DISCOVERY_ENABLED: 'true',
        ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
        TOOL_DISCOVERY_BROKEN_ROUTE_IDS: 'material-specs',
      },
      reason: 'ROUTE_UNAVAILABLE',
    },
    {
      env: {
        TOOL_DISCOVERY_ENABLED: 'true',
        ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
        TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS: 'material-specs',
      },
      reason: 'RELEASE_GATE_BLOCKED',
    },
    {
      env: {
        TOOL_DISCOVERY_ENABLED: 'true',
        ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
        TOOL_DISCOVERY_EXPECTED_REGISTRY_VERSION: 'previous-deployment',
      },
      reason: 'REGISTRY_VERSION_MISMATCH',
    },
    {
      env: {
        TOOL_DISCOVERY_ENABLED: 'true',
        ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
        TOOL_DISCOVERY_MANIFEST_VERSIONS: 'material-specs:2',
      },
      reason: 'MANIFEST_VERSION_MISMATCH',
    },
    {
      env: {
        TOOL_DISCOVERY_ENABLED: 'true',
        ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
        TOOL_DISCOVERY_MANIFEST_VERSIONS: 'invalid-pin',
      },
      reason: 'CONFIGURATION_INVALID',
    },
  ];

  for (const scenario of scenarios) {
    const adapter = createToolDiscoveryCapabilityAvailabilityAdapter(
      registry,
      { env: scenario.env },
    );
    assert.equal(
      adapter.resolve('material-specs', 'beta-user').reason,
      scenario.reason,
    );
  }
});
