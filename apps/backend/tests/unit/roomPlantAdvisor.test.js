// tests/unit/roomPlantAdvisor.test.js
//
// Guardrail and ranking tests for Smart Plant Advisor.
// Uses ts-node register to exercise real TypeScript logic without hitting the DB.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  __roomPlantAdvisorTestables,
  RoomPlantAdvisorService,
} = require('../../src/services/roomPlantAdvisor.service.ts');
const {
  plantAdvisorPropertyParamsSchema,
  plantAdvisorRoomParamsSchema,
  plantAdvisorRecommendationParamsSchema,
} = require('../../src/validators/roomPlantAdvisor.validators.ts');
const { prisma } = require('../../src/lib/prisma.ts');

const { scorePlantCandidate, rankPlantCandidates, confidenceBand } = __roomPlantAdvisorTestables;

function mkPlant(overrides = {}) {
  return {
    id: 'plant-default',
    commonName: 'Default Plant',
    scientificName: 'Planta defaulta',
    lightLevel: 'MEDIUM',
    maintenanceLevel: 'LOW',
    humidityPreference: 'MEDIUM',
    toxicityLevel: 'PET_SAFE',
    isPetSafe: true,
    suitableRoomTypes: ['LIVING_ROOM', 'OFFICE'],
    supportsAirQuality: true,
    hasFragrance: false,
    decorStyleTags: ['modern'],
    placementTips: null,
    careSummary: null,
    wateringCadenceDays: 7,
    baseConfidence: 0.8,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function mkProfile(overrides = {}) {
  return {
    detectedRoomType: null,
    lightLevel: null,
    maintenancePreference: null,
    hasPets: false,
    goals: [],
    ...overrides,
  };
}

test('ranking prefers stronger room/light fit over weaker fit', () => {
  const strong = scorePlantCandidate({
    plant: mkPlant({
      id: 'a',
      commonName: 'Balanced Pick',
      suitableRoomTypes: ['OFFICE'],
      lightLevel: 'MEDIUM',
      maintenanceLevel: 'LOW',
    }),
    roomType: 'OFFICE',
    profile: mkProfile({
      lightLevel: 'MEDIUM',
      maintenancePreference: 'LOW',
      goals: ['AIR_QUALITY'],
    }),
  });

  const weak = scorePlantCandidate({
    plant: mkPlant({
      id: 'b',
      commonName: 'Bright-only Pick',
      suitableRoomTypes: ['KITCHEN'],
      lightLevel: 'BRIGHT_DIRECT',
      maintenanceLevel: 'HIGH',
    }),
    roomType: 'OFFICE',
    profile: mkProfile({
      lightLevel: 'LOW',
      maintenancePreference: 'LOW',
      goals: ['AIR_QUALITY'],
    }),
  });

  assert.ok(strong.score > weak.score, `Expected strong score > weak score (${strong.score} vs ${weak.score})`);
  assert.ok(strong.confidence >= weak.confidence, 'Expected stronger fit to have at least equal confidence');
});

test('pet-toxic plants are downgraded for pet households with explicit warning', () => {
  const toxic = scorePlantCandidate({
    plant: mkPlant({
      id: 'toxic-1',
      commonName: 'Toxic Plant',
      toxicityLevel: 'TOXIC',
      isPetSafe: false,
      suitableRoomTypes: ['LIVING_ROOM'],
      lightLevel: 'MEDIUM',
      maintenanceLevel: 'LOW',
    }),
    roomType: 'LIVING_ROOM',
    profile: mkProfile({
      hasPets: true,
      lightLevel: 'MEDIUM',
      maintenancePreference: 'LOW',
    }),
  });

  assert.equal(toxic.fitCategory, 'WEAK');
  assert.ok(toxic.score <= 62, `Expected hard pet-safety cap on score, got ${toxic.score}`);
  assert.ok(
    toxic.warningFlags.some((warning) => warning.toLowerCase().includes('pet toxicity warning')),
    'Expected explicit pet toxicity warning',
  );
});

test('insufficient light receives strong warning and penalty', () => {
  const lightMismatch = scorePlantCandidate({
    plant: mkPlant({
      id: 'bright',
      commonName: 'Sun Lover',
      lightLevel: 'BRIGHT_DIRECT',
      suitableRoomTypes: ['OFFICE'],
    }),
    roomType: 'OFFICE',
    profile: mkProfile({ lightLevel: 'LOW' }),
  });

  const lightAligned = scorePlantCandidate({
    plant: mkPlant({
      id: 'low',
      commonName: 'Shade Plant',
      lightLevel: 'LOW',
      suitableRoomTypes: ['OFFICE'],
    }),
    roomType: 'OFFICE',
    profile: mkProfile({ lightLevel: 'LOW' }),
  });

  assert.ok(lightAligned.score > lightMismatch.score, 'Expected aligned light to rank higher');
  assert.ok(
    lightMismatch.warningFlags.some((warning) => warning.toLowerCase().includes('insufficient light')),
    'Expected insufficient light warning',
  );
});

test('near-fit room logic marks recommendation as works-but-not-ideal', () => {
  const nearFit = scorePlantCandidate({
    plant: mkPlant({
      id: 'bedroom-plant',
      suitableRoomTypes: ['BEDROOM'],
      commonName: 'Bedroom Plant',
    }),
    roomType: 'OFFICE',
    profile: mkProfile({ lightLevel: 'MEDIUM' }),
  });

  assert.notEqual(nearFit.fitCategory, 'STRONG');
  assert.ok(
    nearFit.warningFlags.some((warning) => warning.toLowerCase().includes('works, but not ideal')),
    'Expected near-fit warning treatment',
  );
});

test('duplicate suppression keeps a single candidate per normalized plant identity', () => {
  const better = {
    plant: mkPlant({
      id: 'dup-1',
      commonName: 'Snake Plant',
      scientificName: 'Dracaena trifasciata',
    }),
    result: {
      score: 90,
      confidence: 0.86,
      confidenceBand: 'HIGH',
      fitSignals: ['good'],
      warningFlags: [],
      reasonSummary: 'good',
      majorWarningCount: 0,
      softBlockerCount: 0,
      fitCategory: 'STRONG',
    },
  };

  const weakerDuplicate = {
    plant: mkPlant({
      id: 'dup-2',
      commonName: 'Snake Plant',
      scientificName: 'Dracaena trifasciata',
    }),
    result: {
      ...better.result,
      score: 55,
      confidence: 0.45,
      confidenceBand: 'LOW',
      fitCategory: 'NEAR_FIT',
    },
  };

  const ranked = rankPlantCandidates([weakerDuplicate, better], 8);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].plant.id, 'dup-1');
});

test('stable ordering uses name and id tie-breakers for deterministic output', () => {
  const baseResult = {
    score: 70,
    confidence: 0.62,
    confidenceBand: 'MEDIUM',
    fitSignals: [],
    warningFlags: [],
    reasonSummary: 'steady',
    majorWarningCount: 0,
    softBlockerCount: 0,
    fitCategory: 'NEAR_FIT',
  };

  const ranked = rankPlantCandidates(
    [
      { plant: mkPlant({ id: '2', commonName: 'Aloe', scientificName: 'Aloe vera' }), result: baseResult },
      { plant: mkPlant({ id: '1', commonName: 'Aloe', scientificName: 'Aloe vera var' }), result: baseResult },
      { plant: mkPlant({ id: '3', commonName: 'Bamboo', scientificName: 'Bambusoideae' }), result: baseResult },
    ],
    8,
  );

  assert.equal(ranked[0].plant.commonName, 'Aloe');
  assert.equal(ranked[1].plant.commonName, 'Aloe');
  assert.equal(ranked[2].plant.commonName, 'Bamboo');
  assert.equal(ranked[0].plant.id, '1');
  assert.equal(ranked[1].plant.id, '2');
});

test('confidence band thresholds are deterministic', () => {
  assert.equal(confidenceBand(0.8), 'HIGH');
  assert.equal(confidenceBand(0.6), 'MEDIUM');
  assert.equal(confidenceBand(0.2), 'LOW');
});

test('params validation enforces uuid guardrails', () => {
  assert.equal(
    plantAdvisorPropertyParamsSchema.safeParse({ propertyId: 'not-a-uuid' }).success,
    false,
  );
  assert.equal(
    plantAdvisorRoomParamsSchema.safeParse({
      propertyId: 'f27f66e8-9c22-406b-aeef-f67c98681768',
      roomId: 'not-a-uuid',
    }).success,
    false,
  );
  assert.equal(
    plantAdvisorRecommendationParamsSchema.safeParse({
      propertyId: 'f27f66e8-9c22-406b-aeef-f67c98681768',
      roomId: '42f2f984-8f9b-42f4-b21a-f7024c3f1c0c',
      recommendationId: '44a0d0b0-f414-4e44-a496-4fef1f63a8f0',
    }).success,
    true,
  );
});

test('saveRecommendation is idempotent when already saved', async () => {
  const service = new RoomPlantAdvisorService();
  const originalAssert = service.assertRoomBelongs;
  const originalScoped = service.getScopedRecommendation;
  const originalUpdate = prisma.roomPlantRecommendation.update;

  service.assertRoomBelongs = async () => ({ id: 'room', name: 'Room', type: 'OFFICE' });
  service.getScopedRecommendation = async () => ({
    id: 'rec-1',
    propertyId: 'prop',
    roomId: 'room',
    roomPlantProfileId: 'profile',
    plantCatalogId: 'plant',
    rank: 1,
    score: 75,
    confidence: 0.7,
    status: 'SAVED',
    reasonSummary: 'already saved',
    fitSignals: [],
    warningFlags: [],
    plantCatalog: mkPlant({ id: 'plant', commonName: 'Saved Plant' }),
    room: { id: 'room', name: 'Office' },
  });
  let updateCalled = false;
  prisma.roomPlantRecommendation.update = async () => {
    updateCalled = true;
    throw new Error('should not update');
  };

  const result = await service.saveRecommendation('prop', 'room', 'rec-1');
  assert.equal(updateCalled, false);
  assert.equal(result.recommendation.status, 'SAVED');

  service.assertRoomBelongs = originalAssert;
  service.getScopedRecommendation = originalScoped;
  prisma.roomPlantRecommendation.update = originalUpdate;
});

test('dismissRecommendation is idempotent when already dismissed', async () => {
  const service = new RoomPlantAdvisorService();
  const originalAssert = service.assertRoomBelongs;
  const originalScoped = service.getScopedRecommendation;
  const originalUpdate = prisma.roomPlantRecommendation.update;

  service.assertRoomBelongs = async () => ({ id: 'room', name: 'Room', type: 'OFFICE' });
  service.getScopedRecommendation = async () => ({
    id: 'rec-1',
    propertyId: 'prop',
    roomId: 'room',
    roomPlantProfileId: 'profile',
    plantCatalogId: 'plant',
    rank: 1,
    score: 75,
    confidence: 0.7,
    status: 'DISMISSED',
    reasonSummary: 'already dismissed',
    fitSignals: [],
    warningFlags: [],
    plantCatalog: mkPlant({ id: 'plant', commonName: 'Dismissed Plant' }),
    room: { id: 'room', name: 'Office' },
  });
  let updateCalled = false;
  prisma.roomPlantRecommendation.update = async () => {
    updateCalled = true;
    throw new Error('should not update');
  };

  const result = await service.dismissRecommendation('prop', 'room', 'rec-1');
  assert.equal(updateCalled, false);
  assert.equal(result.recommendation.status, 'DISMISSED');

  service.assertRoomBelongs = originalAssert;
  service.getScopedRecommendation = originalScoped;
  prisma.roomPlantRecommendation.update = originalUpdate;
});

test('add-to-home flow is idempotent when event already exists', async () => {
  const service = new RoomPlantAdvisorService();
  const originalScoped = service.getScopedRecommendation;
  const originalUpdate = prisma.roomPlantRecommendation.update;
  const originalFindFirst = prisma.homeEvent.findFirst;
  const originalCreate = prisma.homeEvent.create;

  service.getScopedRecommendation = async () => ({
    id: 'rec-1',
    propertyId: 'prop',
    roomId: 'room',
    roomPlantProfileId: 'profile',
    plantCatalogId: 'plant',
    rank: 1,
    score: 80,
    confidence: 0.8,
    status: 'RECOMMENDED',
    reasonSummary: 'great fit',
    fitSignals: [],
    warningFlags: [],
    plantCatalog: mkPlant({ id: 'plant', commonName: 'Timeline Plant' }),
    room: { id: 'room', name: 'Living Room' },
  });
  prisma.roomPlantRecommendation.update = async () => ({
    id: 'rec-1',
    propertyId: 'prop',
    roomId: 'room',
    roomPlantProfileId: 'profile',
    plantCatalogId: 'plant',
    rank: 1,
    score: 80,
    confidence: 0.8,
    status: 'SAVED',
    reasonSummary: 'great fit',
    fitSignals: [],
    warningFlags: [],
    plantCatalog: mkPlant({ id: 'plant', commonName: 'Timeline Plant' }),
  });
  prisma.homeEvent.findFirst = async () => ({ id: 'existing-event' });
  let createCalled = false;
  prisma.homeEvent.create = async () => {
    createCalled = true;
    return { id: 'new-event' };
  };

  const result = await service.addRecommendationToHome('prop', 'room', 'rec-1', 'user-1', {});
  assert.equal(createCalled, false);
  assert.equal(result.homeEventId, 'existing-event');
  assert.equal(result.recommendation.status, 'SAVED');

  service.getScopedRecommendation = originalScoped;
  prisma.roomPlantRecommendation.update = originalUpdate;
  prisma.homeEvent.findFirst = originalFindFirst;
  prisma.homeEvent.create = originalCreate;
});
