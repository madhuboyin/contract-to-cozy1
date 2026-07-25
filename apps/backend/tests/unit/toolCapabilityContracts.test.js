const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ToolCapabilityDefinitionSchema,
  createCapabilityAvailabilityAdapter,
  createToolCapabilityRegistry,
  evaluateCapabilityAvailability,
} = require('../../src/productFramework/index.ts');

function capability(overrides = {}) {
  const id = overrides.id ?? 'material-specs';
  return {
    id,
    version: 1,
    owner: 'Homeowner Product',
    presentation: {
      label: 'Material Specs',
      shortDescription: 'Track finishes and products.',
      longDescription: 'Keep a durable record of finishes, products, and supplier details.',
      iconName: 'layers',
      intentAliases: ['what paint did I use'],
      outcomeCategory: 'UNDERSTAND_HOME',
      badges: [],
    },
    productFramework: {
      primaryJob: 'STAY_AHEAD',
      secondaryJobs: ['MAJOR_MOMENT'],
      primaryDestination: 'HOME_RECORD',
      homeownerOutcome: 'Find the exact material needed for repair or replacement.',
      expectedTimeToValue: '2–5 minutes',
      livingHomeRecordReads: ['project', 'room'],
      livingHomeRecordWrites: ['material-specification'],
    },
    destination: {
      routeTemplate: `/dashboard/properties/[id]/materials`,
      routeAliases: [],
      navTarget: 'tool:material-specs',
      acceptedContext: ['PROPERTY', 'PROJECT', 'ROOM'],
      workflowOnly: false,
    },
    recommendation: {
      mode: 'CONTEXTUAL',
      sourceKinds: ['PROJECT'],
      jobs: ['STAY_AHEAD', 'MAJOR_MOMENT'],
      triggerFamilies: ['PROJECT_COMPLETED'],
      recommendationDefinitionCodes: [],
      reasonTemplates: {
        PROJECT_COMPLETED: 'Record the finishes and products used in this completed project.',
      },
      expectedOutcome: 'Create a reusable material record.',
      readinessRequirements: [
        { kind: 'PROPERTY', reason: 'Select a property first.' },
      ],
      baseScore: 60,
      explicitRelatedCapabilityIds: [],
      maxImpressionsPer30Days: 3,
      cooldownDaysAfterDismissal: 30,
    },
    governance: {
      safetyTier: 'LOW_CONSEQUENCE',
      policyVersion: 'phase0-v1',
      rolloutKey: `MATERIAL_SPECS`,
      releaseStage: 'ACTIVE',
      commercialAction: false,
    },
    lifecycle: {
      expectedOutput: 'A saved material specification.',
      completionKind: 'ARTIFACT_CREATED',
      completionSignal: 'material_specification_saved',
      outputEntityTypes: ['MaterialSpec'],
    },
    ...overrides,
  };
}

test('valid capability definition satisfies the foundation contract', () => {
  assert.doesNotThrow(() => ToolCapabilityDefinitionSchema.parse(capability()));
});

test('contextual capability requires a reviewed contextual source and reason template', () => {
  const fixture = capability();
  fixture.recommendation.sourceKinds = [];
  fixture.recommendation.triggerFamilies = [];
  fixture.recommendation.recommendationDefinitionCodes = [];
  fixture.recommendation.reasonTemplates = {};
  const result = ToolCapabilityDefinitionSchema.safeParse(fixture);
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((issue) => issue.message).join(' '), /contextual source/i);
  assert.match(result.error.issues.map((issue) => issue.message).join(' '), /reason template/i);
});

test('safe partial value is explicit and limited to low-consequence contextual capabilities', () => {
  const material = capability();
  material.recommendation.safePartialValue = true;
  material.governance.safetyTier = 'MATERIAL_FINANCIAL';
  const materialResult = ToolCapabilityDefinitionSchema.safeParse(material);
  assert.equal(materialResult.success, false);
  assert.match(
    materialResult.error.issues.map((issue) => issue.message).join(' '),
    /safe partial value/i,
  );

  const catalogOnly = capability();
  catalogOnly.recommendation.safePartialValue = true;
  catalogOnly.recommendation.mode = 'CATALOG_ONLY';
  const catalogResult = ToolCapabilityDefinitionSchema.safeParse(catalogOnly);
  assert.equal(catalogResult.success, false);
  assert.match(
    catalogResult.error.issues.map((issue) => issue.message).join(' '),
    /safe partial value/i,
  );
});

test('workflow-only mode and destination must agree', () => {
  const fixture = capability();
  fixture.recommendation.mode = 'WORKFLOW_ONLY';
  const result = ToolCapabilityDefinitionSchema.safeParse(fixture);
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((issue) => issue.message).join(' '), /workflow-only destination/i);
});

test('capability definitions reject unknown icons and route parameters', () => {
  const unknownIcon = capability();
  unknownIcon.presentation.iconName = 'made-up-icon';
  const iconResult = ToolCapabilityDefinitionSchema.safeParse(unknownIcon);
  assert.equal(iconResult.success, false);
  assert.match(iconResult.error.issues.map((issue) => issue.message).join(' '), /invalid option/i);

  const unknownRouteParameter = capability();
  unknownRouteParameter.destination.routeTemplate =
    '/dashboard/properties/[propertySlug]/materials';
  const routeResult = ToolCapabilityDefinitionSchema.safeParse(unknownRouteParameter);
  assert.equal(routeResult.success, false);
  assert.match(
    routeResult.error.issues.map((issue) => issue.message).join(' '),
    /unknown capability route parameter.*propertySlug/i,
  );

  const repeatedRouteParameter = capability();
  repeatedRouteParameter.destination.routeTemplate =
    '/dashboard/properties/[id]/compare/[id]';
  const repeatedResult = ToolCapabilityDefinitionSchema.safeParse(repeatedRouteParameter);
  assert.equal(repeatedResult.success, false);
  assert.match(
    repeatedResult.error.issues.map((issue) => issue.message).join(' '),
    /must not be repeated/i,
  );
});

test('registry rejects duplicate IDs, rollout keys, and routes', () => {
  assert.throws(
    () => createToolCapabilityRegistry([capability(), capability()]),
    /Duplicate capability ID/,
  );

  const sameRollout = capability({
    id: 'plant-advisor',
    destination: {
      ...capability().destination,
      routeTemplate: '/dashboard/properties/[id]/tools/plant-advisor',
    },
  });
  assert.throws(
    () => createToolCapabilityRegistry([capability(), sameRollout]),
    /Duplicate capability rollout key/,
  );

  const sameRoute = capability({
    id: 'plant-advisor',
    governance: {
      ...capability().governance,
      rolloutKey: 'PLANT_ADVISOR',
    },
  });
  assert.throws(
    () => createToolCapabilityRegistry([capability(), sameRoute]),
    /route collision/i,
  );
});

test('registry rejects unknown and self-related capability references', () => {
  const unknown = capability();
  unknown.recommendation.explicitRelatedCapabilityIds = ['plant-advisor'];
  assert.throws(
    () => createToolCapabilityRegistry([unknown]),
    /unknown related capability plant-advisor/,
  );

  const self = capability();
  self.recommendation.explicitRelatedCapabilityIds = ['material-specs'];
  assert.throws(
    () => createToolCapabilityRegistry([self]),
    /cannot relate to itself/,
  );
});

test('registry output and version are deterministic regardless of input order', () => {
  const material = capability();
  const plant = capability({
    id: 'plant-advisor',
    presentation: {
      ...capability().presentation,
      label: 'Plant Advisor',
    },
    destination: {
      ...capability().destination,
      routeTemplate: '/dashboard/properties/[id]/tools/plant-advisor',
      navTarget: 'tool:plant-advisor',
    },
    governance: {
      ...capability().governance,
      rolloutKey: 'PLANT_ADVISOR',
    },
  });

  const first = createToolCapabilityRegistry([material, plant]);
  const second = createToolCapabilityRegistry([plant, material]);
  assert.equal(first.version, second.version);
  assert.deepEqual(
    first.capabilities.map((entry) => entry.id),
    ['material-specs', 'plant-advisor'],
  );
  assert.equal(first.getByRoute('/dashboard/properties/[id]/materials').id, 'material-specs');
});

test('availability preserves beta fail-open behavior and supports launch fail-closed behavior', () => {
  const definition = capability();

  assert.equal(
    evaluateCapabilityAvailability(definition, undefined, 'BETA_FAIL_OPEN').available,
    true,
  );

  const launchDecision = evaluateCapabilityAvailability(
    definition,
    undefined,
    'LAUNCH_FAIL_CLOSED',
  );
  assert.equal(launchDecision.available, false);
  assert.equal(launchDecision.reason, 'POLICY_UNAVAILABLE');
});

test('availability adapter applies its failure mode when the policy provider fails', () => {
  const registry = createToolCapabilityRegistry([capability()]);
  const failingLoader = () => {
    throw new Error('configuration provider unavailable');
  };
  const betaAdapter = createCapabilityAvailabilityAdapter({
    registry,
    loadPolicy: failingLoader,
    failureMode: 'BETA_FAIL_OPEN',
  });
  const launchAdapter = createCapabilityAvailabilityAdapter({
    registry,
    loadPolicy: failingLoader,
    failureMode: 'LAUNCH_FAIL_CLOSED',
  });

  assert.equal(betaAdapter.resolve('material-specs').available, true);
  assert.equal(launchAdapter.resolve('material-specs').available, false);
  assert.equal(launchAdapter.resolve('material-specs').reason, 'POLICY_UNAVAILABLE');
});

test('availability applies global, explicit-disable, and rollout gates in order', () => {
  const definition = capability();
  const basePolicy = {
    enabled: true,
    enforceReleaseGates: true,
    disabledToolIds: [],
    rollouts: {
      MATERIAL_SPECS: {
        enabled: true,
        cohort: 'FULL',
        rolloutPct: 100,
      },
    },
  };

  assert.equal(evaluateCapabilityAvailability(definition, basePolicy).available, true);

  const globallyDisabled = evaluateCapabilityAvailability(definition, {
    ...basePolicy,
    enabled: false,
  });
  assert.equal(globallyDisabled.reason, 'DISCOVERY_DISABLED');

  const explicitlyDisabled = evaluateCapabilityAvailability(definition, {
    ...basePolicy,
    disabledToolIds: ['material-specs'],
  });
  assert.equal(explicitlyDisabled.reason, 'CAPABILITY_DISABLED');

  const rolloutMissing = evaluateCapabilityAvailability(definition, {
    ...basePolicy,
    rollouts: {},
  });
  assert.equal(rolloutMissing.reason, 'ROLLOUT_MISSING');

  const rolloutDisabled = evaluateCapabilityAvailability(definition, {
    ...basePolicy,
    rollouts: {
      MATERIAL_SPECS: {
        enabled: false,
        cohort: 'BETA',
        rolloutPct: 25,
      },
    },
  });
  assert.equal(rolloutDisabled.reason, 'ROLLOUT_DISABLED');
});

test('CAP-704 operational guards precede cohort availability', () => {
  const definition = capability();
  const basePolicy = {
    enabled: true,
    enforceReleaseGates: true,
    disabledToolIds: [],
    rollouts: {
      MATERIAL_SPECS: {
        enabled: true,
        cohort: 'FULL',
        rolloutPct: 100,
      },
    },
  };

  assert.equal(evaluateCapabilityAvailability(definition, {
    ...basePolicy,
    registryVersionMatches: false,
  }).reason, 'REGISTRY_VERSION_MISMATCH');
  assert.equal(evaluateCapabilityAvailability(definition, {
    ...basePolicy,
    brokenRouteToolIds: ['material-specs'],
  }).reason, 'ROUTE_UNAVAILABLE');
  assert.equal(evaluateCapabilityAvailability(definition, {
    ...basePolicy,
    manifestVersions: { 'material-specs': 2 },
  }).reason, 'MANIFEST_VERSION_MISMATCH');
  assert.equal(evaluateCapabilityAvailability(definition, {
    ...basePolicy,
    releaseGateBlockedToolIds: ['material-specs'],
  }).reason, 'RELEASE_GATE_BLOCKED');
});

test('availability adapter filters workflow-only tools and resolves unknown IDs', () => {
  const material = capability();
  const workflow = capability({
    id: 'project-tracker',
    destination: {
      ...capability().destination,
      routeTemplate: '/dashboard/properties/[id]/projects',
      navTarget: 'tool:project-tracker',
      workflowOnly: true,
    },
    recommendation: {
      ...capability().recommendation,
      mode: 'WORKFLOW_ONLY',
    },
    governance: {
      ...capability().governance,
      rolloutKey: 'PROJECT_TRACKER',
    },
  });
  const registry = createToolCapabilityRegistry([material, workflow]);
  const adapter = createCapabilityAvailabilityAdapter({
    registry,
    loadPolicy: () => ({
      enabled: true,
      enforceReleaseGates: false,
      disabledToolIds: [],
      rollouts: {},
    }),
  });

  assert.deepEqual(
    adapter.listAvailable().map((entry) => entry.id),
    ['material-specs'],
  );
  assert.deepEqual(
    adapter.listAvailable({ includeWorkflowOnly: true }).map((entry) => entry.id),
    ['material-specs', 'project-tracker'],
  );
  assert.equal(adapter.resolve('missing-tool').reason, 'UNKNOWN_CAPABILITY');
});
