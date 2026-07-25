const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  createCapabilityAvailabilityAdapter,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  buildToolLifecycleAnalyticsEvents,
} = require('../../src/services/analytics/toolLifecycle.ts');
const {
  materialSpecCompletionEvent,
} = require('../../src/services/analytics/materialSpecLifecycle.ts');

test('CAP-800 Material Specs exposes reviewed homeowner language and Home Record contracts', () => {
  const capability = canonicalCapabilityRegistry.getById('material-specs');
  assert.ok(capability);
  assert.equal(capability.version, 2);
  assert.ok(capability.presentation.intentAliases.includes('what paint did i use'));
  assert.ok(capability.presentation.intentAliases.includes('match a repair finish'));
  assert.equal(capability.lifecycle.completionKind, 'ARTIFACT_CREATED');
  assert.equal(capability.lifecycle.completionSignal, 'material_specification_saved');
  assert.deepEqual(
    capability.productFramework.livingHomeRecordWrites,
    ['material-specification'],
  );
  assert.deepEqual(capability.recommendation.explicitRelatedCapabilityIds, [
    'project-tracker',
    'inspection-hub',
    'home-digital-twin',
  ]);
});

test('CAP-800 canonical catalog search can retrieve Material Specs from homeowner phrasing', () => {
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
  const query = 'what paint did i use';
  const matches = catalog.capabilities.filter((capability) =>
    [
      capability.label,
      capability.shortDescription,
      ...capability.intentAliases,
    ].join(' ').toLowerCase().includes(query),
  );

  assert.deepEqual(matches.map((capability) => capability.id), ['material-specs']);
});

test('CAP-800 create and update operations produce canonical meaningful completions', () => {
  for (const operation of ['create', 'update']) {
    const input = materialSpecCompletionEvent({
      id: `spec-${operation}`,
      projectId: 'project-1',
      roomId: 'room-1',
    }, operation);
    const [event] = buildToolLifecycleAnalyticsEvents({
      userId: '11111111-1111-4111-8111-111111111111',
      propertyId: '22222222-2222-4222-8222-222222222222',
      events: [input],
    });

    assert.equal(event.eventName, 'TOOL_COMPLETED');
    assert.equal(event.featureKey, 'material-specs');
    assert.equal(event.metadataJson.completionKind, 'ARTIFACT_CREATED');
    assert.equal(event.metadataJson.outputKey, `spec-${operation}`);
    assert.equal(event.metadataJson.sourceEntityType, 'PROJECT');
    assert.equal(event.metadataJson.sourceEntityId, 'project-1');
    assert.equal(event.metadataJson.operation, operation);
    assert.equal(
      event.metadataJson.livingHomeRecordWrite,
      'material-specification',
    );
  }
});
