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

function createPrismaMock({
  definition = REAL_DEFINITION,
  homeAssets = [],
  property = { id: 'prop-1' },
  killSwitchPaused = false,
  suppressions = [],
} = {}) {
  const runs = [];
  let recommendationRow = null;
  let currentHomeAssets = homeAssets;
  let currentSuppressions = suppressions;
  const recommendationUpserts = [];
  const explanationUpserts = [];
  const recommendationExpires = [];
  const recommendationSuppressed = [];

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
          return { hasSmokeDetectors: null, roofReplacementYear: null, ...property, homeAssets: currentHomeAssets };
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
    personalizedRecommendation: {
      upsert: async ({ create, update }) => {
        recommendationUpserts.push({ create, update });
        if (!recommendationRow) {
          recommendationRow = { id: 'rec-1', status: 'ACTIVE', ...create };
        } else {
          recommendationRow = { ...recommendationRow, ...update };
        }
        return recommendationRow;
      },
      updateMany: async ({ where, data }) => {
        recommendationExpires.push({ where, data });
        if (data.status === 'SUPPRESSED') recommendationSuppressed.push({ where, data });
        if (recommendationRow && recommendationRow.status === where.status) {
          recommendationRow = { ...recommendationRow, ...data };
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    recommendationExplanation: {
      upsert: async ({ create, update }) => {
        explanationUpserts.push({ create, update });
        return { id: 'exp-1', ...create, ...update };
      },
    },
    recommendationSuppression: {
      findMany: async ({ where }) => {
        const scopeKeys = where.OR.map((o) => `${o.scope}:${o.scopeKey}`);
        return currentSuppressions.filter(
          (s) => scopeKeys.includes(`${s.scope}:${s.scopeKey}`) && (!s.propertyId || s.propertyId === where.propertyId),
        );
      },
    },
  };

  return {
    prismaMock,
    runs,
    recommendationUpserts,
    explanationUpserts,
    recommendationExpires,
    recommendationSuppressed,
    getRecommendationRow: () => recommendationRow,
    setHomeAssets: (next) => {
      currentHomeAssets = next;
    },
    setSuppressions: (next) => {
      currentSuppressions = next;
    },
  };
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
    '../../src/modules/personalization/infrastructure/propertyTraitRepository.ts',
    '../../src/modules/personalization/infrastructure/recommendationRepository.ts',
    '../../src/modules/personalization/infrastructure/suppressionRepository.ts',
    '../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts',
    '../../src/modules/personalization/application/evaluateHvacFilterProof.usecase.ts',
    '../../src/modules/personalization/application/shadowEvaluateHvacFilterProof.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/shadowEvaluateHvacFilterProof.usecase.ts');
}

test('SHADOW_DISABLED: no recommendation is created when the rollout flag excludes this property', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, recommendationUpserts, runs } = createPrismaMock({ homeAssets });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase('0');

  const result = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  assert.deepEqual(result, { evaluation: { status: 'SHADOW_DISABLED' }, recommendationCreated: false });
  assert.equal(recommendationUpserts.length, 0);
  assert.equal(runs.length, 0);
});

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

  // Scoring is threaded through end to end (domain/scoring.ts).
  assert.equal(typeof recommendationUpserts[0].create.score, 'number');
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(recommendationUpserts[0].create.priorityBand));
  assert.equal(recommendationUpserts[0].create.confidence, 1);
  assert.ok(recommendationUpserts[0].create.scoreBreakdown);
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

test('FALSE result expires a previously-ACTIVE recommendation', async () => {
  const overdueAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const recentAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, recommendationExpires, setHomeAssets, getRecommendationRow } = createPrismaMock({
    homeAssets: overdueAssets,
  });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  const first = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  assert.equal(first.recommendationCreated, true);
  assert.equal(getRecommendationRow().status, 'ACTIVE');

  setHomeAssets(recentAssets);
  const second = await shadowEvaluateHvacFilterProofForProperty('prop-1');

  assert.equal(second.evaluation.result, 'FALSE');
  assert.equal(second.recommendationCreated, false);
  assert.equal(recommendationExpires.length, 1);
  assert.equal(getRecommendationRow().status, 'EXPIRED');
});

test('re-eligibility after EXPIRED revives the recommendation to ACTIVE, not stuck forever', async () => {
  const overdueAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const recentAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, setHomeAssets, getRecommendationRow } = createPrismaMock({ homeAssets: overdueAssets });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  await shadowEvaluateHvacFilterProofForProperty('prop-1'); // eligible -> ACTIVE
  setHomeAssets(recentAssets);
  await shadowEvaluateHvacFilterProofForProperty('prop-1'); // FALSE -> EXPIRED
  assert.equal(getRecommendationRow().status, 'EXPIRED');

  setHomeAssets(overdueAssets);
  const third = await shadowEvaluateHvacFilterProofForProperty('prop-1'); // eligible again

  assert.equal(third.recommendationCreated, true);
  assert.equal(getRecommendationRow().status, 'ACTIVE');
});

test('an active DEFINITION-scope suppression blocks the upsert and flips an existing ACTIVE row to SUPPRESSED', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const { prismaMock, recommendationSuppressed, getRecommendationRow, setSuppressions } = createPrismaMock({
    homeAssets,
  });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  // First run: no suppression yet -> creates the ACTIVE row normally.
  const first = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  assert.equal(first.recommendationCreated, true);
  assert.equal(getRecommendationRow().status, 'ACTIVE');

  // A suppression becomes active before the next run (e.g. explicit feedback arrived).
  setSuppressions([
    { scope: 'DEFINITION', scopeKey: HVAC_FILTER_PROOF_DEFINITION_CODE, propertyId: 'prop-1', until: null },
  ]);
  const second = await shadowEvaluateHvacFilterProofForProperty('prop-1');

  assert.equal(second.recommendationCreated, false);
  assert.equal(second.suppressed, true);
  assert.equal(recommendationSuppressed.length, 1);
  assert.equal(getRecommendationRow().status, 'SUPPRESSED');
});

test('an expired suppression does not block the upsert', async () => {
  const homeAssets = [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }];
  const { prismaMock } = createPrismaMock({
    homeAssets,
    suppressions: [
      {
        scope: 'DEFINITION',
        scopeKey: HVAC_FILTER_PROOF_DEFINITION_CODE,
        propertyId: 'prop-1',
        until: new Date(Date.now() - 1000),
      },
    ],
  });
  installPrismaMock(prismaMock);
  const { shadowEvaluateHvacFilterProofForProperty } = loadUseCase();

  const result = await shadowEvaluateHvacFilterProofForProperty('prop-1');
  assert.equal(result.recommendationCreated, true);
  assert.equal(result.suppressed, undefined);
});
