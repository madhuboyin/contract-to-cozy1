const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  HVAC_FILTER_PROOF_DEFINITION_CODE,
  HVAC_FILTER_PROOF_RULE_AST,
  HVAC_FILTER_PROOF_RULE_VERSION,
} = require('../../src/modules/personalization/catalog/proofDefinition.ts');

function createPrismaMock({ definition = null, homeAssets = [] } = {}) {
  const runs = [];

  const prismaMock = {
    recommendationDefinition: {
      findUnique: async ({ where }) => {
        if (definition && where.code === definition.code) return definition;
        return null;
      },
    },
    homeAsset: {
      findMany: async () => homeAssets,
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
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/evaluationRunRepository.ts');
  const useCasePath = require.resolve('../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts');
  delete require.cache[repoPath];
  delete require.cache[useCasePath];
  return require('../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts');
}

const REAL_DEFINITION = {
  code: HVAC_FILTER_PROOF_DEFINITION_CODE,
  id: 'def-1',
  rules: [{ version: HVAC_FILTER_PROOF_RULE_VERSION, ruleAst: HVAC_FILTER_PROOF_RULE_AST }],
};

test('returns FAILED/DEFINITION_NOT_FOUND and persists nothing when the definition does not exist', async () => {
  const { prismaMock, runs } = createPrismaMock({ definition: null });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', 'no_such_code');
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'DEFINITION_NOT_FOUND' });
  assert.equal(runs.length, 0);
});

test('returns FAILED/INVALID_RULE_AST and records a failed run when the stored ruleAst is malformed', async () => {
  const brokenDefinition = { code: 'broken', id: 'def-2', rules: [{ version: 1, ruleAst: { op: 'not_a_real_op' } }] };
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
