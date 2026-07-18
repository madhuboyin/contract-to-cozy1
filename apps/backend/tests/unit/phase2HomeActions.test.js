const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  const home = routeFor('/properties/:propertyId/home', 'get');
  const command = routeFor('/properties/:propertyId/home-actions/:actionId/commands', 'post');
  const interaction = routeFor('/properties/:propertyId/home-actions/:actionId/interactions', 'post');
  assert.ok(feed);
  assert.ok(home);
  assert.ok(command);
  assert.ok(interaction);
  assert.ok(feed.stack.some((layer) => layer.handle === propertyAuthMiddleware));
  assert.ok(home.stack.some((layer) => layer.handle === propertyAuthMiddleware));
  assert.ok(command.stack.some((layer) => layer.handle === propertyAuthMiddleware));
  assert.ok(interaction.stack.some((layer) => layer.handle === propertyAuthMiddleware));
  assert.ok(command.stack.length > feed.stack.length);
});

test('unified Home uses one five-section responsive surface and five homeowner destinations', () => {
  const homeSurface = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/components/home/UnifiedHomeSurface.tsx'),
    'utf8',
  );
  const dashboard = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/page.tsx'),
    'utf8',
  );
  const navigation = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/lib/navigation/jobsNavigation.ts'),
    'utf8',
  );
  for (const heading of [
    'What needs attention', 'Decisions to make', 'Active major moment',
    'Home at a glance', 'Ask ContractToCozy',
  ]) assert.match(homeSurface, new RegExp(heading));
  assert.match(dashboard, /return <UnifiedHomeSurface propertyId=/);
  for (const label of ['Home', 'Plan & Projects', 'Home Record', 'Ask', 'Profile & Settings']) {
    assert.match(navigation, new RegExp(`name: '${label.replace('&', '\\&')}'`));
  }
  assert.equal((navigation.match(/name: '/g) || []).length, 5);
});

test('Phase 2 declares stable shown, opened, acted, resolved, superseded, and verified lineage', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '../../src/services/homeActions.service.ts'), 'utf8');
  for (const event of [
    'HOME_ACTION_SURFACED', 'HOME_ACTION_OPENED', 'HOME_ACTION_ACTED',
    'HOME_ACTION_RESOLUTION_RECORDED', 'HOME_ACTION_SUPERSEDED', 'HOME_ACTION_OUTCOME_VERIFIED',
  ]) assert.match(schema, new RegExp(`\\b${event}\\b`));
  assert.match(service, /eventType: 'HOME_ACTION_OPENED'/);
  assert.match(service, /eventType: 'HOME_ACTION_ACTED'/);
  assert.match(service, /eventType: 'HOME_ACTION_SUPERSEDED'/);
});

test('Phase 2 route audit covers canonical CTAs and every guidance template destination', () => {
  const routeAudit = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/scripts/product-framework/check-route-disposition.mjs'),
    'utf8',
  );
  assert.match(routeAudit, /PHASE2_CANONICAL_CTA_ROUTES/);
  assert.match(routeAudit, /extractGuidanceTemplateRoutes/);
  assert.match(routeAudit, /PRODUCT_FRAMEWORK_ROUTE_CONTRACTS/);
});
