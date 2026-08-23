const test = require('node:test');
const assert = require('node:assert/strict');

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

const { adaptOrchestratedActionToHomeAction } = require('../../src/services/orchestration.service.ts');

function coverageGapAction(overrides = {}) {
  return {
    id: 'coverage-gap:property-1:dishwasher-item',
    actionKey: 'COVERAGE_GAP::dishwasher-item',
    source: 'RISK',
    propertyId: 'property-1',
    title: 'No coverage for Dishwasher (Kitchen)',
    description: 'No warranty or insurance coverage found',
    systemType: 'APPLIANCE',
    category: 'APPLIANCE',
    riskLevel: 'HIGH',
    exposure: 1200,
    coverage: { hasCoverage: false, type: 'NONE', expiresOn: null },
    confidence: { score: 0.9, level: 'HIGH', explanation: [] },
    priority: 85,
    cta: { show: true, label: 'Get insurance quotes', reason: 'ACTION_REQUIRED' },
    suppression: { suppressed: false, reasons: [] },
    signalSources: [],
    primarySignalSource: null,
    relatedEntity: { type: 'INVENTORY_ITEM', id: 'dishwasher-item' },
    overdue: false,
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
    ...overrides,
  };
}

test('without a coverage analysis, behavior is unchanged from today (LOW_CONSEQUENCE, empty decision fields)', () => {
  const action = adaptOrchestratedActionToHomeAction(coverageGapAction());

  assert.equal(action.source.kind, 'COVERAGE');
  assert.equal(action.governance.safetyTier, 'LOW_CONSEQUENCE');
  assert.deepEqual(action.assumptions, []);
  assert.deepEqual(action.options, []);
  assert.deepEqual(action.tradeoffs, []);
  assert.equal(action.evidence.length, 1);
});

test('with a saved coverage analysis, the action elevates to MATERIAL_FINANCIAL with valid decision fields', () => {
  const action = adaptOrchestratedActionToHomeAction(
    coverageGapAction(),
    new Date('2026-08-23T12:00:00.000Z'),
    { id: 'analysis-1', confidence: 'HIGH', computedAt: new Date('2026-08-01T00:00:00.000Z') },
  );

  assert.equal(action.governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(action.governance.professionalBoundary, 'Modeled cost comparison only; verify controlling contract terms before deciding.');
  assert.equal(action.assumptions.length, 1);
  assert.equal(action.options.length, 2);
  assert.equal(action.options.find((o) => o.id === 'add-protection').recommended, true);
  assert.equal(action.tradeoffs.length, 2);
  assert.equal(action.evidence.length, 2);
  assert.equal(action.evidence[1].id, 'coverage-analysis:analysis-1');
  assert.match(action.tradeoffs.find((t) => t.optionId === 'add-protection').summary, /\$1,200/);
});

test('a non-coverage action is unaffected by the new parameter', () => {
  const action = adaptOrchestratedActionToHomeAction(
    {
      id: 'risk-water-heater',
      actionKey: 'risk:water-heater',
      source: 'RISK',
      propertyId: 'property-1',
      title: 'Water Heater',
      description: null,
      systemType: 'WATER_HEATER',
      category: 'SYSTEMS',
      riskLevel: 'MODERATE',
      exposure: null,
      coverage: { hasCoverage: true, type: 'WARRANTY', expiresOn: null },
      confidence: { score: 0.7, level: 'MEDIUM', explanation: [] },
      priority: 40,
      cta: { show: true, label: 'Schedule service', reason: 'ACTION_REQUIRED' },
      suppression: { suppressed: false, reasons: [] },
      signalSources: [],
      primarySignalSource: null,
      relatedEntity: null,
      overdue: false,
      createdAt: new Date('2026-07-01T12:00:00.000Z'),
    },
    undefined,
    { id: 'irrelevant-analysis', confidence: 'HIGH', computedAt: new Date() },
  );

  assert.equal(action.source.kind, 'SYSTEM');
  assert.equal(action.governance.safetyTier, 'LOW_CONSEQUENCE');
  assert.deepEqual(action.options, []);
});

test('the coverage-gap fixture still schema-validates end to end (superRefine gate) with an analysis present', () => {
  const { HomeActionSchema } = require('../../src/productFramework/homeAction.contract.ts');
  const action = adaptOrchestratedActionToHomeAction(
    coverageGapAction(),
    new Date('2026-08-23T12:00:00.000Z'),
    { id: 'analysis-2', confidence: 'MEDIUM', computedAt: new Date('2026-08-01T00:00:00.000Z') },
  );

  assert.doesNotThrow(() => HomeActionSchema.parse(action));
});
