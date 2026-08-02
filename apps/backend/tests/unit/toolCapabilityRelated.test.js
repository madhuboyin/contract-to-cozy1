const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  canonicalCapabilityRegistry,
  createToolCapabilityRegistry,
  resolveRelatedCapabilities,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  getRelatedCapabilities,
} = require('../../src/services/capabilityRelated.service.ts');
const relatedRouter = require('../../src/routes/capabilitySuggestions.routes.ts').default;
const {
  RelatedCapabilitiesQuerySchema,
} = require('../../src/routes/capabilitySuggestions.routes.ts');

const ALL_TIERS = [
  'LOW_CONSEQUENCE',
  'MATERIAL_FINANCIAL',
  'REGULATED_COVERAGE',
  'SAFETY_EMERGENCY',
];

function context(overrides = {}) {
  const ids = canonicalCapabilityRegistry.capabilities.map(({ id }) => id);
  return {
    availableCapabilityIds: ids,
    readinessByCapabilityId: Object.fromEntries(ids.map((id) => [id, 'READY'])),
    canUseCapabilities: true,
    allowedSafetyTiers: ALL_TIERS,
    enforceApprovals: false,
    approvedCapabilityIds: [],
    commercialActionsAllowed: true,
    workflowContextTypes: [],
    sourceEntityType: null,
    suppressedCapabilityIds: [],
    ...overrides,
  };
}

test('explicit manifest relationships lead and preserve reviewed order', () => {
  const result = resolveRelatedCapabilities({
    registry: canonicalCapabilityRegistry,
    currentCapabilityId: 'service-price-radar',
    context: context(),
  });

  assert.deepEqual(
    result.suggestions.map(({ capabilityId }) => capabilityId),
    ['negotiation-shield', 'cost-explainer', 'true-cost'],
  );
  assert.ok(result.suggestions.every(({ signals }) => signals.explicit));
  assert.ok(result.suggestions.every(({ capabilityId }) =>
    capabilityId !== 'service-price-radar'));
});

test('verified outputs outrank taxonomy-only relationships', () => {
  const result = resolveRelatedCapabilities({
    registry: canonicalCapabilityRegistry,
    currentCapabilityId: 'inspection-hub',
    context: context({ sourceEntityType: 'ISSUE' }),
    limit: 4,
  });

  assert.deepEqual(
    result.suggestions.slice(0, 2).map(({ capabilityId }) => capabilityId),
    ['diy', 'permits'],
  );
  assert.ok(result.suggestions.slice(0, 3).every(({ signals }) =>
    signals.outputToInput));
  assert.ok(result.suggestions.slice(0, 2).every(({ signals }) =>
    signals.outputToInput
    && signals.sourceEntityCompatible
    && signals.sharedPrimaryJob
    && signals.sameDestination
    && signals.sameOutcome));
  assert.ok(result.suggestions.slice(3).every(({ signals }) =>
    !signals.outputToInput));
});

test('release, readiness, governance, workflow, and suppression gates fail closed', () => {
  const result = resolveRelatedCapabilities({
    registry: canonicalCapabilityRegistry,
    currentCapabilityId: 'service-price-radar',
    context: context({
      availableCapabilityIds: ['cost-explainer', 'quote-comparison', 'true-cost'],
      readinessByCapabilityId: {
        'cost-explainer': 'UNAVAILABLE',
        'quote-comparison': 'READY',
        'true-cost': 'READY',
      },
      enforceApprovals: true,
      approvedCapabilityIds: ['quote-comparison', 'true-cost'],
      suppressedCapabilityIds: ['true-cost'],
    }),
    limit: 99,
  });

  assert.deepEqual(result.suggestions, []);
  assert.equal(result.diagnostics.unavailableCount > 0, true);
  assert.equal(result.diagnostics.unreadiedCount, 1);
  assert.equal(result.diagnostics.workflowContextBlockedCount, 1);
  assert.equal(result.diagnostics.suppressedCount, 1);
});

test('workflow and commercial capabilities require their explicit governance context', () => {
  const workflow = resolveRelatedCapabilities({
    registry: canonicalCapabilityRegistry,
    currentCapabilityId: 'service-price-radar',
    context: context({
      availableCapabilityIds: ['quote-comparison'],
      readinessByCapabilityId: { 'quote-comparison': 'READY' },
      workflowContextTypes: ['PROPERTY'],
    }),
  });
  assert.deepEqual(
    workflow.suggestions.map(({ capabilityId }) => capabilityId),
    ['quote-comparison'],
  );

  const commercialBlocked = resolveRelatedCapabilities({
    registry: canonicalCapabilityRegistry,
    currentCapabilityId: 'service-price-radar',
    context: context({
      availableCapabilityIds: ['financing'],
      readinessByCapabilityId: { financing: 'READY' },
      commercialActionsAllowed: false,
    }),
  });
  assert.deepEqual(commercialBlocked.suggestions, []);
  assert.equal(commercialBlocked.diagnostics.governanceBlockedCount, 1);
});

test('defaults to three and clamps caller requests to the absolute maximum of four', () => {
  const defaultResult = resolveRelatedCapabilities({
    registry: canonicalCapabilityRegistry,
    currentCapabilityId: 'inspection-hub',
    context: context(),
  });
  const clampedResult = resolveRelatedCapabilities({
    registry: canonicalCapabilityRegistry,
    currentCapabilityId: 'inspection-hub',
    context: context(),
    limit: 100,
  });

  assert.equal(defaultResult.suggestions.length, 3);
  assert.equal(clampedResult.suggestions.length, 4);
});

test('canonical manifests declare only verified output-to-input entity types', () => {
  assert.deepEqual(
    canonicalCapabilityRegistry.getById('inspection-hub').lifecycle.outputEntityTypes,
    ['ISSUE'],
  );
  assert.deepEqual(
    canonicalCapabilityRegistry.getById('project-tracker').lifecycle.outputEntityTypes,
    ['PROJECT'],
  );
  assert.deepEqual(
    canonicalCapabilityRegistry.getById('material-specs').lifecycle.outputEntityTypes,
    ['STRUCTURED_RECORD'],
  );
});

test('registry version changes when relationship or compatibility semantics change', () => {
  const definitions = structuredClone(canonicalCapabilityRegistry.capabilities);
  const inspectionHub = definitions.find(({ id }) => id === 'inspection-hub');
  inspectionHub.lifecycle.outputEntityTypes.push('DOCUMENT');

  const changed = createToolCapabilityRegistry(definitions);
  assert.notEqual(changed.version, canonicalCapabilityRegistry.version);
});

function serviceDependencies(overrides = {}) {
  const ids = canonicalCapabilityRegistry.capabilities.map(({ id }) => id);
  return {
    registry: canonicalCapabilityRegistry,
    loadPropertyContext: async (propertyId) => ({
      propertyId,
      contextVersion: 'context-related-v1',
      generatedAt: '2026-07-24T12:00:00.000Z',
      scopes: ['CORE'],
      facts: {
        'core.yearBuilt': {
          key: 'core.yearBuilt',
          value: 2005,
          state: 'KNOWN',
          source: 'PUBLIC_RECORD',
          verified: true,
          confidence: 0.9,
          observedAt: '2026-07-24T12:00:00.000Z',
          validUntil: null,
          correctionPath: null,
        },
      },
      warnings: [],
    }),
    loadReadinessMetrics: async () => ({
      trackedSystemCount: 3,
      coverageGapCount: 1,
      jurisdictionStatus: 'KNOWN',
    }),
    availableCapabilityIds: () => ids,
    loadRecentlyCompletedCapabilityIds: async () => [],
    ...overrides,
  };
}

test('CAP-601 service projects safe property destinations and versioned attribution', async () => {
  const response = await getRelatedCapabilities({
    propertyId: 'property-1',
    userId: 'user-1',
    currentCapabilityId: 'service-price-radar',
  }, serviceDependencies());

  assert.equal(response.recommendationVersion, 'capability-related-v1');
  assert.equal(response.contextVersion, 'context-related-v1');
  assert.deepEqual(
    response.suggestions.map(({ capabilityId }) => capabilityId),
    ['negotiation-shield', 'cost-explainer', 'true-cost'],
  );
  assert.ok(response.suggestions.every(({ href }) =>
    href.startsWith('/dashboard/properties/property-1/')));
  assert.ok(response.suggestions.every(({ reasonCode }) =>
    reasonCode === 'EXPLICIT_RELATIONSHIP'));
});

test('CAP-601 service suppresses recently completed related capabilities', async () => {
  const response = await getRelatedCapabilities({
    propertyId: 'property-1',
    userId: 'user-1',
    currentCapabilityId: 'service-price-radar',
  }, serviceDependencies({
    loadRecentlyCompletedCapabilityIds: async () => ['negotiation-shield'],
  }));

  assert.equal(
    response.suggestions.some(({ capabilityId }) =>
      capabilityId === 'negotiation-shield'),
    false,
  );
});

test('CAP-908 catalog-only rollback suppresses related resolution before context loading', async () => {
  let contextLoads = 0;
  const response = await getRelatedCapabilities({
    propertyId: 'property-1',
    userId: 'user-1',
    currentCapabilityId: 'service-price-radar',
  }, serviceDependencies({
    recommendationsEnabled: () => false,
    loadPropertyContext: async () => {
      contextLoads += 1;
      throw new Error('catalog-only mode must not load related context');
    },
  }));

  assert.equal(response.contextVersion, 'catalog-only');
  assert.deepEqual(response.suggestions, []);
  assert.equal(contextLoads, 0);
});

test('CAP-601 query and route enforce bounded canonical property-scoped access', () => {
  assert.equal(RelatedCapabilitiesQuerySchema.safeParse({
    currentCapabilityId: 'service-price-radar',
    limit: '4',
    workflowContextType: ['PROPERTY', 'SERVICE'],
  }).success, true);
  assert.equal(RelatedCapabilitiesQuerySchema.safeParse({
    currentCapabilityId: 'not-a-capability',
  }).success, false);
  assert.equal(RelatedCapabilitiesQuerySchema.safeParse({
    currentCapabilityId: 'service-price-radar',
    limit: '5',
  }).success, false);

  const route = relatedRouter.stack
    .filter((layer) => layer.route)
    .find((layer) =>
      layer.route.path === '/properties/:propertyId/related-capabilities'
      && layer.route.methods?.get)
    ?.route;
  assert.ok(route, 'Expected related capabilities GET route');
  assert.equal(route.stack.length, 3);
  assert.equal(route.stack[0].name, 'authenticate');
  assert.equal(route.stack[1].name, 'propertyAuthMiddleware');
});
