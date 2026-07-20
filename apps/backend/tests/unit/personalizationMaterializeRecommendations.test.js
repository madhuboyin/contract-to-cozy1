const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function installModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function loadUseCase({
  contentAvailable = true,
  paused = false,
  evaluationStatus = 'COMPLETED',
  contextVersions = ['personalization-test-context'],
} = {}) {
  const upserts = [];
  const expired = [];
  let evaluationCount = 0;
  installModule('../../src/modules/personalization/application/evaluateDefinition.usecase.ts', {
    evaluateDefinitionForProperty: async (_propertyId, code, trigger) => {
      const contextVersion = contextVersions[Math.min(
        Math.floor(evaluationCount / 5),
        contextVersions.length - 1,
      )];
      evaluationCount += 1;
      return paused
        ? { status: 'PAUSED' }
        : evaluationStatus === 'COMPLETED'
        ? {
        status: 'COMPLETED', result: 'TRUE', eligible: true,
        definitionId: `def-${code}`, ruleVersion: 1, evaluationRunId: `run-${trigger}`,
        contextVersion,
        traitsSnapshot: code === 'hvac_filter_replacement_check_proof'
          ? { hvacFilterDaysSinceServiced: { known: true, value: 200 } }
          : {},
      }
        : { status: 'FAILED', errorCode: 'DEFINITION_NOT_ACTIVE', definitionId: `def-${code}` };
    },
  });
  installModule('../../src/modules/personalization/infrastructure/suppressionRepository.ts', {
    findActiveSuppression: async () => null,
  });
  installModule('../../src/modules/personalization/infrastructure/recommendationRepository.ts', {
    expireRecommendationIfActive: async (_propertyId, definitionId) => expired.push(definitionId),
    suppressRecommendationIfActive: async () => {},
    upsertRecommendation: async (params) => { upserts.push(params); return { id: `rec-${upserts.length}` }; },
  });
  installModule('../../src/modules/personalization/infrastructure/recommendationContentRepository.ts', {
    loadActiveRecommendationContent: async () => contentAvailable
      ? { version: 2, title: 'Reviewed title', body: 'Reviewed explanation' }
      : null,
  });

  const useCasePath = require.resolve('../../src/modules/personalization/application/materializeRecommendations.usecase.ts');
  delete require.cache[useCasePath];
  const useCase = require('../../src/modules/personalization/application/materializeRecommendations.usecase.ts');
  return { ...useCase, upserts, expired };
}

test('materializes all five eligible personalization definitions using active versioned content', async () => {
  const { materializeRecommendationsForProperty, upserts } = loadUseCase();
  const result = await materializeRecommendationsForProperty('prop-1', 'MANUAL');
  assert.deepEqual(result, { evaluated: 5, active: 5 });
  assert.equal(upserts.length, 5);
  assert.ok(upserts.every((item) => item.contentVersion === 2));
  assert.ok(upserts.every((item) => item.headline === 'Reviewed title'));
  assert.ok(upserts.every((item) => item.reasonCodes[0].params.message === 'Reviewed explanation'));
  assert.ok(upserts.every((item) => item.evaluationRunId === 'run-MANUAL'));
  assert.ok(upserts.every((item) => item.evidence.contextVersion === 'personalization-test-context'));
  assert.ok(upserts.every((item) => !Object.hasOwn(item, 'householdId')));
  const hvac = upserts.find((item) => item.definitionId === 'def-hvac_filter_replacement_check_proof');
  assert.equal(hvac.score, 62);
  assert.equal(hvac.reasonCodes[0].params.factSummary, 'The recorded HVAC service date was 200 days ago.');
  const smokeInstall = upserts.find((item) => item.definitionId === 'def-smoke_detector_installation_review');
  assert.match(smokeInstall.reasonCodes[0].params.factSummary, /not installed/);
});
test('does not surface eligible recommendations without ACTIVE reviewed content', async () => {
  const { materializeRecommendationsForProperty, upserts, expired } = loadUseCase({ contentAvailable: false });
  const result = await materializeRecommendationsForProperty('prop-1');
  assert.deepEqual(result, { evaluated: 5, active: 0 });
  assert.equal(upserts.length, 0);
  assert.equal(expired.length, 5);
});

test('global pause performs no evaluation or materialization', async () => {
  const { materializeRecommendationsForProperty, upserts, expired } = loadUseCase({ paused: true });
  const result = await materializeRecommendationsForProperty('prop-1');
  assert.deepEqual(result, { evaluated: 0, active: 0, paused: true });
  assert.equal(upserts.length, 0);
  assert.equal(expired.length, 0);
});

test('inactive definitions expire previously stored recommendations', async () => {
  const { materializeRecommendationsForProperty, upserts, expired } = loadUseCase({ evaluationStatus: 'FAILED' });
  const result = await materializeRecommendationsForProperty('prop-1');
  assert.deepEqual(result, { evaluated: 5, active: 0 });
  assert.equal(upserts.length, 0);
  assert.equal(expired.length, 5);
});

test('a changed Property Context version refreshes recommendation evidence', async () => {
  const { materializeRecommendationsForProperty, upserts } = loadUseCase({ contextVersions: ['context-v1', 'context-v2'] });
  await materializeRecommendationsForProperty('prop-1', 'HOME_READ');
  await materializeRecommendationsForProperty('prop-1', 'HOME_READ');
  assert.equal(upserts.length, 10);
  assert.ok(upserts.slice(0, 5).every((item) => item.evidence.contextVersion === 'context-v1'));
  assert.ok(upserts.slice(5).every((item) => item.evidence.contextVersion === 'context-v2'));
});
