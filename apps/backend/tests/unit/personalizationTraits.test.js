const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  deriveHvacFilterReplacementOverdue,
  HVAC_FILTER_OVERDUE_THRESHOLD_DAYS,
  deriveSmokeDetectorMissing,
  deriveRoofReplacementOverdue,
  ROOF_REPLACEMENT_OVERDUE_THRESHOLD_YEARS,
} = require('../../src/modules/personalization/domain/traits.ts');

const NOW = new Date('2026-07-13T00:00:00.000Z');

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

test('UNKNOWN when the property has no HVAC-type asset at all', () => {
  const reading = deriveHvacFilterReplacementOverdue(
    [{ assetType: 'WATER_HEATER', lastServiced: daysAgo(10) }],
    NOW,
  );
  assert.deepEqual(reading, { known: false });
});

test('UNKNOWN when an HVAC asset exists but was never serviced', () => {
  const reading = deriveHvacFilterReplacementOverdue(
    [{ assetType: 'HVAC_FURNACE', lastServiced: null }],
    NOW,
  );
  assert.deepEqual(reading, { known: false });
});

test('known FALSE when serviced within the threshold', () => {
  const reading = deriveHvacFilterReplacementOverdue(
    [{ assetType: 'HVAC_FURNACE', lastServiced: daysAgo(HVAC_FILTER_OVERDUE_THRESHOLD_DAYS - 1) }],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: false });
});

test('known TRUE when serviced at or beyond the threshold', () => {
  const reading = deriveHvacFilterReplacementOverdue(
    [{ assetType: 'HVAC_FURNACE', lastServiced: daysAgo(HVAC_FILTER_OVERDUE_THRESHOLD_DAYS) }],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: true });
});

test('matches HVAC asset types case-insensitively by prefix (e.g. HVAC_HEAT_PUMP)', () => {
  const reading = deriveHvacFilterReplacementOverdue(
    [{ assetType: 'hvac_heat_pump', lastServiced: daysAgo(200) }],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: true });
});

test('uses the most recently serviced HVAC asset when multiple exist', () => {
  const reading = deriveHvacFilterReplacementOverdue(
    [
      { assetType: 'HVAC_FURNACE', lastServiced: daysAgo(200) },
      { assetType: 'HVAC_HEAT_PUMP', lastServiced: daysAgo(5) },
    ],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: false });
});

test('deriveSmokeDetectorMissing: UNKNOWN when never confirmed either way', () => {
  assert.deepEqual(deriveSmokeDetectorMissing({ hasSmokeDetectors: null }), { known: false });
});

test('deriveSmokeDetectorMissing: known TRUE (missing) when confirmed absent', () => {
  assert.deepEqual(deriveSmokeDetectorMissing({ hasSmokeDetectors: false }), { known: true, value: true });
});

test('deriveSmokeDetectorMissing: known FALSE (not missing) when confirmed present', () => {
  assert.deepEqual(deriveSmokeDetectorMissing({ hasSmokeDetectors: true }), { known: true, value: false });
});

test('deriveRoofReplacementOverdue: UNKNOWN when roofReplacementYear is unset', () => {
  const reading = deriveRoofReplacementOverdue({ roofReplacementYear: null }, NOW);
  assert.deepEqual(reading, { known: false });
});

test('deriveRoofReplacementOverdue: known FALSE when younger than the threshold', () => {
  const roofReplacementYear = NOW.getUTCFullYear() - (ROOF_REPLACEMENT_OVERDUE_THRESHOLD_YEARS - 1);
  const reading = deriveRoofReplacementOverdue({ roofReplacementYear }, NOW);
  assert.deepEqual(reading, { known: true, value: false });
});

test('deriveRoofReplacementOverdue: known TRUE when at or beyond the threshold', () => {
  const roofReplacementYear = NOW.getUTCFullYear() - ROOF_REPLACEMENT_OVERDUE_THRESHOLD_YEARS;
  const reading = deriveRoofReplacementOverdue({ roofReplacementYear }, NOW);
  assert.deepEqual(reading, { known: true, value: true });
});
