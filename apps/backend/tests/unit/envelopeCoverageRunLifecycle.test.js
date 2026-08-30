const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { Prisma } = require('@prisma/client');

const {
  createCoverageAuditRun,
  failInterruptedCoverageAuditRuns,
  finalizeCoverageAuditRun,
  failCoverageAuditRun,
  boundedCoverageDiagnosticCodes,
  COVERAGE_AUDIT_WORKER_JOB_KEY,
} = require('../../src/services/intelligence/envelopeCoverageRun.repository.ts');

const AUDITED_AT = new Date('2026-08-28T04:30:00.000Z');
const FINISHED_AT = new Date('2026-08-28T04:33:00.000Z');

function createInput(overrides = {}) {
  return {
    idempotencyKey: 'envelope-promotion-coverage-audit:scheduled:2026-08-28',
    trigger: 'SCHEDULED',
    correlationId: 'corr-1',
    auditInputsDigest: 'a'.repeat(64),
    taxonomyVersion: 'itd-v1',
    deploymentRevision: 'deadbeef',
    evaluationContractVersion: null,
    ...overrides,
  };
}

function summary(overrides = {}) {
  return {
    status: 'COMPLETE',
    evaluationStatus: 'NOT_MEASURED',
    propertiesExamined: 4,
    propertiesAudited: 4,
    ownerUnresolved: 0,
    propertyFailures: 0,
    adapterFailures: 0,
    envelopePagesRead: 6,
    observedCapabilities: 2,
    findings: 9,
    reviewRequired: 1,
    declarationDrift: 0,
    declarationDriftDetails: [],
    certificationIssues: [],
    diagnostics: [],
    ...overrides,
  };
}

function finding(overrides = {}) {
  return {
    producerModel: 'Signal',
    domain: 'SAFETY',
    determination: 'REVIEW_REQUIRED',
    evidenceBasis: 'DECLARED_AND_OBSERVED',
    auditInputsDigest: 'a'.repeat(64),
    matchedRuleIds: [],
    firstObservedAt: '2026-08-20T12:00:00.000Z',
    lastObservedAt: '2026-08-25T12:00:00.000Z',
    lastAuditedAt: AUDITED_AT.toISOString(),
    ...overrides,
  };
}

/** In-memory stand-in for the two Prisma delegates the repository touches. */
function makeDb({ runs = [], findings = [] } = {}) {
  const runRows = new Map(runs.map((r) => [r.id, { ...r }]));
  const findingRows = new Map(findings.map((f) => [`${f.producerModel}:${f.domain}`, { ...f }]));
  let runSeq = runRows.size;

  const coverageAuditRun = {
    findUnique: async ({ where }) =>
      [...runRows.values()].find((r) => r.idempotencyKey === where.idempotencyKey) ?? null,
    findUniqueOrThrow: async ({ where }) => {
      const row = [...runRows.values()].find((r) => r.idempotencyKey === where.idempotencyKey);
      if (!row) throw new Error('run not found');
      return row;
    },
    create: async ({ data }) => {
      if ([...runRows.values()].some((r) => r.idempotencyKey === data.idempotencyKey)) {
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
      }
      runSeq += 1;
      const row = { id: `run-${runSeq}`, status: 'RUNNING', finishedAt: null, ...data };
      runRows.set(row.id, row);
      return row;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [id, row] of runRows) {
        if (where.id && row.id !== where.id) continue;
        if (where.workerJobKey && row.workerJobKey !== where.workerJobKey) continue;
        if (where.status && row.status !== where.status) continue;
        if (where.idempotencyKey?.not && row.idempotencyKey === where.idempotencyKey.not) continue;
        runRows.set(id, { ...row, ...data });
        count += 1;
      }
      return { count };
    },
  };

  const coverageAuditFinding = {
    findMany: async () => [...findingRows.values()],
    upsert: async ({ where, create, update }) => {
      const key = `${where.producerModel_domain.producerModel}:${where.producerModel_domain.domain}`;
      const existing = findingRows.get(key);
      const next = existing ? { ...existing, ...update } : { id: `finding-${findingRows.size + 1}`, ...create };
      findingRows.set(key, next);
      return next;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [key, row] of findingRows) {
        if (where.id.in.includes(row.id) && row.active === where.active) {
          findingRows.set(key, { ...row, ...data });
          count += 1;
        }
      }
      return { count };
    },
  };

  let transactionCount = 0;
  const db = {
    coverageAuditRun,
    coverageAuditFinding,
    $transaction: async (callback) => {
      transactionCount += 1;
      return callback({ coverageAuditRun, coverageAuditFinding });
    },
  };
  return {
    db,
    runRows,
    findingRows,
    get transactionCount() { return transactionCount; },
  };
}

test('CoverageAuditRun schema persists bounded audit identity, never homeowner data', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const start = schema.indexOf('model CoverageAuditRun {');
  const model = schema.slice(start, schema.indexOf('\n}', start) + 2);

  assert.ok(start >= 0, 'CoverageAuditRun model is defined');
  assert.match(model, /idempotencyKey\s+String\s+@unique/);
  assert.match(model, /status\s+CoverageAuditRunStatus\s+@default\(RUNNING\)/);
  assert.match(model, /trigger\s+CoverageAuditRunTrigger/);
  assert.doesNotMatch(model, /\bpropertyId\b|\buserId\b|\bhomeowner\b|\bprincipal\b|\benvelopeItem\b/i);

  const runStatus = schema.slice(schema.indexOf('enum CoverageAuditRunStatus {'));
  assert.match(runStatus, /RUNNING[\s\S]*COMPLETE[\s\S]*PARTIAL[\s\S]*FAILED/);
});

test('a fresh attempt terminalizes older interrupted RUNNING audits', async () => {
  const store = makeDb({
    runs: [
      {
        id: 'run-old',
        idempotencyKey: 'old-attempt',
        workerJobKey: COVERAGE_AUDIT_WORKER_JOB_KEY,
        status: 'RUNNING',
      },
      {
        id: 'run-current',
        idempotencyKey: 'current-attempt',
        workerJobKey: COVERAGE_AUDIT_WORKER_JOB_KEY,
        status: 'RUNNING',
      },
    ],
  });
  const count = await failInterruptedCoverageAuditRuns('current-attempt', FINISHED_AT, store.db);
  assert.equal(count, 1);
  assert.equal(store.runRows.get('run-old').status, 'FAILED');
  assert.equal(store.runRows.get('run-old').failureCode, 'EXECUTION_INTERRUPTED');
  assert.equal(store.runRows.get('run-current').status, 'RUNNING');
});

test('createCoverageAuditRun inserts a RUNNING run under the worker job key', async () => {
  const store = makeDb();
  const result = await createCoverageAuditRun(createInput(), store.db);

  assert.equal(result.created, true);
  assert.equal(result.run.status, 'RUNNING');
  assert.equal(result.run.workerJobKey, COVERAGE_AUDIT_WORKER_JOB_KEY);
  assert.equal(store.runRows.size, 1);
});

test('createCoverageAuditRun is idempotent on a pre-existing idempotency key', async () => {
  const store = makeDb({
    runs: [{ id: 'run-1', idempotencyKey: createInput().idempotencyKey, status: 'COMPLETE' }],
  });
  const result = await createCoverageAuditRun(createInput(), store.db);

  assert.equal(result.created, false);
  assert.equal(result.run.id, 'run-1');
  assert.equal(store.runRows.size, 1);
});

test('createCoverageAuditRun resolves a P2002 insert race to the winning row', async () => {
  const store = makeDb();
  // Simulate a concurrent winner landing between findUnique and create.
  const realFindUnique = store.db.coverageAuditRun.findUnique;
  store.db.coverageAuditRun.findUnique = async (args) => {
    store.db.coverageAuditRun.findUnique = realFindUnique;
    return null;
  };
  store.runRows.set('race-winner', { id: 'race-winner', idempotencyKey: createInput().idempotencyKey, status: 'RUNNING' });

  const result = await createCoverageAuditRun(createInput(), store.db);
  assert.equal(result.created, false);
  assert.equal(result.run.id, 'race-winner');
});

test('finalizeCoverageAuditRun reconciles and CAS-terminalizes a COMPLETE run in one transaction', async () => {
  const store = makeDb({
    runs: [{ id: 'run-1', idempotencyKey: createInput().idempotencyKey, status: 'RUNNING' }],
    findings: [{
      id: 'stale', producerModel: 'Signal', domain: 'WEATHER',
      firstObservedAt: null, lastObservedAt: null, active: true, retiredAt: null,
    }],
  });

  const reconciliation = await finalizeCoverageAuditRun({
    runId: 'run-1',
    auditedAt: AUDITED_AT,
    finishedAt: FINISHED_AT,
    findings: [finding()],
    summary: summary({ diagnostics: ['OWNER_UNRESOLVED:property-xyz', 'OWNER_UNRESOLVED:property-abc'] }),
  }, store.db);

  assert.equal(store.transactionCount, 1);
  assert.deepEqual(reconciliation, { created: 1, updated: 0, retired: 1 });

  const run = store.runRows.get('run-1');
  assert.equal(run.status, 'COMPLETE');
  assert.equal(run.finishedAt, FINISHED_AT);
  assert.equal(run.findingsCreated, 1);
  assert.equal(run.findingsRetired, 1);
  // Diagnostics are collapsed to bounded CODE:count, never raw property IDs.
  assert.deepEqual(run.diagnostics, ['OWNER_UNRESOLVED:2']);
  assert.equal(store.findingRows.get('Signal:WEATHER').active, false);
});

test('finalizeCoverageAuditRun for a PARTIAL run updates observations but retires nothing', async () => {
  const store = makeDb({
    runs: [{ id: 'run-1', idempotencyKey: createInput().idempotencyKey, status: 'RUNNING' }],
    findings: [{
      id: 'stale', producerModel: 'Signal', domain: 'WEATHER',
      firstObservedAt: null, lastObservedAt: null, active: true, retiredAt: null,
    }],
  });

  const reconciliation = await finalizeCoverageAuditRun({
    runId: 'run-1',
    auditedAt: AUDITED_AT,
    finishedAt: FINISHED_AT,
    findings: [finding()],
    summary: summary({ status: 'PARTIAL', ownerUnresolved: 1 }),
  }, store.db);

  assert.equal(reconciliation.retired, 0);
  assert.equal(store.runRows.get('run-1').status, 'PARTIAL');
  assert.equal(store.findingRows.get('Signal:WEATHER').active, true);
});

test('finalizeCoverageAuditRun rejects a run that is no longer RUNNING (CAS lost)', async () => {
  const store = makeDb({
    runs: [{ id: 'run-1', idempotencyKey: createInput().idempotencyKey, status: 'COMPLETE' }],
  });

  await assert.rejects(
    finalizeCoverageAuditRun({
      runId: 'run-1',
      auditedAt: AUDITED_AT,
      finishedAt: FINISHED_AT,
      findings: [finding()],
      summary: summary(),
    }, store.db),
    /not RUNNING; terminal transition rejected/,
  );
});

test('failCoverageAuditRun CAS-transitions RUNNING to FAILED with a bounded summary', async () => {
  const store = makeDb({
    runs: [{ id: 'run-1', idempotencyKey: createInput().idempotencyKey, status: 'RUNNING' }],
  });

  const ok = await failCoverageAuditRun('run-1', {
    failureCode: 'EXECUTION_FAILED',
    failureSummary: 'x'.repeat(5000),
  }, store.db);

  assert.equal(ok, true);
  const run = store.runRows.get('run-1');
  assert.equal(run.status, 'FAILED');
  assert.ok(run.finishedAt instanceof Date);
  assert.ok(run.failureSummary.length <= 1000);
});

test('failCoverageAuditRun is a no-op once the run is already terminal', async () => {
  const store = makeDb({
    runs: [{ id: 'run-1', idempotencyKey: createInput().idempotencyKey, status: 'COMPLETE' }],
  });
  const ok = await failCoverageAuditRun('run-1', {
    failureCode: 'EXECUTION_FAILED',
    failureSummary: 'late failure',
  }, store.db);

  assert.equal(ok, false);
  assert.equal(store.runRows.get('run-1').status, 'COMPLETE');
});

test('boundedCoverageDiagnosticCodes collapses to CODE:count and strips identifiers', () => {
  const codes = boundedCoverageDiagnosticCodes([
    'OWNER_UNRESOLVED:property-123',
    'OWNER_UNRESOLVED:property-456',
    'PROPERTY_PAGE_FAILED:connection refused at 10.0.0.3',
    'ENVELOPE_CURSOR_REPEATED:property-789',
  ]);

  assert.deepEqual(
    codes.sort(),
    ['ENVELOPE_CURSOR_REPEATED:1', 'OWNER_UNRESOLVED:2', 'PROPERTY_PAGE_FAILED:1'].sort(),
  );
  assert.doesNotMatch(codes.join(','), /property-\d|10\.0\.0\.3|refused/);
});
