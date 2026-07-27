const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  applyCoverageActionLifecyclePolicy,
  coverageActionPromotionDecision,
} = require('../../src/services/coverageLifecycle.service');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function coverageAction() {
  return {
    id: 'coverage-review:review-1',
    propertyId: 'property-1',
    lineageId: 'coverage-review:deductible-change',
    source: {
      kind: 'COVERAGE',
      entityId: 'review-1',
      version: '3:fingerprint',
    },
    primaryCta: {
      kind: 'REVIEW',
      label: 'Review question',
      href: '/dashboard/properties/property-1/tools/coverage-intelligence?stage=questions',
    },
    secondaryCtas: [{
      kind: 'CORRECT_FACT',
      label: 'Correct policy facts',
      href: '/dashboard/properties/property-1/tools/coverage-intelligence',
    }],
  };
}

test('coverage action promotion fails closed on rollout, kill switch, or rule health', () => {
  assert.deepEqual(
    coverageActionPromotionDecision({
      rolloutEnabled: true,
      killSwitchEnabled: true,
      ruleSourceStatus: 'HEALTHY',
    }),
    { enabled: true, blockers: [] },
  );
  assert.deepEqual(
    coverageActionPromotionDecision({
      rolloutEnabled: false,
      killSwitchEnabled: false,
      ruleSourceStatus: 'UNAVAILABLE',
    }),
    {
      enabled: false,
      blockers: [
        'ROLLOUT_DISABLED',
        'ACTION_KILL_SWITCH_ACTIVE',
        'RULE_SOURCE_UNAVAILABLE',
      ],
    },
  );
});

test('canonical coverage action carries stage and source context without duplication', () => {
  const action = coverageAction();
  const result = applyCoverageActionLifecyclePolicy([action], {
    rolloutEnabled: true,
    killSwitchEnabled: true,
    ruleSourceStatus: 'HEALTHY',
  });

  assert.equal(result.actions.length, 1);
  const href = result.actions[0].primaryCta.href;
  assert.match(href, /stage=questions/);
  assert.match(href, /sourceActionId=coverage-review%3Areview-1/);
  assert.match(href, /coverageReviewId=review-1/);
  assert.equal((href.match(/sourceActionId=/g) ?? []).length, 1);
});

test('disabled coverage action policy suppresses only coverage actions', () => {
  const unrelated = {
    ...coverageAction(),
    id: 'project:project-1',
    source: { kind: 'PROJECT', entityId: 'project-1', version: '1' },
  };
  const result = applyCoverageActionLifecyclePolicy([coverageAction(), unrelated], {
    rolloutEnabled: true,
    killSwitchEnabled: false,
    ruleSourceStatus: 'HEALTHY',
  });

  assert.deepEqual(result.actions.map((action) => action.id), ['project:project-1']);
  assert.equal(result.suppressedCount, 1);
});

test('durable decision resolves the source action and preserves verified lineage', () => {
  const lifecycle = read('apps/backend/src/services/coverageLifecycle.service.ts');
  const controller = read('apps/backend/src/controllers/coverageAnalysis.controller.ts');
  const comparison = read('apps/backend/src/services/coverageComparison.service.ts');

  assert.match(lifecycle, /actionType: 'USER_MARKED_COMPLETE'/);
  assert.match(lifecycle, /HOME_ACTION_OUTCOME_VERIFIED/);
  assert.match(lifecycle, /verificationStatus: 'VERIFIED'/);
  assert.match(controller, /resolveCoverageHomeActionFromDecision/);
  assert.match(controller, /result\.decision\.sourceActionId/);
  assert.match(comparison, /status: 'DRAFT'/);
  assert.match(comparison, /sourceActionId: context\.sourceActionId/);
});

test('coverage stays off permanent suggestions and operational dependencies keep explicit states', () => {
  const definition = read(
    'apps/backend/src/productFramework/capabilities/definitions/saveOptimize.ts',
  );
  const lifecycle = read('apps/backend/src/services/coverageLifecycle.service.ts');
  const routes = read('apps/backend/src/routes/insuranceQuote.routes.ts');

  assert.match(
    definition,
    /'coverage-intelligence'.*'BETA'.*'REGULATED_COVERAGE'.*'CATALOG_ONLY'/,
  );
  assert.match(lifecycle, /benchmarkStatus.*'DISABLED'/);
  assert.match(lifecycle, /partnerStatus: CoverageDependencyStatus/);
  assert.match(lifecycle, /'UNAVAILABLE'/);
  assert.match(routes, /admin\/coverage-operations\/health/);
  assert.match(routes, /requireCapability\('RELEASE_GATE_VIEW'\)/);
});
