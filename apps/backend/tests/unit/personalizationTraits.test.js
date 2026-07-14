const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  deriveHvacFilterReplacementOverdue,
  deriveHvacFilterDaysSinceServiced,
  HVAC_FILTER_OVERDUE_THRESHOLD_DAYS,
  deriveSmokeDetectorMissing,
  deriveSmokeDetectorBatteryOverdue,
  SMOKE_DETECTOR_BATTERY_CHECK_THRESHOLD_DAYS,
  deriveDryerVentCleaningOverdue,
  DRYER_VENT_CLEANING_THRESHOLD_DAYS,
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

test('deriveHvacFilterDaysSinceServiced: UNKNOWN when no HVAC asset at all or never serviced', () => {
  assert.deepEqual(
    deriveHvacFilterDaysSinceServiced([{ assetType: 'WATER_HEATER', lastServiced: daysAgo(10) }], NOW),
    { known: false },
  );
  assert.deepEqual(
    deriveHvacFilterDaysSinceServiced([{ assetType: 'HVAC_FURNACE', lastServiced: null }], NOW),
    { known: false },
  );
});

test('deriveHvacFilterDaysSinceServiced: known, raw day count from the most recently serviced HVAC asset', () => {
  const reading = deriveHvacFilterDaysSinceServiced(
    [
      { assetType: 'HVAC_FURNACE', lastServiced: daysAgo(200) },
      { assetType: 'HVAC_HEAT_PUMP', lastServiced: daysAgo(5) },
    ],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: 5 });
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

// Mirrors the Phase 0 golden fixtures at
// catalog/fixtures/smoke_co_detector_battery_check/{positive,negative,unknown}.json
test('deriveSmokeDetectorBatteryOverdue: UNKNOWN when detector presence is not confirmed true', () => {
  assert.deepEqual(
    deriveSmokeDetectorBatteryOverdue({ hasSmokeDetectors: null }, [], NOW),
    { known: false },
  );
  assert.deepEqual(
    deriveSmokeDetectorBatteryOverdue({ hasSmokeDetectors: false }, [], NOW),
    { known: false },
  );
});

test('deriveSmokeDetectorBatteryOverdue: UNKNOWN when detectors are present but no check history exists', () => {
  const reading = deriveSmokeDetectorBatteryOverdue({ hasSmokeDetectors: true }, [], NOW);
  assert.deepEqual(reading, { known: false });
});

test('deriveSmokeDetectorBatteryOverdue: known TRUE when last checked 400 days ago (fixture: positive)', () => {
  const reading = deriveSmokeDetectorBatteryOverdue(
    { hasSmokeDetectors: true },
    [{ assetType: 'SMOKE_DETECTOR', lastServiced: daysAgo(400) }],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: true });
});

test('deriveSmokeDetectorBatteryOverdue: known FALSE when last checked 30 days ago (fixture: negative)', () => {
  const reading = deriveSmokeDetectorBatteryOverdue(
    { hasSmokeDetectors: true },
    [{ assetType: 'SMOKE_DETECTOR', lastServiced: daysAgo(30) }],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: false });
});

test('deriveSmokeDetectorBatteryOverdue: threshold boundary at 365 days', () => {
  assert.equal(
    deriveSmokeDetectorBatteryOverdue(
      { hasSmokeDetectors: true },
      [{ assetType: 'SMOKE_DETECTOR', lastServiced: daysAgo(SMOKE_DETECTOR_BATTERY_CHECK_THRESHOLD_DAYS - 1) }],
      NOW,
    ).value,
    false,
  );
  assert.equal(
    deriveSmokeDetectorBatteryOverdue(
      { hasSmokeDetectors: true },
      [{ assetType: 'SMOKE_DETECTOR', lastServiced: daysAgo(SMOKE_DETECTOR_BATTERY_CHECK_THRESHOLD_DAYS) }],
      NOW,
    ).value,
    true,
  );
});

test('deriveDryerVentCleaningOverdue: UNKNOWN when no DRYER-type asset at all', () => {
  const reading = deriveDryerVentCleaningOverdue(
    [{ assetType: 'WATER_HEATER', lastServiced: daysAgo(10) }],
    NOW,
  );
  assert.deepEqual(reading, { known: false });
});

test('deriveDryerVentCleaningOverdue: UNKNOWN when a DRYER asset exists but was never serviced', () => {
  const reading = deriveDryerVentCleaningOverdue([{ assetType: 'DRYER', lastServiced: null }], NOW);
  assert.deepEqual(reading, { known: false });
});

test('deriveDryerVentCleaningOverdue: known FALSE when cleaned within the threshold', () => {
  const reading = deriveDryerVentCleaningOverdue(
    [{ assetType: 'DRYER', lastServiced: daysAgo(DRYER_VENT_CLEANING_THRESHOLD_DAYS - 1) }],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: false });
});

test('deriveDryerVentCleaningOverdue: known TRUE when cleaned at or beyond the threshold', () => {
  const reading = deriveDryerVentCleaningOverdue(
    [{ assetType: 'DRYER', lastServiced: daysAgo(DRYER_VENT_CLEANING_THRESHOLD_DAYS) }],
    NOW,
  );
  assert.deepEqual(reading, { known: true, value: true });
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
