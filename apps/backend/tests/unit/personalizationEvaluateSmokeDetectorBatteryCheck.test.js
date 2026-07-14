// Proves the second real catalog rule (smoke_co_detector_battery_check)
// evaluates correctly end to end through the same generic pipeline
// (evaluateHvacFilterProofForProperty takes definitionCode as a parameter —
// despite its HVAC-specific name, it's not hardcoded to one definition).
// Scenarios mirror the Phase 0 golden fixtures at
// catalog/fixtures/smoke_co_detector_battery_check/{positive,negative,unknown}.json.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const DEFINITION_CODE = 'smoke_co_detector_battery_check';
const RULE_AST = { op: 'trait', key: 'smokeDetectorBatteryOverdue', cmp: 'eq', value: true };

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
    '../../src/modules/personalization/infrastructure/traitSnapshotRepository.ts',
    '../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts',
    '../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts');
}

const ACTIVE_DEFINITION = {
  code: DEFINITION_CODE,
  id: 'smoke-def-1',
  status: 'ACTIVE',
  rules: [{ version: 1, ruleAst: RULE_AST, status: 'ACTIVE' }],
};

test('real seeded state is DRAFT, so it is never evaluated (DEFINITION_NOT_ACTIVE)', async () => {
  const draftDefinition = { ...ACTIVE_DEFINITION, status: 'DRAFT' };
  const { prismaMock, runs } = createPrismaMock({ definition: draftDefinition });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', DEFINITION_CODE);
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'DEFINITION_NOT_ACTIVE' });
  assert.equal(runs.length, 0);
});

test('positive fixture: battery checked 400 days ago -> eligible TRUE', async () => {
  const homeAssets = [{ assetType: 'SMOKE_DETECTOR', lastServiced: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) }];
  const { prismaMock } = createPrismaMock({
    definition: ACTIVE_DEFINITION,
    homeAssets,
    property: { id: 'prop-1', hasSmokeDetectors: true },
  });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'TRUE');
  assert.equal(result.eligible, true);
});

test('negative fixture: battery checked 30 days ago -> not eligible FALSE', async () => {
  const homeAssets = [{ assetType: 'SMOKE_DETECTOR', lastServiced: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }];
  const { prismaMock } = createPrismaMock({
    definition: ACTIVE_DEFINITION,
    homeAssets,
    property: { id: 'prop-1', hasSmokeDetectors: true },
  });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'FALSE');
  assert.equal(result.eligible, false);
});

test('unknown fixture: detector presence never recorded -> UNKNOWN, never treated as eligible', async () => {
  const { prismaMock } = createPrismaMock({
    definition: ACTIVE_DEFINITION,
    homeAssets: [],
    property: { id: 'prop-1', hasSmokeDetectors: null },
  });
  installPrismaMock(prismaMock);
  const { evaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await evaluateHvacFilterProofForProperty('prop-1', DEFINITION_CODE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.result, 'UNKNOWN');
  assert.equal(result.eligible, false);
});
