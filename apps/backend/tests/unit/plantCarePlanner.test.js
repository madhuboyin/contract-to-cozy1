const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: {} } };

const { derivePlantCareRecommendations, deriveGardenZoneRecommendations } = require('../../src/services/plantCarePlanner.service.ts');

const baseSignals = {
  heat: false,
  freeze: false,
  storm: false,
  lowHumidity: false,
  poorAirQuality: false,
  heavyRain: false,
  droughtCategory: null,
};

test('adjusts only the soil-check cadence during heat and does not prescribe automatic watering', () => {
  const result = derivePlantCareRecommendations([{
    id: 'plant-1', name: 'Boston Fern', locationType: 'INDOOR', roomName: 'Living Room', zoneName: null,
    humidityPreference: 'HIGH', lightLevel: 'BRIGHT_INDIRECT', wateringCadenceDays: 8,
  }], { ...baseSignals, heat: true, lowHumidity: true });

  assert.equal(result[0].adjustedCheckCadenceDays, 6);
  assert.equal(result[0].wateringCadenceDays, 8);
  assert.match(result[0].guidance, /water only when/i);
  assert.match(result[0].guidance, /higher humidity/i);
});

test('gives indoor and outdoor plants different freeze placement guidance', () => {
  const plants = [
    { id: 'in', name: 'Fern', locationType: 'INDOOR', roomName: 'Office', zoneName: null, humidityPreference: 'HIGH', lightLevel: 'MEDIUM', wateringCadenceDays: 7 },
    { id: 'out', name: 'Rosemary', locationType: 'OUTDOOR', roomName: null, zoneName: 'Patio', humidityPreference: null, lightLevel: null, wateringCadenceDays: null },
  ];
  const result = derivePlantCareRecommendations(plants, { ...baseSignals, freeze: true });

  assert.match(result[0].placementWarning, /cold glass/i);
  assert.match(result[1].placementWarning, /frost protection/i);
  assert.ok(result.every(item => item.priority === 'NOW'));
});

test('uses recorded watering history to elevate an overdue heat soil-check', () => {
  const result = derivePlantCareRecommendations([{
    id: 'plant-1', name: 'Pothos', locationType: 'INDOOR', roomName: 'Kitchen', zoneName: null,
    humidityPreference: 'MODERATE', lightLevel: 'MEDIUM', wateringCadenceDays: 8,
    lastWateredAt: new Date('2026-07-01T12:00:00Z'),
  }], { ...baseSignals, heat: true }, new Date('2026-07-12T12:00:00Z'));

  assert.equal(result[0].priority, 'NOW');
  assert.match(result[0].guidance, /11 days ago/);
});

test('combines drought, irrigation, drainage, frost-pocket, and hardiness context for a garden zone', () => {
  const result = deriveGardenZoneRecommendations([{
    id: 'zone-1', name: 'Front bed', sunExposure: 'FULL_SUN', soilDrainage: 'SLOW', irrigationType: 'NONE', frostPocket: true,
  }], { ...baseSignals, droughtCategory: 'D3', heavyRain: true }, '7a', new Date('2026-07-12T12:00:00Z'));

  assert.equal(result[0].season, 'SUMMER');
  assert.equal(result[0].priority, 'SOON');
  assert.match(result[0].guidance, /hardiness zone 7a/i);
  assert.ok(result[0].actions.some(action => /drought/i.test(action)));
  assert.ok(result[0].actions.some(action => /Slow drainage/i.test(action)));
  assert.ok(result[0].actions.some(action => /frost pocket/i.test(action)));
});

test('provides seasonal planting planning when no severe condition is active', () => {
  const result = deriveGardenZoneRecommendations([{
    id: 'zone-1', name: 'Back border', sunExposure: 'PART_SUN', soilDrainage: 'MODERATE', irrigationType: 'DRIP', frostPocket: false,
  }], baseSignals, '6b', new Date('2026-04-15T12:00:00Z'));

  assert.equal(result[0].season, 'SPRING');
  assert.equal(result[0].priority, 'SEASONAL');
  assert.ok(result[0].actions.some(action => /last-frost/i.test(action)));
});
