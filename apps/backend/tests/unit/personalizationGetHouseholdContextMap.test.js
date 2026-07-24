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
  const materializerPath = require.resolve('../../src/modules/personalization/application/materializeRecommendations.usecase.ts');
  require.cache[materializerPath] = {
    id: materializerPath,
    filename: materializerPath,
    loaded: true,
    exports: {
      materializeRecommendationsForProperty: async () => paused
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
    source: 'USER_INPUT',
    consentVersion: 'personalization-household-profile-v1',
    consentedAt: at,
    properties: [{ occupancyType: 'PRIMARY', effectiveFrom: at, effectiveTo: null }],
    profileAnswers: [
      { question: { code: 'HOUSEHOLD_SIZE', prompt: 'How many people live in your household?' }, answerJson: { value: 3 }, createdAt: at },
      { question: { code: 'HOUSEHOLD_COMPOSITION_SAFETY', prompt: 'Household safety needs?' }, answerJson: { hasChildren: true, hasSeniors: false }, createdAt: at },
      { question: { code: 'PREFERENCE_BUDGET_POSTURE', prompt: 'Favor lower-cost options?' }, answerJson: { value: true, privateNote: 'must-not-leak' }, createdAt: at },
    ],
    derivedTraits: [{
      traitKey: 'HVAC_FILTER_REPLACEMENT_OVERDUE',
      valueJson: { value: true, rawAssetId: 'asset-secret' },
      source: 'DERIVED',
      computedAt: at,
    }],
    recommendations: [{
      status: 'ACTIVE',
      firstEligibleAt: at,
      expiresAt: null,
      definition: { code: 'HVAC_FILTER_REPLACEMENT_CHECK_PROOF' },
    }],
  };
  const { getHouseholdContextMap } = loadUseCase(data);
  const result = await getHouseholdContextMap('property-secret', 'owner-1', at);

  assert.equal(result.configured, true);
  assert.deepEqual(result.summary, {
    PROPERTY: 1,
    HOUSEHOLD: 1,
    PROFILE_FACT: 3,
    DERIVED_TRAIT: 1,
    RECOMMENDATION: 1,
  });
  assert.ok(result.edges.some((edge) => edge.type === 'OCCUPIES'));
  assert.ok(result.edges.some((edge) => edge.type === 'HAS_EXPLICIT_FACT'));
  assert.ok(result.edges.some((edge) => edge.type === 'HAS_DERIVED_TRAIT'));
  assert.ok(result.edges.some((edge) => edge.type === 'HAS_RECOMMENDATION'));
  assert.equal(
    result.nodes.find((node) => node.id.startsWith('profile:household_size'))?.detail,
    '3',
  );
  const hvacTrait = result.nodes.find((node) => node.id === 'trait:hvac_filter_replacement_overdue');
  assert.equal(hvacTrait?.label, 'HVAC filter replacement');
  assert.equal(hvacTrait?.detail, 'Due for attention');
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /property-secret|must-not-leak|asset-secret|rawAssetId|privateNote/);
  assert.match(serialized, /Current-state view only/);
});

test('presents camel-case property signals with homeowner-facing labels and values', async () => {
  const data = {
    source: null,
    consentVersion: null,
    consentedAt: null,
    properties: [],
    profileAnswers: [],
    derivedTraits: [
      { traitKey: 'roofAgeYears', valueJson: 2, source: 'PROPERTY_RECORD', computedAt: at },
      { traitKey: 'roofReplacementOverdue', valueJson: false, source: 'PROPERTY_RECORD', computedAt: at },
      { traitKey: 'smokeDetectorMissing', valueJson: false, source: 'PROPERTY_RECORD', computedAt: at },
    ],
    recommendations: [],
  };
  const { getHouseholdContextMap } = loadUseCase(data);
  const result = await getHouseholdContextMap('property-secret', 'owner-1', at);
  const traits = result.nodes.filter((node) => node.type === 'DERIVED_TRAIT');

  assert.deepEqual(
    traits.map(({ label, detail }) => ({ label, detail })),
    [
      { label: 'Roof age', detail: 'About 2 years' },
      { label: 'Roof replacement timing', detail: 'Not overdue' },
      { label: 'Smoke detectors', detail: 'Recorded as installed' },
    ],
  );
});

test('does not expose stored recommendation nodes while personalization is paused', async () => {
  const data = {
    source: 'USER_INPUT', consentVersion: 'personalization-household-profile-v1', consentedAt: at,
    properties: [{ occupancyType: 'PRIMARY', effectiveFrom: at, effectiveTo: null }],
    profileAnswers: [], derivedTraits: [],
    recommendations: [{ status: 'ACTIVE', firstEligibleAt: at, expiresAt: null, definition: { code: 'STALE' } }],
  };
  const { getHouseholdContextMap } = loadUseCase(data, { paused: true });
  const result = await getHouseholdContextMap('property-secret', 'owner-1', at);
  assert.equal(result.summary.RECOMMENDATION, 0);
  assert.ok(result.nodes.every((node) => node.type !== 'RECOMMENDATION'));
});

test('returns property transparency before optional-profile consent', async () => {
  const data = {
    source: null,
    consentVersion: null,
    consentedAt: null,
    properties: [],
    profileAnswers: [],
    derivedTraits: [{
      traitKey: 'HVAC_FILTER_REPLACEMENT_OVERDUE',
      valueJson: true,
      source: 'DERIVED',
      computedAt: at,
    }],
    recommendations: [{
      status: 'ACTIVE',
      firstEligibleAt: at,
      expiresAt: null,
      definition: { code: 'HVAC_FILTER_REPLACEMENT_CHECK_PROOF' },
    }],
  };
  const { getHouseholdContextMap } = loadUseCase(data);
  const result = await getHouseholdContextMap('property-secret', 'owner-1', at);
  assert.equal(result.configured, true);
  assert.equal(result.consent, null);
  assert.deepEqual(result.summary, {
    PROPERTY: 1,
    HOUSEHOLD: 0,
    PROFILE_FACT: 0,
    DERIVED_TRAIT: 1,
    RECOMMENDATION: 1,
  });
  assert.ok(result.nodes.some((node) => node.type === 'PROPERTY'));
  assert.ok(result.nodes.some((node) => node.type === 'DERIVED_TRAIT'));
  assert.ok(result.nodes.some((node) => node.type === 'RECOMMENDATION'));
  assert.ok(result.nodes.every((node) => node.type !== 'HOUSEHOLD' && node.type !== 'PROFILE_FACT'));
  assert.ok(result.edges.every((edge) => edge.type !== 'OCCUPIES' && edge.type !== 'HAS_EXPLICIT_FACT'));
});
