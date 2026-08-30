// apps/backend/tests/unit/workerExecutionPolicy.test.js
//
// WKR-004: evaluateWorkerExecution() is the single scheduler/manual/poller
// decision function used by apps/workers/src/worker.ts. This exercises the
// decision matrix directly against synthetic env objects (no process.env
// mutation, no Redis/DB) per the audit's "no test database" beta rule.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  evaluateScopedDryRunExecution,
  evaluateWorkerExecution,
  readWorkerFlag,
  getJobOverride,
  normalizeJobEnvKey,
} = require('../../src/config/workerExecutionPolicy.ts');

function policy(overrides = {}) {
  return {
    impact: 'HOMEOWNER_STATE',
    customerJob: 'STAY_AHEAD',
    defaultEnabledInBeta: true,
    supportsDryRun: false,
    supportsPropertyScope: true,
    ...overrides,
  };
}

test('scheduled execution requires WORKER_AUTOMATION_ENABLED', () => {
  const allowed = evaluateWorkerExecution('job-a', 'scheduled', policy(), { WORKER_AUTOMATION_ENABLED: 'true' });
  const blocked = evaluateWorkerExecution('job-a', 'scheduled', policy(), { WORKER_AUTOMATION_ENABLED: 'false' });
  assert.equal(allowed.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /WORKER_AUTOMATION_ENABLED=false/);
});

test('WORKER_AUTOMATION_ENABLED defaults to true when unset', () => {
  const decision = evaluateWorkerExecution('job-a', 'scheduled', policy(), {});
  assert.equal(decision.allowed, true);
});

test('manual trigger requires WORKER_MANUAL_TRIGGERS_ENABLED, not WORKER_AUTOMATION_ENABLED', () => {
  const decision = evaluateWorkerExecution('job-a', 'manual', policy(), {
    WORKER_AUTOMATION_ENABLED: 'false',
    WORKER_MANUAL_TRIGGERS_ENABLED: 'true',
  });
  assert.equal(decision.allowed, true);

  const blocked = evaluateWorkerExecution('job-a', 'manual', policy(), {
    WORKER_AUTOMATION_ENABLED: 'true',
    WORKER_MANUAL_TRIGGERS_ENABLED: 'false',
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /WORKER_MANUAL_TRIGGERS_ENABLED=false/);
});

test('property-scoped dry-run can validate a launch-closed external job', () => {
  const decision = evaluateScopedDryRunExecution(
    'tax-assessment-ingest',
    policy({
      defaultEnabledInBeta: false,
      supportsDryRun: true,
      supportsPropertyScope: true,
      externalProvider: 'NYC DOF',
    }),
    true,
    {
      WORKER_MANUAL_TRIGGERS_ENABLED: 'true',
      WORKER_EXTERNAL_INGEST_ENABLED: 'false',
      WORKER_JOB_TAX_ASSESSMENT_INGEST_ENABLED: 'false',
    },
  );
  assert.equal(decision.allowed, true);
  assert.match(decision.reason, /dry-run bypasses activation gates/);
});

test('dry-run activation bypass requires declared capability and property scope', () => {
  const env = { WORKER_MANUAL_TRIGGERS_ENABLED: 'true' };
  assert.equal(
    evaluateScopedDryRunExecution(
      'job-a',
      policy({ supportsDryRun: true, supportsPropertyScope: true }),
      false,
      env,
    ).allowed,
    false,
  );
  assert.equal(
    evaluateScopedDryRunExecution(
      'job-a',
      policy({ supportsDryRun: false, supportsPropertyScope: true }),
      true,
      env,
    ).allowed,
    false,
  );
  assert.equal(
    evaluateScopedDryRunExecution(
      'job-a',
      policy({ supportsDryRun: true, supportsPropertyScope: true }),
      true,
      { WORKER_MANUAL_TRIGGERS_ENABLED: 'false' },
    ).allowed,
    false,
  );
});

test('defaultEnabledInBeta=false blocks even with every flag on', () => {
  const decision = evaluateWorkerExecution(
    'job-a',
    'scheduled',
    policy({ defaultEnabledInBeta: false }),
    { WORKER_AUTOMATION_ENABLED: 'true' },
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /defaultEnabledInBeta=false/);
});

test('defaultScheduledEnabled=false keeps cron closed while allowing manual execution', () => {
  const launchClosed = policy({ defaultScheduledEnabled: false });
  const scheduled = evaluateWorkerExecution('job-a', 'scheduled', launchClosed, {
    WORKER_AUTOMATION_ENABLED: 'true',
  });
  const manual = evaluateWorkerExecution('job-a', 'manual', launchClosed, {
    WORKER_MANUAL_TRIGGERS_ENABLED: 'true',
  });
  assert.equal(scheduled.allowed, false);
  assert.match(scheduled.reason, /defaultScheduledEnabled=false/);
  assert.equal(manual.allowed, true);
});

test('a non-overridable product gate blocks schedule activation even with a true per-job override', () => {
  const gated = policy({ nonOverridableScheduledBlockReason: 'IPD-002 is not approved' });
  const scheduled = evaluateWorkerExecution('job-a', 'scheduled', gated, {
    WORKER_JOB_JOB_A_ENABLED: 'true',
  });
  const manual = evaluateWorkerExecution('job-a', 'manual', gated, {
    WORKER_MANUAL_TRIGGERS_ENABLED: 'true',
  });
  assert.equal(scheduled.allowed, false);
  assert.match(scheduled.reason, /IPD-002/);
  assert.equal(manual.allowed, true);
});

test('externalProvider jobs require WORKER_EXTERNAL_INGEST_ENABLED', () => {
  const env = { WORKER_AUTOMATION_ENABLED: 'true' };
  const blocked = evaluateWorkerExecution('recall-ingest', 'scheduled', policy({ externalProvider: 'CPSC' }), env);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /WORKER_EXTERNAL_INGEST_ENABLED=false/);

  const allowed = evaluateWorkerExecution(
    'recall-ingest',
    'scheduled',
    policy({ externalProvider: 'CPSC' }),
    { ...env, WORKER_EXTERNAL_INGEST_ENABLED: 'true' },
  );
  assert.equal(allowed.allowed, true);
});

test('DESTRUCTIVE and broadSweep jobs require WORKER_MUTATING_SWEEPS_ENABLED', () => {
  const env = { WORKER_AUTOMATION_ENABLED: 'true' };
  assert.equal(
    evaluateWorkerExecution('cleanup-job', 'scheduled', policy({ impact: 'DESTRUCTIVE' }), env).allowed,
    false,
  );
  assert.equal(
    evaluateWorkerExecution('sweep-job', 'scheduled', policy({ broadSweep: true }), env).allowed,
    false,
  );
  assert.equal(
    evaluateWorkerExecution(
      'cleanup-job',
      'scheduled',
      policy({ impact: 'DESTRUCTIVE' }),
      { ...env, WORKER_MUTATING_SWEEPS_ENABLED: 'true' },
    ).allowed,
    true,
  );
});

test('OUTBOUND-impact jobs require WORKER_OUTBOUND_NOTIFICATIONS_ENABLED', () => {
  const env = { WORKER_AUTOMATION_ENABLED: 'true' };
  assert.equal(
    evaluateWorkerExecution('daily-email-digest', 'scheduled', policy({ impact: 'OUTBOUND' }), env).allowed,
    false,
  );
  assert.equal(
    evaluateWorkerExecution(
      'daily-email-digest',
      'scheduled',
      policy({ impact: 'OUTBOUND' }),
      { ...env, WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true' },
    ).allowed,
    true,
  );
});

test('HOMEOWNER_STATE-impact jobs are unaffected by WORKER_OUTBOUND_NOTIFICATIONS_ENABLED', () => {
  // maintenance-reminders / seasonal-notifications keep running under
  // automation alone; the outbound flag gates NotificationService's
  // transportEnabled instead, not the whole job.
  const decision = evaluateWorkerExecution(
    'maintenance-reminders',
    'scheduled',
    policy({ impact: 'HOMEOWNER_STATE' }),
    { WORKER_AUTOMATION_ENABLED: 'true', WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'false' },
  );
  assert.equal(decision.allowed, true);
});

test('per-job override wins over every group flag', () => {
  const env = {
    WORKER_AUTOMATION_ENABLED: 'true',
    WORKER_JOB_RECALL_INGEST_ENABLED: 'false',
  };
  const decision = evaluateWorkerExecution('recall-ingest', 'scheduled', policy({ externalProvider: 'CPSC' }), env);
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /per-job override/);

  const forceOn = evaluateWorkerExecution(
    'shared-data-backfill',
    'scheduled',
    policy({ defaultEnabledInBeta: false, broadSweep: true }),
    { WORKER_AUTOMATION_ENABLED: 'true', WORKER_JOB_SHARED_DATA_BACKFILL_ENABLED: 'true' },
  );
  assert.equal(forceOn.allowed, true);
});

test('malformed flag values fall back to the beta default and are reported as malformed', () => {
  const diag = readWorkerFlag('WORKER_OUTBOUND_NOTIFICATIONS_ENABLED', {
    WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'yes',
  });
  assert.equal(diag.resolved, false); // beta default for this flag
  assert.equal(diag.malformed, true);

  const unset = readWorkerFlag('WORKER_AUTOMATION_ENABLED', {});
  assert.equal(unset.resolved, true); // beta default for this flag
  assert.equal(unset.malformed, false);
});

test('malformed per-job override is ignored, falling through to group policy', () => {
  const decision = evaluateWorkerExecution('job-a', 'scheduled', policy(), {
    WORKER_AUTOMATION_ENABLED: 'true',
    WORKER_JOB_JOB_A_ENABLED: 'nope',
  });
  assert.equal(decision.allowed, true);
  assert.doesNotMatch(decision.reason, /override/);
});

test('normalizeJobEnvKey uppercases and replaces non-alphanumerics', () => {
  assert.equal(normalizeJobEnvKey('recall-ingest'), 'WORKER_JOB_RECALL_INGEST_ENABLED');
  assert.equal(normalizeJobEnvKey('home-report-export-poller'), 'WORKER_JOB_HOME_REPORT_EXPORT_POLLER_ENABLED');
});

test('Home Briefing uses the canonical per-job flag with legacy Gazette fallback', () => {
  const canonical = getJobOverride('home-briefing-delivery', {
    WORKER_JOB_HOME_BRIEFING_DELIVERY_ENABLED: 'false',
    WORKER_JOB_HOME_GAZETTE_GENERATION_ENABLED: 'true',
  });
  assert.deepEqual(canonical, {
    value: false,
    malformed: false,
    envKey: 'WORKER_JOB_HOME_BRIEFING_DELIVERY_ENABLED',
  });

  const legacy = getJobOverride('home-briefing-delivery', {
    WORKER_JOB_HOME_GAZETTE_GENERATION_ENABLED: 'true',
  });
  assert.deepEqual(legacy, {
    value: true,
    malformed: false,
    envKey: 'WORKER_JOB_HOME_GAZETTE_GENERATION_ENABLED',
  });
});

test('high-impact manual triggers are blocked while approvals are enforced with no workflow', () => {
  const env = { WORKER_AUTOMATION_ENABLED: 'true', WORKER_MANUAL_TRIGGERS_ENABLED: 'true' };
  const blocked = evaluateWorkerExecution(
    'inventory-draft-cleanup',
    'manual',
    policy({ humanApprovalClass: 'HIGH_IMPACT_MANUAL' }),
    { ...env, ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS: 'true' },
  );
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS/);

  const allowedWhenNotEnforced = evaluateWorkerExecution(
    'inventory-draft-cleanup',
    'manual',
    policy({ humanApprovalClass: 'HIGH_IMPACT_MANUAL' }),
    { ...env, ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS: 'false' },
  );
  assert.equal(allowedWhenNotEnforced.allowed, true);
});

test('getJobOverride reports malformed for any non-true/false raw value', () => {
  const o = getJobOverride('job-a', { WORKER_JOB_JOB_A_ENABLED: '1' });
  assert.equal(o.value, undefined);
  assert.equal(o.malformed, true);
  assert.equal(o.envKey, 'WORKER_JOB_JOB_A_ENABLED');
});
