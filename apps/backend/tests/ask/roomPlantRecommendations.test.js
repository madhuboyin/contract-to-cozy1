const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { recommendationResult, resolveRecommendationActionId } = require('../../src/services/ask/handlers/plantRecommendations.handler.ts');
const { RoomPlantRecommendationInputSchema } = require('../../src/services/ask/support/commandInputs.ts');
const { PLANT_RECOMMENDATION_ACTIONS, PLANT_RECOMMENDATIONS_MESSAGE } = require('../../src/services/ask/support/plantRecommendationConstants.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');

const recommendation = (overrides = {}) => ({
  id: 'rec-1', propertyId: 'p1', roomId: 'room-1', roomPlantProfileId: 'profile-1', plantCatalogId: 'plant-1',
  rank: 1, score: 9.2, confidence: 0.92, confidenceBand: 'HIGH', status: 'RECOMMENDED',
  reasonSummary: 'Fits the room light and selected care effort.', reason: { summary: 'Strong fit', fitSignals: ['Bright indirect light', 'Pet safe'], warningFlags: [] }, warningFlags: [],
  plantName: 'Parlor Palm', scientificName: 'Chamaedorea elegans', shortDescription: 'A compact indoor palm.',
  careSummary: 'Let the top soil dry slightly.', placementTip: 'Keep a few feet from the window.',
  lightLevel: 'BRIGHT_INDIRECT', maintenanceLevel: 'LOW', toxicityLevel: 'PET_SAFE', isPetSafe: true, ...overrides,
});

test('the operation is a governed contributor command owned by Plant Advisor', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.ROOM_PLANT_RECOMMENDATIONS.adapterKey, 'plant-advisor.room-recommendations');
  assert.equal(ASK_OPERATION_DEFINITIONS.ROOM_PLANT_RECOMMENDATIONS.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(ASK_DOMAIN_COMMAND_REGISTRY.ROOM_PLANT_RECOMMENDATIONS.artifactType, 'ROOM_PLANT_RECOMMENDATION_SET');
});

test('the input requires room and light while retaining the desktop ranking preferences', () => {
  assert.equal(RoomPlantRecommendationInputSchema.safeParse({ roomId: 'room-1', hasPets: false, goals: [] }).success, false);
  assert.equal(RoomPlantRecommendationInputSchema.safeParse({ roomId: 'room-1', lightLevel: 'MEDIUM', goals: [] }).success, false);
  assert.equal(RoomPlantRecommendationInputSchema.parse({ roomId: 'room-1', lightLevel: 'MEDIUM', hasPets: null, goals: [] }).hasPets, null);
  const parsed = RoomPlantRecommendationInputSchema.parse({ roomId: 'room-1', lightLevel: 'BRIGHT_INDIRECT', maintenancePreference: 'LOW', hasPets: true, goals: ['PET_SAFE', 'LOW_MAINTENANCE'], notes: 'Away from the vent' });
  assert.deepEqual(parsed.goals, ['PET_SAFE', 'LOW_MAINTENANCE']);
});

test('recommendation rows preserve fit, structured care and placement, warnings and governed actions', () => {
  const result = recommendationResult({ roomId: 'room-1', name: 'Dining' }, [recommendation({ warningFlags: ['Keep away from cold drafts', 'Works, but not ideal under current room inputs.'] })], true);
  const row = result.blocks.find((block) => block.id === 'room-plant-recommendations').sections[0].items[0];
  assert.equal(row.title, '1. Parlor Palm');
  assert.deepEqual(row.meta, ['92% fit', 'High confidence']);
  assert.equal(row.badgeLabel, 'Best match');
  assert.deepEqual(row.attributes, [
    { label: 'Light', value: 'Bright indirect' },
    { label: 'Care', value: 'Low' },
    { label: 'Pet safety', value: 'Pet-safe', tone: 'POSITIVE' },
  ]);
  assert.deepEqual(row.highlights, ['Bright indirect light', 'Pet safe']);
  assert.deepEqual(row.warnings, ['Keep away from cold drafts']);
  assert.deepEqual(row.guidance, [
    { label: 'Care', value: 'Let the top soil dry slightly.', kind: 'CARE' },
    { label: 'Best placement', value: 'Keep a few feet from the window.', kind: 'PLACEMENT' },
  ]);
  assert.equal(row.detail, undefined);
  assert.deepEqual(row.actions.map((action) => action.label), ['Track this plant', 'Save for later', 'Not interested']);
  assert.equal(row.actions.every((action) => action.operationId === 'ROOM_PLANT_RECOMMENDATIONS'), true);
  const viewer = recommendationResult({ roomId: 'room-1', name: 'Dining' }, [recommendation()], false);
  assert.equal(viewer.blocks.find((block) => block.id === 'room-plant-recommendations').sections[0].items[0].actions, undefined);
});

test('keeps the generic near-fit warning only when no specific warning is available', () => {
  const result = recommendationResult(
    { roomId: 'room-1', name: 'Dining' },
    [recommendation({ warningFlags: ['Works, but not ideal under current room inputs.'] })],
    true,
  );
  const row = result.blocks.find((block) => block.id === 'room-plant-recommendations').sections[0].items[0];
  assert.deepEqual(row.warnings, ['Works, but not ideal under current room inputs.']);
});

test('resolveRecommendationActionId resolves declared item action messages when launchContext.actionId is omitted', () => {
  assert.equal(resolveRecommendationActionId('Add this recommended plant to my home.', undefined), 'plant-recommendation-add-home');
  assert.equal(resolveRecommendationActionId('Save this plant recommendation.', undefined), 'plant-recommendation-save');
  assert.equal(resolveRecommendationActionId('Dismiss this plant recommendation.', undefined), 'plant-recommendation-dismiss');
  assert.equal(resolveRecommendationActionId('Add this recommended plant to my home.', 'plant-recommendation-add-home'), 'plant-recommendation-add-home');
  assert.equal(resolveRecommendationActionId('Add this recommended plant to my home.', 'plant-recommendation-save'), null);
});

test('clicking Add to home, Save, or Dismiss on a recommended plant proposes the confirmation card instead of reopening the room search form', async (t) => {
  const realPrisma = prismaModule.prisma;
  const realResolve = propertyAccess.resolvePropertyAccess;
  t.after(() => {
    prismaModule.prisma = realPrisma;
    propertyAccess.resolvePropertyAccess = realResolve;
  });

  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', propertyId: 'p1' });
  prismaModule.prisma = {
    roomPlantRecommendation: {
      findFirst: async ({ where }) => (where.id === 'rec-1' && where.propertyId === 'p1'
        ? { id: 'rec-1', propertyId: 'p1', plantCatalog: { commonName: 'Spider Plant' }, room: { id: 'room-laundry', name: 'Laundry' } }
        : null),
    },
    inventoryRoom: {
      findMany: async () => [{ id: 'room-laundry', name: 'Laundry' }],
    },
    roomPlantProfile: {
      findMany: async () => [],
    },
  };

  for (const [kind, spec] of Object.entries(PLANT_RECOMMENDATION_ACTIONS)) {
    // GenericGroupedListBlock ItemActionRow dispatches (entityType, entityId, message, operationId, interactionType) without actionId.
    const proposal = await capabilityInvoke('ROOM_PLANT_RECOMMENDATIONS', {
      userId: 'u1',
      sessionId: 's1',
      executionId: 'e-turn-16',
      propertyId: 'p1',
      message: spec.message,
      operation: ASK_OPERATION_DEFINITIONS.ROOM_PLANT_RECOMMENDATIONS,
      launchContext: {
        entityType: 'PLANT_RECOMMENDATION',
        entityId: 'rec-1',
        operationId: 'ROOM_PLANT_RECOMMENDATIONS',
        sourceExecutionId: 'e-turn-15',
      },
    });
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION', `${kind} should propose confirmation`);
    assert.equal(proposal.reasonCode, 'PLANT_RECOMMENDATION_ACTION_CONFIRMATION_REQUIRED');
    assert.equal(proposal.captureRequests, undefined);
    assert.deepEqual(proposal.parameters.plantRecommendationAction, {
      recommendationId: 'rec-1',
      roomId: 'room-laundry',
      action: kind,
    });
    assert.equal(proposal.confirmation.title, `${spec.label} Spider Plant?`);
    assert.deepEqual(proposal.confirmation.fields, [
      { label: 'Plant', value: 'Spider Plant' },
      { label: 'Room', value: 'Laundry' },
    ]);
  }

  // Conflicting actionId and message on a PLANT_RECOMMENDATION launch fails closed rather than reopening the room search form.
  const conflicted = await capabilityInvoke('ROOM_PLANT_RECOMMENDATIONS', {
    userId: 'u1',
    sessionId: 's1',
    executionId: 'e-conflict',
    propertyId: 'p1',
    message: PLANT_RECOMMENDATION_ACTIONS.ADD_TO_HOME.message,
    operation: ASK_OPERATION_DEFINITIONS.ROOM_PLANT_RECOMMENDATIONS,
    launchContext: {
      entityType: 'PLANT_RECOMMENDATION',
      entityId: 'rec-1',
      actionId: PLANT_RECOMMENDATION_ACTIONS.DISMISS.id,
      operationId: 'ROOM_PLANT_RECOMMENDATIONS',
    },
  });
  assert.equal(conflicted.status, 'NOT_APPLICABLE');
  assert.equal(conflicted.reasonCode, 'PLANT_RECOMMENDATION_ACTION_INVALID');

  // Launching ROOM_PLANT_RECOMMENDATIONS without a PLANT_RECOMMENDATION entity still opens the room search capture form.
  const searchCapture = await capabilityInvoke('ROOM_PLANT_RECOMMENDATIONS', {
    userId: 'u1',
    sessionId: 's1',
    executionId: 'e-turn-15',
    propertyId: 'p1',
    message: PLANT_RECOMMENDATIONS_MESSAGE,
    operation: ASK_OPERATION_DEFINITIONS.ROOM_PLANT_RECOMMENDATIONS,
    launchContext: {
      operationId: 'ROOM_PLANT_RECOMMENDATIONS',
    },
  });
  assert.equal(searchCapture.status, 'NEEDS_CONTEXT');
  assert.equal(searchCapture.reasonCode, 'ROOM_PLANT_RECOMMENDATION_INPUT_REQUIRED');
  assert.equal(searchCapture.captureRequests?.length, 1);
});

