const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  isWarningLevel,
  initialScoreFor,
  isSafetyCritical,
  scoringInputsFor,
  summaryFor,
  HAZARD_INTENT_FAMILY,
  HAZARD_CATEGORY,
} = require('../../src/jobs/severeWeatherAlerts.scoring.ts');

test('isWarningLevel', () => {
  assert.equal(isWarningLevel('Extreme'), true);
  assert.equal(isWarningLevel('Severe'), true);
  assert.equal(isWarningLevel('Moderate'), false);
  assert.equal(isWarningLevel('Minor'), false);
  assert.equal(isWarningLevel('Unknown'), false);
});

test('initialScoreFor maps NWS severity to a rough initial score', () => {
  assert.equal(initialScoreFor('Extreme'), 90);
  assert.equal(initialScoreFor('Severe'), 75);
  assert.equal(initialScoreFor('Moderate'), 55);
  assert.equal(initialScoreFor('Minor'), 35);
  assert.equal(initialScoreFor('Unknown'), 35);
});

test('isSafetyCritical: flood and storm are always safety-critical', () => {
  assert.equal(isSafetyCritical({ hazardFamily: 'FLOOD', severity: 'Minor' }), true);
  assert.equal(isSafetyCritical({ hazardFamily: 'STORM', severity: 'Minor' }), true);
});

test('isSafetyCritical: heatwave only at Extreme severity', () => {
  assert.equal(isSafetyCritical({ hazardFamily: 'HEATWAVE', severity: 'Extreme' }), true);
  assert.equal(isSafetyCritical({ hazardFamily: 'HEATWAVE', severity: 'Severe' }), false);
  assert.equal(isSafetyCritical({ hazardFamily: 'HEATWAVE', severity: 'Moderate' }), false);
});

test('isSafetyCritical: snow is never safety-critical', () => {
  assert.equal(isSafetyCritical({ hazardFamily: 'SNOW', severity: 'Extreme' }), false);
});

test('scoringInputsFor: Warning-level severity uses full exposure and higher probability', () => {
  const inputs = scoringInputsFor({
    hazardFamily: 'FLOOD',
    severity: 'Severe',
    expires: new Date(Date.now() + 3 * 3_600_000).toISOString(),
  });
  assert.equal(inputs.safetyCritical, true);
  assert.equal(inputs.exposureUsd, 8000);
  assert.equal(inputs.probabilityPct, 90);
  assert.equal(inputs.timeWindowHours, 3);
});

test('scoringInputsFor: Advisory/Watch-level severity halves exposure and lowers probability', () => {
  const inputs = scoringInputsFor({
    hazardFamily: 'HEATWAVE',
    severity: 'Moderate',
    expires: null,
  });
  assert.equal(inputs.safetyCritical, false);
  assert.equal(inputs.exposureUsd, 500); // 1000 / 2
  assert.equal(inputs.probabilityPct, 50);
});

test('scoringInputsFor: falls back to a 6-hour window when expires is missing or invalid', () => {
  assert.equal(scoringInputsFor({ hazardFamily: 'SNOW', severity: 'Severe', expires: null }).timeWindowHours, 6);
  assert.equal(
    scoringInputsFor({ hazardFamily: 'SNOW', severity: 'Severe', expires: 'not-a-date' }).timeWindowHours,
    6
  );
});

test('scoringInputsFor: clamps timeWindowHours to at least 1 for an already-past expiry', () => {
  const inputs = scoringInputsFor({
    hazardFamily: 'STORM',
    severity: 'Severe',
    expires: new Date(Date.now() - 3_600_000).toISOString(),
  });
  assert.equal(inputs.timeWindowHours, 1);
});

test('summaryFor: prefers the first sentence of the headline', () => {
  const summary = summaryFor({
    headline: 'Flash Flood Warning issued. Seek higher ground immediately.',
    description: 'Should not be used.',
    senderName: 'NWS Mount Holly',
    event: 'Flash Flood Warning',
  });
  assert.equal(summary, 'Flash Flood Warning issued. — NWS Mount Holly');
});

test('summaryFor: falls back to description when headline is missing', () => {
  const summary = summaryFor({
    headline: null,
    description: 'Heavy rain expected across the area.',
    senderName: null,
    event: 'Flood Warning',
  });
  assert.equal(summary, 'Heavy rain expected across the area.');
});

test('summaryFor: falls back to a generic "in effect" message when both are missing', () => {
  const summary = summaryFor({
    headline: null,
    description: null,
    senderName: 'NWS Baltimore',
    event: 'Heat Advisory',
  });
  assert.equal(summary, 'Heat Advisory in effect — NWS Baltimore');
});

test('HAZARD_INTENT_FAMILY and HAZARD_CATEGORY cover every hazard family', () => {
  for (const family of ['FLOOD', 'STORM', 'HEATWAVE', 'SNOW']) {
    assert.ok(HAZARD_INTENT_FAMILY[family], `missing intent family for ${family}`);
    assert.ok(HAZARD_CATEGORY[family], `missing category for ${family}`);
  }
  assert.equal(HAZARD_INTENT_FAMILY.SNOW, 'freeze_risk');
  assert.equal(HAZARD_CATEGORY.HEATWAVE, 'HVAC');
});
