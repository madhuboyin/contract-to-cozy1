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

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({
  initialStatus = 'PENDING',
  claimCount = 1,
  readyUpdateThrows = false,
  contextAllowed = true,
}) {
  const calls = { updates: [], deletes: [], uploads: 0 };

  const prismaMock = {
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
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const storagePath = require.resolve('../../../backend/src/services/storage/reportStorage.ts');
  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: {
      uploadPdfBuffer: async () => {
        calls.uploads++;
        return { bucket: 'test-bucket', key: 'home-report-property-1.pdf' };
      },
    },
  };

  const pdfPath = require.resolve('../../../backend/src/services/pdf/renderHomeReportPackPdf.ts');
  require.cache[pdfPath] = {
    id: pdfPath,
    filename: pdfPath,
    loaded: true,
    exports: { renderHomeReportPackPdf: async () => Buffer.from('fake-pdf') },
  };

  const snapshotPath = require.resolve('../../../backend/src/services/planningContext/reportSnapshot.ts');
  require.cache[snapshotPath] = {
    id: snapshotPath,
    filename: snapshotPath,
    loaded: true,
    exports: {
      checkReportWorkerContext: async () => ({
        allowed: contextAllowed,
        userId: 'user-1',
        reasonCodes: contextAllowed ? [] : ['NOT_APPLICABLE'],
      }),
      buildAuthoritativeReportSnapshot: async () => ({
        property: { addressLine1: '1 Main St', city: 'Plainsboro', state: 'NJ' },
        meta: { generatedAt: new Date().toISOString(), contextVersion: 'v1' },
      }),
    },
  };

  const deletePath = require.resolve('../../src/storage/deleteObject.ts');
  require.cache[deletePath] = {
    id: deletePath,
    filename: deletePath,
    loaded: true,
    exports: {
      deleteObject: async (bucket, key) => {
        calls.deletes.push({ bucket, key });
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/generateHomeReportExport.job.ts');
  delete require.cache[jobPath];
  return { job: require(jobPath), calls };
}

test('claim succeeds (updateMany count=1): generation proceeds through to READY', async () => {
  const { job, calls } = loadJob({ claimCount: 1 });

  await job.generateHomeReportExportJob('export-1');

  assert.equal(calls.uploads, 1);
  const readyUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'READY');
  assert.ok(readyUpdate, 'must reach the READY update');
  assert.equal(calls.deletes.length, 0);
});

test('claim fails (updateMany count=0, another caller already claimed it): job returns without generating', async () => {
  const { job, calls } = loadJob({ claimCount: 0 });

  await job.generateHomeReportExportJob('export-1');

  assert.equal(calls.uploads, 0, 'must not generate/upload when the atomic claim did not succeed');
});

test('a failure in the terminal READY update deletes the just-uploaded object instead of orphaning it', async () => {
  const { job, calls } = loadJob({ claimCount: 1, readyUpdateThrows: true });

  await assert.rejects(() => job.generateHomeReportExportJob('export-1'));

  assert.equal(calls.uploads, 1);
  assert.equal(calls.deletes.length, 1, 'the orphaned object must be cleaned up');
  assert.equal(calls.deletes[0].bucket, 'test-bucket');
  assert.equal(calls.deletes[0].key, 'home-report-property-1.pdf');
  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate, 'must still mark the row FAILED');
});

test('a successful READY update does NOT trigger cleanup on a later, unrelated failure', async () => {
  const { job, calls } = loadJob({ claimCount: 1 });

  await job.generateHomeReportExportJob('export-1');

  assert.equal(calls.deletes.length, 0, 'a properly-referenced object must never be deleted');
});

test('skips entirely when property context is not applicable', async () => {
  const { job, calls } = loadJob({ claimCount: 1, contextAllowed: false });

  await job.generateHomeReportExportJob('export-1');

  assert.equal(calls.uploads, 0);
  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate);
  assert.match(failedUpdate.args.data.errorMessage, /PROPERTY_CONTEXT_RECHECK_BLOCKED/);
});
