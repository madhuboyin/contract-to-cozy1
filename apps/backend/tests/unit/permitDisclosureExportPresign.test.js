// apps/backend/tests/unit/permitDisclosureExportPresign.test.js
//
// W3 (permits): generatePermitDisclosureJob used to persist a raw, permanent
// https://<bucket>.s3.amazonaws.com/<key> URL on the PermitDisclosureExport
// record, and getDisclosureExport/listDisclosureExports returned it as-is —
// unlike every other export job in this codebase (generateHomeReportExport,
// generateMaterialSpecExport), which store only the object key and presign a
// short-lived URL on read. A permit disclosure PDF (permit history +
// unpermitted-work flags) is a legally-sensitive seller-disclosure document;
// a permanent guessable URL undermined the 7-day expiresAt retention gate
// entirely. Fixed to presign from fileKey on every read instead.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ record, records, presignImpl }) {
  const presignCalls = [];

  const prismaMock = {
    permitDisclosureExport: {
      findFirst: async () => record,
      findMany: async () => records,
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  // JobQueue.service.ts opens real BullMQ/Redis connections at import time —
  // stub it before the first require of permitTracker.service.ts below.
  const jobQueuePath = require.resolve('../../src/services/JobQueue.service.ts');
  require.cache[jobQueuePath] = {
    id: jobQueuePath,
    filename: jobQueuePath,
    loaded: true,
    exports: { generatePermitDisclosureQueue: { add: async () => ({ id: 'job-1' }) } },
  };

  const presignPath = require.resolve('../../src/services/storage/presign.ts');
  require.cache[presignPath] = {
    id: presignPath,
    filename: presignPath,
    loaded: true,
    exports: {
      presignGetObject: async (args) => {
        presignCalls.push(args);
        return presignImpl ? presignImpl(args) : `https://signed.example.com/${args.key}`;
      },
    },
  };

  const servicePath = require.resolve('../../src/services/permitTracker.service.ts');
  delete require.cache[servicePath];
  return { ...require(servicePath), getPresignCalls: () => presignCalls };
}

function completedRecord(overrides = {}) {
  return {
    id: 'export-1',
    propertyId: 'property-1',
    status: 'COMPLETED',
    totalPermits: 3,
    openFlags: 1,
    fileKey: 'permit-disclosure-property-1-2026-07-20.pdf',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    errorMessage: null,
    snapshotJson: { propertyContextVersion: 'v1' },
    createdAt: new Date(),
    ...overrides,
  };
}

test('getDisclosureExport returns a presigned URL, never the raw fileKey/bucket URL', async () => {
  process.env.S3_BUCKET = 'test-bucket';
  const { permitTrackerService, getPresignCalls } = loadService({ record: completedRecord() });

  const result = await permitTrackerService.getDisclosureExport('export-1', 'property-1');

  assert.equal(result.fileUrl, 'https://signed.example.com/permit-disclosure-property-1-2026-07-20.pdf');
  assert.doesNotMatch(result.fileUrl, /s3\.amazonaws\.com/, 'must not fall back to a raw permanent S3 URL');
  assert.equal(getPresignCalls().length, 1);
  assert.equal(getPresignCalls()[0].bucket, 'test-bucket');
  assert.equal(getPresignCalls()[0].expiresInSeconds, 60);
});

test('getDisclosureExport returns null fileUrl once the DB-level expiresAt has passed', async () => {
  process.env.S3_BUCKET = 'test-bucket';
  const { permitTrackerService, getPresignCalls } = loadService({
    record: completedRecord({ expiresAt: new Date(Date.now() - 1000) }),
  });

  const result = await permitTrackerService.getDisclosureExport('export-1', 'property-1');

  assert.equal(result.fileUrl, null);
  assert.equal(getPresignCalls().length, 0, 'must not presign an expired export');
});

test('getDisclosureExport returns null fileUrl while still GENERATING', async () => {
  process.env.S3_BUCKET = 'test-bucket';
  const { permitTrackerService } = loadService({
    record: completedRecord({ status: 'GENERATING', fileKey: null }),
  });

  const result = await permitTrackerService.getDisclosureExport('export-1', 'property-1');

  assert.equal(result.fileUrl, null);
});

test('listDisclosureExports presigns each completed, unexpired export independently', async () => {
  process.env.S3_BUCKET = 'test-bucket';
  const { permitTrackerService, getPresignCalls } = loadService({
    records: [
      completedRecord({ id: 'export-1', fileKey: 'key-1' }),
      completedRecord({ id: 'export-2', fileKey: 'key-2', expiresAt: new Date(Date.now() - 1000) }),
    ],
  });

  const results = await permitTrackerService.listDisclosureExports('property-1');

  assert.equal(results.length, 2);
  assert.equal(results[0].fileUrl, 'https://signed.example.com/key-1');
  assert.equal(results[1].fileUrl, null);
  assert.equal(getPresignCalls().length, 1);
  assert.equal(results[0].fileKey, undefined, 'the raw object key must not leak into the API response');
});
