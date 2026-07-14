const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  HVAC_FILTER_PROOF_DEFINITION_CODE,
  HVAC_FILTER_PROOF_RULE_AST,
  HVAC_FILTER_PROOF_RULE_VERSION,
} = require('../../src/modules/personalization/catalog/proofDefinition.ts');

function createPrismaMock({ definition = null, homeAssets = [], property = { id: 'prop-1' }, killSwitchPaused = false } = {}) {
  const runs = [];

  const prismaMock = {
    systemSetting: {
      findUnique: async () => (killSwitchPaused ? { value: { paused: true } } : null),
    },
    recommendationDefinition: {
      findUnique: async ({ where }) => {
        if (definition && where.code === definition.code) return definition;
        return null;
      },
    },
    property: {
      findUnique: async ({ where }) => {
        if (property && where.id === property.id) {
          return {
            hasSmokeDetectors: null,
            roofReplacementYear: null,
            ...property,
            homeAssets,
          };
        }
        return null;
      },
    },
    householdProperty: {
      findFirst: async () => null,
    },
    derivedTrait: {
      upsert: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    },
    traitSnapshot: {
      create: async () => ({}),
      findFirst: async () => null,
    },
    personalizationEvaluationRun: {
      create: async ({ data }) => {
        runs.push(data);
        return { id: `run-${runs.length}`, ...data };
      },
    },
  };

  return { prismaMock, runs };
}

function installPrismaMock(prismaMock) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };
}

function loadUseCase() {
  // Cache-bust every module in the call chain, not just the top-level one —
  // this use case now calls computePropertyTraitSnapshot.usecase.ts, which
  // itself calls propertyTraitRepository.ts; a stale, not-reloaded module in
  // the chain would keep writing into a previous test's mock instance
  // (learned the hard way earlier this session with personalizationAudit.service.ts).
  const paths = [
    '../../src/services/personalizationKillSwitch.service.ts',
    '../../src/modules/personalization/infrastructure/evaluationRunRepository.ts',
    '../../src/modules/personalization/infrastructure/propertyTraitRepository.ts',
    '../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts',
    '../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts');
}

const REAL_DEFINITION = {
  code: HVAC_FILTER_PROOF_DEFINITION_CODE,
  id: 'def-1',
  status: 'ACTIVE',
  rules: [{ version: HVAC_FILTER_PROOF_RULE_VERSION, ruleAst: HVAC_FILTER_PROOF_RULE_AST, status: 'ACTIVE' }],
};

test('returns PAUSED and persists nothing when the kill switch is engaged', async () => {
  const { prismaMock, runs } = createPrismaMock({ definition: REAL_DEFINITION, killSwitchPaused: true });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.deepEqual(result, { status: 'PAUSED' });
  assert.equal(runs.length, 0);
});

test('returns FAILED/DEFINITION_NOT_FOUND and persists nothing when the definition does not exist', async () => {
  const { prismaMock, runs } = createPrismaMock({ definition: null });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', 'no_such_code');
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'DEFINITION_NOT_FOUND' });
  assert.equal(runs.length, 0);
});

test('returns FAILED/DEFINITION_NOT_ACTIVE and persists nothing when the definition is DRAFT', async () => {
  const draftDefinition = { ...REAL_DEFINITION, status: 'DRAFT' };
  const { prismaMock, runs } = createPrismaMock({ definition: draftDefinition });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'DEFINITION_NOT_ACTIVE', definitionId: 'def-1' });
  assert.equal(runs.length, 0);
});

test('returns FAILED/DEFINITION_NOT_ACTIVE when the definition is ACTIVE but its only rule is DRAFT', async () => {
  const draftRuleDefinition = {
    ...REAL_DEFINITION,
    rules: [{ version: HVAC_FILTER_PROOF_RULE_VERSION, ruleAst: HVAC_FILTER_PROOF_RULE_AST, status: 'DRAFT' }],
  };
  const { prismaMock, runs } = createPrismaMock({ definition: draftRuleDefinition });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'DEFINITION_NOT_ACTIVE', definitionId: 'def-1' });
  assert.equal(runs.length, 0);
});

test('returns FAILED/DEFINITION_NOT_ACTIVE when the definition has a per-definition pause set', async () => {
  const pausedDefinition = { ...REAL_DEFINITION, pausedAt: new Date() };
  const { prismaMock, runs } = createPrismaMock({ definition: pausedDefinition });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'DEFINITION_NOT_ACTIVE', definitionId: 'def-1' });
  assert.equal(runs.length, 0);
});

test('returns FAILED/DEFINITION_NOT_ACTIVE when the definition is outside its effective window', async () => {
  const expiredDefinition = { ...REAL_DEFINITION, effectiveTo: new Date(Date.now() - 24 * 60 * 60 * 1000) };
  const { prismaMock, runs } = createPrismaMock({ definition: expiredDefinition });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'DEFINITION_NOT_ACTIVE', definitionId: 'def-1' });
  assert.equal(runs.length, 0);
});

test('returns FAILED/INVALID_RULE_AST and records a failed run when the stored ruleAst is malformed', async () => {
  const brokenDefinition = {
    code: 'broken',
    id: 'def-2',
    status: 'ACTIVE',
    rules: [{ version: 1, ruleAst: { op: 'not_a_real_op' }, status: 'ACTIVE' }],
  };
  const { prismaMock, runs } = createPrismaMock({ definition: brokenDefinition });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', 'broken');
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorCode, 'INVALID_RULE_AST');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'FAILED');
  assert.equal(runs[0].definitionId, 'def-2');
});

test('positive fixture: HVAC serviced 200 days ago -> eligible TRUE, run recorded COMPLETED', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, runs } = createPrismaMock({ definition: REAL_DEFINITION, homeAssets });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'TRUE');
  assert.equal(result.eligible, true);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].result, 'TRUE');
  assert.equal(runs[0].definitionId, 'def-1');
  assert.equal(runs[0].ruleVersion, HVAC_FILTER_PROOF_RULE_VERSION);

  // Scoring inputs — present on every COMPLETED result (scoring itself happens
  // one layer up, in shadowEvaluateHvacFilterProof.usecase.ts).
  assert.equal(result.traitsSnapshot.hvacFilterDaysSinceServiced.known, true);
  assert.equal(result.traitsSnapshot.hvacFilterDaysSinceServiced.value, 200);
  assert.equal(result.scoreConfig, null); // REAL_DEFINITION's mocked rule has no scoreConfig field
});

test('COMPLETED result passes through the active rule\'s scoreConfig unchanged', async () => {
  const scoreConfig = { modelVersion: 'test-v1', baseRelevance: 50, weights: { baseRelevance: 0.5, urgency: 0.3, confidence: 0.2 } };
  const definitionWithScoreConfig = {
    ...REAL_DEFINITION,
    rules: [{ ...REAL_DEFINITION.rules[0], scoreConfig }],
  };
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const { prismaMock } = createPrismaMock({ definition: definitionWithScoreConfig, homeAssets });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.deepEqual(result.scoreConfig, scoreConfig);
});

test('negative fixture: HVAC serviced 5 days ago -> not eligible FALSE', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, runs } = createPrismaMock({ definition: REAL_DEFINITION, homeAssets });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'FALSE');
  assert.equal(result.eligible, false);
  assert.equal(runs[0].result, 'FALSE');
});

test('unknown fixture: no HVAC asset at all -> UNKNOWN, never treated as eligible', async () => {
  const { prismaMock, runs } = createPrismaMock({ definition: REAL_DEFINITION, homeAssets: [] });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'UNKNOWN');
  assert.equal(result.eligible, false);
  assert.equal(runs[0].result, 'UNKNOWN');
});

test('returns FAILED/PROPERTY_NOT_FOUND and records a failed run when the property does not exist', async () => {
  const { prismaMock, runs } = createPrismaMock({ definition: REAL_DEFINITION, property: null });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('missing-prop', HVAC_FILTER_PROOF_DEFINITION_CODE);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorCode, 'PROPERTY_NOT_FOUND');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'FAILED');
});
