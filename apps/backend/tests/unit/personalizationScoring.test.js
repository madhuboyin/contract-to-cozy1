const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  DEFAULT_HVAC_FILTER_SCORE_CONFIG,
  parseHvacFilterScoreConfig,
  priorityBandFromScore,
  computeHvacFilterProofScore,
} = require('../../src/modules/personalization/domain/scoring.ts');

const THRESHOLD_DAYS = 90;

test('parseHvacFilterScoreConfig: falls back to default when raw is missing/malformed', () => {
  assert.deepEqual(parseHvacFilterScoreConfig(undefined), DEFAULT_HVAC_FILTER_SCORE_CONFIG);
  assert.deepEqual(parseHvacFilterScoreConfig(null), DEFAULT_HVAC_FILTER_SCORE_CONFIG);
  assert.deepEqual(parseHvacFilterScoreConfig('not an object'), DEFAULT_HVAC_FILTER_SCORE_CONFIG);
  assert.deepEqual(parseHvacFilterScoreConfig([1, 2, 3]), DEFAULT_HVAC_FILTER_SCORE_CONFIG);
  assert.deepEqual(parseHvacFilterScoreConfig({ modelVersion: 'v2' }), DEFAULT_HVAC_FILTER_SCORE_CONFIG);
  assert.deepEqual(
    parseHvacFilterScoreConfig({ modelVersion: 'v2', baseRelevance: 50, weights: { baseRelevance: 0.5 } }),
    DEFAULT_HVAC_FILTER_SCORE_CONFIG,
  );
});

test('parseHvacFilterScoreConfig: accepts a fully-shaped custom config', () => {
  const custom = {
    modelVersion: 'custom-v2',
    baseRelevance: 80,
    weights: { baseRelevance: 0.5, urgency: 0.3, confidence: 0.2 },
  };
  assert.deepEqual(parseHvacFilterScoreConfig(custom), custom);
});

test('priorityBandFromScore: HIGH/MEDIUM/LOW boundaries', () => {
  assert.equal(priorityBandFromScore(70), 'HIGH');
  assert.equal(priorityBandFromScore(69.999), 'MEDIUM');
  assert.equal(priorityBandFromScore(45), 'MEDIUM');
  assert.equal(priorityBandFromScore(44.999), 'LOW');
  assert.equal(priorityBandFromScore(0), 'LOW');
});

test('computeHvacFilterProofScore: at threshold, urgency component is 0', () => {
  const result = computeHvacFilterProofScore({
    daysSinceServiced: THRESHOLD_DAYS,
    thresholdDays: THRESHOLD_DAYS,
    confidence: 1,
    scoreConfigRaw: undefined,
  });
  assert.equal(result.scoreBreakdown.components.urgency.raw, 0);
});

test('computeHvacFilterProofScore: urgency clamps at 100 for 2x threshold or beyond', () => {
  const atDouble = computeHvacFilterProofScore({
    daysSinceServiced: THRESHOLD_DAYS * 2,
    thresholdDays: THRESHOLD_DAYS,
    confidence: 1,
    scoreConfigRaw: undefined,
  });
  const wayBeyond = computeHvacFilterProofScore({
    daysSinceServiced: THRESHOLD_DAYS * 10,
    thresholdDays: THRESHOLD_DAYS,
    confidence: 1,
    scoreConfigRaw: undefined,
  });
  assert.equal(atDouble.scoreBreakdown.components.urgency.raw, 100);
  assert.equal(wayBeyond.scoreBreakdown.components.urgency.raw, 100);
  assert.equal(atDouble.score, wayBeyond.score);
});

test('computeHvacFilterProofScore: score/priorityBand/confidence are reproducible for the same inputs', () => {
  const input = {
    daysSinceServiced: 150,
    thresholdDays: THRESHOLD_DAYS,
    confidence: 1,
    scoreConfigRaw: undefined,
  };
  const first = computeHvacFilterProofScore(input);
  const second = computeHvacFilterProofScore(input);
  assert.deepEqual(first, second);
  assert.equal(first.scoreBreakdown.modelVersion, DEFAULT_HVAC_FILTER_SCORE_CONFIG.modelVersion);
});

test('computeHvacFilterProofScore: a different scoreConfig produces a different, deterministic score', () => {
  const baseline = computeHvacFilterProofScore({
    daysSinceServiced: 150,
    thresholdDays: THRESHOLD_DAYS,
    confidence: 1,
    scoreConfigRaw: undefined,
  });
  const custom = computeHvacFilterProofScore({
    daysSinceServiced: 150,
    thresholdDays: THRESHOLD_DAYS,
    confidence: 1,
    scoreConfigRaw: {
      modelVersion: 'custom-v2',
      baseRelevance: 100,
      weights: { baseRelevance: 0.8, urgency: 0.1, confidence: 0.1 },
    },
  });
  assert.notEqual(baseline.score, custom.score);
  assert.equal(custom.scoreBreakdown.modelVersion, 'custom-v2');
});

test('computeHvacFilterProofScore: score and priorityBand stay within bounds', () => {
  const result = computeHvacFilterProofScore({
    daysSinceServiced: 10000,
    thresholdDays: THRESHOLD_DAYS,
    confidence: 1,
    scoreConfigRaw: undefined,
  });
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(result.priorityBand));
});
