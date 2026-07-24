const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  buildHomeFirstValueInsight,
} = require('../../src/services/environment/environmentHomeOutlook.service.ts');

function report(overrides = {}) {
  return {
    propertyId: 'property-1',
    property: {
      name: 'Rental',
      address: '324 Hemley Trl',
      city: 'Wake Forest',
      state: 'NC',
      zipCode: '27587',
    },
    generatedAt: '2026-07-24T12:00:00.000Z',
    insights: [],
    sections: {
      weather: {
        status: 'ok',
        fetchedAt: '2026-07-24T12:00:00.000Z',
        data: {
          current: {
            temperatureF: 78,
            apparentTemperatureF: 79,
            humidityPercent: 45,
            windSpeedMph: 4,
            precipitationIn: 0,
            weatherCode: 0,
            isDay: true,
            observedAt: '2026-07-24T08:00:00',
          },
          hourly: [],
          tenDayForecast: [{
            date: '2026-07-24',
            tempMaxF: 84,
            tempMinF: 64,
            precipitationSumIn: 0,
            weatherCode: 0,
          }],
          thirtyDayHistory: [],
        },
      },
    },
    ...overrides,
  };
}

test('builds a season- and area-specific verified outlook when no threshold is crossed', () => {
  const insight = buildHomeFirstValueInsight(report());

  assert.equal(insight.kind, 'VERIFIED_OUTLOOK');
  assert.match(insight.title, /quiet summer weather window/i);
  assert.match(insight.summary, /Wake Forest, NC/);
  assert.match(insight.detail, /extreme heat, heavy rain, thunderstorms, and air quality/);
});

test('uses a grounded watch insight before the verified outlook', () => {
  const insight = buildHomeFirstValueInsight(report({
    insights: [{
      severity: 'watch',
      title: 'High heat expected Monday',
      summary: 'One day may reach 95°F.',
      homeImplication: 'Cooling demand may rise.',
      timeframe: 'Monday',
      source: 'Open-Meteo forecast',
    }],
  }));

  assert.equal(insight.kind, 'WATCH');
  assert.equal(insight.title, 'High heat expected Monday');
});

test('does not re-surface action insight as passive first value after lifecycle suppression', () => {
  const insight = buildHomeFirstValueInsight(report({
    insights: [{ severity: 'action' }],
  }));

  assert.equal(insight, null);
});
