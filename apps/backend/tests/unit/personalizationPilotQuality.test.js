const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ recommendationRows = [], feedbackRows = [], answerRows = [], optionalProfilesEnabled = 0 } = {}) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      prisma: {
        household: { count: async () => optionalProfilesEnabled },
        personalizedRecommendation: { groupBy: async () => recommendationRows },
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
  const servicePath = require.resolve('../../src/services/personalizationPilotQuality.service.ts');
  delete require.cache[servicePath];
  return require(servicePath);
}

const counted = (row, count) => ({ ...row, _count: { _all: count } });

test('returns aggregate pilot quality without exposing household or recommendation rows', async () => {
  const { getPersonalizationPilotQuality } = loadService({
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
  const result = await getPersonalizationPilotQuality(30, now);
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
  const { getPersonalizationPilotQuality } = loadService();
  const result = await getPersonalizationPilotQuality(30, new Date('2026-07-13T12:00:00.000Z'));
  assert.equal(result.feedback.acceptanceRate, null);
  assert.equal(result.feedback.negativeRate, null);
  assert.equal(result.optionalProfilesEnabled, 0);
  assert.equal(result.propertiesWithDefaultGuidance, 0);
  assert.equal(result.sample.status, 'NO_DATA');
  assert.equal(result.sample.onlineTuningAllowed, false);
});

test('counts all property-owned recommendations as default-guidance reach', async () => {
  const { getPersonalizationPilotQuality } = loadService({
    recommendationRows: [
      counted({ propertyId: 'property-1', definitionId: 'def-1', status: 'ACTIVE' }, 1),
      counted({ propertyId: 'property-2', definitionId: 'def-2', status: 'ACTIVE' }, 1),
    ],
  });

  const result = await getPersonalizationPilotQuality(30, new Date('2026-07-13T12:00:00.000Z'));
  assert.equal(result.recommendations.total, 2);
  assert.equal(result.propertiesWithDefaultGuidance, 2);
});
