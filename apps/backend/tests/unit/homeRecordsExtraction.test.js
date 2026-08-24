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
const transactionCalls = { warrantyCreates: [], expenseCreates: [], candidateUpdateManys: [], linkCreates: [], homeEventCreates: [] };
let homeEventIdCounter = 0;
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
    expense: {
      create: async (args) => {
        transactionCalls.expenseCreates.push(args);
        return { id: 'expense-1', ...args.data };
      },
    },
    extractedFactCandidate: {
      updateMany: async (args) => { transactionCalls.candidateUpdateManys.push(args); return { count: args.where.id.in.length }; },
    },
    propertyRecordLink: {
      create: async (args) => { transactionCalls.linkCreates.push(args); return { id: `link-${transactionCalls.linkCreates.length + 1}`, ...args.data }; },
    },
    homeEvent: {
      create: async (args) => {
        transactionCalls.homeEventCreates.push(args);
        homeEventIdCounter += 1;
        return { id: `home-event-${homeEventIdCounter}`, ...args.data };
      },
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

const stagePolicyTermCalls = [];
let stagePolicyTermResult = { policy: { id: 'policy-1' }, term: { id: 'term-1' } };
const policyRecordPath = require.resolve('../../src/services/insurancePolicyRecord.service.ts');
require.cache[policyRecordPath] = {
  id: policyRecordPath,
  filename: policyRecordPath,
  loaded: true,
  exports: {
    stageExtractedPolicyTerm: async (input) => {
      stagePolicyTermCalls.push(input);
      return stagePolicyTermResult;
    },
  },
};

const propertyChangeCalls = [];
const propertyChangePath = require.resolve('../../src/propertyChanges/propertyChange.service.ts');
require.cache[propertyChangePath] = {
  id: propertyChangePath,
  filename: propertyChangePath,
  loaded: true,
  exports: {
    emitPropertyChangeWithTransaction: async (_tx, input) => {
      propertyChangeCalls.push(input);
      return { change: { id: `change-${propertyChangeCalls.length}`, ...input }, deduped: false };
    },
  },
};

const documentPromotionOutcomeCalls = [];
const outcomeObservationServicePath = require.resolve('../../src/services/decisionPlatform/outcomeObservationService.ts');
require.cache[outcomeObservationServicePath] = {
  id: outcomeObservationServicePath,
  filename: outcomeObservationServicePath,
  loaded: true,
  exports: {
    recordDocumentPromotionOutcome: async (input) => {
      documentPromotionOutcomeCalls.push(input);
      return { id: `outcome-${documentPromotionOutcomeCalls.length}`, ...input };
    },
  },
};

const { HomeRecordsExtractionService } = require('../../src/services/homeRecordsExtraction.service.ts');
const service = new HomeRecordsExtractionService();

const originalBucket = process.env.S3_BUCKET;
process.env.S3_BUCKET = 'bucket-1';
test.after(() => { process.env.S3_BUCKET = originalBucket; });

test('runExtraction refuses record types with no promotion contract', async () => {
  versionForRecord = {
    id: 'version-1',
    scanStatus: 'CLEAN',
    record: { lifecycleStatus: 'ACTIVE', recordType: 'MANUAL' },
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
  versionForRecord = { id: 'version-1', originalFileName: 'ge-fridge-warranty.pdf' };
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
  transactionCalls.homeEventCreates.length = 0;
  homeEventIdCounter = 0;

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

  // Slice 6: the real historical fact (coverage began) is promoted to
  // Timeline instead of leaving only a generic upload trail, and the
  // record links back to that event so the evidence-impact purge gate
  // engages for it too.
  assert.equal(transactionCalls.homeEventCreates.length, 1);
  const eventData = transactionCalls.homeEventCreates[0].data;
  assert.equal(eventData.type, 'MILESTONE');
  assert.match(eventData.title, /GE/);
  assert.equal(eventData.occurredAt.toISOString().slice(0, 10), '2024-03-01');
  assert.equal(eventData.observationKind, 'EVIDENCE_DERIVED');
  assert.equal(eventData.verificationStatus, 'EVIDENCE_VERIFIED');
  assert.equal(eventData.sourceEntityType, 'WARRANTY');
  assert.equal(eventData.sourceEntityId, 'warranty-1');

  assert.equal(transactionCalls.linkCreates.length, 2);
  assert.equal(transactionCalls.linkCreates[1].data.entityType, 'HOME_EVENT');
  assert.equal(transactionCalls.linkCreates[1].data.entityId, 'home-event-1');
  assert.equal(transactionCalls.linkCreates[1].data.purpose, 'EVIDENCE');
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

test('runExtraction stages a document-type candidate plus mapped expense fields for a RECEIPT record', async () => {
  // Earlier promote* tests permanently swap this mock to read from
  // candidatesForPromotion instead — restore the default before exercising
  // runExtraction's own "already analyzed" findMany check.
  prismaMock.extractedFactCandidate.findMany = async () => existingCandidates;
  versionForRecord = {
    id: 'version-1',
    storageKey: 'key-1',
    mimeType: 'application/pdf',
    originalFileName: 'home-depot-receipt.pdf',
    scanStatus: 'CLEAN',
    record: { lifecycleStatus: 'ACTIVE', recordType: 'RECEIPT' },
  };
  existingCandidates = [];
  analyzeResult = {
    documentType: 'RECEIPT',
    confidence: 0.75,
    extractedData: {
      vendor: 'Home Depot',
      amount: 84.21,
      purchaseDate: new Date('2026-06-15T00:00:00.000Z'),
      category: 'materials',
    },
    suggestedActions: [],
  };
  createManyCalls.length = 0;

  await service.runExtraction({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1' });

  assert.equal(createManyCalls.length, 1);
  const rows = createManyCalls[0].data;
  const byField = Object.fromEntries(rows.map((r) => [r.fieldKey, r]));

  assert.equal(rows.every((r) => r.targetDomain === 'EXPENSE'), true);
  assert.equal(byField._documentType.proposedValue, 'RECEIPT');
  assert.equal(byField.description.proposedValue, 'Home Depot');
  assert.equal(byField.amount.proposedValue, '84.21');
  assert.equal(byField.transactionDate.proposedValue, '2026-06-15');
  assert.equal(byField.category.proposedValue, 'MATERIALS');
});

test('promoteExpense blocks promotion until every required field is confirmed or corrected', async () => {
  versionForRecord = { id: 'version-1' };
  candidatesForPromotion = [
    { id: 'c-desc', fieldKey: 'description', reviewStatus: 'CONFIRMED', reviewedValue: 'Home Depot', promotedEntityId: null },
    { id: 'c-amount', fieldKey: 'amount', reviewStatus: 'PENDING', reviewedValue: null, promotedEntityId: null },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;

  await assert.rejects(
    service.promoteExpense({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' }),
    (err) => {
      assert.equal(err.code, 'PROPERTY_RECORD_EXTRACTION_PROMOTION_INCOMPLETE');
      assert.ok(err.details.missingFields.includes('amount'));
      assert.ok(err.details.missingFields.includes('transactionDate'));
      return true;
    },
  );
});

test('promoteExpense creates an Expense, links it, and marks candidates promoted once required fields are reviewed', async () => {
  versionForRecord = { id: 'version-1', originalFileName: 'home-depot-receipt.pdf' };
  candidatesForPromotion = [
    { id: 'c-desc', fieldKey: 'description', reviewStatus: 'CONFIRMED', reviewedValue: 'Home Depot', promotedEntityId: null },
    { id: 'c-amount', fieldKey: 'amount', reviewStatus: 'CONFIRMED', reviewedValue: '84.21', promotedEntityId: null },
    { id: 'c-date', fieldKey: 'transactionDate', reviewStatus: 'CORRECTED', reviewedValue: '2026-06-15', promotedEntityId: null },
    { id: 'c-category', fieldKey: 'category', reviewStatus: 'CONFIRMED', reviewedValue: 'MATERIALS', promotedEntityId: null },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;
  propertyForPromotion = { homeownerProfileId: 'homeowner-1' };
  transactionCalls.expenseCreates.length = 0;
  transactionCalls.candidateUpdateManys.length = 0;
  transactionCalls.linkCreates.length = 0;
  transactionCalls.homeEventCreates.length = 0;
  homeEventIdCounter = 0;

  const expense = await service.promoteExpense({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' });

  assert.equal(expense.id, 'expense-1');
  const createData = transactionCalls.expenseCreates[0].data;
  assert.equal(createData.homeownerProfileId, 'homeowner-1');
  assert.equal(createData.description, 'Home Depot');
  assert.equal(createData.amount, 84.21);
  assert.equal(createData.category, 'MATERIALS');
  assert.equal(createData.transactionDate.toISOString().slice(0, 10), '2026-06-15');

  assert.equal(transactionCalls.candidateUpdateManys[0].data.promotedEntityId, 'expense-1');
  assert.deepEqual(
    transactionCalls.candidateUpdateManys[0].where.id.in.sort(),
    ['c-amount', 'c-category', 'c-date', 'c-desc'].sort(),
  );

  assert.equal(transactionCalls.linkCreates[0].data.entityType, 'EXPENSE');
  assert.equal(transactionCalls.linkCreates[0].data.entityId, 'expense-1');
  assert.equal(transactionCalls.linkCreates[0].data.purpose, 'RECEIPT');

  // Slice 6: promote the real fact (a purchase happened) to Timeline,
  // using the typed expenseId FK rather than a sourceEntityType/Id pointer.
  assert.equal(transactionCalls.homeEventCreates.length, 1);
  const eventData = transactionCalls.homeEventCreates[0].data;
  assert.equal(eventData.type, 'PURCHASE');
  assert.match(eventData.title, /Home Depot/);
  assert.equal(eventData.occurredAt.toISOString().slice(0, 10), '2026-06-15');
  assert.equal(eventData.expenseId, 'expense-1');
  assert.equal(Number(eventData.amount), 84.21);
  assert.equal(eventData.observationKind, 'EVIDENCE_DERIVED');
  assert.equal(eventData.verificationStatus, 'EVIDENCE_VERIFIED');

  assert.equal(transactionCalls.linkCreates.length, 2);
  assert.equal(transactionCalls.linkCreates[1].data.entityType, 'HOME_EVENT');
  assert.equal(transactionCalls.linkCreates[1].data.entityId, 'home-event-1');
});

test('promoteExpense refuses to run twice against the same analysis', async () => {
  versionForRecord = { id: 'version-1' };
  candidatesForPromotion = [
    { id: 'c-desc', fieldKey: 'description', reviewStatus: 'CONFIRMED', reviewedValue: 'Home Depot', promotedEntityId: 'expense-1' },
    { id: 'c-amount', fieldKey: 'amount', reviewStatus: 'CONFIRMED', reviewedValue: '84.21', promotedEntityId: 'expense-1' },
    { id: 'c-date', fieldKey: 'transactionDate', reviewStatus: 'CONFIRMED', reviewedValue: '2026-06-15', promotedEntityId: 'expense-1' },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;

  await assert.rejects(
    service.promoteExpense({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' }),
    (err) => err.code === 'PROPERTY_RECORD_EXTRACTION_ALREADY_PROMOTED',
  );
});

test('runExtraction stages a document-type candidate plus mapped insurance fields for an INSURANCE_POLICY record', async () => {
  prismaMock.extractedFactCandidate.findMany = async () => existingCandidates;
  versionForRecord = {
    id: 'version-1',
    storageKey: 'key-1',
    mimeType: 'application/pdf',
    originalFileName: 'homeowners-policy.pdf',
    scanStatus: 'CLEAN',
    record: { lifecycleStatus: 'ACTIVE', recordType: 'INSURANCE_POLICY' },
  };
  existingCandidates = [];
  analyzeResult = {
    documentType: 'INSURANCE_POLICY',
    confidence: 0.9,
    extractedData: {
      carrierName: 'State Farm',
      policyNumber: 'SF-12345',
      coverageType: 'HO-3',
      premiumAmount: 1450,
      deductible: 1000,
      dwellingLimit: 350000,
      personalPropertyLimit: 175000,
      liabilityLimit: 300000,
      valuationBasis: 'Replacement Cost',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      expiryDate: new Date('2027-01-01T00:00:00.000Z'),
    },
    suggestedActions: [],
  };
  createManyCalls.length = 0;

  await service.runExtraction({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1' });

  assert.equal(createManyCalls.length, 1);
  const rows = createManyCalls[0].data;
  const byField = Object.fromEntries(rows.map((r) => [r.fieldKey, r]));

  assert.equal(rows.every((r) => r.targetDomain === 'INSURANCE_POLICY'), true);
  assert.equal(byField._documentType.proposedValue, 'INSURANCE_POLICY');
  assert.equal(byField.carrierName.proposedValue, 'State Farm');
  assert.equal(byField.policyNumber.proposedValue, 'SF-12345');
  assert.equal(byField.coverageType.proposedValue, 'HO-3');
  assert.equal(byField.premiumAmount.proposedValue, '1450');
  assert.equal(byField.deductibleAmount.proposedValue, '1000');
  assert.equal(byField.dwellingLimit.proposedValue, '350000');
  assert.equal(byField.personalPropertyLimit.proposedValue, '175000');
  assert.equal(byField.liabilityLimit.proposedValue, '300000');
  assert.equal(byField.valuationBasis.proposedValue, 'Replacement Cost');
  assert.equal(byField.termStart.proposedValue, '2026-01-01');
  assert.equal(byField.termEnd.proposedValue, '2027-01-01');
});

test('promoteInsurancePolicy blocks staging until every required field is confirmed or corrected', async () => {
  versionForRecord = { id: 'version-1' };
  candidatesForPromotion = [
    { id: 'c-carrier', fieldKey: 'carrierName', reviewStatus: 'CONFIRMED', reviewedValue: 'State Farm', promotedEntityId: null },
    { id: 'c-policy', fieldKey: 'policyNumber', reviewStatus: 'PENDING', reviewedValue: null, promotedEntityId: null },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;

  await assert.rejects(
    service.promoteInsurancePolicy({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' }),
    (err) => {
      assert.equal(err.code, 'PROPERTY_RECORD_EXTRACTION_PROMOTION_INCOMPLETE');
      assert.ok(err.details.missingFields.includes('policyNumber'));
      return true;
    },
  );
});

test('promoteInsurancePolicy stages a policy term via stageExtractedPolicyTerm, links it, and marks candidates promoted', async () => {
  versionForRecord = { id: 'version-1', originalFileName: 'homeowners-policy.pdf' };
  candidatesForPromotion = [
    { id: 'c-carrier', fieldKey: 'carrierName', reviewStatus: 'CONFIRMED', reviewedValue: 'State Farm', promotedEntityId: null },
    { id: 'c-policy', fieldKey: 'policyNumber', reviewStatus: 'CONFIRMED', reviewedValue: 'SF-12345', promotedEntityId: null },
    { id: 'c-coverage', fieldKey: 'coverageType', reviewStatus: 'CONFIRMED', reviewedValue: 'HO-3', promotedEntityId: null },
    { id: 'c-premium', fieldKey: 'premiumAmount', reviewStatus: 'CORRECTED', reviewedValue: '1500', promotedEntityId: null },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;
  propertyForPromotion = { homeownerProfileId: 'homeowner-1' };
  stagePolicyTermCalls.length = 0;
  stagePolicyTermResult = { policy: { id: 'policy-1' }, term: { id: 'term-1' } };
  transactionCalls.candidateUpdateManys.length = 0;
  transactionCalls.linkCreates.length = 0;
  transactionCalls.homeEventCreates.length = 0;
  homeEventIdCounter = 0;

  const staged = await service.promoteInsurancePolicy({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' });

  assert.equal(staged.policy.id, 'policy-1');
  assert.equal(staged.term.id, 'term-1');

  assert.equal(stagePolicyTermCalls.length, 1);
  const staging = stagePolicyTermCalls[0];
  assert.equal(staging.homeownerProfileId, 'homeowner-1');
  assert.equal(staging.userId, 'u1');
  assert.equal(staging.propertyId, 'p1');
  assert.equal(staging.carrierName, 'State Farm');
  assert.equal(staging.policyNumber, 'SF-12345');
  assert.equal(staging.coverageType, 'HO-3');
  assert.equal(staging.premiumAmount, 1500);
  assert.equal(staging.documentId, undefined);

  assert.equal(transactionCalls.candidateUpdateManys[0].data.promotedEntityType, 'INSURANCE_POLICY_TERM');
  assert.equal(transactionCalls.candidateUpdateManys[0].data.promotedEntityId, 'term-1');
  assert.deepEqual(
    transactionCalls.candidateUpdateManys[0].where.id.in.sort(),
    ['c-carrier', 'c-coverage', 'c-policy', 'c-premium'].sort(),
  );

  assert.equal(transactionCalls.linkCreates[0].data.entityType, 'INSURANCE_POLICY');
  assert.equal(transactionCalls.linkCreates[0].data.entityId, 'policy-1');
  assert.equal(transactionCalls.linkCreates[0].data.purpose, 'EVIDENCE');

  // Unlike promoteWarranty/promoteExpense, no HomeEvent is created — the
  // staged facts are still UNVERIFIED until confirmed per-field through the
  // insurance domain's own review workflow.
  assert.equal(transactionCalls.homeEventCreates.length, 0);
});

test('promoteInsurancePolicy refuses to run twice against the same analysis', async () => {
  versionForRecord = { id: 'version-1' };
  candidatesForPromotion = [
    { id: 'c-carrier', fieldKey: 'carrierName', reviewStatus: 'CONFIRMED', reviewedValue: 'State Farm', promotedEntityId: 'term-1' },
    { id: 'c-policy', fieldKey: 'policyNumber', reviewStatus: 'CONFIRMED', reviewedValue: 'SF-12345', promotedEntityId: 'term-1' },
  ];
  prismaMock.extractedFactCandidate.findMany = async () => candidatesForPromotion;

  await assert.rejects(
    service.promoteInsurancePolicy({ propertyId: 'p1', recordId: 'r1', versionId: 'version-1', userId: 'u1' }),
    (err) => err.code === 'PROPERTY_RECORD_EXTRACTION_ALREADY_PROMOTED',
  );
});
