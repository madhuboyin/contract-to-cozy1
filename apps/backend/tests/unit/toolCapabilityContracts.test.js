const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ToolCapabilityDefinitionSchema,
  createToolCapabilityRegistry,
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

test('workflow-only mode and destination must agree', () => {
  const fixture = capability();
  fixture.recommendation.mode = 'WORKFLOW_ONLY';
  const result = ToolCapabilityDefinitionSchema.safeParse(fixture);
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((issue) => issue.message).join(' '), /workflow-only destination/i);
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
