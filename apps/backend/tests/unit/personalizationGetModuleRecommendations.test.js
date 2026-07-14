const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function installModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function loadUseCase() {
  let materialized = 0;
  installModule('../../src/modules/personalization/infrastructure/pilotRepository.ts', {
    findPilotHouseholdForProperty: async () => null,
    listActiveRecommendationsForModule: async () => [{
      id: 'rec-1',
      status: 'ACTIVE',
      score: 60,
      priorityBand: 'MEDIUM',
      confidence: 0.8,
      expiresAt: null,
      definition: { code: 'hvac_filter_replacement_check_proof', category: 'low_cost_prevention' },
      explanations: [{ headline: 'Check HVAC filter', reasonCodes: [] }],
    }],
  });
  installModule('../../src/modules/personalization/application/materializePilotRecommendations.usecase.ts', {
    materializePilotRecommendationsForProperty: async () => { materialized += 1; },
  });
  const path = require.resolve('../../src/modules/personalization/application/getModuleRecommendations.usecase.ts');
  delete require.cache[path];
  return { ...require(path), materialized: () => materialized };
}

const capabilities = {
  canManageSensitiveProfile: false,
  canViewSensitiveEvidence: false,
  canViewOrdinaryRecommendations: true,
  canAct: false,
  canGiveFeedback: false,
};

test('returns capability-aware Maintenance items through the shared contract', async () => {
  const { getModuleRecommendations, materialized } = loadUseCase();
  const result = await getModuleRecommendations('prop-1', 'MAINTENANCE', capabilities, 3);
  assert.equal(result.configured, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].actions[0].enabled, false);
  assert.equal(materialized(), 1);
});

test('evaluates property recommendations without optional household opt-in', async () => {
  const { getModuleRecommendations, materialized } = loadUseCase();
  const result = await getModuleRecommendations('prop-1', 'MAINTENANCE', capabilities, 3);
  assert.equal(result.configured, true);
  assert.equal(result.items.length, 1);
  assert.equal(materialized(), 1);
});
