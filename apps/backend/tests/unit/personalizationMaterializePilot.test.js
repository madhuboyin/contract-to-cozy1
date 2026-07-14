const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function installModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function loadUseCase({ contentAvailable = true } = {}) {
  const upserts = [];
  const expired = [];
  installModule('../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts', {
    evaluateDefinitionForProperty: async (_propertyId, code, trigger) => ({
      status: 'COMPLETED', result: 'TRUE', eligible: true,
      definitionId: `def-${code}`, ruleVersion: 1, evaluationRunId: `run-${trigger}`,
    }),
  });
  installModule('../../src/modules/personalization/infrastructure/suppressionRepository.ts', {
    findActiveSuppression: async () => null,
  });
  installModule('../../src/modules/personalization/infrastructure/recommendationRepository.ts', {
    expireRecommendationIfActive: async (_propertyId, definitionId) => expired.push(definitionId),
    suppressRecommendationIfActive: async () => {},
    upsertRecommendation: async (params) => { upserts.push(params); return { id: `rec-${upserts.length}` }; },
  });
  installModule('../../src/modules/personalization/infrastructure/pilotContentRepository.ts', {
    loadActivePilotContent: async () => contentAvailable
      ? { version: 2, title: 'Reviewed title', body: 'Reviewed explanation' }
      : null,
  });

  const useCasePath = require.resolve('../../src/modules/personalization/application/materializePilotRecommendations.usecase.ts');
  delete require.cache[useCasePath];
  const useCase = require('../../src/modules/personalization/application/materializePilotRecommendations.usecase.ts');
  return { ...useCase, upserts, expired };
}

test('materializes all three eligible pilot definitions using active versioned content', async () => {
  const { materializePilotRecommendationsForProperty, upserts } = loadUseCase();
  const result = await materializePilotRecommendationsForProperty('prop-1', 'MANUAL');
  assert.deepEqual(result, { evaluated: 3, active: 3 });
  assert.equal(upserts.length, 3);
  assert.ok(upserts.every((item) => item.contentVersion === 2));
  assert.ok(upserts.every((item) => item.headline === 'Reviewed title'));
  assert.ok(upserts.every((item) => item.reasonCodes[0].params.message === 'Reviewed explanation'));
  assert.ok(upserts.every((item) => item.evaluationRunId === 'run-MANUAL'));
  assert.ok(upserts.every((item) => item.householdId === null));
});
test('does not surface eligible recommendations without ACTIVE reviewed content', async () => {
  const { materializePilotRecommendationsForProperty, upserts, expired } = loadUseCase({ contentAvailable: false });
  const result = await materializePilotRecommendationsForProperty('prop-1');
  assert.deepEqual(result, { evaluated: 3, active: 0 });
  assert.equal(upserts.length, 0);
  assert.equal(expired.length, 3);
});
