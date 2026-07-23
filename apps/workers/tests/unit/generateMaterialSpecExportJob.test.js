// apps/workers/tests/unit/generateMaterialSpecExportJob.test.js
//
// W3 (exports): same two fixes as generateHomeReportExportJob.test.js —
// atomic claim (safe claim ownership) and object cleanup on a post-upload
// terminal-update failure — applied to the material-spec export job.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache — including renderPdf itself, so no test here needs to
// mock the `playwright` package at all.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { generateMaterialSpecExportJob } = require('../../src/jobs/generateMaterialSpecExport.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ claimCount = 1, completedUpdateThrows = false }) {
  const calls = { updates: [], deletes: [], uploads: 0 };

  const deps = {
    prisma: {
      materialSpecExport: {
        findUnique: async () => ({
          id: 'export-1',
          status: 'PENDING',
          propertyId: 'property-1',
          requestedByUserId: 'user-1',
          scopeType: 'ALL',
          title: 'All materials',
          property: { id: 'property-1', address: '1 Main St', city: 'Plainsboro', state: 'NJ' },
        }),
        updateMany: async (args) => {
          calls.updates.push({ kind: 'updateMany', args });
          return { count: claimCount };
        },
        update: async (args) => {
          calls.updates.push({ kind: 'update', args });
          if (args.data.status === 'COMPLETED' && completedUpdateThrows) {
            throw new Error('DB write failed');
          }
          return { id: 'export-1', ...args.data };
        },
      },
      materialSpec: {
        findMany: async () => [],
      },
    },
    uploadPdfBuffer: async () => {
      calls.uploads++;
      return { bucket: 'test-bucket', key: 'material-specs-property-1.pdf' };
    },
    deleteObject: async (bucket, key) => {
      calls.deletes.push({ bucket, key });
    },
    renderPdf: async () => Buffer.from('fake-pdf'),
    logger: noopLogger,
  };
  return { deps, calls };
}

test('claim succeeds (updateMany count=1): generation proceeds through to COMPLETED', async () => {
  const { deps, calls } = fakeDeps({ claimCount: 1 });

  await generateMaterialSpecExportJob('export-1', deps);

  assert.equal(calls.uploads, 1);
  const completedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'COMPLETED');
  assert.ok(completedUpdate);
  assert.equal(calls.deletes.length, 0);
});

test('claim fails (updateMany count=0): job returns without generating', async () => {
  const { deps, calls } = fakeDeps({ claimCount: 0 });

  await generateMaterialSpecExportJob('export-1', deps);

  assert.equal(calls.uploads, 0);
});

test('a failure in the terminal COMPLETED update deletes the just-uploaded object', async () => {
  const { deps, calls } = fakeDeps({ claimCount: 1, completedUpdateThrows: true });

  await assert.rejects(() => generateMaterialSpecExportJob('export-1', deps));

  assert.equal(calls.uploads, 1);
  assert.equal(calls.deletes.length, 1);
  assert.equal(calls.deletes[0].key, 'material-specs-property-1.pdf');
  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate);
});
