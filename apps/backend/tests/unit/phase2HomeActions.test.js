const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { goldenTestHomes } = require('../fixtures/productFramework/goldenTestHomes.js');
const {
  HomeActionCommandSchema,
  rankAndDeduplicateHomeActions,
  scoreHomeAction,
} = require('../../src/services/homeActions.service.ts');
const router = require('../../src/routes/homeActions.routes.ts').default;
const { propertyAuthMiddleware } = require('../../src/middleware/propertyAuth.middleware.ts');

function actionFixture(id, overrides = {}) {
  const action = structuredClone(goldenTestHomes.find((item) => item.id === 'existing-repair').action);
  action.id = id;
  action.lineageId = overrides.lineageId ?? id;
  action.source.entityId = overrides.entityId ?? id;
  return Object.assign(action, overrides);
}

function routeFor(routePath, method) {
  return router.stack
    .filter((layer) => layer.route)
    .find((layer) => layer.route.path === routePath && layer.route.methods?.[method])
    ?.route;
}

test('canonical feed ranks urgency and consequence with an explicit missing-context penalty', () => {
  const urgent = actionFixture('urgent', { priority: 'NOW' });
  const planned = actionFixture('planned', { priority: 'PLAN' });
  planned.confidence.missing = ['System age', 'Last service date'];

  const urgentScore = scoreHomeAction(urgent);
  const plannedScore = scoreHomeAction(planned);
  assert.ok(urgentScore.score > plannedScore.score);
  assert.equal(plannedScore.components.missingContextPenalty, 6);
  assert.match(plannedScore.explanation, /missing context/i);
});

test('canonical feed surfaces one winner for duplicate cross-source signals and preserves merge diagnostics', () => {
  const lower = actionFixture('lower', { lineageId: 'shared-lineage', priority: 'PLAN' });
  const higher = actionFixture('higher', { lineageId: 'shared-lineage', priority: 'NOW' });
  const distinct = actionFixture('distinct', { priority: 'SOON', signal: 'Review roof flashing before winter' });
  const result = rankAndDeduplicateHomeActions([lower, distinct, higher]);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'higher');
  assert.deepEqual(result[0].deduplication.mergedActionIds, ['lower']);
  assert.deepEqual(result.map((item) => item.ranking.rank), [1, 2]);
});

test('canonical lifecycle commands require safe deferment and dismissal inputs', () => {
  assert.equal(HomeActionCommandSchema.safeParse({ command: 'DEFER' }).success, false);
  assert.equal(HomeActionCommandSchema.safeParse({
    command: 'DEFER',
    nextTriggerAt: '2026-12-01T12:00:00.000Z',
    consequenceAcknowledged: true,
  }).success, true);
  assert.equal(HomeActionCommandSchema.safeParse({ command: 'NOT_RELEVANT' }).success, false);
  assert.equal(HomeActionCommandSchema.safeParse({
    command: 'NOT_RELEVANT', consequenceAcknowledged: true,
  }).success, true);
  assert.equal(HomeActionCommandSchema.safeParse({ command: 'CORRECT_FACT' }).success, true);
});

test('Phase 2 home-action routes are property-scoped and mutation requires contributor access', () => {
  const feed = routeFor('/properties/:propertyId/home-actions', 'get');
  const command = routeFor('/properties/:propertyId/home-actions/:actionId/commands', 'post');
  assert.ok(feed);
  assert.ok(command);
  assert.ok(feed.stack.some((layer) => layer.handle === propertyAuthMiddleware));
  assert.ok(command.stack.some((layer) => layer.handle === propertyAuthMiddleware));
  assert.ok(command.stack.length > feed.stack.length);
});
