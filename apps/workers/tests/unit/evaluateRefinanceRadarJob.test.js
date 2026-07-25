const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  evaluateRefinanceRadarForSnapshot,
} = require('../../src/jobs/evaluateRefinanceRadar.job.ts');

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  fatal() {},
  child() { return this; },
};

function profile(overrides) {
  return {
    id: overrides.id,
    propertyId: overrides.propertyId,
    updatedAt: new Date('2026-07-25T12:00:00.000Z'),
    previousRadarState: null,
    lastRateSnapshotId: null,
    ...overrides,
  };
}

test('evaluates complete profiles in pages and reports state transitions and isolated failures', async () => {
  const pages = [
    [
      profile({ id: 'a', propertyId: 'property-open' }),
      profile({
        id: 'b',
        propertyId: 'property-close',
        previousRadarState: 'OPEN',
      }),
    ],
    [
      profile({ id: 'c', propertyId: 'property-fail' }),
    ],
  ];
  const cursors = [];
  const evaluated = [];
  const completedClaims = [];
  const failedClaims = [];

  const result = await evaluateRefinanceRadarForSnapshot(
    'snapshot-1',
    {
      loadEligibleProfiles: async (cursor) => {
        cursors.push(cursor);
        return pages.shift() ?? [];
      },
      acquireEvaluationClaim: async (propertyId) => ({
        claimId: `claim-${propertyId}`,
        leaseToken: `lease-${propertyId}`,
        attempt: 1,
      }),
      completeEvaluationClaim: async (lease) => {
        completedClaims.push(lease.claimId);
        return true;
      },
      failEvaluationClaim: async (lease) => {
        failedClaims.push(lease.claimId);
        return { updated: true, deadLettered: false };
      },
      evaluateProperty: async (propertyId, propertyContextVersion) => {
        evaluated.push({ propertyId, propertyContextVersion });
        if (propertyId === 'property-fail') throw new Error('temporary failure');
        return {
          available: true,
          radarState: propertyId === 'property-open' ? 'OPEN' : 'CLOSED',
        };
      },
      logger: noopLogger,
    },
    { pageSize: 2, concurrency: 2 },
  );

  assert.deepEqual(cursors, [null, 'b']);
  assert.equal(result.examined, 3);
  assert.equal(result.evaluated, 2);
  assert.equal(result.opened, 1);
  assert.equal(result.closed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 0);
  assert.equal(
    evaluated.filter(({ propertyId }) => propertyId === 'property-fail').length,
    3,
    'failed properties should be retried within the same snapshot run',
  );
  assert.match(evaluated[0].propertyContextVersion, /^financing-profile:/);
  assert.deepEqual(completedClaims.sort(), ['claim-property-close', 'claim-property-open']);
  assert.deepEqual(failedClaims, ['claim-property-fail']);
});

test('skips a property when its durable claim is already completed or actively leased', async () => {
  let evaluateCalls = 0;
  let page = 0;

  const result = await evaluateRefinanceRadarForSnapshot(
    'snapshot-1',
    {
      loadEligibleProfiles: async () => {
        page++;
        return page === 1
          ? [profile({
              id: 'a',
              propertyId: 'property-a',
              lastRateSnapshotId: 'snapshot-1',
            })]
          : [];
      },
      acquireEvaluationClaim: async () => null,
      completeEvaluationClaim: async () => true,
      failEvaluationClaim: async () => ({ updated: true, deadLettered: false }),
      evaluateProperty: async () => {
        evaluateCalls++;
        return { available: true, radarState: 'CLOSED' };
      },
      logger: noopLogger,
    },
    { pageSize: 100 },
  );

  assert.equal(evaluateCalls, 0);
  assert.equal(result.examined, 1);
  assert.equal(result.evaluated, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
});

test('retries an existing snapshot when the durable property claim is still available', async () => {
  let page = 0;
  let evaluateCalls = 0;
  let completedClaims = 0;

  const result = await evaluateRefinanceRadarForSnapshot(
    'snapshot-1',
    {
      loadEligibleProfiles: async () => {
        page++;
        return page === 1
          ? [profile({
              id: 'a',
              propertyId: 'property-a',
              lastRateSnapshotId: 'snapshot-1',
            })]
          : [];
      },
      acquireEvaluationClaim: async () => ({
        claimId: 'claim-a',
        leaseToken: 'lease-a',
        attempt: 2,
      }),
      completeEvaluationClaim: async () => {
        completedClaims++;
        return true;
      },
      failEvaluationClaim: async () => ({ updated: true, deadLettered: false }),
      evaluateProperty: async () => {
        evaluateCalls++;
        return { available: true, radarState: 'CLOSED' };
      },
      logger: noopLogger,
    },
  );

  assert.equal(evaluateCalls, 1);
  assert.equal(completedClaims, 1);
  assert.equal(result.evaluated, 1);
  assert.equal(result.skipped, 0);
});

test('dead-letters a property claim after its final durable attempt fails', async () => {
  let page = 0;
  const failures = [];

  const result = await evaluateRefinanceRadarForSnapshot(
    'snapshot-1',
    {
      loadEligibleProfiles: async () => {
        page++;
        return page === 1
          ? [profile({ id: 'a', propertyId: 'property-a' })]
          : [];
      },
      acquireEvaluationClaim: async () => ({
        claimId: 'claim-a',
        leaseToken: 'lease-a',
        attempt: 2,
      }),
      completeEvaluationClaim: async () => true,
      failEvaluationClaim: async (lease, error, maxDurableAttempts) => {
        failures.push({ lease, error, maxDurableAttempts });
        return { updated: true, deadLettered: true };
      },
      evaluateProperty: async () => {
        throw new Error('permanent failure');
      },
      logger: noopLogger,
    },
    { maxAttempts: 1, maxDurableAttempts: 2 },
  );

  assert.equal(result.failed, 1);
  assert.equal(result.deadLettered, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].maxDurableAttempts, 2);
});
