const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  createCapabilityAvailabilityAdapter,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  buildPropertyContextCapabilitySources,
} = require('../../src/productFramework/capabilities/propertyContextCapabilitySources.ts');
const {
  buildToolLifecycleAnalyticsEvents,
} = require('../../src/services/analytics/toolLifecycle.ts');
const {
  sellerPrepPlanCompletionEvent,
} = require('../../src/services/analytics/sellerPrepLifecycle.ts');

function propertyContext(propertyUse) {
  return {
    propertyId: 'property-1',
    contextVersion: 'context-v2',
    generatedAt: '2026-07-24T12:00:00.000Z',
    scopes: ['CORE'],
    facts: {
      'core.propertyUse': {
        key: 'core.propertyUse',
        value: propertyUse,
        state: propertyUse ? 'KNOWN' : 'UNKNOWN',
        source: 'USER_REPORTED',
        verified: true,
        confidence: 1,
        observedAt: '2026-07-24T12:00:00.000Z',
        validUntil: null,
      },
    },
    warnings: [],
  };
}

test('CAP-804 Seller Prep owns seller discovery, Home Record, and completion contracts', () => {
  const capability = canonicalCapabilityRegistry.getById('seller-prep');
  assert.ok(capability);
  assert.equal(capability.version, 2);
  assert.ok(capability.presentation.intentAliases.includes('prepare my home to sell'));
  assert.equal(capability.recommendation.requiresExplicitTrigger, true);
  assert.deepEqual(capability.recommendation.recommendationDefinitionCodes, [
    'SELLER_SALE_INTENT_ACTIVE',
  ]);
  assert.deepEqual(capability.recommendation.sourceCtaExclusionCapabilityIds, [
    'sell-hold-rent',
  ]);
  assert.equal(capability.lifecycle.completionKind, 'PLAN_CREATED');
  assert.equal(
    capability.lifecycle.completionSignal,
    'seller_prep_plan_created_or_advanced',
  );
  assert.deepEqual(capability.productFramework.livingHomeRecordWrites, [
    'seller-prep-plan',
    'seller-prep-preferences',
    'seller-prep-checklist-progress',
    'agent-comparison',
  ]);
});

test('CAP-804 catalog search retrieves Seller Prep from homeowner phrasing', () => {
  const availability = createCapabilityAvailabilityAdapter({
    registry: canonicalCapabilityRegistry,
    failureMode: 'LAUNCH_FAIL_CLOSED',
    loadPolicy: () => ({
      enabled: true,
      enforceReleaseGates: false,
      disabledToolIds: [],
      rollouts: {},
    }),
  });
  const catalog = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability,
    userId: 'user-1',
    propertyId: 'property-1',
  });
  const query = 'prepare my home to sell';
  const matches = catalog.capabilities.filter((capability) =>
    [
      capability.label,
      capability.shortDescription,
      ...capability.intentAliases,
    ].join(' ').toLowerCase().includes(query),
  );
  assert.deepEqual(matches.map((capability) => capability.id), ['seller-prep']);
});

test('CAP-804 derives seller intent only from a confirmed FOR_SALE Home Record fact', () => {
  assert.deepEqual(
    buildPropertyContextCapabilitySources(propertyContext('PRIMARY_RESIDENCE')),
    [],
  );
  assert.deepEqual(
    buildPropertyContextCapabilitySources(propertyContext(null)),
    [],
  );
  const [source] = buildPropertyContextCapabilitySources(propertyContext('FOR_SALE'));
  assert.equal(source.definitionCode, 'SELLER_SALE_INTENT_ACTIVE');
  assert.equal(source.contextVersion, 'context-v2');
});

test('CAP-804 plan creation and advancement emit canonical completion', () => {
  const events = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [
      sellerPrepPlanCompletionEvent({
        planId: 'plan-1',
        operation: 'preferences_saved',
        sourceJourneyId: 'journey-1',
      }),
      sellerPrepPlanCompletionEvent({
        planId: 'plan-1',
        operation: 'checklist_item_completed',
        itemId: 'item-1',
        sourceProjectId: 'project-1',
      }),
    ],
  });
  assert.ok(events.every((event) => event.eventName === 'TOOL_COMPLETED'));
  assert.ok(events.every((event) =>
    event.metadataJson.completionKind === 'PLAN_CREATED'));
  assert.equal(events[0].metadataJson.journeyId, 'journey-1');
  assert.equal(events[1].metadataJson.operation, 'checklist_item_completed');
});

