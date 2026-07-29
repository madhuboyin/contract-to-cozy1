const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let sourceRow;
let programRow;
let inTransaction = false;
const sourceCreates = [];
const sourceUpdates = [];
const programUpdates = [];
const auditCreates = [];

const hiddenAssetSource = {
  findUnique: async ({ where }) => where.id === sourceRow.id ? sourceRow : null,
  create: async ({ data }) => {
    sourceCreates.push(data);
    return { id: 'source-created', ...data };
  },
  update: async ({ where, data }) => {
    sourceUpdates.push({ where, data, inTransaction });
    sourceRow = { ...sourceRow, ...data };
    return sourceRow;
  },
};

const hiddenAssetProgram = {
  findUnique: async ({ where }) => where.id === programRow.id ? programRow : null,
  updateMany: async ({ where, data }) => {
    programUpdates.push({ where, data, inTransaction });
    if (where.id !== programRow.id || where.reviewStatus !== programRow.reviewStatus) {
      return { count: 0 };
    }
    programRow = { ...programRow, ...data };
    return { count: 1 };
  },
};

const auditLog = {
  create: async ({ data }) => {
    auditCreates.push({ data, inTransaction });
    return { id: `audit-${auditCreates.length}`, ...data };
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
const prisma = {
  hiddenAssetSource,
  hiddenAssetProgram,
  auditLog,
  $transaction: async (fn) => {
    inTransaction = true;
    try {
      return await fn({ hiddenAssetSource, hiddenAssetProgram, auditLog });
    } finally {
      inTransaction = false;
    }
  },
};
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma },
};

const { savingsBenefitsAdminService } = require('../../src/services/savingsBenefitsAdmin.service.ts');
const {
  transitionSavingsBenefitProgram,
} = require('../../src/services/savingsBenefitsGovernance.service.ts');

test.beforeEach(() => {
  sourceRow = {
    id: 'source-1',
    name: 'Official source',
    sourceKind: 'OFFICIAL_GOVERNMENT',
    officialUrl: 'https://example.gov/programs',
    reviewSlaDays: 180,
    status: 'ACTIVE',
    lastReviewedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastReviewedBy: 'reviewer-old',
  };
  programRow = {
    id: 'program-1',
    name: 'Benefit program',
    reviewStatus: 'IN_REVIEW',
    publishedAt: null,
    sourceUrl: 'https://example.gov/programs/benefit',
    lastVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    source: {
      status: 'ACTIVE',
      officialUrl: 'https://example.gov/programs',
      lastReviewedAt: new Date(),
      reviewSlaDays: 180,
    },
  };
  sourceCreates.length = 0;
  sourceUpdates.length = 0;
  programUpdates.length = 0;
  auditCreates.length = 0;
});

test('creating or editing source metadata cannot silently attest a fresh review', async () => {
  await savingsBenefitsAdminService.createSource({
    name: 'New source',
    sourceKind: 'OFFICIAL_GOVERNMENT',
    officialUrl: 'https://example.gov/new',
  });
  assert.equal(sourceCreates[0].lastReviewedAt, null);
  assert.equal(sourceCreates[0].lastReviewedBy, null);

  await savingsBenefitsAdminService.updateSource('source-1', {
    name: 'Official source renamed',
    sourceKind: 'OFFICIAL_GOVERNMENT',
    officialUrl: 'https://example.gov/programs',
  });
  assert.equal('lastReviewedAt' in sourceUpdates[0].data, false);
  assert.equal('lastReviewedBy' in sourceUpdates[0].data, false);
});

test('source review attestation and its audit row share one transaction', async () => {
  const reviewed = await savingsBenefitsAdminService.reviewSource(
    'source-1',
    'reviewer-1',
    'Checked the official program index and publication date.',
  );

  assert.equal(reviewed.lastReviewedBy, 'reviewer-1');
  assert.equal(sourceUpdates[0].inTransaction, true);
  assert.equal(auditCreates[0].inTransaction, true);
  assert.equal(auditCreates[0].data.action, 'ADMIN_SAVINGS_BENEFITS_SOURCE_REVIEW');
  assert.equal(
    auditCreates[0].data.metadata.reason,
    'Checked the official program index and publication date.',
  );
});

test('program lifecycle transition and its audit row are atomic and compare-and-set guarded', async () => {
  const result = await transitionSavingsBenefitProgram({
    programId: 'program-1',
    actorId: 'reviewer-1',
    action: 'APPROVE',
    reason: 'Criteria match the official publication.',
  });

  assert.equal(result.status, 'APPROVED');
  assert.equal(programUpdates[0].where.reviewStatus, 'IN_REVIEW');
  assert.equal(programUpdates[0].inTransaction, true);
  assert.equal(auditCreates[0].inTransaction, true);
  assert.equal(auditCreates[0].data.action, 'ADMIN_SAVINGS_BENEFITS_LIFECYCLE');
});
