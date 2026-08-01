const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

process.env.GEMINI_API_KEY ||= 'test-placeholder';

// Item #24 (§15 "Reconciliation failures are retryable and visible
// internally"). acceptFindingAsWork's resolveAndUpsertWorkItem call is the
// PRIMARY effect of the function (unlike every other caller in the
// codebase, which syncs a work item alongside an already-committed primary
// mutation) -- a failure here must be caught, logged with context, and
// turned into a clean, retryable error, not left to bubble up as a raw
// internal exception.

const finding = {
  id: 'finding-1',
  reportId: 'report-1',
  propertyId: 'property-1',
  status: 'OPEN',
  severity: 'MINOR',
  homeSystem: 'PLUMBING',
  inspectorRecommendation: 'REPAIR',
  inspectorDescription: 'Minor leak.',
  estimatedCostCentsLow: null,
  estimatedCostCentsHigh: null,
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  report: { status: 'CONFIRMED' },
};

const prismaMock = {
  inspectionFinding: {
    findUnique: async () => finding,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const resolveWorkItemPath = require.resolve('../../src/modules/homeOperations/application/resolveWorkItem.usecase.ts');
require.cache[resolveWorkItemPath] = {
  id: resolveWorkItemPath,
  filename: resolveWorkItemPath,
  loaded: true,
  exports: {
    resolveAndUpsertWorkItem: async () => {
      throw new Error('simulated database outage');
    },
  },
};

const { acceptFindingAsWork } = require('../../src/services/inspectionHub.service.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');

test('acceptFindingAsWork turns a resolveAndUpsertWorkItem failure into a clean, retryable error, not a raw exception', async () => {
  await assert.rejects(
    () => acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1'),
    (err) => {
      assert.ok(err instanceof APIError, 'must be the typed APIError, not the raw internal error');
      assert.equal(err.code, 'WORK_ITEM_RESOLUTION_FAILED');
      assert.equal(err.statusCode, 503);
      return true;
    },
  );
});
