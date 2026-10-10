const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

require('../../src/services/ask/askOrchestrator.service.ts');
const { recommendationResult } = require('../../src/services/ask/handlers/plantRecommendations.handler.ts');
const { RoomPlantRecommendationInputSchema } = require('../../src/services/ask/support/commandInputs.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');

const recommendation = (overrides = {}) => ({
  id: 'rec-1', propertyId: 'p1', roomId: 'room-1', roomPlantProfileId: 'profile-1', plantCatalogId: 'plant-1',
  rank: 1, score: 9.2, confidence: 0.92, confidenceBand: 'HIGH', status: 'RECOMMENDED',
  reasonSummary: 'Fits the room light and selected care effort.', reason: { summary: 'Strong fit', fitSignals: ['Bright indirect light', 'Pet safe'], warningFlags: [] }, warningFlags: [],
  plantName: 'Parlor Palm', scientificName: 'Chamaedorea elegans', shortDescription: 'A compact indoor palm.',
  careSummary: 'Let the top soil dry slightly.', placementTip: 'Keep a few feet from the window.', ...overrides,
});

test('the operation is a governed contributor command owned by Plant Advisor', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.ROOM_PLANT_RECOMMENDATIONS.adapterKey, 'plant-advisor.room-recommendations');
  assert.equal(ASK_OPERATION_DEFINITIONS.ROOM_PLANT_RECOMMENDATIONS.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(ASK_DOMAIN_COMMAND_REGISTRY.ROOM_PLANT_RECOMMENDATIONS.artifactType, 'ROOM_PLANT_RECOMMENDATION_SET');
});

test('the input requires room and light while retaining the desktop ranking preferences', () => {
  assert.equal(RoomPlantRecommendationInputSchema.safeParse({ roomId: 'room-1', hasPets: false, goals: [] }).success, false);
  const parsed = RoomPlantRecommendationInputSchema.parse({ roomId: 'room-1', lightLevel: 'BRIGHT_INDIRECT', maintenancePreference: 'LOW', hasPets: true, goals: ['PET_SAFE', 'LOW_MAINTENANCE'], notes: 'Away from the vent' });
  assert.deepEqual(parsed.goals, ['PET_SAFE', 'LOW_MAINTENANCE']);
});

test('recommendation rows preserve fit, care, placement, warnings and governed actions', () => {
  const result = recommendationResult({ roomId: 'room-1', name: 'Dining' }, [recommendation({ warningFlags: ['Keep away from cold drafts'] })], true);
  const row = result.blocks.find((block) => block.id === 'room-plant-recommendations').sections[0].items[0];
  assert.equal(row.title, '1. Parlor Palm');
  assert.deepEqual(row.meta, ['92% fit', 'High confidence', 'Bright indirect light', 'Pet safe']);
  assert.match(row.description, /Why it fits: Fits the room light/);
  assert.match(row.description, /Care: Let the top soil dry slightly/);
  assert.match(row.description, /Placement: Keep a few feet from the window/);
  assert.match(row.description, /Warnings: Keep away from cold drafts/);
  assert.match(row.detail, /Care: Let the top soil dry slightly/);
  assert.match(row.detail, /Placement: Keep a few feet from the window/);
  assert.match(row.detail, /Warnings: Keep away from cold drafts/);
  assert.deepEqual(row.actions.map((action) => action.id), ['plant-recommendation-add-home', 'plant-recommendation-save', 'plant-recommendation-dismiss']);
  assert.equal(row.actions.every((action) => action.operationId === 'ROOM_PLANT_RECOMMENDATIONS'), true);
  const viewer = recommendationResult({ roomId: 'room-1', name: 'Dining' }, [recommendation()], false);
  assert.equal(viewer.blocks.find((block) => block.id === 'room-plant-recommendations').sections[0].items[0].actions, undefined);
});
