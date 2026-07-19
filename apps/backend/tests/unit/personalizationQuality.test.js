const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({
  recommendationRows = [],
  feedbackRows = [],
  answerRows = [],
  optionalProfilesEnabled = 0,
  calibrationRows = [],
  incidentRows = [],
  onRecommendationQuery,
} = {}) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      prisma: {
        household: { count: async () => optionalProfilesEnabled },
        personalizedRecommendation: {
          groupBy: async (query) => {
            onRecommendationQuery?.(query);
            return recommendationRows;
          },
          findMany: async () => calibrationRows,
        },
        recommendationIncident: { findMany: async () => incidentRows },
        recommendationFeedback: { groupBy: async () => feedbackRows },
        profileAnswer: { groupBy: async () => answerRows },
        recommendationDefinition: {
          findMany: async () => [
            { id: 'def-1', code: 'hvac_filter_replacement_check_proof' },
            { id: 'def-2', code: 'dryer_vent_cleaning_reminder' },
          ],
        },
      },
    },
  };
  const servicePath = require.resolve('../../src/services/personalizationQuality.service.ts');
  delete require.cache[servicePath];
  return require(servicePath);
}

const counted = (row, count) => ({ ...row, _count: { _all: count } });

test('returns aggregate personalization quality without exposing household or recommendation rows', async () => {
  const { getPersonalizationQuality } = loadService({
    optionalProfilesEnabled: 3,
    recommendationRows: [
      counted({ propertyId: 'property-1', definitionId: 'def-1', status: 'ACTIVE' }, 4),
      counted({ propertyId: 'property-1', definitionId: 'def-1', status: 'DISMISSED' }, 1),
      counted({ propertyId: 'property-2', definitionId: 'def-2', status: 'ACTIVE' }, 2),
    ],
    feedbackRows: [
      counted({ type: 'ACCEPTED', explicit: true, reasonCode: null }, 3),
      counted({ type: 'NOT_RELEVANT', explicit: true, reasonCode: 'WRONG_PROFILE' }, 2),
      counted({ type: 'DISMISSED', explicit: true, reasonCode: 'BAD_TIMING' }, 1),
      counted({ type: 'VIEWED', explicit: false, reasonCode: null }, 5),
    ],
    answerRows: [counted({ action: 'ANSWERED' }, 4), counted({ action: 'SNOOZED' }, 1)],
  });

  const now = new Date('2026-07-13T12:00:00.000Z');
  const result = await getPersonalizationQuality(30, now);
  assert.equal(result.optionalProfilesEnabled, 3);
  assert.equal(result.propertiesWithDefaultGuidance, 2);
  assert.equal(result.recommendations.total, 7);
  assert.deepEqual(result.recommendations.byStatus, [
    { status: 'ACTIVE', count: 6 },
    { status: 'DISMISSED', count: 1 },
  ]);
  assert.equal(result.feedback.total, 11);
  assert.equal(result.feedback.explicit, 6);
  assert.equal(result.feedback.accepted, 3);
  assert.equal(result.feedback.negative, 3);
  assert.equal(result.feedback.acceptanceRate, 0.5);
  assert.deepEqual(result.feedback.reasons, [
    { reasonCode: 'WRONG_PROFILE', count: 2 },
    { reasonCode: 'BAD_TIMING', count: 1 },
  ]);
  assert.deepEqual(result.sample, {
    decisionEvents: 6,
    minimumRequired: 20,
    status: 'INSUFFICIENT_SAMPLE',
    onlineTuningAllowed: false,
  });
  assert.equal(result.generatedAt, now.toISOString());
});

test('reports no data without dividing by zero or enabling tuning', async () => {
  const { getPersonalizationQuality } = loadService();
  const result = await getPersonalizationQuality(30, new Date('2026-07-13T12:00:00.000Z'));
  assert.equal(result.feedback.acceptanceRate, null);
  assert.equal(result.feedback.negativeRate, null);
  assert.equal(result.optionalProfilesEnabled, 0);
  assert.equal(result.propertiesWithDefaultGuidance, 0);
  assert.equal(result.sample.status, 'NO_DATA');
  assert.equal(result.sample.onlineTuningAllowed, false);
});

test('counts all property-owned recommendations as default-guidance reach', async () => {
  let recommendationQuery;
  const { getPersonalizationQuality } = loadService({
    recommendationRows: [
      counted({ propertyId: 'property-1', definitionId: 'def-1', status: 'ACTIVE' }, 1),
      counted({ propertyId: 'property-2', definitionId: 'def-2', status: 'ACTIVE' }, 1),
    ],
    onRecommendationQuery: (query) => { recommendationQuery = query; },
  });

  const now = new Date('2026-07-13T12:00:00.000Z');
  const result = await getPersonalizationQuality(30, now);
  assert.equal(result.recommendations.total, 2);
  assert.equal(result.propertiesWithDefaultGuidance, 2);
  assert.deepEqual(recommendationQuery.where, {
    lastEvaluatedAt: { gte: new Date('2026-06-13T12:00:00.000Z') },
  });
});

test('reports complaints, reversals, overrides, calibration, and incident resolution outcomes', async () => {
  const createdAt = new Date('2026-07-10T00:00:00.000Z');
  const { getPersonalizationQuality } = loadService({
    feedbackRows: [
      counted({ type: 'COMPLAINT', explicit: true, reasonCode: 'OTHER' }, 2),
      counted({ type: 'RECOMMENDATION_OVERRIDDEN', explicit: true, reasonCode: null }, 1),
      counted({ type: 'RECOMMENDATION_REVERSED', explicit: true, reasonCode: null }, 1),
      counted({ type: 'PROFILE_CORRECTED', explicit: true, reasonCode: 'WRONG_PROFILE' }, 3),
    ],
    calibrationRows: [
      { confidence: 0.9, feedbackEvents: [{ type: 'ACCEPTED' }] },
      { confidence: 0.8, feedbackEvents: [{ type: 'COMPLAINT' }] },
      { confidence: 0.4, feedbackEvents: [{ type: 'COMPLETED' }] },
    ],
    incidentRows: [
      { status: 'OPEN', type: 'COMPLAINT', severity: 'HIGH', createdAt, resolvedAt: null },
      { status: 'RESOLVED', type: 'REVERSAL', severity: 'CRITICAL', createdAt, resolvedAt: new Date('2026-07-10T12:00:00.000Z') },
    ],
  });
  const result = await getPersonalizationQuality(30, new Date('2026-07-13T12:00:00.000Z'));
  assert.equal(result.feedback.complaints, 2);
  assert.equal(result.feedback.overrides, 1);
  assert.equal(result.feedback.reversals, 1);
  assert.equal(result.feedback.corrections, 3);
  assert.equal(result.incidents.total, 2);
  assert.equal(result.incidents.open, 1);
  assert.equal(result.incidents.resolutionRate, 0.5);
  assert.equal(result.incidents.medianResolutionHours, 12);
  assert.deepEqual(result.calibration.find((band) => band.band === 'HIGH'), {
    band: 'HIGH',
    samples: 2,
    positiveOutcomes: 1,
    observedPositiveRate: 0.5,
    averageConfidence: 0.85,
    calibrationGap: 0.35,
  });
});
