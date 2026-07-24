const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  canonicalCapabilityRegistry,
  createToolCapabilityRegistry,
  resolveRelatedCapabilities,
} = require('../../src/productFramework/capabilities/index.ts');

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
    ['DOCUMENT'],
  );
});

test('registry version changes when relationship or compatibility semantics change', () => {
  const definitions = structuredClone(canonicalCapabilityRegistry.capabilities);
  const inspectionHub = definitions.find(({ id }) => id === 'inspection-hub');
  inspectionHub.lifecycle.outputEntityTypes.push('DOCUMENT');

  const changed = createToolCapabilityRegistry(definitions);
  assert.notEqual(changed.version, canonicalCapabilityRegistry.version);
});
