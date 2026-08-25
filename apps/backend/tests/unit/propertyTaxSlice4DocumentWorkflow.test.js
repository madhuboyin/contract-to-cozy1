const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  PROPERTY_TAX_PRIVACY_CONSENT_VERSION,
  PropertyTaxDocumentIntakeService,
} = require('../../src/services/propertyTax/propertyTaxDocumentIntake.service');
const {
  PropertyTaxHomeownerActionService,
} = require('../../src/services/propertyTax/propertyTaxHomeownerAction.service');

test('Vault intake requires explicit privacy consent before storage', async () => {
  let uploads = 0;
  const service = new PropertyTaxDocumentIntakeService(
    {},
    async () => {
      uploads += 1;
      return { key: 'unexpected' };
    },
  );

  await assert.rejects(
    () => service.createVaultIntake({
      propertyId: 'property-1',
      userId: 'user-1',
      kind: 'TAX_BILL',
      privacyConsent: false,
      file: { originalname: 'bill.pdf' },
    }),
    /Privacy consent/,
  );
  assert.equal(uploads, 0);
});

test('tax document upload uses owned Vault storage and records consent provenance', async () => {
  const calls = { document: [], intake: [], removed: [] };
  const tx = {
    document: {
      async create(input) {
        calls.document.push(input);
        return { id: 'document-1', ...input.data };
      },
    },
    propertyTaxDocumentIntake: {
      async create(input) {
        calls.intake.push(input);
        return {
          id: 'intake-1',
          document: { id: 'document-1' },
          fields: [],
          ...input.data,
        };
      },
    },
  };
  const db = {
    property: {
      async findFirst() {
        return { id: 'property-1', homeownerProfileId: 'profile-1' };
      },
    },
    async $transaction(callback) {
      return callback(tx);
    },
  };
  const service = new PropertyTaxDocumentIntakeService(
    db,
    async () => ({ key: 'documents/profile-1/property-1/bill.pdf' }),
    async (key) => calls.removed.push(key),
  );

  const result = await service.createVaultIntake({
    propertyId: 'property-1',
    userId: 'user-1',
    kind: 'TAX_BILL',
    privacyConsent: true,
    file: {
      originalname: 'bill.pdf',
      mimetype: 'application/pdf',
      size: 128,
      buffer: Buffer.from('%PDF tax bill'),
    },
  });

  assert.equal(result.storageMode, 'VAULT');
  assert.equal(result.extractionMethod, 'MANUAL');
  assert.equal(
    calls.intake[0].data.privacyConsentVersion,
    PROPERTY_TAX_PRIVACY_CONSENT_VERSION,
  );
  assert.equal(calls.document[0].data.verificationStatus, 'PENDING');
  assert.equal(calls.document[0].data.metadata.category, 'PROPERTY_TAX');
  assert.equal(calls.removed.length, 0);
});

test('manual staging preserves per-field confidence and source location', async () => {
  const calls = { fields: [], intake: [] };
  const tx = {
    propertyTaxExtractedField: {
      async upsert(input) {
        calls.fields.push(input);
        return { id: `field-${calls.fields.length}` };
      },
    },
    propertyTaxDocumentIntake: {
      async update(input) {
        calls.intake.push(input);
        return { id: 'intake-1', fields: [] };
      },
    },
  };
  const service = new PropertyTaxDocumentIntakeService({
    propertyTaxDocumentIntake: {
      async findFirst() {
        return { id: 'intake-1', status: 'UPLOADED' };
      },
    },
    async $transaction(callback) {
      return callback(tx);
    },
  });

  await service.stageManualFields(
    'intake-1',
    'property-1',
    'user-1',
    [{
      fieldKey: 'totalAssessedValue',
      value: 250000,
      confidence: 0.92,
      pageNumber: 1,
      boundingBox: { x: 10, y: 20, width: 80, height: 12 },
      sourceText: 'Total assessed value $250,000',
    }],
    new Date('2026-07-27T12:00:00.000Z'),
  );

  assert.equal(calls.fields[0].create.confidence, 0.92);
  assert.equal(calls.fields[0].create.pageNumber, 1);
  assert.match(calls.fields[0].create.sourceTextHash, /^[a-f0-9]{64}$/);
  assert.equal(calls.intake[0].data.status, 'NEEDS_REVIEW');
  assert.equal(calls.intake[0].data.extractionProvider, null);
});

test('homeowner confirmation creates document-backed canonical assessment and bill evidence', async () => {
  const calls = {
    assessment: [],
    bill: [],
    evidence: [],
    document: [],
    intake: [],
  };
  const fields = [
    { id: 'field-year', fieldKey: 'taxYear', proposedValueJson: 2027 },
    { id: 'field-parcel', fieldKey: 'parcelId', proposedValueJson: 'parcel-100' },
    { id: 'field-value', fieldKey: 'totalAssessedValue', proposedValueJson: 250000 },
    { id: 'field-exemption', fieldKey: 'exemptions', proposedValueJson: ['STAR'] },
    { id: 'field-bill', fieldKey: 'billAmount', proposedValueJson: 4800 },
  ];
  const tx = {
    propertyTaxDocumentIntake: {
      async findFirst() {
        return {
          id: 'intake-1',
          propertyId: 'property-1',
          documentId: 'document-1',
          kind: 'TAX_BILL',
          status: 'NEEDS_REVIEW',
          document: { id: 'document-1' },
          fields,
          confirmedAssessmentRecord: null,
          confirmedBillRecord: null,
        };
      },
      async update(input) {
        calls.intake.push(input);
        return { id: 'intake-1', ...input.data, fields };
      },
    },
    propertyTaxExtractedField: {
      async update() {
        return {};
      },
    },
    property: {
      async findUniqueOrThrow() {
        return {
          id: 'property-1',
          address: '123 Main Street',
          city: 'Bronx',
          state: 'NY',
          zipCode: '10451',
          county: 'Bronx',
          countyFips: '36005',
          taxAssessmentRecords: [{ jurisdictionId: 'jurisdiction-1' }],
        };
      },
    },
    propertyTaxJurisdiction: {
      async findUniqueOrThrow() {
        return { id: 'jurisdiction-1' };
      },
    },
    propertyTaxParcelMatch: {
      async findFirst() {
        return null;
      },
      async create() {
        return { id: 'parcel-match-1' };
      },
    },
    propertyTaxAssessmentRecord: {
      async create(input) {
        calls.assessment.push(input);
        return { id: 'assessment-1' };
      },
    },
    propertyTaxAssessmentDocument: {
      async create() {
        return {};
      },
    },
    propertyTaxBillRecord: {
      async create(input) {
        calls.bill.push(input);
        return { id: 'bill-1' };
      },
    },
    propertyTaxBillDocument: {
      async create() {
        return {};
      },
    },
    propertyTaxFieldEvidence: {
      async create(input) {
        calls.evidence.push(input);
        return {};
      },
    },
    document: {
      async update(input) {
        calls.document.push(input);
        return {};
      },
    },
  };
  const service = new PropertyTaxDocumentIntakeService({
    async $transaction(callback) {
      return callback(tx);
    },
  }, undefined, undefined, async (_tx, input) => {
    calls.propertyChange = input;
  });

  const result = await service.confirm(
    'intake-1',
    'property-1',
    'user-1',
    fields.map((field) => ({
      fieldKey: field.fieldKey,
      status: 'CONFIRMED',
    })),
    new Date('2026-07-27T12:00:00.000Z'),
  );

  assert.equal(calls.assessment[0].data.sourceType, 'DOCUMENT');
  assert.equal(calls.assessment[0].data.totalAssessedValue, 250000);
  assert.deepEqual(calls.assessment[0].data.exemptionsJson, ['STAR']);
  assert.equal(calls.bill[0].data.sourceType, 'DOCUMENT');
  assert.equal(calls.bill[0].data.billAmount, 4800);
  assert.ok(calls.evidence.every((call) =>
    call.data.reviewStatus === 'HOMEOWNER_CONFIRMED'
    && call.data.sourceDocumentId === 'document-1'
  ));
  assert.equal(calls.document[0].data.verificationStatus, 'VERIFIED');
  assert.equal(result.confirmedAssessmentRecordId, 'assessment-1');
  assert.equal(result.confirmedBillRecordId, 'bill-1');
  assert.equal(calls.propertyChange.changeType, 'DOCUMENT_PROMOTED');
  assert.deepEqual(calls.propertyChange.changedFactKeys, [
    'financial.propertyTaxAssessment',
    'financial.propertyTaxBill',
  ]);
});

test('reviewed rules create exemption and correction checklists without eligibility conclusions', async () => {
  const upserts = [];
  const service = new PropertyTaxHomeownerActionService(
    {
      propertyTaxDocumentIntake: {
        async findFirst() {
          return { id: 'intake-1' };
        },
      },
      propertyTaxHomeownerAction: {
        async upsert(input) {
          upserts.push(input);
          return {};
        },
        async findMany() {
          return [];
        },
      },
    },
    {
      async getForProperty() {
        return {
          coverage: 'REVIEWED',
          reason: null,
          profile: {
            id: 'profile-1',
            slug: 'bronx-class-1',
            version: 1,
            officialLinks: {
              assessment: 'https://nyc.gov/assessment',
              challenge: 'https://nyc.gov/challenge',
              exemptions: 'https://nyc.gov/exemptions',
            },
          },
        };
      },
    },
    {
      async getCenter() {
        return { conflicts: [{ fieldKey: 'classification', observations: [] }] };
      },
    },
  );

  const result = await service.listAndRefresh('property-1', 'user-1');

  assert.equal(result.coverage, 'REVIEWED');
  assert.equal(upserts.length, 3);
  assert.ok(upserts.some((call) =>
    call.create.type === 'EXEMPTION_REVIEW'
    && /without assuming/.test(call.create.explanation)
  ));
  assert.ok(upserts.some((call) =>
    call.create.type === 'FACTUAL_CORRECTION'
    && /conflict/.test(call.create.explanation)
  ));
});

test('Slice 4 exposes consented Vault intake and reviewed non-appeal actions without a migration', () => {
  const root = path.resolve(__dirname, '../../..');
  const read = (relativePath) => fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
  const schema = read('backend/prisma/schema.prisma');
  const routes = read('backend/src/routes/propertyTax.routes.ts');
  const client = read(
    'frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
  );

  for (const model of [
    'PropertyTaxDocumentIntake',
    'PropertyTaxExtractedField',
    'PropertyTaxHomeownerAction',
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
  }
  assert.match(routes, /property-tax\/intakes/);
  assert.match(routes, /validateDocumentUpload/);
  assert.match(routes, /property-tax\/actions\/refresh/);
  assert.match(client, /does not send the document to an AI provider/);
  assert.match(client, /Eligibility is never assumed/);

  const migrationsDirectory = path.join(root, 'backend/prisma/migrations');
  const taxMigrations = fs.existsSync(migrationsDirectory)
    ? fs.readdirSync(migrationsDirectory)
      .filter((name) => /property.tax|tax.appeal/i.test(name))
    : [];
  assert.deepEqual(taxMigrations, []);
});
