const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

process.env.GEMINI_API_KEY ||= 'phase2-test-key';

// Home Operations Slice 2: linkWorkItemsAndReconcile resolves a durable work
// item for every work-item-eligible ranked action, then re-collapses the
// list preferring the resolved workKey over the fuzzy canonical-key text
// heuristic that rankAndDeduplicateHomeActions already applied.

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
  exports: { redis: { status: 'ready', eval: async () => [1, 60_000], decr: async () => 0, del: async () => 0 } },
};

// In-memory fake enforcing the same unique constraints as schema.prisma,
// same pattern as tests/unit/homeOperationsResolveWorkItem.test.js.
const workItems = new Map();
const workSources = new Map();
const workEvents = new Map();
let failNextResolve = false;

const prismaMock = {
  operationalWorkItem: {
    findUnique: async ({ where }) => {
      const { propertyId, workKey } = where.propertyId_workKey;
      return [...workItems.values()].find((w) => w.propertyId === propertyId && w.workKey === workKey) ?? null;
    },
    create: async ({ data }) => {
      if (failNextResolve) { failNextResolve = false; throw new Error('simulated DB failure'); }
      // Mirror schema.prisma's @@unique([propertyId, workKey]) — two
      // concurrent creates for the same identity must not both succeed.
      const existing = [...workItems.values()].find((w) => w.propertyId === data.propertyId && w.workKey === data.workKey);
      if (existing) { const err = new Error('Unique constraint failed on propertyId_workKey'); err.code = 'P2002'; throw err; }
      const row = { id: crypto.randomUUID(), state: 'CANDIDATE', acceptanceState: 'PROPOSED', disposition: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      workItems.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = { ...workItems.get(where.id), ...data, updatedAt: new Date() };
      workItems.set(where.id, row);
      return row;
    },
  },
  operationalWorkSource: {
    upsert: async ({ where, create, update }) => {
      const k = where.workItemId_sourceType_sourceEntityId_sourceRole;
      const key = `${k.workItemId}:${k.sourceType}:${k.sourceEntityId}:${k.sourceRole}`;
      const existing = workSources.get(key);
      const row = existing ? { ...existing, ...update } : { id: crypto.randomUUID(), ...create };
      workSources.set(key, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => {
      const key = `${data.workItemId}:${data.idempotencyKey}`;
      if (workEvents.has(key)) { const err = new Error('dup'); err.code = 'P2002'; throw err; }
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
      workEvents.set(key, row);
      return row;
    },
    findUnique: async ({ where }) => {
      const k = where.workItemId_idempotencyKey;
      return workEvents.get(`${k.workItemId}:${k.idempotencyKey}`) ?? null;
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { linkWorkItemsAndReconcile } = require('../../src/services/homeActions.service.ts');

function rankedAction(overrides = {}) {
  return {
    id: 'guidance:journey-1',
    propertyId: 'property-1',
    lineageId: 'lineage-1',
    source: { kind: 'GUIDANCE', entityId: 'journey-1', version: 'v1' },
    priority: 'SOON',
    signal: 'Resolve the HVAC decision',
    whyItMatters: 'The unit needs a repair-or-replace decision.',
    recommendedAction: 'Continue the journey',
    expectedOutcome: 'A clear next step is chosen.',
    timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: '...' },
    confidence: { score: 0.7, label: 'MEDIUM', missing: [] },
    governance: { safetyTier: 'LOW_CONSEQUENCE' },
    ranking: { rank: 1, score: 50, explanation: '...', components: {} },
    deduplication: { canonicalKey: 'signal:resolve-the-hvac-decision', mergedActionIds: [] },
    workItem: null,
    ...overrides,
  };
}

function reset() {
  workItems.clear();
  workSources.clear();
  workEvents.clear();
  failNextResolve = false;
}

test('an eligible action is annotated with a resolved work item', async () => {
  reset();
  const [result] = await linkWorkItemsAndReconcile('property-1', [rankedAction()]);
  assert.ok(result.workItem);
  assert.equal(result.workItem.state, 'CANDIDATE');
  assert.equal(result.workItem.acceptanceState, 'PROPOSED');
  assert.equal(workItems.size, 1);
});

test('an advisory-only action (no adapter) passes through with workItem null, unaffected', async () => {
  reset();
  const action = rankedAction({ id: 'personalization:rec-1', source: { kind: 'PERSONALIZATION', entityId: 'rec-1', version: 'v1' } });
  const [result] = await linkWorkItemsAndReconcile('property-1', [action]);
  assert.equal(result.workItem, null);
  assert.equal(result.deduplication.canonicalKey, action.deduplication.canonicalKey);
  assert.equal(workItems.size, 0);
});

test('a resolution failure does not throw and does not drop the action from the feed', async () => {
  reset();
  failNextResolve = true;
  const [result] = await linkWorkItemsAndReconcile('property-1', [rankedAction()]);
  assert.equal(result.workItem, null);
  assert.equal(result.id, 'guidance:journey-1');
});

test('two differently-worded actions resolving to the same workKey merge into one entry', async () => {
  reset();
  const a = rankedAction({
    id: 'guidance:journey-1',
    signal: 'Resolve the HVAC decision',
    deduplication: { canonicalKey: 'signal:resolve-the-hvac-decision', mergedActionIds: [] },
    ranking: { rank: 1, score: 60, explanation: '...', components: {} },
  });
  const b = rankedAction({
    id: 'incident:journey-1-escalation',
    source: { kind: 'GUIDANCE', entityId: 'journey-1', version: 'v1' },
    signal: 'The HVAC decision needs your attention now',
    deduplication: { canonicalKey: 'signal:the-hvac-decision-needs-your-attention-now', mergedActionIds: [] },
    ranking: { rank: 2, score: 40, explanation: '...', components: {} },
  });

  const results = await linkWorkItemsAndReconcile('property-1', [a, b]);

  assert.equal(results.length, 1, 'both actions share the same GUIDANCE journey-1 obligation and must collapse into one');
  assert.equal(results[0].id, 'guidance:journey-1', 'the higher-scored action wins');
  assert.ok(results[0].deduplication.mergedActionIds.includes('incident:journey-1-escalation'));
  assert.equal(workItems.size, 1, 'only one durable work item should exist for the shared obligation');
});

test('two unrelated eligible actions never merge', async () => {
  reset();
  const a = rankedAction({ id: 'guidance:journey-1', source: { kind: 'GUIDANCE', entityId: 'journey-1', version: 'v1' } });
  const b = rankedAction({ id: 'guidance:journey-2', source: { kind: 'GUIDANCE', entityId: 'journey-2', version: 'v1' }, signal: 'A different decision' });

  const results = await linkWorkItemsAndReconcile('property-1', [a, b]);

  assert.equal(results.length, 2);
  assert.equal(workItems.size, 2);
});
