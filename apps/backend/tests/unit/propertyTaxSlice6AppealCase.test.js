const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  PropertyTaxAppealCaseService,
} = require('../../src/services/propertyTax/propertyTaxAppealCase.service');

function readyResult() {
  return {
    status: 'READY',
    reason: 'Evidence is ready',
    selectedGround: 'ASSESSED_VALUE',
    gaps: [],
    effort: 'LOW',
    ruleProfile: {
      id: 'profile-1',
      title: 'Reviewed Bronx rules',
      version: 1,
      reviewedAt: '2026-07-27T12:00:00.000Z',
      expiresAt: '2027-01-14T23:59:59.000Z',
    },
    ground: {
      code: 'ASSESSED_VALUE',
      label: 'Assessed value',
      formCode: 'TC108',
      officialFormUrl: 'https://nyc.gov/forms',
      requirements: {},
    },
    canonical: {
      taxYear: 2027,
      parcelId: 'parcel-1',
      valuationDate: '2026-01-05T05:00:00.000Z',
      classification: '1',
      totalAssessedValue: 30000,
      taxableValue: 28000,
      assessmentRatio: 0.06,
      effectiveTaxRate: 0.2,
    },
    evidence: [{ id: 'evidence-1', title: 'Condition record' }],
    comparables: [
      {
        id: 'comp-1',
        qualification: 'QUALIFIED',
        address: '123 Main Street',
        adjustedSalePrice: 400000,
      },
    ],
    taxAtStake: { low: 500, high: 1000 },
    evaluatedAt: '2026-07-27T12:00:00.000Z',
    professionalBoundary: 'No prediction.',
  };
}

function caseRecord(overrides = {}) {
  const now = new Date('2026-07-27T12:00:00.000Z');
  return {
    id: 'case-1',
    propertyId: 'property-1',
    ruleProfileId: 'profile-1',
    caseKey: 'profile-1:ASSESSED_VALUE:2027',
    ground: 'ASSESSED_VALUE',
    status: 'PREPARING',
    taxYear: 2027,
    title: 'Assessed value appeal preparation',
    readinessSnapshotJson: readyResult(),
    officialFormUrl: 'https://nyc.gov/forms',
    formCode: 'TC108',
    externalFilingReference: null,
    filingConfirmationDocumentId: null,
    filedAt: null,
    responseReceivedAt: null,
    responseSummary: null,
    hearingAt: null,
    hearingLocation: null,
    determination: null,
    determinationAt: null,
    determinationReference: null,
    determinationSummary: null,
    originalAssessedValue: 30000,
    finalAssessedValue: null,
    refundAmount: null,
    creditAmount: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    packet: {
      id: 'packet-1',
      caseId: 'case-1',
      status: 'INCOMPLETE',
      checklistJson: [],
      completedChecklistJson: [],
      narrative: 'A sufficiently long evidence-grounded narrative for the current assessment appeal.',
      narrativeMode: 'MANUAL',
      narrativeProvider: null,
      narrativeModel: null,
      narrativeEvidenceJson: {},
      unresolvedPlaceholdersJson: [],
      placeholderValuesJson: {},
      generatedAt: now,
      homeownerReviewedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    events: [],
    reminders: [],
    ruleProfile: {
      id: 'profile-1',
      title: 'Reviewed Bronx rules',
      version: 1,
      reviewedAt: now,
      expiresAt: new Date('2027-01-14T23:59:59.000Z'),
    },
    filingConfirmationDocument: null,
    ...overrides,
  };
}

function transaction(calls) {
  return {
    propertyTaxAppealCase: {
      async create(input) {
        calls.caseCreate.push(input);
        return { id: 'case-1' };
      },
      async update(input) {
        calls.caseUpdate.push(input);
        return { id: 'case-1' };
      },
    },
    propertyTaxAppealPacket: {
      async create(input) {
        calls.packetCreate.push(input);
        return { id: 'packet-1' };
      },
      async update(input) {
        calls.packetUpdate.push(input);
        return { id: 'packet-1' };
      },
    },
    homeEvent: {
      async upsert(input) {
        calls.homeEvent.push(input);
        return { id: `home-${calls.homeEvent.length}` };
      },
    },
    propertyTaxAppealCaseEvent: {
      async create(input) {
        calls.caseEvent.push(input);
        return { id: `event-${calls.caseEvent.length}` };
      },
    },
  };
}

function calls() {
  return {
    caseCreate: [],
    caseUpdate: [],
    packetCreate: [],
    packetUpdate: [],
    homeEvent: [],
    caseEvent: [],
  };
}

test('case creation fails closed unless evidence-qualified readiness is READY', async () => {
  let writes = 0;
  const service = new PropertyTaxAppealCaseService(
    { async $transaction() { writes += 1; } },
    {
      async evaluate() {
        return {
          ...readyResult(),
          status: 'NOT_READY',
          reason: 'Three comparables are missing',
        };
      },
    },
  );

  await assert.rejects(
    () => service.createOrResume({
      propertyId: 'property-1',
      userId: 'user-1',
      ground: 'ASSESSED_VALUE',
    }),
    /readiness is READY/,
  );
  assert.equal(writes, 0);
});

test('ready case creates a manual evidence-grounded packet and Home Timeline event', async () => {
  const recorded = calls();
  const tx = transaction(recorded);
  const db = {
    propertyTaxAppealCase: {
      async findUnique() {
        return null;
      },
      async findFirst() {
        return caseRecord();
      },
    },
    async $transaction(callback) {
      return callback(tx);
    },
  };
  const service = new PropertyTaxAppealCaseService(
    db,
    { async evaluate() { return readyResult(); } },
  );

  const result = await service.createOrResume({
    propertyId: 'property-1',
    userId: 'user-1',
    ground: 'ASSESSED_VALUE',
  });

  assert.equal(result.id, 'case-1');
  assert.equal(recorded.caseCreate[0].data.formCode, 'TC108');
  assert.equal(recorded.packetCreate[0].data.narrativeMode, 'MANUAL');
  assert.equal(recorded.packetCreate[0].data.narrativeProvider, undefined);
  assert.deepEqual(
    recorded.packetCreate[0].data.narrativeEvidenceJson.evidenceIds,
    ['evidence-1'],
  );
  assert.equal(recorded.homeEvent[0].create.type, 'MILESTONE');
  assert.equal(
    recorded.homeEvent[0].create.subtype,
    'PROPERTY_TAX_APPEAL_CREATED',
  );
});

test('packet becomes ready only after placeholders, checklist, and homeowner review', async () => {
  const recorded = calls();
  const tx = transaction(recorded);
  const db = {
    propertyTaxAppealCase: {
      async findFirst() {
        return caseRecord();
      },
    },
    async $transaction(callback) {
      return callback(tx);
    },
  };
  const service = new PropertyTaxAppealCaseService(db, {});

  await service.updatePacket({
    caseId: 'case-1',
    propertyId: 'property-1',
    userId: 'user-1',
    narrative: 'This is a homeowner-reviewed evidence-grounded narrative with enough detail to remain editable.',
    completedChecklist: [
      'VERIFY_CANONICAL_FACTS',
      'VERIFY_GROUND_EVIDENCE',
      'VERIFY_CURRENT_FORM',
      'COMPLETE_OFFICIAL_FORM',
      'REVIEW_NARRATIVE',
    ],
    placeholderValues: {
      APPLICANT_NAME: 'Home Owner',
      APPLICANT_CONTACT: 'owner@example.com',
      REQUESTED_RESULT: 'Review assessed value',
      SIGNATURE_DATE: '2026-07-27',
    },
    homeownerReviewed: true,
  });

  assert.equal(recorded.packetUpdate[0].data.status, 'READY');
  assert.equal(recorded.packetUpdate[0].data.narrativeMode, 'MANUAL');
  assert.equal(recorded.packetUpdate[0].data.narrativeProvider, null);
  assert.deepEqual(recorded.packetUpdate[0].data.unresolvedPlaceholdersJson, []);
  assert.equal(recorded.caseUpdate[0].data.status, 'PACKET_READY');
});

test('external filing requires a ready packet and writes a durable filing milestone', async () => {
  const recorded = calls();
  const tx = transaction(recorded);
  const readyCase = caseRecord({
    status: 'PACKET_READY',
    packet: { ...caseRecord().packet, status: 'READY' },
  });
  const db = {
    propertyTaxAppealCase: {
      async findFirst() {
        return readyCase;
      },
    },
    async $transaction(callback) {
      return callback(tx);
    },
  };
  const service = new PropertyTaxAppealCaseService(db, {});

  await service.confirmExternalFiling({
    caseId: 'case-1',
    propertyId: 'property-1',
    userId: 'user-1',
    filedAt: new Date('2026-07-27T12:00:00.000Z'),
    externalReference: 'TC-RECEIPT-123',
  });

  assert.equal(recorded.caseUpdate[0].data.status, 'AWAITING_RESPONSE');
  assert.equal(recorded.packetUpdate[0].data.status, 'FILED');
  assert.equal(recorded.caseEvent[0].data.type, 'FILED');
  assert.equal(recorded.homeEvent[0].create.importance, 'HIGHLIGHT');
});

test('determination records final assessment, refund, credit, closure, and timeline', async () => {
  const recorded = calls();
  const tx = transaction(recorded);
  const filedCase = caseRecord({
    status: 'AWAITING_RESPONSE',
    filedAt: new Date('2026-07-27T12:00:00.000Z'),
  });
  const db = {
    propertyTaxAppealCase: {
      async findFirst() {
        return filedCase;
      },
    },
    async $transaction(callback) {
      return callback(tx);
    },
  };
  const service = new PropertyTaxAppealCaseService(db, {});

  await service.recordDetermination({
    caseId: 'case-1',
    propertyId: 'property-1',
    userId: 'user-1',
    determination: 'REDUCED',
    determinationAt: new Date('2026-09-15T12:00:00.000Z'),
    reference: 'DECISION-42',
    summary: 'Assessment reduced after review.',
    finalAssessedValue: 25000,
    refundAmount: 500,
    creditAmount: 200,
    closeCase: true,
  });

  assert.equal(recorded.caseUpdate[0].data.status, 'CLOSED');
  assert.equal(recorded.caseUpdate[0].data.finalAssessedValue, 25000);
  assert.equal(recorded.caseUpdate[0].data.refundAmount, 500);
  assert.equal(recorded.caseUpdate[0].data.creditAmount, 200);
  assert.deepEqual(
    recorded.caseEvent.map((event) => event.data.type),
    ['DETERMINATION_RECORDED', 'CLOSED'],
  );
  assert.equal(recorded.homeEvent.length, 2);
});

test('case reminders are durable, idempotent, and property scoped', async () => {
  const upserts = [];
  const db = {
    propertyTaxAppealCase: {
      async findFirst() {
        return caseRecord();
      },
    },
    propertyTaxAppealReminder: {
      async upsert(input) {
        upserts.push(input);
        return {
          id: 'reminder-1',
          caseId: 'case-1',
          reminderKey: input.create.reminderKey,
          title: input.create.title,
          dueAt: input.create.dueAt,
          status: 'PENDING',
          completedAt: null,
        };
      },
    },
  };
  const service = new PropertyTaxAppealCaseService(db, {});

  const reminder = await service.upsertReminder({
    caseId: 'case-1',
    propertyId: 'property-1',
    userId: 'user-1',
    reminderKey: 'hearing-prep',
    title: 'Prepare for hearing',
    dueAt: new Date('2026-09-01T12:00:00.000Z'),
  });

  assert.equal(reminder.status, 'PENDING');
  assert.deepEqual(upserts[0].where.caseId_reminderKey, {
    caseId: 'case-1',
    reminderKey: 'hearing-prep',
  });
});

test('Slice 6 exposes resumable case, packet, filing, tracking, reminders, and outcomes without a migration', () => {
  const root = path.resolve(__dirname, '../../../..');
  const schema = fs.readFileSync(
    path.join(root, 'apps/backend/prisma/schema.prisma'),
    'utf8',
  );
  const routes = fs.readFileSync(
    path.join(root, 'apps/backend/src/routes/propertyTax.routes.ts'),
    'utf8',
  );
  const service = fs.readFileSync(
    path.join(
      root,
      'apps/backend/src/services/propertyTax/propertyTaxAppealCase.service.ts',
    ),
    'utf8',
  );
  const ui = fs.readFileSync(
    path.join(
      root,
      'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
    ),
    'utf8',
  );

  assert.match(schema, /model PropertyTaxAppealCase/);
  assert.match(schema, /model PropertyTaxAppealPacket/);
  assert.match(schema, /model PropertyTaxAppealReminder/);
  assert.match(routes, /appeal\/cases\/:caseId\/filing/);
  assert.match(routes, /appeal\/cases\/:caseId\/determination/);
  assert.match(service, /narrativeMode: 'MANUAL'/);
  assert.match(service, /propertyTaxAppealCaseEvent/);
  assert.match(service, /homeEvent\.upsert/);
  assert.match(ui, /Contract to Cozy does not submit the official form/);
  assert.match(ui, /Record determination and realized outcome/);

  const migrationRoot = path.join(root, 'apps/backend/prisma/migrations');
  const migrationNames = fs.existsSync(migrationRoot)
    ? fs.readdirSync(migrationRoot)
    : [];
  assert.equal(
    migrationNames.some((name) => /appeal|property.?tax/i.test(name)),
    false,
  );
});
