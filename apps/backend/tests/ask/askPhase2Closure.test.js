require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const test = require('node:test');
const { HomeEventDatePrecision } = require('@prisma/client');
const { parseApproximateDate } = require('../../src/modules/propertyContext/application/relationalCaptureAdapters.ts');

test('approximate inventory dates preserve year, month, range, and unknown precision', () => {
  const year = parseApproximateDate({ installedOn: { precision: 'YEAR', value: '2018' } }, 'installedOn', true);
  assert.equal(year.date.toISOString(), '2018-01-01T00:00:00.000Z');
  assert.equal(year.precision, HomeEventDatePrecision.YEAR);

  const month = parseApproximateDate({ installedOn: { precision: 'MONTH', value: '2020-06' } }, 'installedOn', true);
  assert.equal(month.date.toISOString(), '2020-06-01T00:00:00.000Z');
  assert.equal(month.precision, HomeEventDatePrecision.MONTH);

  const range = parseApproximateDate({ installedOn: { precision: 'RANGE', value: '2019-01-01', rangeEnd: '2019-03-31' } }, 'installedOn', true);
  assert.equal(range.rangeEnd.toISOString(), '2019-03-31T00:00:00.000Z');
  assert.equal(range.precision, HomeEventDatePrecision.RANGE);

  const unknown = parseApproximateDate({ installedOn: { precision: 'UNKNOWN' } }, 'installedOn', true);
  assert.equal(unknown.date, null);
  assert.equal(unknown.precision, HomeEventDatePrecision.UNKNOWN);
});

test('approximate inventory dates reject invalid ranges and future values', () => {
  assert.throws(() => parseApproximateDate({ installedOn: { precision: 'RANGE', value: '2020-05-02', rangeEnd: '2020-05-01' } }, 'installedOn', true), /cannot be before/);
  assert.throws(() => parseApproximateDate({ installedOn: { precision: 'YEAR', value: '2999' } }, 'installedOn', true), /future/);
});
