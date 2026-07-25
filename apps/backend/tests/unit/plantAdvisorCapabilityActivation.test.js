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
  plantAdvisorCompletionEvent,
} = require('../../src/services/analytics/plantAdvisorLifecycle.ts');
const {
  plantAdvisorGrowingContextReadiness,
  RoomPlantAdvisorService,
} = require('../../src/services/roomPlantAdvisor.service.ts');

test('CAP-801 Plant Advisor owns reviewed discovery and Home Record contracts', () => {
  const capability = canonicalCapabilityRegistry.getById('plant-advisor');
  assert.ok(capability);
  assert.equal(capability.version, 2);
  assert.ok(
    capability.presentation.intentAliases.includes(
      'what plant works in this room',
    ),
  );
  assert.ok(
    capability.presentation.intentAliases.includes('plants for low light'),
  );
  assert.equal(capability.productFramework.primaryJob, 'STAY_AHEAD');
  assert.equal(capability.lifecycle.completionKind, 'OUTPUT_GENERATED');
  assert.equal(
    capability.lifecycle.completionSignal,
    'plant_recommendations_generated',
  );
  assert.deepEqual(capability.lifecycle.outputEntityTypes, ['ROOM']);
  assert.deepEqual(capability.productFramework.livingHomeRecordWrites, [
    'room-plant-profile',
    'plant-recommendation',
    'home-plant',
    'plant-care-plan',
  ]);
});

test('CAP-801 catalog search retrieves Plant Advisor from homeowner phrasing', () => {
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
  const query = 'what plant works in this room';
  const matches = catalog.capabilities.filter((capability) =>
    [
      capability.label,
      capability.shortDescription,
      ...capability.intentAliases,
    ].join(' ').toLowerCase().includes(query),
  );

  assert.deepEqual(matches.map((capability) => capability.id), ['plant-advisor']);
});

test('CAP-801 missing room light remains NEEDS_CONTEXT instead of being guessed', () => {
  assert.deepEqual(plantAdvisorGrowingContextReadiness({
    lightLevel: null,
  }), {
    state: 'NEEDS_CONTEXT',
    missingFields: ['lightLevel'],
  });
  assert.deepEqual(plantAdvisorGrowingContextReadiness({
    lightLevel: 'BRIGHT_INDIRECT',
  }), {
    state: 'READY',
    missingFields: [],
  });
});

test('CAP-801 service blocks recommendation generation until light is known', async () => {
  const service = new RoomPlantAdvisorService();
  service.assertRoomBelongs = async () => ({
    id: 'room-1',
    name: 'Living room',
    type: 'LIVING_ROOM',
  });
  service.ensureProfile = async () => ({
    id: 'profile-1',
    lightLevel: null,
  });

  await assert.rejects(
    service.generateRecommendations('property-1', 'room-1', {}),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.code, 'PLANT_ADVISOR_CONTEXT_REQUIRED');
      assert.deepEqual(error.details, {
        readiness: 'NEEDS_CONTEXT',
        missingFields: ['lightLevel'],
      });
      return true;
    },
  );
});

test('CAP-801 generated recommendation sets produce canonical completion', () => {
  const [event] = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [plantAdvisorCompletionEvent({
      roomId: 'room-1',
      profileId: 'profile-1',
      recommendationIds: ['recommendation-1', 'recommendation-2'],
    })],
  });

  assert.equal(event.eventName, 'TOOL_COMPLETED');
  assert.equal(event.featureKey, 'plant-advisor');
  assert.equal(event.metadataJson.completionKind, 'OUTPUT_GENERATED');
  assert.equal(event.metadataJson.sourceEntityType, 'ROOM');
  assert.equal(event.metadataJson.sourceEntityId, 'room-1');
  assert.equal(
    event.metadataJson.outputKey,
    'plant-recommendations:profile-1',
  );
  assert.equal(event.metadataJson.recommendationCount, 2);
  assert.deepEqual(event.metadataJson.livingHomeRecordWrites, [
    'room-plant-profile',
    'plant-recommendation',
  ]);
});
