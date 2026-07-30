const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

process.env.GEMINI_API_KEY ||= 'phase2-test-key';

// Home Operations Item #12 (§5.16): computeHomeActionEmptyStateReason is a
// pure, synchronous decision function, but it lives in homeActions.service.ts
// alongside heavy I/O-bound code, so importing the module still needs the
// same minimal ioredis/redis/prisma stand-ins as
// homeActionFeedWorkItemLinking.test.js just to let the module load.

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
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: {} },
};

const { computeHomeActionEmptyStateReason } = require('../../src/services/homeActions.service.ts');

function baseInput(overrides = {}) {
  return {
    surfacedCount: 0,
    candidateCount: 0,
    personalizationStatus: 'AVAILABLE',
    derivedFrom: { riskAssessment: true, checklist: true },
    contextCompletenessPercent: 100,
    hasEverAcceptedWork: true,
    ...overrides,
  };
}

test('a non-empty feed never gets a reason, regardless of other inputs', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({
      surfacedCount: 1,
      personalizationStatus: 'FAILED',
      hasEverAcceptedWork: false,
    })),
    null,
  );
});

test('DATA_UNAVAILABLE when personalization materialization failed', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({ personalizationStatus: 'FAILED' })),
    'DATA_UNAVAILABLE',
  );
});

test('DATA_UNAVAILABLE wins over every other condition, including no accepted work', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({
      personalizationStatus: 'FAILED',
      hasEverAcceptedWork: false,
      derivedFrom: { riskAssessment: false, checklist: false },
      contextCompletenessPercent: 0,
    })),
    'DATA_UNAVAILABLE',
  );
});

test('RECOMMENDATIONS_PAUSED when the personalization kill-switch is on', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({ personalizationStatus: 'PAUSED' })),
    'RECOMMENDATIONS_PAUSED',
  );
});

test('SOURCE_EVALUATION_PENDING when nothing has ever been evaluated for this property', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({
      candidateCount: 0,
      derivedFrom: { riskAssessment: false, checklist: false },
    })),
    'SOURCE_EVALUATION_PENDING',
  );
});

test('SOURCE_EVALUATION_PENDING requires candidateCount === 0 too — a risk report with zero current candidates is not "pending"', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({
      candidateCount: 3,
      derivedFrom: { riskAssessment: false, checklist: false },
      hasEverAcceptedWork: false,
    })),
    'NO_ACCEPTED_WORK',
  );
});

test('SOURCE_EVALUATION_PENDING wins over MISSING_FACTS when nothing has ever been evaluated', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({
      candidateCount: 0,
      derivedFrom: { riskAssessment: false, checklist: false },
      contextCompletenessPercent: 0,
    })),
    'SOURCE_EVALUATION_PENDING',
  );
});

test('either derivedFrom source having run is enough to skip SOURCE_EVALUATION_PENDING', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({
      candidateCount: 0,
      derivedFrom: { riskAssessment: true, checklist: false },
    })),
    'ALL_CAUGHT_UP',
  );
});

test('MISSING_FACTS when context completeness is below the threshold', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({ contextCompletenessPercent: 25 })),
    'MISSING_FACTS',
  );
});

test('completeness exactly at the threshold does not count as missing facts', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({ contextCompletenessPercent: 50 })),
    'ALL_CAUGHT_UP',
  );
});

test('a null completeness (context unavailable) does not trigger MISSING_FACTS', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({ contextCompletenessPercent: null })),
    'ALL_CAUGHT_UP',
  );
});

test('MISSING_FACTS wins over NO_ACCEPTED_WORK', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({
      contextCompletenessPercent: 10,
      hasEverAcceptedWork: false,
    })),
    'MISSING_FACTS',
  );
});

test('NO_ACCEPTED_WORK when recommendations exist but nothing has ever been accepted', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput({ hasEverAcceptedWork: false })),
    'NO_ACCEPTED_WORK',
  );
});

test('ALL_CAUGHT_UP is the true fallback: evaluated, complete facts, has accepted work before', () => {
  assert.equal(
    computeHomeActionEmptyStateReason(baseInput()),
    'ALL_CAUGHT_UP',
  );
});
