const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: {} },
};

const {
  derivePlantAdvisorWeatherModules,
} = require('../../src/services/environment/plantAdvisorWeather.service.ts');

function sections(humidityPercent = 55) {
  return {
    weather: {
      status: 'ok',
      fetchedAt: '2026-07-12T12:00:00Z',
      data: {
        current: {
          temperatureF: 90,
          apparentTemperatureF: 94,
          humidityPercent,
          windSpeedMph: 5,
          precipitationIn: 0,
          weatherCode: 0,
          isDay: true,
          observedAt: '2026-07-12T12:00:00Z',
        },
        hourly: [],
        tenDayForecast: [],
        thirtyDayHistory: [],
      },
    },
    airQuality: { status: 'unavailable', reason: 'test' },
    drought: { status: 'unavailable', reason: 'test' },
    floodElevation: { status: 'unavailable', reason: 'test' },
  };
}

const heatInsight = {
  id: 'heat-2026-07-14',
  category: 'heat',
  severity: 'watch',
  title: 'High heat expected',
  summary: 'One hot day.',
  homeImplication: 'Cooling demand may rise.',
  timeframe: 'Tuesday',
  effectiveFrom: '2026-07-14',
  effectiveTo: '2026-07-14',
  affectedSystems: [],
  recommendedActions: [],
  actions: [],
  source: 'test',
};

test('offers contextual Plant Advisor setup when heat is relevant and no plant data exists', () => {
  const modules = derivePlantAdvisorWeatherModules('property-1', sections(), [heatInsight], {
    profiles: [],
    plants: [],
  });

  assert.equal(modules.length, 1);
  assert.equal(modules[0].trigger, 'heat');
  assert.equal(modules[0].relatedInsightId, heatInsight.id);
  assert.equal(modules[0].contextLevel, 'setup');
  assert.equal(modules[0].action.label, 'Set up Plant Advisor');
  assert.match(modules[0].action.href, /launchSurface=environment-report/);
  assert.match(modules[0].action.href, /weatherContext=heat/);
  assert.match(modules[0].action.href, /insightId=heat-2026-07-14/);
  assert.match(modules[0].action.href, /returnTo=%2Fdashboard%2Fproperties%2Fproperty-1%2Fenvironment-report/);
  assert.match(modules[0].action.href, /#environment-weather-guidance$/);
});

test('personalizes heat guidance with plants added to the home and their room', () => {
  const modules = derivePlantAdvisorWeatherModules('property-1', sections(), [heatInsight], {
    profiles: [{ roomId: 'room-1', roomName: 'Living Room', roomType: 'LIVING_ROOM' }],
    plants: [{
      recommendationId: 'recommendation-1',
      name: 'Boston Fern',
      roomId: 'room-1',
      roomName: 'Living Room',
      status: 'SAVED',
      isAddedToHome: true,
      humidityPreference: 'HIGH',
      lightLevel: 'BRIGHT_INDIRECT',
      maintenanceLevel: 'MEDIUM',
      wateringCadenceDays: 7,
    }],
  }, { coolingType: 'CENTRAL_AIR' });

  assert.equal(modules[0].contextLevel, 'added_plants');
  assert.deepEqual(modules[0].plantNames, ['Boston Fern']);
  assert.deepEqual(modules[0].roomNames, ['Living Room']);
  assert.match(modules[0].summary, /Boston Fern/);
  assert.match(modules[0].summary, /Living Room/);
  assert.match(modules[0].summary, /central air cooling/);
  assert.equal(modules[0].action.label, 'Review my plants');
  assert.match(modules[0].action.href, /roomId=room-1/);
});

test('adds low-humidity guidance without requiring a home-risk insight', () => {
  const modules = derivePlantAdvisorWeatherModules('property-1', sections(25), [], {
    profiles: [],
    plants: [],
  });

  assert.equal(modules.length, 1);
  assert.equal(modules[0].trigger, 'low_humidity');
  assert.equal(modules[0].relatedInsightId, null);
});

test('poor-air guidance explicitly avoids presenting plants as filtration', () => {
  const airQualityInsight = { ...heatInsight, id: 'aq-1', category: 'air_quality' };
  const modules = derivePlantAdvisorWeatherModules('property-1', sections(), [airQualityInsight], {
    profiles: [{ roomId: 'room-1', roomName: 'Bedroom', roomType: 'BEDROOM' }],
    plants: [],
  });

  assert.equal(modules[0].contextLevel, 'room_profiles');
  assert.match(modules[0].summary, /not a substitute for indoor-air filtration/i);
});

test('maps freeze and storm insights to contextual plant modules', () => {
  const insights = [
    { ...heatInsight, id: 'freeze-1', category: 'freeze' },
    { ...heatInsight, id: 'storm-1', category: 'storm' },
  ];
  const modules = derivePlantAdvisorWeatherModules('property-1', sections(), insights, {
    profiles: [{ roomId: 'room-1', roomName: 'Sunroom', roomType: 'SUNROOM' }],
    plants: [],
  }, { heatingType: 'HEAT_PUMP', hasSecondaryHeat: false });

  assert.deepEqual(modules.map(module => module.trigger), ['freeze', 'storm']);
  assert.match(modules[0].summary, /heat pump heat/);
  assert.match(modules[1].summary, /No backup heat source is recorded/);
});
