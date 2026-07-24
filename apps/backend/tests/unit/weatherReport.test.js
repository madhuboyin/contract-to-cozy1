const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  partitionWeatherDays,
  upcomingHourlyWeather,
} = require('../../src/services/environment/weatherReport.service.ts');

test('partitions forecast past-days into recent history without treating them as future threats', () => {
  const result = partitionWeatherDays({
    time: ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'],
    temperature_2m_max: [98, 96, 82, 84],
    temperature_2m_min: [75, 74, 65, 66],
    precipitation_sum: [0, 0.2, 0, 0.1],
    weather_code: [0, 1, 0, 1],
  }, '2026-07-24', [{
    date: '2026-07-22',
    tempMaxF: 90,
    tempMinF: 70,
    precipitationSumIn: 0,
  }]);

  assert.deepEqual(result.tenDayForecast.map(day => day.date), ['2026-07-24', '2026-07-25']);
  assert.deepEqual(result.thirtyDayHistory.map(day => day.date), ['2026-07-22', '2026-07-23']);
  assert.equal(result.thirtyDayHistory[0].tempMaxF, 98);
});

test('excludes prepended past hourly values from the 48-hour forecast', () => {
  const result = upcomingHourlyWeather({
    time: ['2026-07-24T10:00', '2026-07-24T11:00', '2026-07-24T12:00', '2026-07-24T13:00'],
    temperature_2m: [70, 72, 74, 76],
    precipitation_probability: [0, 0, 10, 20],
    weather_code: [0, 0, 1, 2],
  }, '2026-07-24T12:00');

  assert.deepEqual(result.map(point => point.time), ['2026-07-24T12:00', '2026-07-24T13:00']);
});
