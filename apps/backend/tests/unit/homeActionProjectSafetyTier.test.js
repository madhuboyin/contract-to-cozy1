const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

process.env.GEMINI_API_KEY ||= 'phase2-test-key';

// Home Operations Slice 0: loadProjectActions used to apply a flat
// lowConsequenceGovernance() to every project regardless of open safety
// issues, failed safety checks, or funding/contract value. This exercises
// the real per-instance derivation end to end through getPromotedHomeActions
// (including the HomeActionSchema.parse() the loader runs through), so a
// regression that fails schema validation (missing ESCALATE cta, empty
// assumptions/options/tradeoffs for a material tier) throws here instead of
// only at request time.

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
    redis: { status: 'ready', eval: async () => [1, 60_000], decr: async () => 0, del: async () => 0 },
  },
};

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const BASE_PROJECT = {
  id: 'project-1',
  propertyId: 'property-1',
  name: 'Kitchen remodel',
  description: 'Full kitchen remodel',
  status: 'IN_PROGRESS',
  guidanceJourneyId: null,
  startDate: new Date('2026-01-01'),
  expectedEndDate: new Date('2026-03-01'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-15'),
  safetyCheckResult: 'NOT_REQUIRED',
  fundingMode: 'SELF_PAID',
  contractAmountCents: null,
  paidToDateCents: null,
  milestones: [{ id: 'm1', name: 'Demo complete', status: 'IN_PROGRESS', position: 0 }],
  issues: [],
};

function emptyDb(projectOverrides) {
  return {
    guidanceJourney: { findMany: async () => [] },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [{ ...BASE_PROJECT, ...projectOverrides }] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
  };
}

test('a plain self-paid project with no issues is LOW_CONSEQUENCE and offers no COMPLETE control', async () => {
  const { actions } = await getPromotedHomeActions('property-1', emptyDb({}), { includePersonalization: false });
  const action = actions.find((a) => a.source.kind === 'PROJECT');
  assert.ok(action, 'expected a promoted project action');
  assert.equal(action.governance.safetyTier, 'LOW_CONSEQUENCE');
  assert.ok(!action.feedbackControls.includes('COMPLETE'));
  assert.ok(!action.feedbackControls.includes('ALREADY_DONE'));
  assert.ok(action.feedbackControls.includes('ACKNOWLEDGE'));
});

test('an open SAFETY issue escalates the project to SAFETY_EMERGENCY with an ESCALATE CTA', async () => {
  const db = emptyDb({
    issues: [{ id: 'issue-1', category: 'SAFETY', severity: 'MAJOR', status: 'OPEN', description: 'Exposed wiring', createdAt: new Date() }],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { includePersonalization: false });
  const action = actions.find((a) => a.source.kind === 'PROJECT');
  assert.equal(action.governance.safetyTier, 'SAFETY_EMERGENCY');
  assert.equal(action.priority, 'NOW');
  assert.equal(action.primaryCta.kind, 'ESCALATE');
  assert.ok(!action.feedbackControls.includes('COMPLETE'));
});

test('a failed safety check escalates to SAFETY_EMERGENCY even with no open issue', async () => {
  const db = emptyDb({ safetyCheckResult: 'FAILED' });
  const { actions } = await getPromotedHomeActions('property-1', db, { includePersonalization: false });
  const action = actions.find((a) => a.source.kind === 'PROJECT');
  assert.equal(action.governance.safetyTier, 'SAFETY_EMERGENCY');
});

test('a signed contract makes the project MATERIAL_FINANCIAL, not REGULATED_COVERAGE (no jurisdiction check exists to back that tier)', async () => {
  const db = emptyDb({ contractAmountCents: 500_000 });
  const { actions } = await getPromotedHomeActions('property-1', db, { includePersonalization: false });
  const action = actions.find((a) => a.source.kind === 'PROJECT');
  assert.equal(action.governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.ok(action.assumptions.length > 0);
  assert.ok(action.options.length >= 2);
  assert.ok(action.tradeoffs.length > 0);
});

test('coverage-dependent funding also elevates to MATERIAL_FINANCIAL', async () => {
  const db = emptyDb({ fundingMode: 'COVERED' });
  const { actions } = await getPromotedHomeActions('property-1', db, { includePersonalization: false });
  const action = actions.find((a) => a.source.kind === 'PROJECT');
  assert.equal(action.governance.safetyTier, 'MATERIAL_FINANCIAL');
});
