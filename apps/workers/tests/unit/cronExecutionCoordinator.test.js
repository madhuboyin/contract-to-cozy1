// apps/workers/tests/unit/cronExecutionCoordinator.test.js
//
// WKR-007: runWithCronLease() is the single place both the scheduled-tick
// path and the manual cron-trigger-queue path in worker.ts acquire/renew/
// release the cron lease. Covers: skip-without-calling-fn when the lease is
// held, release-on-both-success-and-throw, the per-job TTL override env var,
// and that the lease is actually renewed (not just held once) for a run
// that outlives the TTL.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadCoordinator({ acquireImpl, renewImpl, releaseImpl } = {}) {
  const calls = { acquire: [], renew: [], release: [] };

  const cronLeasePath = require.resolve('../../src/lib/cronLease.ts');
  require.cache[cronLeasePath] = {
    id: cronLeasePath,
    filename: cronLeasePath,
    loaded: true,
    exports: {
      acquireCronLease: async (jobKey, ttlMs) => {
        calls.acquire.push({ jobKey, ttlMs });
        return acquireImpl ? acquireImpl(jobKey, ttlMs) : true;
      },
      renewCronLease: async (jobKey, ttlMs) => {
        calls.renew.push({ jobKey, ttlMs });
        return renewImpl ? renewImpl(jobKey, ttlMs) : true;
      },
      releaseCronLease: async (jobKey) => {
        calls.release.push({ jobKey });
        if (releaseImpl) return releaseImpl(jobKey);
      },
    },
  };

  const policyPath = require.resolve('../../../backend/src/config/workerExecutionPolicy.ts');
  require.cache[policyPath] = {
    id: policyPath,
    filename: policyPath,
    loaded: true,
    exports: {
      normalizeJobEnvKey: (jobKey) => `WORKER_JOB_${jobKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_ENABLED`,
      legacyJobEnvKeys: (jobKey, suffix) =>
        jobKey === 'home-briefing-delivery'
          ? [`WORKER_JOB_HOME_GAZETTE_GENERATION_${suffix}`]
          : [],
    },
  };

  const modulePath = require.resolve('../../src/lib/cronExecutionCoordinator.ts');
  delete require.cache[modulePath];
  return { ...require(modulePath), calls };
}

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

test('runs fn and releases the lease when the lease is acquired', async () => {
  const { runWithCronLease, calls } = loadCoordinator();
  let fnCalled = false;

  const outcome = await runWithCronLease('freeze-risk-incidents', async () => {
    fnCalled = true;
    return { examined: 1 };
  });

  assert.equal(fnCalled, true);
  assert.equal(outcome.status, 'ran');
  assert.deepEqual(outcome.result, { examined: 1 });
  assert.equal(calls.release.length, 1);
  assert.equal(calls.release[0].jobKey, 'freeze-risk-incidents');
});

test('skips without calling fn when another replica/run holds the lease', async () => {
  const { runWithCronLease, calls } = loadCoordinator({ acquireImpl: () => false });
  let fnCalled = false;

  const outcome = await runWithCronLease('severe-weather-alerts', async () => {
    fnCalled = true;
  });

  assert.equal(fnCalled, false);
  assert.equal(outcome.status, 'skipped');
  assert.match(outcome.reason, /lease held/);
  assert.equal(calls.release.length, 0, 'must never release a lease it never acquired');
});

test('releases the lease even when fn throws, and the rejection propagates to the caller', async () => {
  const { runWithCronLease, calls } = loadCoordinator();

  await assert.rejects(
    () =>
      runWithCronLease('home-briefing-delivery', async () => {
        throw new Error('boom');
      }),
    /boom/,
  );

  assert.equal(calls.release.length, 1);
  assert.equal(calls.release[0].jobKey, 'home-briefing-delivery');
});

test('uses the default TTL when no per-job override is set', async () => {
  const { runWithCronLease, calls } = loadCoordinator();

  await runWithCronLease('freeze-risk-incidents', async () => {});

  assert.equal(calls.acquire[0].ttlMs, 10 * 60 * 1000);
});

test('a per-job WORKER_JOB_<KEY>_LEASE_TTL_MS override wins over the default', async () => {
  await withEnv({ WORKER_JOB_HOME_BRIEFING_DELIVERY_LEASE_TTL_MS: '90000' }, async () => {
    const { runWithCronLease, calls } = loadCoordinator();

    await runWithCronLease('home-briefing-delivery', async () => {});

    assert.equal(calls.acquire[0].ttlMs, 90_000);
  });
});

test('a malformed per-job TTL override falls back to the default instead of a NaN/zero TTL', async () => {
  await withEnv({ WORKER_JOB_HOME_BRIEFING_DELIVERY_LEASE_TTL_MS: 'not-a-number' }, async () => {
    const { runWithCronLease, calls } = loadCoordinator();

    await runWithCronLease('home-briefing-delivery', async () => {});

    assert.equal(calls.acquire[0].ttlMs, 10 * 60 * 1000);
  });
});

test('legacy Gazette lease TTL remains a bounded fallback during scheduler migration', async () => {
  await withEnv({ WORKER_JOB_HOME_GAZETTE_GENERATION_LEASE_TTL_MS: '75000' }, async () => {
    const { runWithCronLease, calls } = loadCoordinator();

    await runWithCronLease('home-briefing-delivery', async () => {});

    assert.equal(calls.acquire[0].ttlMs, 75_000);
  });
});

test('renews the lease at least once during a run that outlives one renewal interval', async () => {
  // Renewal interval is max(1000ms, 40% of TTL) — a 3s TTL gives a 1.2s
  // renewal interval; waiting comfortably past it (not right at the
  // boundary) avoids a flaky single-tick timing miss.
  await withEnv({ CRON_LEASE_TTL_MS: '3000' }, async () => {
    const { runWithCronLease, calls } = loadCoordinator();

    await runWithCronLease('freeze-risk-incidents', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1400));
    });

    assert.ok(calls.renew.length >= 1, `expected at least one renewal, got ${calls.renew.length}`);
    assert.equal(calls.renew[0].jobKey, 'freeze-risk-incidents');
  });
});

test('logs a warning but does not throw when a renewal fails (lease already lost)', async () => {
  await withEnv({ CRON_LEASE_TTL_MS: '3000' }, async () => {
    const { runWithCronLease } = loadCoordinator({ renewImpl: () => false });

    const outcome = await runWithCronLease('freeze-risk-incidents', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1400));
      return { examined: 1 };
    });

    assert.equal(outcome.status, 'ran');
  });
});
