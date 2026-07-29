const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  classifySavingsBenefitsSource,
  savingsBenefitsSourceHealthAuditJob,
} = require('../../src/jobs/savingsBenefitsSourceHealthAudit.job.ts');

const NOW = new Date('2026-07-29T12:00:00.000Z');
const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  fatal() {},
  child() { return this; },
};

test('classifies current, overdue, and unreviewed sources without treating null review as fresh', () => {
  assert.equal(classifySavingsBenefitsSource({
    id: 'fresh',
    name: 'Fresh',
    status: 'ACTIVE',
    lastReviewedAt: new Date('2026-07-20T12:00:00.000Z'),
    reviewSlaDays: 30,
  }, NOW).health, 'HEALTHY');

  const overdue = classifySavingsBenefitsSource({
    id: 'stale',
    name: 'Stale',
    status: 'ACTIVE',
    lastReviewedAt: new Date('2026-06-01T12:00:00.000Z'),
    reviewSlaDays: 30,
  }, NOW);
  assert.equal(overdue.health, 'DEGRADED');
  assert.ok(overdue.overdueSeconds > 0);

  assert.equal(classifySavingsBenefitsSource({
    id: 'unreviewed',
    name: 'Unreviewed',
    status: 'ACTIVE',
    lastReviewedAt: null,
    reviewSlaDays: 30,
  }, NOW).health, 'CRITICAL');
});

test('publishes bounded health counts and oldest SLA breach', async () => {
  const values = new Map();
  let resetCount = 0;
  let oldestOverdueSeconds = null;
  const rows = [
    {
      id: 'fresh',
      name: 'Fresh',
      status: 'ACTIVE',
      lastReviewedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      reviewSlaDays: 30,
    },
    {
      id: 'overdue',
      name: 'Overdue',
      status: 'ACTIVE',
      lastReviewedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      reviewSlaDays: 30,
    },
    {
      id: 'unreviewed',
      name: 'Unreviewed',
      status: 'ACTIVE',
      lastReviewedAt: null,
      reviewSlaDays: 30,
    },
  ];

  const result = await savingsBenefitsSourceHealthAuditJob(undefined, {
    prisma: { hiddenAssetSource: { findMany: async () => rows } },
    logger: noopLogger,
    metrics: {
      resetSources() { resetCount += 1; },
      setSources(health, value) { values.set(health, value); },
      setOldestOverdueSeconds(value) { oldestOverdueSeconds = value; },
    },
  });

  assert.equal(resetCount, 1);
  assert.deepEqual(Object.fromEntries(values), {
    HEALTHY: 1,
    DEGRADED: 1,
    CRITICAL: 1,
  });
  assert.ok(oldestOverdueSeconds > 0);
  assert.equal(result.examined, 3);
  assert.equal(result.failed, 0);
  assert.match(result.reason, /1 critical and 1 overdue/);
});
