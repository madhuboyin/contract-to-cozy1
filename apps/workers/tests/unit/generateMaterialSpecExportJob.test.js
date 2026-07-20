// apps/workers/tests/unit/generateMaterialSpecExportJob.test.js
//
// W3 (exports): same two fixes as generateHomeReportExportJob.test.js —
// atomic claim (safe claim ownership) and object cleanup on a post-upload
// terminal-update failure — applied to the material-spec export job.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function fakeBrowser() {
  return {
    newPage: async () => ({
      setContent: async () => {},
      evaluateHandle: async () => {},
      pdf: async () => Buffer.from('fake-pdf'),
    }),
    close: async () => {},
  };
}

function loadJob({ claimCount = 1, completedUpdateThrows = false }) {
  const calls = { updates: [], deletes: [], uploads: 0 };

  const prismaMock = {
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
        return { bucket: 'test-bucket', key: 'material-specs-property-1.pdf' };
      },
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

  const playwrightPath = require.resolve('playwright');
  require.cache[playwrightPath] = {
    id: playwrightPath,
    filename: playwrightPath,
    loaded: true,
    exports: {
      chromium: {
        executablePath: () => '/fake/chromium',
        launch: async () => fakeBrowser(),
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/generateMaterialSpecExport.job.ts');
  delete require.cache[jobPath];
  return { job: require(jobPath), calls };
}

test('claim succeeds (updateMany count=1): generation proceeds through to COMPLETED', async () => {
  const { job, calls } = loadJob({ claimCount: 1 });

  await job.generateMaterialSpecExportJob('export-1');

  assert.equal(calls.uploads, 1);
  const completedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'COMPLETED');
  assert.ok(completedUpdate);
  assert.equal(calls.deletes.length, 0);
});

test('claim fails (updateMany count=0): job returns without generating', async () => {
  const { job, calls } = loadJob({ claimCount: 0 });

  await job.generateMaterialSpecExportJob('export-1');

  assert.equal(calls.uploads, 0);
});

test('a failure in the terminal COMPLETED update deletes the just-uploaded object', async () => {
  const { job, calls } = loadJob({ claimCount: 1, completedUpdateThrows: true });

  await assert.rejects(() => job.generateMaterialSpecExportJob('export-1'));

  assert.equal(calls.uploads, 1);
  assert.equal(calls.deletes.length, 1);
  assert.equal(calls.deletes[0].key, 'material-specs-property-1.pdf');
  const failedUpdate = calls.updates.find((u) => u.kind === 'update' && u.args.data.status === 'FAILED');
  assert.ok(failedUpdate);
});
