// apps/workers/tests/unit/sharedDataSignalAuditJobs.test.js
//
// W4 item 4: runSharedDataConsistencyAuditJob and runSharedSignalHealthAuditJob
// had no dedicated test. Both are thin, read-only pass-through wrappers
// around services — the real logic lives in those services (out of scope
// here) — so coverage focuses on the env-driven limit/lookback parsing and
// the return-shape mapping, which is these jobs' only real content.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runSharedDataConsistencyAuditJob } = require('../../src/jobs/sharedDataConsistencyAudit.job.ts');
const { runSharedSignalHealthAuditJob } = require('../../src/jobs/sharedSignalHealthAudit.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function withEnv(overrides, fn) {
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const key of Object.keys(originals)) {
        if (originals[key] === undefined) delete process.env[key];
        else process.env[key] = originals[key];
      }
    }
  })();
}

function consistencyDeps({ consistency, readiness }) {
  const calls = { consistencyArgs: null, readinessArgs: null };
  const deps = {
    sharedDataBackfillService: {
      getConsistencyReport: async (args) => {
        calls.consistencyArgs = args;
        return consistency;
      },
      getReadinessReport: async (args) => {
        calls.readinessArgs = args;
        return readiness;
      },
    },
    logger: noopLogger,
  };
  return { deps, calls };
}

function healthAuditDeps({ overview }) {
  const calls = { overviewArgs: null };
  const deps = {
    signalService: {
      getSignalHealthOverview: async (args) => {
        calls.overviewArgs = args;
        return overview;
      },
    },
    logger: noopLogger,
  };
  return { deps, calls };
}

test('consistency audit: maps both reports into a flat summary', async () => {
  const { deps } = consistencyDeps({
    consistency: { propertiesEvaluated: 10, issueCount: 2 },
    readiness: { summary: { ready: 7, partial: 2, legacyHeavy: 1 } },
  });

  const result = await runSharedDataConsistencyAuditJob(deps);

  assert.deepEqual(result, {
    propertiesEvaluated: 10,
    issueCount: 2,
    readyProperties: 7,
    partialProperties: 2,
    legacyHeavyProperties: 1,
  });
});

test('consistency audit: SHARED_DATA_AUDIT_LIMIT is passed through when set and valid', async () => {
  await withEnv({ SHARED_DATA_AUDIT_LIMIT: '50' }, async () => {
    const { deps, calls } = consistencyDeps({
      consistency: { propertiesEvaluated: 0, issueCount: 0 },
      readiness: { summary: { ready: 0, partial: 0, legacyHeavy: 0 } },
    });

    await runSharedDataConsistencyAuditJob(deps);

    assert.equal(calls.consistencyArgs.limit, 50);
    assert.equal(calls.readinessArgs.limit, 50);
  });
});

test('consistency audit: an unset/invalid limit is passed through as undefined (no artificial cap)', async () => {
  await withEnv({ SHARED_DATA_AUDIT_LIMIT: undefined }, async () => {
    const { deps, calls } = consistencyDeps({
      consistency: { propertiesEvaluated: 0, issueCount: 0 },
      readiness: { summary: { ready: 0, partial: 0, legacyHeavy: 0 } },
    });

    await runSharedDataConsistencyAuditJob(deps);

    assert.equal(calls.consistencyArgs.limit, undefined);
  });
});

test('signal health audit: maps the overview into a flat summary', async () => {
  const { deps } = healthAuditDeps({
    overview: {
      propertiesEvaluated: 5,
      totals: { totalSignals: 20, staleSignals: 3, lowConfidenceSignals: 2, interactionSignals: 1 },
    },
  });

  const result = await runSharedSignalHealthAuditJob(deps);

  assert.deepEqual(result, {
    propertiesEvaluated: 5,
    totalSignals: 20,
    staleSignals: 3,
    lowConfidenceSignals: 2,
    interactionSignals: 1,
  });
});

test('signal health audit: defaults limit and lookbackDays to 120 when unset', async () => {
  await withEnv({ SHARED_SIGNAL_AUDIT_LIMIT: undefined, SHARED_SIGNAL_AUDIT_LOOKBACK_DAYS: undefined }, async () => {
    const { deps, calls } = healthAuditDeps({
      overview: { propertiesEvaluated: 0, totals: { totalSignals: 0, staleSignals: 0, lowConfidenceSignals: 0, interactionSignals: 0 } },
    });

    await runSharedSignalHealthAuditJob(deps);

    assert.equal(calls.overviewArgs.limit, 120);
    assert.equal(calls.overviewArgs.lookbackDays, 120);
  });
});

test('signal health audit: honors custom limit and lookbackDays', async () => {
  await withEnv({ SHARED_SIGNAL_AUDIT_LIMIT: '30', SHARED_SIGNAL_AUDIT_LOOKBACK_DAYS: '60' }, async () => {
    const { deps, calls } = healthAuditDeps({
      overview: { propertiesEvaluated: 0, totals: { totalSignals: 0, staleSignals: 0, lowConfidenceSignals: 0, interactionSignals: 0 } },
    });

    await runSharedSignalHealthAuditJob(deps);

    assert.equal(calls.overviewArgs.limit, 30);
    assert.equal(calls.overviewArgs.lookbackDays, 60);
  });
});
