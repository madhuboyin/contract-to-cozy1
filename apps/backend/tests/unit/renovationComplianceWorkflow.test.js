'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  CreateManualPermitSchema,
  UpdatePermitSchema,
  RecordOfficialPermitStatusSchema,
} = require('../../src/validators/permitTracker.validators.ts');
const {
  UpdateRenovationComplianceConditionSchema,
  CreateHoaDocumentReviewSchema,
} = require('../../src/validators/renovationComplianceWorkflow.validators.ts');

test('homeowner permit edits update reported progress, never official status', () => {
  const created = CreateManualPermitSchema.parse({
    category: 'BUILDING',
    workTypes: ['INTERIOR_REMODEL'],
    status: 'ISSUED',
    reportedStatus: 'SUBMITTED',
  });
  assert.equal(created.reportedStatus, 'SUBMITTED');
  assert.equal(Object.hasOwn(created, 'status'), false);

  const updated = UpdatePermitSchema.parse({
    status: 'FINALED',
    reportedStatus: 'CLOSEOUT_REQUESTED',
  });
  assert.equal(updated.reportedStatus, 'CLOSEOUT_REQUESTED');
  assert.equal(Object.hasOwn(updated, 'status'), false);
});

test('official permit transitions require authority evidence and status dates', () => {
  const base = {
    truthLayer: 'AUTHORITY_CONFIRMED',
    sourceType: 'AUTHORITY_PORTAL',
    sourceReference: 'https://authority.example/permit/P-123',
    observedAt: '2026-07-29T12:00:00.000Z',
  };
  assert.equal(RecordOfficialPermitStatusSchema.safeParse({
    ...base,
    status: 'ISSUED',
  }).success, false);
  assert.equal(RecordOfficialPermitStatusSchema.safeParse({
    ...base,
    status: 'ISSUED',
    issueDate: '2026-07-28T12:00:00.000Z',
  }).success, true);
  assert.equal(RecordOfficialPermitStatusSchema.safeParse({
    ...base,
    status: 'FINALED',
  }).success, false);
});

test('blocking conditions cannot be marked satisfied without document evidence', () => {
  assert.equal(UpdateRenovationComplianceConditionSchema.safeParse({
    status: 'SATISFIED',
    verificationNotes: 'Homeowner reports this is complete.',
  }).success, false);
  assert.equal(UpdateRenovationComplianceConditionSchema.safeParse({
    status: 'SATISFIED',
    verificationNotes: 'Verified against the authority closeout document.',
    sourceDocumentId: 'document-1',
  }).success, true);
});

test('conditional HOA document extractions remain review candidates with explicit conditions', () => {
  assert.equal(CreateHoaDocumentReviewSchema.safeParse({
    hoaApprovalId: 'hoa-1',
    documentId: 'document-1',
    extractedDecisionStatus: 'APPROVED_WITH_CONDITIONS',
    extractedConditions: [],
    extractionMethod: 'DOCUMENT_PARSER',
  }).success, false);
  assert.equal(CreateHoaDocumentReviewSchema.safeParse({
    hoaApprovalId: 'hoa-1',
    documentId: 'document-1',
    extractedDecisionStatus: 'APPROVED_WITH_CONDITIONS',
    extractedConditions: [{
      title: 'Approved paint color',
      description: 'Use the association-approved exterior color.',
    }],
    extractionMethod: 'DOCUMENT_PARSER',
  }).success, true);
});

test('workflow preserves truth layers, cautious coverage, blockers, and expiration alerts', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../../src/services/renovationComplianceWorkflow.service.ts'),
    'utf8',
  );
  const permitService = fs.readFileSync(
    path.join(__dirname, '../../src/services/permitTracker.service.ts'),
    'utf8',
  );
  const fetchService = fs.readFileSync(
    path.join(__dirname, '../../src/services/permitFetch.service.ts'),
    'utf8',
  );
  const normalizer = fs.readFileSync(
    path.join(__dirname, '../../src/services/permitAdapters/permitNormalizer.ts'),
    'utf8',
  );
  const ui = fs.readFileSync(
    path.join(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/renovations/[caseId]/compliance/page.tsx'),
    'utf8',
  );

  assert.match(permitService, /status:\s*'UNKNOWN'/);
  assert.match(permitService, /reportedStatus:\s*payload\.reportedStatus/);
  assert.match(permitService, /officialSourceReference:\s*payload\.sourceReference/);
  assert.match(fetchService, /officialTruthLayer:\s*record\.officialTruthLayer/);
  assert.match(normalizer, /officialTruthLayer:\s*'SOURCE_OBSERVED'/);
  assert.match(workflow, /This is not evidence that no permit is required or exists/);
  assert.match(workflow, /PERMIT_EXPIRATION/);
  assert.match(workflow, /HOA_EXPIRATION/);
  assert.match(workflow, /status !== 'NEEDS_REVIEW'/);
  assert.match(workflow, /decisionTruthLayer:\s*'DOCUMENTED'/);
  assert.match(workflow, /condition\.isBlocking && condition\.status === 'OPEN'/);
  assert.match(ui, /Reported progress is kept separate from official authority/);
  assert.match(ui, /No authority-backed status has been recorded/);
  assert.match(ui, /Verification document ID/);
});
