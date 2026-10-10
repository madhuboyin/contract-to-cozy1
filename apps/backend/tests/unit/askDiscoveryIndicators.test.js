const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Explore with Cozy, Phase 3 (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md): the exact owning-domain
// definitions and exclusions. The real dashboard projection, priority-list policy and completeness function run; only the DB-backed
// reads (fatigue suppression, DIY count, the Property Context snapshot) are replaced.
const indicators = require('../../src/services/ask/askDiscoveryIndicators.ts');
const feedback = require('../../src/services/decisionPlatform/homeActionUsefulnessFeedback.service.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyContext = require('../../src/modules/propertyContext/application/getPropertyContext.ts');
const { getContextCompleteness } = require('../../src/modules/propertyContext/application/getContextCompleteness.ts');
const { PROPERTY_RECORD_CONTEXT_SCOPES } = require('../../src/services/propertyRecordOverview.service.ts');
const { DIY_ACTIVE_STATUSES } = require('../../src/services/ask/askOrchestrator.service.ts');
const { buildAskDiscoveryTopics } = require('../../src/services/ask/askDiscoveryTopics.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');

const action = (id, priority, overrides = {}) => ({
  id, priority, state: 'OPEN', workItem: null, evidence: [], recommendedAction: `Do ${id}`,
  governance: { safetyTier: 'STANDARD' }, source: { kind: 'MAINTENANCE' },
  recommendationResponse: { status: 'AVAILABLE', safeNextAction: null }, ...overrides,
});
const coverage = (id, subject) => action(id, 'SOON', { source: { kind: 'GUIDANCE' }, governance: { safetyTier: 'REGULATED_COVERAGE' }, recommendedAction: `Add coverage information for ${subject}` });

test('Home care counts the attention section: NOW and SOON only, never plan-ahead', () => {
  const count = indicators.countAttentionActions([action('a', 'NOW'), action('b', 'SOON'), action('c', 'PLAN'), action('d', 'CONSIDER')]);
  assert.equal(count, 2);
});

test('Home care excludes suppressed, completed, unavailable, stale and watch-only items', () => {
  const actions = [
    action('ok', 'NOW'),
    action('snoozed', 'NOW', { state: 'SNOOZED' }),
    action('deferred-item', 'SOON', { workItem: { state: 'DEFERRED' } }),
    action('fatigue', 'SOON'),
    action('done', 'NOW', { state: 'COMPLETED' }),
    action('verified', 'NOW', { workItem: { state: 'VERIFIED' } }),
    action('unavailable', 'NOW', { recommendationResponse: { status: 'UNAVAILABLE', safeNextAction: null } }),
    action('stale', 'SOON', { evidence: [{ freshness: 'STALE' }] }),
  ];
  assert.equal(indicators.countAttentionActions(actions, new Set(['fatigue'])), 1);
  assert.equal(indicators.countAttentionActions(actions), 2, 'without the fatigue id the fatigue item counts');
});

test('Home care states the real number, not the dashboard\'s three-card cap, and counts a coverage group once', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => action(id, id < 'd' ? 'NOW' : 'SOON'));
  assert.equal(indicators.countAttentionActions(six), 6);
  assert.equal(indicators.countAttentionActions([coverage('c1', 'roof'), coverage('c2', 'furnace'), coverage('c3', 'deck'), action('x', 'NOW')]), 2);
});

test('Home care is zero, not omitted, when nothing needs attention', () => {
  assert.equal(indicators.countAttentionActions([]), 0);
  assert.equal(indicators.countAttentionActions([action('later', 'PLAN')]), 0);
});

const stubSources = ({ diyCount = 2, snapshot, suppressed = new Set() } = {}) => {
  const original = {
    suppressed: feedback.getSuppressedHomeActionIds, context: propertyContext.getPropertyContext, count: prisma.diyProject.count,
  };
  const calls = { context: [], diy: [] };
  feedback.getSuppressedHomeActionIds = async () => suppressed;
  propertyContext.getPropertyContext = async (...args) => { calls.context.push(args); if (snapshot instanceof Error) throw snapshot; return snapshot; };
  prisma.diyProject.count = async (args) => { calls.diy.push(args); if (diyCount instanceof Error) throw diyCount; return diyCount; };
  return { calls, restore: () => { feedback.getSuppressedHomeActionIds = original.suppressed; propertyContext.getPropertyContext = original.context; prisma.diyProject.count = original.count; } };
};
const snapshot = { propertyId: 'p1', contextVersion: 'ctx-1', scopes: ['CORE'], facts: {} };
const feed = (actions) => Promise.resolve({ actions, generatedAt: '2026-10-10T00:00:00.000Z' });

test('each topic reads its owning domain: attention feed, open DIY projects, Property Context completeness over the PROPERTY_SUMMARY scopes', async () => {
  const stub = stubSources({ diyCount: 3, snapshot });
  try {
    const result = await indicators.loadAskDiscoveryIndicators({ userId: 'u1', propertyId: 'p1', feed: feed([action('a', 'NOW'), action('b', 'PLAN')]) });
    assert.deepEqual(result.HOME_CARE, { label: 'need attention', value: 1, sourceVersion: 'home-actions-attention-v1@2026-10-10T00:00:00.000Z', freshness: 'CURRENT' });
    assert.deepEqual(result.DIY_PROJECTS, { label: 'active', value: 3, sourceVersion: 'diy-open-projects-v1', freshness: 'CURRENT' });
    assert.deepEqual(result.HOME_RECORD, { label: 'complete', value: `${getContextCompleteness(snapshot).completenessPercent}%`, sourceVersion: 'ctx-1', freshness: 'CURRENT' });
    assert.deepEqual(stub.calls.context[0].slice(0, 3), ['p1', { userId: 'u1' }, { scopes: PROPERTY_RECORD_CONTEXT_SCOPES }]);
  } finally { stub.restore(); }
});

test('DIY counts exactly the open set the DIY projects card lists, for this home only', async () => {
  const stub = stubSources({ snapshot });
  try {
    await indicators.loadAskDiscoveryIndicators({ userId: 'u1', propertyId: 'p1', feed: feed([]) });
    assert.deepEqual(stub.calls.diy[0], { where: { propertyId: 'p1', status: { in: ['PLANNING', 'IN_PROGRESS'] } } });
    assert.deepEqual(stub.calls.diy[0].where.status.in, DIY_ACTIVE_STATUSES);
  } finally { stub.restore(); }
});

test('one failing source omits only its own indicator', async () => {
  for (const [broken, expected] of [
    ['feed', { HOME_CARE: false, DIY_PROJECTS: true, HOME_RECORD: true }],
    ['diy', { HOME_CARE: true, DIY_PROJECTS: false, HOME_RECORD: true }],
    ['context', { HOME_CARE: true, DIY_PROJECTS: true, HOME_RECORD: false }],
  ]) {
    const stub = stubSources({ diyCount: broken === 'diy' ? new Error('db') : 1, snapshot: broken === 'context' ? new Error('denied') : snapshot });
    try {
      const result = await indicators.loadAskDiscoveryIndicators({ userId: 'u1', propertyId: 'p1', feed: broken === 'feed' ? Promise.reject(new Error('feed down')) : feed([]) });
      assert.deepEqual(Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value !== null])), expected, broken);
    } finally { stub.restore(); }
  }
});

test('fatigue lookup failure omits the Home care indicator rather than overstating it', async () => {
  const stub = stubSources({ snapshot });
  feedback.getSuppressedHomeActionIds = async () => { throw new Error('lookup failed'); };
  try {
    const result = await indicators.loadAskDiscoveryIndicators({ userId: 'u1', propertyId: 'p1', feed: feed([action('a', 'NOW')]) });
    assert.equal(result.HOME_CARE, null);
    assert.notEqual(result.DIY_PROJECTS, null);
  } finally { stub.restore(); }
});

test('the projection attaches an indicator to its topic, and a missing one leaves the topic and its starters intact', () => {
  const indicator = { label: 'active', value: 2, sourceVersion: 'v', freshness: 'CURRENT' };
  const topics = buildAskDiscoveryTopics({
    controls: readAskOperationalControls(), householdRole: 'OWNER', operatingMode: 'UNKNOWN', propertyId: 'p1',
    indicators: { DIY_PROJECTS: indicator, HOME_CARE: null },
  });
  assert.deepEqual(topics.map((t) => [t.id, t.indicator]), [['HOME_CARE', null], ['DIY_PROJECTS', indicator], ['HOME_RECORD', null]]);
  assert.ok(topics.every((t) => t.starters.length > 0));
});
