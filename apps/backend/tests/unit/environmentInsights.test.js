const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { deriveEnvironmentInsights } = require('../../src/services/environment/environmentInsights.service.ts');

const property = {
  id: 'property-1',
  address: '123 Main St',
  city: 'Princeton',
  state: 'NJ',
  zipCode: '08540',
  hasDrainageIssues: false,
  hasSumpPumpBackup: true,
  coolingType: 'CENTRAL_AIR',
};

function sections(overrides = {}) {
  return {
    weather: {
      status: 'ok',
      fetchedAt: '2026-07-12T12:00:00Z',
      data: {
        current: {
          temperatureF: 80,
          apparentTemperatureF: 82,
          humidityPercent: 60,
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
    airQuality: {
      status: 'ok',
      fetchedAt: '2026-07-12T12:00:00Z',
      data: { current: { aqi: 42, pm2_5: 5, pm10: 9, observedAt: '2026-07-12T12:00:00Z' }, history: [] },
    },
    drought: { status: 'ok', fetchedAt: '2026-07-12T12:00:00Z', data: { current: null, history: [] } },
    floodElevation: {
      status: 'ok',
      fetchedAt: '2026-07-12T12:00:00Z',
      data: { femaFloodZone: 'X', femaZoneSubtype: null, elevationFeet: 100 },
    },
    ...overrides,
  };
}

test('returns no insights when conditions do not cross an action threshold', () => {
  assert.deepEqual(deriveEnvironmentInsights(property, sections()), []);
});

test('turns heavy rain into a property-aware action when flood exposure is present', () => {
  const input = sections();
  input.weather.data.tenDayForecast.push({
    date: '2026-07-14',
    tempMaxF: 78,
    tempMinF: 66,
    precipitationSumIn: 1.4,
    weatherCode: 65,
  });
  input.floodElevation.data.femaFloodZone = 'AE';

  const insights = deriveEnvironmentInsights(property, input);
  assert.equal(insights[0].category, 'rain');
  assert.equal(insights[0].severity, 'action');
  assert.match(insights[0].homeImplication, /FEMA flood zone AE/);
  assert.equal(insights[0].actions[1].label, 'Check weather coverage');
});

test('detects multi-day heat and recommends cooling-system preparation', () => {
  const input = sections();
  input.weather.data.tenDayForecast.push(
    { date: '2026-07-14', tempMaxF: 96, tempMinF: 75, precipitationSumIn: 0, weatherCode: 0 },
    { date: '2026-07-15', tempMaxF: 98, tempMinF: 76, precipitationSumIn: 0, weatherCode: 1 }
  );

  const insights = deriveEnvironmentInsights(property, input);
  assert.equal(insights[0].category, 'heat');
  assert.equal(insights[0].severity, 'action');
  assert.match(insights[0].title, /Multi-day heat/);
  assert.equal(insights[0].actions[1].label, 'Find an HVAC professional');
});

test('prioritizes action insights above watch insights', () => {
  const input = sections();
  input.weather.data.tenDayForecast.push({
    date: '2026-07-14',
    tempMaxF: 70,
    tempMinF: 18,
    precipitationSumIn: 0,
    weatherCode: 0,
  });
  input.airQuality.data.current.aqi = 110;

  const insights = deriveEnvironmentInsights(property, input);
  assert.equal(insights[0].category, 'freeze');
  assert.equal(insights[0].severity, 'action');
  assert.equal(insights[1].category, 'air_quality');
  assert.equal(insights[1].severity, 'watch');
});
