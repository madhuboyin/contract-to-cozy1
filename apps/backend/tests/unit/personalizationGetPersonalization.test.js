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
  preferences = { agingInPlace: false, budgetSensitive: false },
} = {}) {
  let questionLoads = 0;
  let recommendationLoads = 0;
  installModule('../../src/modules/personalization/infrastructure/personalizationRepository.ts', {
    findConsentedHouseholdForProperty: async () => household,
    findHouseholdForPropertyOwner: async () => null,
    listActivePersonalizationRecommendations: async () => {
      recommendationLoads += 1;
      return [{
        id: 'rec-1',
        score: 60,
        priorityBand: 'MEDIUM',
        firstEligibleAt: new Date('2026-01-01'),
        definition: { code: 'hvac_filter_replacement_check_proof', category: 'maintenance' },
        explanations: [{ headline: 'Reviewed', reasonCodes: [], evidenceJson: { sensitive: true } }],
      }];
    },
    enableHouseholdProfile: async () => ({}),
    resetHouseholdProfile: async () => true,
  });
  installModule('../../src/modules/personalization/application/materializeRecommendations.usecase.ts', {
    materializeRecommendationsForProperty: async () => paused
      ? ({ evaluated: 0, active: 0, paused: true })
      : ({ evaluated: 3, active: 1 }),
  });
  installModule('../../src/modules/personalization/application/getNextEligibleQuestionForHousehold.usecase.ts', {
    getNextEligibleQuestionForHousehold: async () => {
      questionLoads += 1;
      return { question: { id: 'question-1' } };
    },
  });
  installModule('../../src/modules/personalization/infrastructure/profileRankingRepository.ts', {
    loadExplicitRankingPreferences: async () => preferences,
  });
  const path = require.resolve('../../src/modules/personalization/application/getPersonalization.usecase.ts');
  delete require.cache[path];
  return {
    ...require('../../src/modules/personalization/application/getPersonalization.usecase.ts'),
    getQuestionLoads: () => questionLoads,
    getRecommendationLoads: () => recommendationLoads,
  };
}

test('OWNER receives the next question and authorized evidence', async () => {
  const { getPersonalization, getQuestionLoads } = loadUseCase();
  const result = await getPersonalization('prop-1', 'owner-1', {
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
  const { getPersonalization, getQuestionLoads, getRecommendationLoads } = loadUseCase({ paused: true });
  const result = await getPersonalization('prop-1', 'owner-1', {
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
  const { getPersonalization, getQuestionLoads } = loadUseCase();
  const result = await getPersonalization('prop-1', 'viewer-1', {
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
  const { getPersonalization, getQuestionLoads } = loadUseCase({ household: null });
  const result = await getPersonalization('prop-1', 'owner-1', {
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

test('consented explicit budget preference is visible as owner-only read-time ranking', async () => {
  const { getPersonalization } = loadUseCase({
    preferences: { agingInPlace: false, budgetSensitive: true },
  });
  const result = await getPersonalization('prop-1', 'owner-1', {
    canManageSensitiveProfile: true,
    canViewSensitiveEvidence: true,
    canViewOrdinaryRecommendations: true,
    canAct: true,
    canGiveFeedback: true,
  });
  assert.equal(result.recommendations[0].score, 66);
  assert.equal(result.rankingContext.profileApplied, true);
  assert.match(result.recommendations[0].rankingReasons[0], /lower-cost options/);
});
