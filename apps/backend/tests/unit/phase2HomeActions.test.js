const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

process.env.GEMINI_API_KEY ||= 'phase2-test-key';
const { EventEmitter } = require('node:events');
class RedisTestDouble extends EventEmitter {
  constructor() {
    super();
    this.options = { maxRetriesPerRequest: null };
  }
  status = 'ready';
  duplicate() { return new RedisTestDouble(); }
  async connect() { return undefined; }
  async info() { return 'redis_version:7.0.0'; }
  defineCommand(name) { this[name] = async () => null; }
  async eval() { return [1, 60_000]; }
  async decr() { return 0; }
  async del() { return 0; }
  async quit() { return 'OK'; }
  disconnect() {}
}
const ioredisPath = require.resolve('ioredis');
require.cache[ioredisPath] = {
  id: ioredisPath,
  filename: ioredisPath,
  loaded: true,
  exports: { __esModule: true, default: RedisTestDouble, Redis: RedisTestDouble },
};
const redisPath = require.resolve('../../src/lib/redis.ts');
require.cache[redisPath] = {
  id: redisPath,
  filename: redisPath,
  loaded: true,
  exports: {
    redis: {
      status: 'ready',
      eval: async () => [1, 60_000],
      decr: async () => 0,
      del: async () => 0,
    },
  },
};

const { goldenTestHomes } = require('../fixtures/productFramework/goldenTestHomes.js');
const {
  HomeActionCommandSchema,
  rankAndDeduplicateHomeActions,
  scoreHomeAction,
} = require('../../src/services/homeActions.service.ts');
const { adaptOrchestratedActionToHomeAction } = require('../../src/services/orchestration.service.ts');
const { adaptHomeActionSource } = require('../../src/productFramework/homeActionSourceAdapters.ts');
const { buildRecommendationResponseContract } = require('../../src/productFramework/recommendationResponse.contract.ts');
const { getGuidanceJourneyDisplayTitle } = require('../../src/services/guidanceEngine/guidanceTemplateRegistry.ts');
const { getHomeAssetDisplayLabel } = require('../../src/productFramework/homeAssetDisplay.ts');

function actionFixture(id, overrides = {}) {
  const action = structuredClone(goldenTestHomes.find((item) => item.id === 'existing-repair').action);
  action.id = id;
  action.lineageId = overrides.lineageId ?? id;
  action.source.entityId = overrides.entityId ?? id;
  return Object.assign(action, overrides);
}

function routeFor(router, routePath, method) {
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
  lower.source.kind = 'PERSONALIZATION';
  higher.source.kind = 'MAINTENANCE';
  const distinct = actionFixture('distinct', { priority: 'SOON', signal: 'Review roof flashing before winter' });
  const result = rankAndDeduplicateHomeActions([lower, distinct, higher]);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'higher');
  assert.deepEqual(result[0].deduplication.mergedActionIds, ['lower']);
  assert.equal(result[0].source.kind, 'MAINTENANCE');
  assert.deepEqual(result.map((item) => item.ranking.rank), [1, 2]);
});

test('orchestration percentages are normalized for Home Action evidence and confidence', () => {
  const baseAction = {
    id: 'checklist-action',
    actionKey: 'maintenance:filter',
    source: 'CHECKLIST',
    propertyId: 'property-1',
    title: 'Replace the HVAC filter',
    description: 'The recurring filter task is due.',
    checklistItemId: 'checklist-item-1',
    status: 'PENDING',
    nextDueDate: new Date('2026-08-01T12:00:00.000Z'),
    isRecurring: true,
    serviceCategory: null,
    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null },
    confidence: { score: 80, level: 'HIGH', explanation: ['Task is due'] },
    cta: { show: true, label: 'Review task', reason: 'ACTION_REQUIRED' },
    suppression: { suppressed: false, reasons: [] },
    signalSources: [],
    primarySignalSource: null,
    priority: 75,
    overdue: false,
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
  };

  const percentage = adaptOrchestratedActionToHomeAction(baseAction);
  assert.equal(percentage.evidence[0].confidence, 0.8);
  assert.equal(percentage.confidence.score, 0.8);

  const ratio = adaptOrchestratedActionToHomeAction({
    ...baseAction,
    confidence: { ...baseAction.confidence, score: 0.82 },
  });
  assert.equal(ratio.evidence[0].confidence, 0.82);
  assert.equal(ratio.confidence.score, 0.82);
});

test('orchestration recommendations preserve the affected service context', () => {
  const action = adaptOrchestratedActionToHomeAction({
    id: 'risk-hvac',
    actionKey: 'risk:hvac',
    source: 'RISK',
    propertyId: 'property-1',
    title: 'HVAC furnace',
    description: null,
    systemType: 'HVAC',
    category: 'HVAC',
    riskLevel: 'HIGH',
    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null },
    confidence: { score: 0.9, level: 'HIGH', explanation: [] },
    cta: { show: true, label: 'Schedule Service', reason: 'ACTION_REQUIRED' },
    suppression: { suppressed: false, reasons: [] },
    signalSources: [],
    primarySignalSource: null,
    priority: 80,
    overdue: false,
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
  });

  assert.equal(action.recommendedAction, 'Schedule service for HVAC Furnace');
  assert.equal(action.primaryCta.label, 'Schedule Service');
  assert.equal(
    action.primaryCta.href,
    '/dashboard/providers?propertyId=property-1&category=HVAC&serviceLabel=HVAC+Furnace&intent=service-booking&from=home-action&actionKey=risk%3Ahvac',
  );
  assert.equal(
    action.whyItMatters,
    'Routine furnace maintenance is recommended soon based on the information in your Home Record.',
  );
});

test('service recommendations do not leak a conflicting coverage action', () => {
  const action = adaptOrchestratedActionToHomeAction({
    id: 'risk-hvac-conflicting-copy',
    actionKey: 'risk:hvac:conflicting-copy',
    source: 'RISK',
    propertyId: 'property-1',
    title: 'HVAC Furnace',
    description: 'Add Home Warranty',
    systemType: 'HVAC',
    category: 'HVAC',
    riskLevel: 'HIGH',
    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null },
    confidence: { score: 0.9, level: 'HIGH', explanation: [] },
    priority: 80,
    cta: { show: true, label: 'Schedule Service', reason: 'ACTION_REQUIRED' },
    suppression: { suppressed: false, reasons: [] },
    signalSources: [],
    primarySignalSource: null,
    overdue: false,
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
  });

  assert.equal(action.recommendedAction, 'Schedule service for HVAC Furnace');
  assert.equal(
    action.whyItMatters,
    'Routine furnace maintenance is recommended soon based on the information in your Home Record.',
  );
  assert.doesNotMatch(action.signal, /warranty/i);
});

test('service recommendations send water-heater work to plumbing provider search', () => {
  const action = adaptOrchestratedActionToHomeAction({
    id: 'risk-water-heater',
    actionKey: 'risk:water-heater',
    source: 'RISK',
    propertyId: 'property-1',
    title: 'WATER_HEATER_TANK',
    description: null,
    systemType: 'WATER_HEATER_TANK',
    category: 'SYSTEM',
    riskLevel: 'HIGH',
    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null },
    confidence: { score: 0.9, level: 'HIGH', explanation: [] },
    priority: 80,
    cta: { show: true, label: 'Schedule Service', reason: 'ACTION_REQUIRED' },
    suppression: { suppressed: false, reasons: [] },
    signalSources: [],
    primarySignalSource: null,
    relatedEntity: { type: 'INVENTORY_ITEM', id: 'water-heater-item' },
    overdue: false,
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
  });

  assert.match(action.primaryCta.href, /^\/dashboard\/providers\?/);
  assert.match(action.primaryCta.href, /category=PLUMBING/);
  assert.match(action.primaryCta.href, /serviceLabel=Water\+Heater/);
  assert.match(action.primaryCta.href, /actionKey=risk%3Awater-heater/);
  assert.match(action.primaryCta.href, /itemId=water-heater-item/);
});

test('Home asset labels humanize identifiers and simplify roof construction subtypes', () => {
  assert.equal(getHomeAssetDisplayLabel({ name: 'HVAC_FURNACE' }), 'HVAC Furnace');
  assert.equal(getHomeAssetDisplayLabel({ name: 'Roof Shingle' }), 'Roof');
  assert.equal(getHomeAssetDisplayLabel({ name: 'Main water heater' }), 'Main Water Heater');
});

test('degraded material actions use one CTA-aligned homeowner instruction', () => {
  const fixture = actionFixture('degraded-guidance');
  const { source, job, recommendationResponse: _response, ...base } = fixture;
  const action = adaptHomeActionSource('GUIDANCE', {
    ...base,
    sourceEntityId: source.entityId,
    sourceVersion: source.version,
    job,
    withheldRecommendedAction: 'Add coverage information for HVAC Furnace',
    primaryCta: { kind: 'PURCHASE', label: 'Purchase coverage', href: '/purchase' },
    secondaryCtas: [{ kind: 'CORRECT_FACT', label: 'Add home information', href: '/home-record' }],
    recommendationResponse: buildRecommendationResponseContract({
      status: 'DATA_UNAVAILABLE',
      safetyTier: base.governance.safetyTier,
    }),
  });

  assert.equal(action.recommendedAction, 'Add coverage information for HVAC Furnace');
  assert.equal(action.primaryCta.kind, 'CORRECT_FACT');
  assert.equal(action.primaryCta.label, 'Add home information');
  assert.equal(action.secondaryCtas.some((cta) => cta.kind === 'CORRECT_FACT'), false);
  assert.doesNotMatch(action.recommendedAction, /qualified professional|\bor\b/i);
});

test('journey keys are converted to homeowner-facing titles', () => {
  assert.equal(getGuidanceJourneyDisplayTitle('coverage_gap_resolution'), 'Resolve a coverage gap');
  assert.equal(getGuidanceJourneyDisplayTitle('unknown_home_journey'), 'Unknown home');
});

test('degraded confidence explanation does not claim there is no context penalty', () => {
  const degraded = actionFixture('degraded-ranking');
  degraded.recommendationResponse = buildRecommendationResponseContract({
    status: 'DATA_UNAVAILABLE',
    safetyTier: degraded.governance.safetyTier,
  });
  degraded.confidence.score = null;
  degraded.confidence.label = 'LOW';
  degraded.confidence.missing = [];

  assert.match(scoreHomeAction(degraded).explanation, /source confidence is insufficient/i);
  assert.doesNotMatch(scoreHomeAction(degraded).explanation, /no missing-context penalty/i);
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
  const router = require('../../src/routes/homeActions.routes.ts').default;
  const { propertyAuthMiddleware } = require('../../src/middleware/propertyAuth.middleware.ts');
  const feed = routeFor(router, '/properties/:propertyId/home-actions', 'get');
  const home = routeFor(router, '/properties/:propertyId/home', 'get');
  const command = routeFor(router, '/properties/:propertyId/home-actions/:actionId/commands', 'post');
  const interaction = routeFor(router, '/properties/:propertyId/home-actions/:actionId/interactions', 'post');
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
  const actionPlan = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/action-plan/page.tsx'),
    'utf8',
  );
  const homeService = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeActions.service.ts'),
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
  assert.doesNotMatch(homeSurface, /suggestedQuestions/);
  assert.doesNotMatch(homeSurface, /home\.contractVersion/);
  assert.match(homeSurface, /Prioritized actions/);
  assert.match(homeSurface, /COVERAGE_CORRECTION_GROUP/);
  assert.match(homeSurface, /CRITICAL_WEATHER/);
  assert.match(homeSurface, /SEASONAL_CHECKLIST/);
  assert.match(homeSurface, /Critical weather/);
  assert.match(homeSurface, /View seasonal checklist/);
  assert.match(homeSurface, /Review coverage gaps/);
  const seasonalCardSource = homeSurface.slice(
    homeSurface.indexOf('export function SeasonalChecklistActionCard'),
    homeSurface.indexOf('export function CoverageCorrectionGroupCard'),
  );
  const genericActionCardSource = homeSurface.slice(
    homeSurface.indexOf('export function ActionCard'),
    homeSurface.indexOf('export function UnifiedHomeSurface'),
  );
  assert.match(seasonalCardSource, /flex flex-wrap items-center gap-2/);
  assert.doesNotMatch(seasonalCardSource, /flex items-start gap-3/);
  assert.doesNotMatch(homeSurface, /Why this priority:/);
  assert.doesNotMatch(genericActionCardSource, /Priority #\{action\.ranking\.rank\}/);
  assert.doesNotMatch(genericActionCardSource, /confidence\.label/);
  assert.match(genericActionCardSource, /Mark done/);
  assert.match(homeSurface, /View full action plan/);
  assert.match(actionPlan, /api\.getHomeActions\(propertyId\)/);
  assert.match(actionPlan, /Ranked actions and supporting details/);
  assert.match(actionPlan, /showSupportingDetails/);
  assert.match(actionPlan, /Open Resolution Center/);
  assert.match(homeService, /\/dashboard\/properties\/\$\{propertyId\}\/action-plan/);
  for (const destination of ['recordHref', 'systemsHref', 'coverageHref', 'workHref']) {
    assert.match(homeSurface, new RegExp(destination));
  }
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
