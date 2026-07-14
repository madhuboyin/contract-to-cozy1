const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadUseCase(data, { paused = false } = {}) {
  const repositoryPath = require.resolve('../../src/modules/personalization/infrastructure/contextMapRepository.ts');
  require.cache[repositoryPath] = {
    id: repositoryPath,
    filename: repositoryPath,
    loaded: true,
    exports: { loadHouseholdContextMapData: async () => data },
  };
  const materializerPath = require.resolve('../../src/modules/personalization/application/materializePilotRecommendations.usecase.ts');
  require.cache[materializerPath] = {
    id: materializerPath,
    filename: materializerPath,
    loaded: true,
    exports: {
      materializePilotRecommendationsForProperty: async () => paused
        ? { evaluated: 0, active: 0, paused: true }
        : { evaluated: 3, active: 1 },
    },
  };
  const useCasePath = require.resolve('../../src/modules/personalization/application/getHouseholdContextMap.usecase.ts');
  delete require.cache[useCasePath];
  return require(useCasePath);
}

const at = new Date('2026-07-13T12:00:00.000Z');

test('builds a sanitized current-state map from consented relational records', async () => {
  const data = {
    status: 'ACTIVE',
    source: 'USER_CREATED',
    consentVersion: 'personalization-household-profile-v1',
    consentedAt: at,
    properties: [{ occupancyType: 'PRIMARY', effectiveFrom: at, effectiveTo: null }],
    members: [{ type: 'CHILD', lifeStage: 'EARLY_SCHOOL', count: 1, source: 'USER_INPUT', createdAt: at }],
    pets: [],
    goals: [],
    preferences: [{ key: 'BUDGET_POSTURE', valueJson: { value: true, privateNote: 'must-not-leak' }, createdAt: at }],
    lifestyleAttributes: [],
    derivedTraits: [{
      traitKey: 'HVAC_FILTER_REPLACEMENT_OVERDUE',
      valueJson: { value: true, rawAssetId: 'asset-secret' },
      source: 'DERIVED',
      confidence: 1,
      computedAt: at,
      validUntil: null,
    }],
    recommendations: [{
      status: 'ACTIVE',
      firstEligibleAt: at,
      expiresAt: null,
      definition: { code: 'HVAC_FILTER_REPLACEMENT_CHECK_PROOF' },
    }],
  };
  const { getHouseholdContextMap } = loadUseCase(data);
  const result = await getHouseholdContextMap('property-secret', at);

  assert.equal(result.configured, true);
  assert.deepEqual(result.summary, {
    PROPERTY: 1,
    HOUSEHOLD: 1,
    PROFILE_FACT: 2,
    DERIVED_TRAIT: 1,
    RECOMMENDATION: 1,
  });
  assert.ok(result.edges.some((edge) => edge.type === 'OCCUPIES'));
  assert.ok(result.edges.some((edge) => edge.type === 'HAS_EXPLICIT_FACT'));
  assert.ok(result.edges.some((edge) => edge.type === 'HAS_DERIVED_TRAIT'));
  assert.ok(result.edges.some((edge) => edge.type === 'HAS_RECOMMENDATION'));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /property-secret|must-not-leak|asset-secret|rawAssetId|privateNote/);
  assert.match(serialized, /Current-state view only/);
});

test('does not expose stored recommendation nodes while personalization is paused', async () => {
  const data = {
    status: 'ACTIVE', source: 'USER_CREATED', consentVersion: 'personalization-household-profile-v1', consentedAt: at,
    properties: [{ occupancyType: 'PRIMARY', effectiveFrom: at, effectiveTo: null }],
    members: [], pets: [], goals: [], preferences: [], lifestyleAttributes: [], derivedTraits: [],
    recommendations: [{ status: 'ACTIVE', firstEligibleAt: at, expiresAt: null, definition: { code: 'STALE' } }],
  };
  const { getHouseholdContextMap } = loadUseCase(data, { paused: true });
  const result = await getHouseholdContextMap('property-secret', at);
  assert.equal(result.summary.RECOMMENDATION, 0);
  assert.ok(result.nodes.every((node) => node.type !== 'RECOMMENDATION'));
});

test('returns an empty non-configured map before consent', async () => {
  const { getHouseholdContextMap } = loadUseCase(null);
  const result = await getHouseholdContextMap('property-secret', at);
  assert.equal(result.configured, false);
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.equal(result.consent, null);
});
