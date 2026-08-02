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
  saleCaseMilestoneCompletionEvent,
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

test('CAP-804 Sale Readiness owns sale-case discovery, Home Record, and completion contracts', () => {
  const capability = canonicalCapabilityRegistry.getById('seller-prep');
  assert.ok(capability);
  assert.equal(capability.version, 3);
  assert.equal(capability.presentation.label, 'Sale Readiness & Handoff');
  assert.ok(capability.presentation.intentAliases.includes('prepare my home to sell'));
  assert.equal(capability.recommendation.requiresExplicitTrigger, true);
  assert.deepEqual(capability.recommendation.recommendationDefinitionCodes, [
    'SELLER_SALE_INTENT_ACTIVE',
  ]);
  assert.deepEqual(capability.recommendation.sourceCtaExclusionCapabilityIds, [
    'sell-hold-rent',
  ]);
  assert.equal(capability.lifecycle.completionKind, 'OUTCOME_VERIFIED');
  assert.equal(
    capability.lifecycle.completionSignal,
    'sale_case_verified_milestone_completed',
  );
  assert.deepEqual(capability.productFramework.livingHomeRecordWrites, [
    'sale-case',
    'sale-milestone',
    'sale-work-reference',
    'sale-handoff-package',
    'ownership-transition-decision',
  ]);
});

test('CAP-804 sale readiness stays contextual and safety-gated in general catalog search', () => {
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
  assert.deepEqual(matches.map((capability) => capability.id), []);
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

test('CAP-804 verified sale milestones emit canonical completion', () => {
  const events = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [
      saleCaseMilestoneCompletionEvent({
        saleCaseId: 'sale-case-1',
        milestoneId: 'milestone-1',
        operation: 'readiness_verified',
        sourceJourneyId: 'journey-1',
      }),
      saleCaseMilestoneCompletionEvent({
        saleCaseId: 'sale-case-1',
        milestoneId: 'milestone-2',
        operation: 'handoff_published',
        sourceProjectId: 'project-1',
      }),
    ],
  });
  assert.ok(events.every((event) => event.eventName === 'TOOL_COMPLETED'));
  assert.ok(events.every((event) =>
    event.metadataJson.completionKind === 'OUTCOME_VERIFIED'));
  assert.equal(events[0].metadataJson.journeyId, 'journey-1');
  assert.equal(events[1].metadataJson.operation, 'handoff_published');
});
