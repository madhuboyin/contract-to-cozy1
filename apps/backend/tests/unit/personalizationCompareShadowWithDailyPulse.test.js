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
  status: 'ACTIVE',
  rules: [{ version: HVAC_FILTER_PROOF_RULE_VERSION, ruleAst: HVAC_FILTER_PROOF_RULE_AST, status: 'ACTIVE' }],
};

function createPrismaMock({ homeAssets = [], dailyPulseAction = null } = {}) {
  const prismaMock = {
    systemSetting: {
      findUnique: async () => null,
    },
    recommendationDefinition: {
      findUnique: async ({ where }) => (where.code === REAL_DEFINITION.code ? REAL_DEFINITION : null),
    },
    property: {
      findUnique: async ({ where }) =>
        where.id === 'prop-1'
          ? { hasSmokeDetectors: null, roofReplacementYear: null, homeAssets }
          : null,
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
      create: async ({ data }) => ({ id: 'run-1', ...data }),
    },
    personalizedRecommendation: {
      upsert: async ({ create }) => ({ id: 'rec-1', status: 'ACTIVE', ...create }),
      updateMany: async () => ({ count: 0 }),
    },
    recommendationExplanation: {
      upsert: async ({ create }) => ({ id: 'exp-1', ...create }),
    },
    propertyMicroAction: {
      findFirst: async () => dailyPulseAction,
    },
  };

  return { prismaMock };
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

function loadUseCase(personalizationShadowPct = '100') {
  process.env.TOOL_ROLLOUT_PERSONALIZATION_SHADOW = personalizationShadowPct;
  const paths = [
    '../../src/config/featureFlags.ts',
    '../../src/services/personalizationKillSwitch.service.ts',
    '../../src/modules/personalization/infrastructure/evaluationRunRepository.ts',
    '../../src/modules/personalization/infrastructure/traitSnapshotRepository.ts',
    '../../src/modules/personalization/infrastructure/recommendationRepository.ts',
    '../../src/modules/personalization/infrastructure/dailyPulseComparisonRepository.ts',
    '../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts',
    '../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts',
    '../../src/modules/personalization/application/shadowEvaluateHvacFilterProof.usecase.ts',
    '../../src/modules/personalization/application/compareShadowWithDailyPulse.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/compareShadowWithDailyPulse.usecase.ts');
}

const OVERDUE_HOME_ASSETS = [
  { assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
];
const NOT_OVERDUE_HOME_ASSETS = [
  { assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
];
const PENDING_DAILY_PULSE_ACTION = { id: 'action-1' };

test('AGREE_BOTH_FLAG: personalization eligible and Daily Pulse already has a pending HVAC check', async () => {
  const { prismaMock } = createPrismaMock({ homeAssets: OVERDUE_HOME_ASSETS, dailyPulseAction: PENDING_DAILY_PULSE_ACTION });
  installPrismaMock(prismaMock);
  const { compareShadowWithDailyPulseForProperty } = loadUseCase();

  const result = await compareShadowWithDailyPulseForProperty('prop-1');
  assert.equal(result.personalizationEligible, true);
  assert.equal(result.dailyPulseHasActiveAction, true);
  assert.equal(result.agreement, 'AGREE_BOTH_FLAG');
});

test('AGREE_BOTH_CLEAR: personalization not eligible and Daily Pulse has no pending HVAC check', async () => {
  const { prismaMock } = createPrismaMock({ homeAssets: NOT_OVERDUE_HOME_ASSETS, dailyPulseAction: null });
  installPrismaMock(prismaMock);
  const { compareShadowWithDailyPulseForProperty } = loadUseCase();

  const result = await compareShadowWithDailyPulseForProperty('prop-1');
  assert.equal(result.personalizationEligible, false);
  assert.equal(result.dailyPulseHasActiveAction, false);
  assert.equal(result.agreement, 'AGREE_BOTH_CLEAR');
});

test('DISAGREE_PERSONALIZATION_ONLY: personalization eligible but Daily Pulse has nothing pending', async () => {
  const { prismaMock } = createPrismaMock({ homeAssets: OVERDUE_HOME_ASSETS, dailyPulseAction: null });
  installPrismaMock(prismaMock);
  const { compareShadowWithDailyPulseForProperty } = loadUseCase();

  const result = await compareShadowWithDailyPulseForProperty('prop-1');
  assert.equal(result.agreement, 'DISAGREE_PERSONALIZATION_ONLY');
});

test('DISAGREE_DAILY_PULSE_ONLY: personalization not eligible but Daily Pulse already has one pending', async () => {
  const { prismaMock } = createPrismaMock({ homeAssets: NOT_OVERDUE_HOME_ASSETS, dailyPulseAction: PENDING_DAILY_PULSE_ACTION });
  installPrismaMock(prismaMock);
  const { compareShadowWithDailyPulseForProperty } = loadUseCase();

  const result = await compareShadowWithDailyPulseForProperty('prop-1');
  assert.equal(result.agreement, 'DISAGREE_DAILY_PULSE_ONLY');
});

test('UNKNOWN personalization result is treated as not-eligible for comparison purposes', async () => {
  const { prismaMock } = createPrismaMock({ homeAssets: [], dailyPulseAction: null });
  installPrismaMock(prismaMock);
  const { compareShadowWithDailyPulseForProperty } = loadUseCase();

  const result = await compareShadowWithDailyPulseForProperty('prop-1');
  assert.equal(result.personalizationResult, 'UNKNOWN');
  assert.equal(result.personalizationEligible, false);
  assert.equal(result.agreement, 'AGREE_BOTH_CLEAR');
});

test('SHADOW_DISABLED (rollout flag off) is treated as not-eligible for comparison purposes', async () => {
  const { prismaMock } = createPrismaMock({ homeAssets: OVERDUE_HOME_ASSETS, dailyPulseAction: PENDING_DAILY_PULSE_ACTION });
  installPrismaMock(prismaMock);
  const { compareShadowWithDailyPulseForProperty } = loadUseCase('0');

  const result = await compareShadowWithDailyPulseForProperty('prop-1');
  assert.equal(result.personalizationResult, undefined);
  assert.equal(result.personalizationEligible, false);
  assert.equal(result.dailyPulseHasActiveAction, true);
  assert.equal(result.agreement, 'DISAGREE_DAILY_PULSE_ONLY');
});
