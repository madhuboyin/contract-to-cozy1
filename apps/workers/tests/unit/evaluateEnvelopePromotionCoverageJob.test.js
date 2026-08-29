// apps/workers/tests/unit/evaluateEnvelopePromotionCoverageJob.test.js
//
// Phase 1 (C2C_INTELLIGENCE_AGENTIC_EVOLUTION_IMPLEMENTATION_PLAN.md §6.2,
// IPD-001 / IPD-009): the shared scheduled/manual handler that owns the
// durable CoverageAuditRun idempotency contract. These tests inject fakes
// for the backend repository/service functions and assert:
//   - MANUAL invocations must carry the durable queue job ID;
//   - the idempotency key is derived from trigger + invocation identity
//     (calendar day for SCHEDULED, queue job ID for MANUAL);
//   - a non-created run (idempotent replay / concurrent RUNNING) short-circuits
//     without executing the audit;
//   - an execution failure records FAILED on the run and rethrows.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  runEvaluateEnvelopePromotionCoverageJob,
} = require('../../src/jobs/evaluateEnvelopePromotionCoverage.job.ts');

const NOW = new Date('2026-08-28T04:30:00.000Z');

function runRow(overrides = {}) {
  return {
    id: 'run-1',
    status: 'RUNNING',
    propertiesExamined: 0,
    findingsCreated: 0,
    findingsUpdated: 0,
    ownerUnresolved: 0,
    propertyFailures: 0,
    adapterFailures: 0,
    failureSummary: null,
    ...overrides,
  };
}

function auditResult(overrides = {}) {
  return {
    status: 'COMPLETE',
    evaluationStatus: 'NOT_MEASURED',
    propertiesExamined: 3,
    propertiesAudited: 3,
    ownerUnresolved: 0,
    propertyFailures: 0,
    adapterFailures: 0,
    envelopePagesRead: 3,
    observedCapabilities: 2,
    findings: 9,
    reviewRequired: 1,
    declarationDrift: 0,
    certificationIssues: [],
    diagnostics: [],
    reconciliation: { created: 2, updated: 7, retired: 1 },
    ...overrides,
  };
}

function deps(overrides = {}) {
  const calls = { createRun: [], executeAudit: [], failRun: [] };
  const base = {
    createRun: async (input) => {
      calls.createRun.push(input);
      return { created: true, run: runRow() };
    },
    executeAudit: async (input) => {
      calls.executeAudit.push(input);
      return auditResult();
    },
    failRun: async (runId, input) => {
      calls.failRun.push({ runId, input });
      return true;
    },
    digest: () => 'digest-abc',
    taxonomyVersion: 'itd-v1',
    deploymentRevision: () => 'deadbeef',
    now: () => NOW,
    ...overrides,
  };
  return { calls, deps: base };
}

test('a MANUAL invocation without the durable queue job ID is rejected', async () => {
  const { deps: d, calls } = deps();
  await assert.rejects(
    runEvaluateEnvelopePromotionCoverageJob({ trigger: 'MANUAL' }, d),
    /Manual coverage-audit invocation requires the durable queue job ID/,
  );
  assert.equal(calls.createRun.length, 0);
});

test('a SCHEDULED invocation keys the run by calendar day and pins run identity', async () => {
  const { deps: d, calls } = deps();
  const result = await runEvaluateEnvelopePromotionCoverageJob({}, d);

  assert.equal(calls.createRun.length, 1);
  assert.equal(calls.createRun[0].idempotencyKey, 'envelope-promotion-coverage-audit:scheduled:2026-08-28');
  assert.equal(calls.createRun[0].trigger, 'SCHEDULED');
  assert.equal(calls.createRun[0].auditInputsDigest, 'digest-abc');
  assert.equal(calls.createRun[0].taxonomyVersion, 'itd-v1');
  assert.equal(calls.createRun[0].deploymentRevision, 'deadbeef');
  assert.equal(calls.createRun[0].evaluationContractVersion, null);
  assert.equal(calls.executeAudit[0].runId, 'run-1');
  assert.deepEqual(result, { examined: 3, created: 2, updated: 7, failed: 0, reason: undefined });
});

test('a MANUAL invocation keys the run by the durable queue job ID', async () => {
  const { deps: d, calls } = deps();
  await runEvaluateEnvelopePromotionCoverageJob({ trigger: 'MANUAL', invocationId: 'bull-job-42' }, d);
  assert.equal(calls.createRun[0].idempotencyKey, 'envelope-promotion-coverage-audit:manual:bull-job-42');
  assert.equal(calls.createRun[0].trigger, 'MANUAL');
});

test('a PARTIAL audit surfaces a reason and the not-retired count', async () => {
  const { deps: d } = deps({
    executeAudit: async () => auditResult({
      status: 'PARTIAL',
      ownerUnresolved: 1,
      adapterFailures: 2,
      reconciliation: { created: 0, updated: 4, retired: 0 },
    }),
  });
  const result = await runEvaluateEnvelopePromotionCoverageJob({}, d);
  assert.equal(result.failed, 3);
  assert.match(result.reason, /completed partially; findings were not retired/);
});

test('an already-RUNNING idempotent replay short-circuits without executing the audit', async () => {
  const { deps: d, calls } = deps({
    createRun: async () => ({ created: false, run: runRow({ status: 'RUNNING' }) }),
  });
  const result = await runEvaluateEnvelopePromotionCoverageJob({}, d);

  assert.equal(calls.executeAudit.length, 0);
  assert.equal(calls.failRun.length, 0);
  assert.equal(result.skipped, 1);
  assert.match(result.reason, /already running/);
});

test('a terminal idempotent replay reports the persisted run outcome without re-running', async () => {
  const { deps: d, calls } = deps({
    createRun: async () => ({
      created: false,
      run: runRow({ status: 'COMPLETE', propertiesExamined: 5, findingsCreated: 1, findingsUpdated: 2 }),
    }),
  });
  const result = await runEvaluateEnvelopePromotionCoverageJob({}, d);

  assert.equal(calls.executeAudit.length, 0);
  assert.equal(result.examined, 5);
  assert.equal(result.created, 1);
  assert.equal(result.updated, 2);
  assert.equal(result.skipped, 1);
});

test('an execution failure records FAILED on the run and rethrows', async () => {
  const boom = new Error('reconcile transaction deadlock');
  const { deps: d, calls } = deps({
    executeAudit: async () => { throw boom; },
  });

  await assert.rejects(runEvaluateEnvelopePromotionCoverageJob({}, d), /reconcile transaction deadlock/);
  assert.equal(calls.failRun.length, 1);
  assert.equal(calls.failRun[0].runId, 'run-1');
  assert.equal(calls.failRun[0].input.failureCode, 'EXECUTION_FAILED');
  // Raw exception text must not leak into durable audit metadata.
  assert.doesNotMatch(calls.failRun[0].input.failureSummary, /deadlock/);
});
