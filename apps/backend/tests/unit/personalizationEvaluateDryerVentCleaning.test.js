// Proves the third real catalog rule (dryer_vent_cleaning_reminder)
// evaluates correctly end to end through the same generic pipeline
// (evaluateDefinitionForProperty takes definitionCode as a parameter).
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const DEFINITION_CODE = 'dryer_vent_cleaning_reminder';
const RULE_AST = { op: 'trait', key: 'dryerVentCleaningOverdue', cmp: 'eq', value: true };

function createPrismaMock({ definition = null, homeAssets = [], property = { id: 'prop-1' } } = {}) {
  const runs = [];

  const prismaMock = {
    systemSetting: {
      findUnique: async () => null,
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
  const paths = [
    '../../src/services/personalizationKillSwitch.service.ts',
    '../../src/modules/personalization/infrastructure/evaluationRunRepository.ts',
    '../../src/modules/personalization/infrastructure/propertyTraitRepository.ts',
    '../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts',
    '../../src/modules/personalization/application/evaluateDefinition.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/evaluateDefinition.usecase.ts');
}

const ACTIVE_DEFINITION = {
  code: DEFINITION_CODE,
  id: 'dryer-def-1',
  status: 'ACTIVE',
  safetyClass: 'SAFETY_SENSITIVE',
  rules: [{ version: 1, ruleAst: RULE_AST, status: 'ACTIVE', authoredBy: 'author-1', reviewedBy: 'reviewer-1' }],
};

test('real seeded state is DRAFT, so it is never evaluated (DEFINITION_NOT_ACTIVE)', async () => {
  const draftDefinition = { ...ACTIVE_DEFINITION, status: 'DRAFT' };
  const { prismaMock, runs } = createPrismaMock({ definition: draftDefinition });
  installPrismaMock(prismaMock);
  const { evaluateDefinitionForProperty } = loadUseCase();

  const result = await evaluateDefinitionForProperty('prop-1', DEFINITION_CODE);
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'DEFINITION_NOT_ACTIVE', definitionId: 'dryer-def-1' });
  assert.equal(runs.length, 0);
});

test('positive: vent cleaned 400 days ago -> eligible TRUE', async () => {
  const homeAssets = [{ assetType: 'DRYER', lastServiced: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) }];
  const { prismaMock } = createPrismaMock({ definition: ACTIVE_DEFINITION, homeAssets });
  installPrismaMock(prismaMock);
  const { evaluateDefinitionForProperty } = loadUseCase();

  const result = await evaluateDefinitionForProperty('prop-1', DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'TRUE');
  assert.equal(result.eligible, true);
});

test('negative: vent cleaned 30 days ago -> not eligible FALSE', async () => {
  const homeAssets = [{ assetType: 'DRYER', lastServiced: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }];
  const { prismaMock } = createPrismaMock({ definition: ACTIVE_DEFINITION, homeAssets });
  installPrismaMock(prismaMock);
  const { evaluateDefinitionForProperty } = loadUseCase();

  const result = await evaluateDefinitionForProperty('prop-1', DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'FALSE');
  assert.equal(result.eligible, false);
});

test('unknown: no DRYER-type asset at all -> UNKNOWN, never treated as eligible', async () => {
  const { prismaMock } = createPrismaMock({ definition: ACTIVE_DEFINITION, homeAssets: [] });
  installPrismaMock(prismaMock);
  const { evaluateDefinitionForProperty } = loadUseCase();

  const result = await evaluateDefinitionForProperty('prop-1', DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'UNKNOWN');
  assert.equal(result.eligible, false);
});
