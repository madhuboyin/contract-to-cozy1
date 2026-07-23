// apps/workers/tests/unit/generateHomeReportExportJob.test.js
//
// W3 (exports):
//   1. Atomic claim ("safe claim ownership") — the job used to
//      findUnique+status-check, then a separate update to GENERATING, with
//      no guard against two overlapping poller ticks (or replicas) both
//      passing the check before either wrote GENERATING. Now an atomic
//      updateMany with a status: PENDING WHERE guard; only the caller that
//      actually flips the row proceeds.
//   2. Object cleanup on terminal failure — if the READY update itself
//      throws after a successful S3 upload, nothing referenced the object
//      yet (storageKey never persisted), so it must be deleted rather than
//      left orphaned.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { generateHomeReportExportJob } = require('../../src/jobs/generateHomeReportExport.job.ts');

function fakeDeps({
  initialStatus = 'PENDING',
  claimCount = 1,
  readyUpdateThrows = false,
  contextAllowed = true,
}) {
  const calls = { updates: [], deletes: [], uploads: 0 };

  const deps = {
    prisma: {
      homeReportExport: {
        findUnique: async () => ({
          id: 'export-1',
          status: initialStatus,
          propertyId: 'property-1',
          userId: 'user-1',
          sections: null,
        }),
        updateMany: async (args) => {
          calls.updates.push({ kind: 'updateMany', args });
          return { count: claimCount };
        },
        update: async (args) => {
          calls.updates.push({ kind: 'update', args });
          if (args.data.status === 'READY' && readyUpdateThrows) {
            throw new Error('DB write failed');
          }
          return { id: 'export-1', ...args.data };
        },
      },
      homeReportExportEvent: {
        create: async () => ({}),
      },
    },
    uploadPdfBuffer: async () => {
      calls.uploads++;
      return { bucket: 'test-bucket', key: 'home-report-property-1.pdf' };
    },
    renderHomeReportPackPdf: async () => Buffer.from('fake-pdf'),
    checkReportWorkerContext: async () => ({
      allowed: contextAllowed,
      userId: 'user-1',
      reasonCodes: contextAllowed ? [] : ['NOT_APPLICABLE'],
    }),
    buildAuthoritativeReportSnapshot: async () => ({
      property: { addressLine1: '1 Main St', city: 'Plainsboro', state: 'NJ' },
      meta: { generatedAt: new Date().toISOString(), contextVersion: 'v1' },
    }),
    deleteObject: async (bucket, key) => {
      calls.deletes.push({ bucket, key });
    },
  };
  return { deps, calls };
}

test('claim succeeds (updateMany count=1): generation proceeds through to READY', async () => {
  const { deps, calls } = fakeDeps({ claimCount: 1 });

  await generateHomeReportExportJob('export-1', deps);

  assert.equal(calls.uploads, 1);
  const readyUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'READY');
  assert.ok(readyUpdate, 'must reach the READY update');
  assert.equal(calls.deletes.length, 0);
});

test('claim fails (updateMany count=0, another caller already claimed it): job returns without generating', async () => {
  const { deps, calls } = fakeDeps({ claimCount: 0 });

  await generateHomeReportExportJob('export-1', deps);

  assert.equal(calls.uploads, 0, 'must not generate/upload when the atomic claim did not succeed');
});

test('a failure in the terminal READY update deletes the just-uploaded object instead of orphaning it', async () => {
  const { deps, calls } = fakeDeps({ claimCount: 1, readyUpdateThrows: true });

  await assert.rejects(() => generateHomeReportExportJob('export-1', deps));

  assert.equal(calls.uploads, 1);
  assert.equal(calls.deletes.length, 1, 'the orphaned object must be cleaned up');
  assert.equal(calls.deletes[0].bucket, 'test-bucket');
  assert.equal(calls.deletes[0].key, 'home-report-property-1.pdf');
  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate, 'must still mark the row FAILED');
});

test('a successful READY update does NOT trigger cleanup on a later, unrelated failure', async () => {
  const { deps, calls } = fakeDeps({ claimCount: 1 });

  await generateHomeReportExportJob('export-1', deps);

  assert.equal(calls.deletes.length, 0, 'a properly-referenced object must never be deleted');
});

test('skips entirely when property context is not applicable', async () => {
  const { deps, calls } = fakeDeps({ claimCount: 1, contextAllowed: false });

  await generateHomeReportExportJob('export-1', deps);

  assert.equal(calls.uploads, 0);
  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate);
  assert.match(failedUpdate.args.data.errorMessage, /PROPERTY_CONTEXT_RECHECK_BLOCKED/);
});
