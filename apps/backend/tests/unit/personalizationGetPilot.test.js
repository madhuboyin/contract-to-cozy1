const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function installModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function loadUseCase({
  household = { id: 'hh-1', consentVersion: 'v1', consentedAt: new Date('2026-01-01') },
  paused = false,
} = {}) {
  let questionLoads = 0;
  let recommendationLoads = 0;
  installModule('../../src/modules/personalization/infrastructure/pilotRepository.ts', {
    findPilotHouseholdForProperty: async () => household,
    findPilotHousehold: async () => null,
    listActivePilotRecommendations: async () => {
      recommendationLoads += 1;
      return [{
        id: 'rec-1',
        definition: { code: 'pilot', category: 'maintenance' },
        explanations: [{ headline: 'Reviewed', reasonCodes: [], evidenceJson: { sensitive: true } }],
      }];
    },
    optInPilotHousehold: async () => ({}),
    resetPilotHousehold: async () => true,
  });
  installModule('../../src/modules/personalization/application/materializePilotRecommendations.usecase.ts', {
    materializePilotRecommendationsForProperty: async () => paused
      ? ({ evaluated: 0, active: 0, paused: true })
      : ({ evaluated: 3, active: 1 }),
  });
  installModule('../../src/modules/personalization/application/getNextEligibleQuestionForHousehold.usecase.ts', {
    getNextEligibleQuestionForHousehold: async () => {
      questionLoads += 1;
      return { question: { id: 'question-1' } };
    },
  });
  const path = require.resolve('../../src/modules/personalization/application/getPilotPersonalization.usecase.ts');
  delete require.cache[path];
  return {
    ...require('../../src/modules/personalization/application/getPilotPersonalization.usecase.ts'),
    getQuestionLoads: () => questionLoads,
    getRecommendationLoads: () => recommendationLoads,
  };
}

test('OWNER receives the next question and authorized evidence', async () => {
  const { getPilotPersonalization, getQuestionLoads } = loadUseCase();
  const result = await getPilotPersonalization('prop-1', 'owner-1', {
    canManageSensitiveProfile: true,
    canViewSensitiveEvidence: true,
    canViewOrdinaryRecommendations: true,
    canAct: true,
    canGiveFeedback: true,
  });
  assert.equal(result.nextQuestion.id, 'question-1');
  assert.equal(result.available, true);
  assert.equal(result.profileEnabled, true);
  assert.deepEqual(result.recommendations[0].explanations[0].evidenceJson, { sensitive: true });
  assert.equal(result.capabilities.canManageSensitiveProfile, true);
  assert.equal(getQuestionLoads(), 1);
});

test('global pause hides previously stored recommendations and profile questions', async () => {
  const { getPilotPersonalization, getQuestionLoads, getRecommendationLoads } = loadUseCase({ paused: true });
  const result = await getPilotPersonalization('prop-1', 'owner-1', {
    canManageSensitiveProfile: true,
    canViewSensitiveEvidence: true,
    canViewOrdinaryRecommendations: true,
    canAct: true,
    canGiveFeedback: true,
  });
  assert.equal(result.available, false);
  assert.deepEqual(result.recommendations, []);
  assert.equal(result.nextQuestion, null);
  assert.equal(getQuestionLoads(), 0);
  assert.equal(getRecommendationLoads(), 0);
});

test('non-owner receives ordinary recommendations with evidence redacted and no profile question', async () => {
  const { getPilotPersonalization, getQuestionLoads } = loadUseCase();
  const result = await getPilotPersonalization('prop-1', 'viewer-1', {
    canManageSensitiveProfile: false,
    canViewSensitiveEvidence: false,
    canViewOrdinaryRecommendations: true,
    canAct: false,
    canGiveFeedback: false,
  });
  assert.equal(result.nextQuestion, null);
  assert.equal(result.recommendations[0].explanations[0].evidenceJson, null);
  assert.equal(result.capabilities.canGiveFeedback, false);
  assert.equal(getQuestionLoads(), 0);
});

test('property guidance is available before the optional household profile is enabled', async () => {
  const { getPilotPersonalization, getQuestionLoads } = loadUseCase({ household: null });
  const result = await getPilotPersonalization('prop-1', 'owner-1', {
    canManageSensitiveProfile: true,
    canViewSensitiveEvidence: true,
    canViewOrdinaryRecommendations: true,
    canAct: true,
    canGiveFeedback: true,
  });
  assert.equal(result.profileEnabled, false);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.nextQuestion, null);
  assert.equal(getQuestionLoads(), 0);
});
