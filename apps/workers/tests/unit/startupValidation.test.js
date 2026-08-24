// apps/workers/tests/unit/startupValidation.test.js
//
// W5 item 6: nothing previously verified that a required external
// dependency (database, Redis, and — gated on which jobs are currently
// enabled — SMTP/S3/Gemini) was actually reachable/configured before the
// worker started accepting jobs. Covers the gating logic (a capability's
// check is only "required" when a job that needs it is actually enabled
// per evaluateWorkerExecution) and the production-only hard-fail
// convention already used elsewhere in worker.ts.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

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

function freshModule() {
  const modPath = require.resolve('../../src/lib/startupValidation.ts');
  delete require.cache[modPath];
  return require(modPath);
}

// Baseline: no group flags overridden, only beta defaults in effect —
// WORKER_AUTOMATION_ENABLED=true, WORKER_OUTBOUND_NOTIFICATIONS_ENABLED=false,
// WORKER_EXTERNAL_INGEST_ENABLED=false, WORKER_MUTATING_SWEEPS_ENABLED=false,
// WORKER_MANUAL_TRIGGERS_ENABLED=true (see workerExecutionPolicy.ts).
const CLEAR_FLAGS = {
  WORKER_AUTOMATION_ENABLED: undefined,
  WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: undefined,
  WORKER_EXTERNAL_INGEST_ENABLED: undefined,
  WORKER_MUTATING_SWEEPS_ENABLED: undefined,
  WORKER_MANUAL_TRIGGERS_ENABLED: undefined,
  NODE_ENV: 'test',
  SMTP_HOST: undefined,
  SMTP_PASS: undefined,
  WEB_PUSH_DELIVERY_ENABLED: undefined,
  WEB_PUSH_VAPID_SUBJECT: undefined,
  WEB_PUSH_VAPID_PUBLIC_KEY: undefined,
  WEB_PUSH_VAPID_PRIVATE_KEY: undefined,
  REFINANCE_EXTERNAL_ALERTS_ENABLED: undefined,
  REFINANCE_PUSH_ALERTS_ENABLED: undefined,
  REFINANCE_ALERT_ROLLOUT_MODE: undefined,
  REFINANCE_ALERT_RECIPIENT_EMAIL_ALLOWLIST: undefined,
  S3_BUCKET: undefined,
  GEMINI_API_KEY: undefined,
};

test('worker intelligence registry validation fails before processing invalid mappings', () => {
  const { assertValidWorkerIntelligenceRegistries } = freshModule();
  assert.doesNotThrow(() => assertValidWorkerIntelligenceRegistries(() => []));
  assert.throws(
    () => assertValidWorkerIntelligenceRegistries(() => ['duplicate consumer owner']),
    /Home Intelligence registry validation failed in worker: duplicate consumer owner/,
  );
});

test('database and redis are always required, regardless of job flags', async () => {
  await withEnv(CLEAR_FLAGS, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });

    const db = results.find((r) => r.name === 'database');
    const redis = results.find((r) => r.name === 'redis');
    assert.equal(db.required, true);
    assert.equal(db.ok, true);
    assert.equal(redis.required, true);
    assert.equal(redis.ok, true);
  });
});

test('a failing database check is reported as a failure', async () => {
  await withEnv(CLEAR_FLAGS, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {
        throw new Error('connection refused');
      },
      checkRedisConnectivity: async () => {},
    });

    const db = results.find((r) => r.name === 'database');
    assert.equal(db.ok, false);
    assert.match(db.detail, /connection refused/);
  });
});

test('smtp is not required when no OUTBOUND job is enabled (beta default)', async () => {
  await withEnv(CLEAR_FLAGS, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });

    const smtp = results.find((r) => r.name === 'smtp');
    assert.equal(smtp.required, false);
    assert.equal(smtp.ok, true);
  });
});

test('smtp becomes required once WORKER_OUTBOUND_NOTIFICATIONS_ENABLED=true, and fails when unconfigured', async () => {
  await withEnv({ ...CLEAR_FLAGS, WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true' }, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });

    const smtp = results.find((r) => r.name === 'smtp');
    assert.equal(smtp.required, true);
    assert.equal(smtp.ok, false);
    assert.match(smtp.detail, /SMTP_HOST and SMTP_PASS/);
  });
});

test('smtp passes once SMTP_HOST and SMTP_PASS are set and the OUTBOUND group is enabled', async () => {
  await withEnv(
    { ...CLEAR_FLAGS, WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true', SMTP_HOST: 'smtp.example.com', SMTP_PASS: 'secret' },
    async () => {
      const { validateStartupDependencies } = freshModule();
      const results = await validateStartupDependencies({
        checkDatabaseConnectivity: async () => {},
        checkRedisConnectivity: async () => {},
      });

      const smtp = results.find((r) => r.name === 'smtp');
      assert.equal(smtp.required, true);
      assert.equal(smtp.ok, true);
    },
  );
});

test('web push fails closed when enabled without complete VAPID configuration', async () => {
  await withEnv(
    { ...CLEAR_FLAGS, WEB_PUSH_DELIVERY_ENABLED: 'true' },
    async () => {
      const { validateStartupDependencies } = freshModule();
      const results = await validateStartupDependencies({
        checkDatabaseConnectivity: async () => {},
        checkRedisConnectivity: async () => {},
      });
      const push = results.find((result) => result.name === 'web-push');
      assert.equal(push.required, true);
      assert.equal(push.ok, false);
      assert.match(push.detail, /WEB_PUSH_VAPID_SUBJECT/);
    },
  );
});

test('web push startup validation passes with complete VAPID configuration', async () => {
  await withEnv(
    {
      ...CLEAR_FLAGS,
      WEB_PUSH_DELIVERY_ENABLED: 'true',
      WEB_PUSH_VAPID_SUBJECT: 'mailto:operations@example.com',
      WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key',
      WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key',
    },
    async () => {
      const { validateStartupDependencies } = freshModule();
      const results = await validateStartupDependencies({
        checkDatabaseConnectivity: async () => {},
        checkRedisConnectivity: async () => {},
      });
      const push = results.find((result) => result.name === 'web-push');
      assert.equal(push.required, true);
      assert.equal(push.ok, true);
    },
  );
});

test('refinance external delivery requires a recipient in default ALLOWLIST mode', async () => {
  await withEnv(
    {
      ...CLEAR_FLAGS,
      REFINANCE_EXTERNAL_ALERTS_ENABLED: 'true',
    },
    async () => {
      const { validateStartupDependencies } = freshModule();
      const results = await validateStartupDependencies({
        checkDatabaseConnectivity: async () => {},
        checkRedisConnectivity: async () => {},
      });
      const rollout = results.find(
        (result) => result.name === 'refinance-alert-rollout',
      );
      assert.equal(rollout.required, true);
      assert.equal(rollout.ok, false);
      assert.match(
        rollout.detail,
        /REFINANCE_ALERT_RECIPIENT_EMAIL_ALLOWLIST/,
      );
    },
  );
});

test('GENERAL refinance alert rollout must be explicitly configured', async () => {
  await withEnv(
    {
      ...CLEAR_FLAGS,
      REFINANCE_EXTERNAL_ALERTS_ENABLED: 'true',
      REFINANCE_ALERT_ROLLOUT_MODE: 'GENERAL',
    },
    async () => {
      const { validateStartupDependencies } = freshModule();
      const results = await validateStartupDependencies({
        checkDatabaseConnectivity: async () => {},
        checkRedisConnectivity: async () => {},
      });
      const rollout = results.find(
        (result) => result.name === 'refinance-alert-rollout',
      );
      assert.equal(rollout.required, true);
      assert.equal(rollout.ok, true);
    },
  );
});

test('s3 is required by default — home-report-export-poller and material-spec-export-poller are HOMEOWNER_STATE jobs enabled under automation alone', async () => {
  await withEnv(CLEAR_FLAGS, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });

    const s3 = results.find((r) => r.name === 's3');
    assert.equal(s3.required, true);
    assert.equal(s3.ok, false);
    assert.match(s3.detail, /S3_BUCKET/);
  });
});

test('s3 is not required when automation is disabled entirely', async () => {
  await withEnv({ ...CLEAR_FLAGS, WORKER_AUTOMATION_ENABLED: 'false', WORKER_MANUAL_TRIGGERS_ENABLED: 'false' }, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });

    const s3 = results.find((r) => r.name === 's3');
    assert.equal(s3.required, false);
  });
});

test('gemini-ai is not required by default (WORKER_EXTERNAL_INGEST_ENABLED defaults to false, gating generate-diy-ai-guide)', async () => {
  await withEnv(CLEAR_FLAGS, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });

    const ai = results.find((r) => r.name === 'gemini-ai');
    assert.equal(ai.required, false);
  });
});

test('gemini-ai becomes required once WORKER_EXTERNAL_INGEST_ENABLED=true, and fails without GEMINI_API_KEY', async () => {
  await withEnv({ ...CLEAR_FLAGS, WORKER_EXTERNAL_INGEST_ENABLED: 'true' }, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });

    const ai = results.find((r) => r.name === 'gemini-ai');
    assert.equal(ai.required, true);
    assert.equal(ai.ok, false);
  });
});

test('a per-job override that disables a normally-enabled job removes its dependency requirement', async () => {
  await withEnv(
    {
      ...CLEAR_FLAGS,
      WORKER_JOB_HOME_REPORT_EXPORT_POLLER_ENABLED: 'false',
      WORKER_JOB_MATERIAL_SPEC_EXPORT_POLLER_ENABLED: 'false',
      // report-export-cleanup/material-spec-export-cleanup are already
      // off by default (DESTRUCTIVE+broadSweep, gated behind
      // WORKER_MUTATING_SWEEPS_ENABLED=false) — generate-permit-disclosure
      // is the remaining S3-dependent key enabled by default (HOMEOWNER_STATE,
      // manual trigger, WORKER_MANUAL_TRIGGERS_ENABLED defaults true).
      WORKER_JOB_GENERATE_PERMIT_DISCLOSURE_ENABLED: 'false',
    },
    async () => {
      const { validateStartupDependencies } = freshModule();
      const results = await validateStartupDependencies({
        checkDatabaseConnectivity: async () => {},
        checkRedisConnectivity: async () => {},
      });

      const s3 = results.find((r) => r.name === 's3');
      assert.equal(s3.required, false);
    },
  );
});

test('mortgage-rate-ingest (FRED_API_KEY) is never checked — it has its own graceful degradation chain', async () => {
  await withEnv(CLEAR_FLAGS, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });

    assert.equal(results.find((r) => r.name === 'fred' || r.name === 'mortgage-rate-ingest'), undefined);
  });
});

test('does not throw outside production even when required checks fail', async () => {
  await withEnv({ ...CLEAR_FLAGS, NODE_ENV: 'development' }, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {
        throw new Error('down');
      },
      checkRedisConnectivity: async () => {},
    });

    assert.equal(results.find((r) => r.name === 'database').ok, false);
  });
});

test('throws in production when a required check fails', async () => {
  await withEnv({ ...CLEAR_FLAGS, NODE_ENV: 'production' }, async () => {
    const { validateStartupDependencies } = freshModule();
    await assert.rejects(
      () =>
        validateStartupDependencies({
          checkDatabaseConnectivity: async () => {
            throw new Error('down');
          },
          checkRedisConnectivity: async () => {},
        }),
      /Refusing to start in production/,
    );
  });
});

test('resolves cleanly in production when every required check passes', async () => {
  // s3 is required by default (see the "required by default" test above) —
  // must be configured here or this production run legitimately refuses to start.
  await withEnv({ ...CLEAR_FLAGS, NODE_ENV: 'production', S3_BUCKET: 'test-bucket' }, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: async () => {},
      checkRedisConnectivity: async () => {},
    });
    assert.ok(results.every((r) => r.ok));
  });
});

test('a check that never resolves is treated as a timeout failure rather than hanging forever', async () => {
  await withEnv(CLEAR_FLAGS, async () => {
    const { validateStartupDependencies } = freshModule();
    const results = await validateStartupDependencies({
      checkDatabaseConnectivity: () => new Promise(() => {}),
      checkRedisConnectivity: async () => {},
    });

    const db = results.find((r) => r.name === 'database');
    assert.equal(db.ok, false);
    assert.match(db.detail, /timed out/);
  });
});
