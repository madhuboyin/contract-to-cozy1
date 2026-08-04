const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let versionForRecord = null;
let existingCandidates = [];
let candidateForReview = null;
let candidatesForPromotion = [];
let propertyForPromotion = { homeownerProfileId: 'homeowner-1' };

const createManyCalls = [];
const updateManyCalls = [];
const updateCalls = [];
const transactionCalls = { warrantyCreates: [], candidateUpdateManys: [], linkCreates: [] };
let downloadCalls = 0;
let analyzeCalls = 0;
let analyzeResult = null;

const prismaMock = {
  propertyRecordVersion: {
    findFirst: async () => versionForRecord,
  },
  extractedFactCandidate: {
    findMany: async () => existingCandidates,
    findFirst: async () => candidateForReview,
    createMany: async (args) => { createManyCalls.push(args); return { count: args.data.length }; },
    update: async (args) => { updateCalls.push(args); return { id: args.where.id, ...args.data }; },
    updateMany: async (args) => { updateManyCalls.push(args); return { count: 1 }; },
  },
  property: {
    findUnique: async () => propertyForPromotion,
  },
  $transaction: async (fn) => fn({
    warranty: {
      create: async (args) => {
        transactionCalls.warrantyCreates.push(args);
        return { id: 'warranty-1', ...args.data };
      },
    },
    extractedFactCandidate: {
      updateMany: async (args) => { transactionCalls.candidateUpdateManys.push(args); return { count: args.where.id.in.length }; },
    },
    propertyRecordLink: {
      create: async (args) => { transactionCalls.linkCreates.push(args); return { id: 'link-1', ...args.data }; },
    },
  }),
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const storagePath = require.resolve('../../src/services/storage/reportStorage.ts');
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: {
    downloadObjectBuffer: async () => { downloadCalls += 1; return Buffer.from('fake-pdf'); },
  },
};

const intelligencePath = require.resolve('../../src/services/documentIntelligence.service.ts');
require.cache[intelligencePath] = {
  id: intelligencePath,
  filename: intelligencePath,
  loaded: true,
  exports: {
    documentIntelligenceService: {
      analyzeDocument: async () => { analyzeCalls += 1; return analyzeResult; },
    },
  },
};

const { HomeRecordsExtractionService } = require('../../src/services/homeRecordsExtraction.service.ts');
const service = new HomeRecordsExtractionService();

const originalBucket = process.env.S3_BUCKET;
process.env.S3_BUCKET = 'bucket-1';
test.after(() => { process.env.S3_BUCKET = originalBucket; });

test('runExtraction refuses non-WARRANTY record types', async () => {
  versionForRecord = {
    id: 'version-1',
    scanStatus: 'CLEAN',
    record: { lifecycleStatus: 'ACTIVE', recordType: 'RECEIPT' },
  };

  await assert.rejects(
    service.runExtraction({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1' }),
    (err) => err.code === 'PROPERTY_RECORD_EXTRACTION_UNSUPPORTED_TYPE',
  );
});

test('runExtraction refuses a version that has not passed content validation', async () => {
  versionForRecord = {
    id: 'version-1',
    scanStatus: 'PENDING',
    record: { lifecycleStatus: 'ACTIVE', recordType: 'WARRANTY' },
  };

  await assert.rejects(
    service.runExtraction({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1' }),
    (err) => err.code === 'PROPERTY_RECORD_VERSION_NOT_CLEAN',
  );
});

test('runExtraction is idempotent — does not re-run AI analysis when candidates already exist', async () => {
  versionForRecord = {
    id: 'version-1',
    scanStatus: 'CLEAN',
    record: { lifecycleStatus: 'ACTIVE', recordType: 'WARRANTY' },
  };
  existingCandidates = [{ id: 'candidate-1', fieldKey: 'providerName' }];
  analyzeCalls = 0;
  downloadCalls = 0;

  const result = await service.runExtraction({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1' });

  assert.equal(analyzeCalls, 0);
  assert.equal(downloadCalls, 0);
  assert.deepEqual(result, existingCandidates);
});

test('runExtraction stages a document-type candidate plus mapped warranty fields from AI insights', async () => {
  versionForRecord = {
    id: 'version-1',
    storageKey: 'key-1',
    mimeType: 'application/pdf',
    originalFileName: 'ge-fridge-warranty.pdf',
    scanStatus: 'CLEAN',
    record: { lifecycleStatus: 'ACTIVE', recordType: 'WARRANTY' },
  };
  existingCandidates = [];
  analyzeResult = {
    documentType: 'WARRANTY',
    confidence: 0.82,
    extractedData: {
      manufacturer: 'GE',
      purchaseDate: new Date('2024-03-01T00:00:00.000Z'),
      warrantyExpiration: new Date('2026-03-01T00:00:00.000Z'),
      category: 'appliance',
      productName: 'Fridge',
      modelNumber: 'GFE28',
      amount: 1899.99,
    },
    suggestedActions: [],
  };
  createManyCalls.length = 0;

  await service.runExtraction({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1' });

  assert.equal(createManyCalls.length, 1);
  const rows = createManyCalls[0].data;
  const byField = Object.fromEntries(rows.map((r) => [r.fieldKey, r]));

  assert.equal(byField._documentType.proposedValue, 'WARRANTY');
  assert.equal(byField.providerName.proposedValue, 'GE');
  assert.equal(byField.startDate.proposedValue, '2024-03-01');
  assert.equal(byField.expiryDate.proposedValue, '2026-03-01');
  assert.equal(byField.category.proposedValue, 'APPLIANCE');
  assert.match(byField.coverageDetails.proposedValue, /Product: Fridge/);
  assert.match(byField.coverageDetails.proposedValue, /Model: GFE28/);
  assert.equal(byField.cost.proposedValue, '1899.99');
  assert.equal(rows.every((r) => r.sourceCitation.includes('ge-fridge-warranty.pdf')), true);
});

test('reviewCandidate CONFIRM copies the proposed value as reviewed', async () => {
  candidateForReview = { id: 'c1', fieldKey: 'providerName', proposedValue: 'GE', promotedEntityId: null };
  updateCalls.length = 0;

  const result = await service.reviewCandidate({
    propertyId: 'p1', recordId: 'r1', candidateId: 'c1', userId: 'u1', action: 'CONFIRM',
  });

  assert.equal(result.reviewStatus, 'CONFIRMED');
  assert.equal(result.reviewedValue, 'GE');
  assert.equal(updateCalls[0].data.reviewedByUserId, 'u1');
});

test('reviewCandidate CORRECT requires a non-empty value', async () => {
  candidateForReview = { id: 'c1', fieldKey: 'providerName', proposedValue: 'GE', promotedEntityId: null };

  await assert.rejects(
    service.reviewCandidate({ propertyId: 'p1', recordId: 'r1', candidateId: 'c1', userId: 'u1', action: 'CORRECT', reviewedValue: '   ' }),
    (err) => err.code === 'EXTRACTED_FACT_CANDIDATE_VALUE_REQUIRED',
  );
});

test('reviewCandidate refuses to review the informational document-type row', async () => {
  candidateForReview = { id: 'c1', fieldKey: '_documentType', proposedValue: 'WARRANTY', promotedEntityId: null };

  await assert.rejects(
    service.reviewCandidate({ propertyId: 'p1', recordId: 'r1', candidateId: 'c1', userId: 'u1', action: 'CONFIRM' }),
    (err) => err.code === 'EXTRACTED_FACT_CANDIDATE_NOT_REVIEWABLE',
  );
});

test('reviewCandidate refuses to re-review an already-promoted candidate', async () => {
  candidateForReview = { id: 'c1', fieldKey: 'providerName', proposedValue: 'GE', promotedEntityId: 'warranty-9' };

  await assert.rejects(
    service.reviewCandidate({ propertyId: 'p1', recordId: 'r1', candidateId: 'c1', userId: 'u1', action: 'CONFIRM' }),
    (err) => err.code === 'EXTRACTED_FACT_CANDIDATE_ALREADY_PROMOTED',
  );
});

test('promoteWarranty blocks promotion until every required field is confirmed or corrected', async () => {
  versionForRecord = { id: 'version-1' };
  candidatesForPromotion = [
    { id: 'c-provider', fieldKey: 'providerName', reviewStatus: 'CONFIRMED', reviewedValue: 'GE', promotedEntityId: null },
    { id: 'c-start', fieldKey: 'startDate', reviewStatus: 'PENDING', reviewedValue: null, promotedEntityId: null },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;

  await assert.rejects(
    service.promoteWarranty({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' }),
    (err) => {
      assert.equal(err.code, 'PROPERTY_RECORD_EXTRACTION_PROMOTION_INCOMPLETE');
      assert.ok(err.details.missingFields.includes('startDate'));
      assert.ok(err.details.missingFields.includes('expiryDate'));
      return true;
    },
  );
});

test('promoteWarranty creates a Warranty, links it, and marks candidates promoted once required fields are reviewed', async () => {
  versionForRecord = { id: 'version-1' };
  candidatesForPromotion = [
    { id: 'c-provider', fieldKey: 'providerName', reviewStatus: 'CONFIRMED', reviewedValue: 'GE', promotedEntityId: null },
    { id: 'c-start', fieldKey: 'startDate', reviewStatus: 'CONFIRMED', reviewedValue: '2024-03-01', promotedEntityId: null },
    { id: 'c-expiry', fieldKey: 'expiryDate', reviewStatus: 'CORRECTED', reviewedValue: '2026-03-01', promotedEntityId: null },
    { id: 'c-category', fieldKey: 'category', reviewStatus: 'CONFIRMED', reviewedValue: 'APPLIANCE', promotedEntityId: null },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;
  propertyForPromotion = { homeownerProfileId: 'homeowner-1' };
  transactionCalls.warrantyCreates.length = 0;
  transactionCalls.candidateUpdateManys.length = 0;
  transactionCalls.linkCreates.length = 0;

  const warranty = await service.promoteWarranty({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' });

  assert.equal(warranty.id, 'warranty-1');
  const createData = transactionCalls.warrantyCreates[0].data;
  assert.equal(createData.homeownerProfileId, 'homeowner-1');
  assert.equal(createData.providerName, 'GE');
  assert.equal(createData.category, 'APPLIANCE');
  assert.equal(createData.startDate.toISOString().slice(0, 10), '2024-03-01');
  assert.equal(createData.expiryDate.toISOString().slice(0, 10), '2026-03-01');

  assert.equal(transactionCalls.candidateUpdateManys[0].data.promotedEntityId, 'warranty-1');
  assert.deepEqual(
    transactionCalls.candidateUpdateManys[0].where.id.in.sort(),
    ['c-category', 'c-expiry', 'c-provider', 'c-start'].sort(),
  );

  assert.equal(transactionCalls.linkCreates[0].data.entityType, 'WARRANTY');
  assert.equal(transactionCalls.linkCreates[0].data.entityId, 'warranty-1');
  assert.equal(transactionCalls.linkCreates[0].data.purpose, 'WARRANTY');
});

test('promoteWarranty refuses to run twice against the same analysis', async () => {
  versionForRecord = { id: 'version-1' };
  candidatesForPromotion = [
    { id: 'c-provider', fieldKey: 'providerName', reviewStatus: 'CONFIRMED', reviewedValue: 'GE', promotedEntityId: 'warranty-1' },
    { id: 'c-start', fieldKey: 'startDate', reviewStatus: 'CONFIRMED', reviewedValue: '2024-03-01', promotedEntityId: 'warranty-1' },
    { id: 'c-expiry', fieldKey: 'expiryDate', reviewStatus: 'CONFIRMED', reviewedValue: '2026-03-01', promotedEntityId: 'warranty-1' },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;

  await assert.rejects(
    service.promoteWarranty({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' }),
    (err) => err.code === 'PROPERTY_RECORD_EXTRACTION_ALREADY_PROMOTED',
  );
});
