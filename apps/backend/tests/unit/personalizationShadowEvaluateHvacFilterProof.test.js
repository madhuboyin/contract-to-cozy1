const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  HVAC_FILTER_PROOF_DEFINITION_CODE,
  HVAC_FILTER_PROOF_RULE_AST,
  HVAC_FILTER_PROOF_RULE_VERSION,
} = require('../../src/modules/personalization/catalog/proofDefinition.ts');

const REAL_DEFINITION = {
  code: HVAC_FILTER_PROOF_DEFINITION_CODE,
  id: 'def-1',
  rules: [{ version: HVAC_FILTER_PROOF_RULE_VERSION, ruleAst: HVAC_FILTER_PROOF_RULE_AST }],
};

function createPrismaMock({ definition = REAL_DEFINITION, homeAssets = [], property = { id: 'prop-1' }, killSwitchPaused = false } = {}) {
  const runs = [];
  let recommendationRow = null;
  const recommendationUpserts = [];
  const explanationUpserts = [];

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
          return { hasSmokeDetectors: null, roofReplacementYear: null, ...property, homeAssets };
        }
        return null;
      },
    },
    householdProperty: {
      findFirst: async () => null,
    },
    derivedTrait: {
      upsert: async () => ({}),
    },
    traitSnapshot: {
      create: async () => ({}),
    },
    personalizationEvaluationRun: {
      create: async ({ data }) => {
        runs.push(data);
        return { id: `run-${runs.length}`, ...data };
      },
    },
    personalizedRecommendation: {
      upsert: async ({ create, update }) => {
        recommendationUpserts.push({ create, update });
        if (!recommendationRow) {
          recommendationRow = { id: 'rec-1', ...create };
        } else {
          recommendationRow = { ...recommendationRow, ...update };
        }
        return recommendationRow;
      },
    },
    recommendationExplanation: {
      upsert: async ({ create, update }) => {
        explanationUpserts.push({ create, update });
        return { id: 'exp-1', ...create, ...update };
      },
    },
  };

  return { prismaMock, runs, recommendationUpserts, explanationUpserts, getRecommendationRow: () => recommendationRow };
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
  const paths = [
    '../../src/services/personalizationKillSwitch.service.ts',
    '../../src/modules/personalization/infrastructure/evaluationRunRepository.ts',
    '../../src/modules/personalization/infrastructure/traitSnapshotRepository.ts',
    '../../src/modules/personalization/infrastructure/recommendationRepository.ts',
    '../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts',
    '../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts',
    '../../src/modules/personalization/application/shadowEvaluateHvacFilterProof.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/shadowEvaluateHvacFilterProof.usecase.ts');
}

test('kill switch engaged: no recommendation is created', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, recommendationUpserts } = createPrismaMock({ homeAssets, killSwitchPaused: true });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  assert.equal(result.evaluation.status, 'PAUSED');
  assert.equal(result.recommendationCreated, false);
  assert.equal(recommendationUpserts.length, 0);
});

test('eligible (TRUE): creates a PersonalizedRecommendation + RecommendationExplanation', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, recommendationUpserts, explanationUpserts } = createPrismaMock({ homeAssets });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  assert.equal(result.evaluation.result, 'TRUE');
  assert.equal(result.recommendationCreated, true);
  assert.equal(result.recommendationId, 'rec-1');
  assert.equal(recommendationUpserts.length, 1);
  assert.equal(recommendationUpserts[0].create.propertyId, 'prop-1');
  assert.equal(recommendationUpserts[0].create.definitionId, 'def-1');
  assert.equal(explanationUpserts.length, 1);
  assert.equal(explanationUpserts[0].create.recommendationId, 'rec-1');
});

test('not eligible (FALSE): no recommendation is created', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, recommendationUpserts } = createPrismaMock({ homeAssets });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  assert.equal(result.evaluation.result, 'FALSE');
  assert.equal(result.recommendationCreated, false);
  assert.equal(result.recommendationId, undefined);
  assert.equal(recommendationUpserts.length, 0);
});

test('UNKNOWN: no recommendation is created', async () => {
  const { prismaMock, recommendationUpserts } = createPrismaMock({ homeAssets: [] });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  assert.equal(result.evaluation.result, 'UNKNOWN');
  assert.equal(result.recommendationCreated, false);
  assert.equal(recommendationUpserts.length, 0);
});

test('FAILED (property not found): no recommendation is created', async () => {
  const { prismaMock, recommendationUpserts } = createPrismaMock({ property: null });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await shadowEvaluateHvacFilterProofForProperty('missing-prop');
  assert.equal(result.evaluation.status, 'FAILED');
  assert.equal(result.recommendationCreated, false);
  assert.equal(recommendationUpserts.length, 0);
});

test('idempotent: re-running an eligible evaluation upserts the same recommendation, not a duplicate', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, recommendationUpserts } = createPrismaMock({ homeAssets });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  const first = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  const second = await shadowEvaluateHvacFilterProofForProperty('prop-1');

  assert.equal(first.recommendationId, second.recommendationId);
  assert.equal(recommendationUpserts.length, 2);
  // Second call is an update (refresh), not a fresh create.
  assert.ok(recommendationUpserts[1].update.lastEvaluatedAt);
});
