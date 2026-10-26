const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Slice 3a of the Renovations parity review: the compliance read view. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const { isRenovationComplianceRequest, isRenovationRequirementsRequest, renovationComplianceSections, renovationCaseRows } = require('../../src/services/ask/support/renovationCaseOverview.ts');
const { resolveAskOperation, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { renovationComplianceResult } = require('../../src/services/ask/handlers/capitalPlanning.handler.ts');

const CASE = '11111111-1111-4111-8111-111111111111';
const SCOPE = '33333333-3333-4333-8333-333333333333';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const label = () => 'Nov 1, 2026';

const workflow = (over = {}) => ({
  permits: [{ id: 'p1', permitNumber: 'BP-2041', status: 'ISSUED', reportedStatus: 'APPLIED', officialTruthLayer: 'AUTHORITY_CONFIRMED', officialSourceReference: 'City portal', expirationDate: new Date('2026-11-01T00:00:00Z') }],
  hoaApprovals: [{ id: 'h1', workType: 'EXTERIOR_CHANGE', decisionStatus: 'PENDING', reportedStatus: 'APPROVED', decisionTruthLayer: null }],
  conditions: [
    { id: 'c1', title: 'Inspect framing', description: 'Before drywall.', status: 'OPEN', isBlocking: true, sourceReference: 'Permit BP-2041', dueAt: null },
    { id: 'c2', title: 'Paint colour', status: 'SATISFIED', isBlocking: false },
  ],
  hoaDocumentReviews: [{ id: 'r1', status: 'NEEDS_REVIEW', extractedDecisionStatus: 'APPROVED', extractedReferenceNumber: 'HOA-9', extractedConditions: [{ title: 'Colour', description: 'Match the palette.' }] }],
  alerts: [{ type: 'PERMIT_EXPIRATION', subjectId: 'p1', message: 'Permit expiration is approaching.', expiresAt: new Date('2026-11-01T00:00:00Z') }],
  coverage: { permit: { state: 'LINKED_RECORDS', message: '1 permit record(s) linked to this case.' }, hoa: { state: 'LINKED_RECORDS', message: '1 HOA approval record(s) linked to this case.' } },
  blockers: [{ id: 'c1' }], scopeVersionId: SCOPE, ...over,
});

test('the compliance request is narrow, routes to the renovation answer and is not the requirements or the HOA tracker question', () => {
  for (const yes of ['Show the compliance status for my renovation', 'What approvals does my remodel still need?', 'renovation closeout conditions']) assert.equal(isRenovationComplianceRequest(yes), true, yes);
  for (const no of ['Is my renovation ready to start?', 'Show my renovation cases', 'What are my HOA rules?', 'Show my permits']) assert.equal(isRenovationComplianceRequest(no), false, no);
  assert.equal(isRenovationRequirementsRequest('Show the compliance status for my renovation'), false);
  assert.equal(resolveAskOperation('Show the compliance status for my renovation').operationId, 'RENOVATION_PERMIT_READINESS');
});

test('official and reported status are kept apart, and a missing authority is said plainly', () => {
  const parts = renovationComplianceSections(workflow(), label);
  assert.deepEqual(parts.permits[0].meta, ['Official: Issued', 'Reported: Applied', 'Expires Nov 1, 2026']);
  assert.match(parts.permits[0].description, /Authority confirmed · City portal/);
  assert.equal(parts.hoaApprovals[0].description, 'No association-backed decision has been recorded.');
  assert.deepEqual(parts.hoaApprovals[0].meta, ['Decision: Pending', 'Reported: Approved']);
});

test('open and satisfied conditions are separate, blockers say so, and HOA readings are candidates without a raw document id', () => {
  const parts = renovationComplianceSections(workflow(), label);
  assert.equal(parts.openConditions.length, 1);
  assert.deepEqual(parts.openConditions[0].meta, ['Open', 'Blocks closeout']);
  assert.equal(parts.openConditions[0].detail, 'Source: Permit BP-2041');
  assert.equal(parts.satisfiedConditions.length, 1);
  assert.match(parts.reviews[0].description, /candidates until a homeowner reviews them/);
  assert.equal(parts.reviews[0].detail, 'Colour: Match the palette.');
  assert.equal(JSON.stringify(parts.reviews).includes('documentId'), false);
  assert.deepEqual(parts.alerts, ['Permit expiration is approaching. (Nov 1, 2026)']);
});

test('cases in an approvals or closeout stage offer Show approvals', () => {
  const rows = renovationCaseRows([{ id: 'a', name: 'Deck', lifecycle: 'APPROVALS_IN_PROGRESS', updatedAt: UPDATED }, { id: 'b', name: 'Roof', lifecycle: 'IN_EXECUTION', updatedAt: UPDATED }], 'b');
  assert.deepEqual(rows[0].actions.map((action) => action.id), ['renovation-case-show-readiness', 'renovation-case-show-compliance']);
  assert.match(rows[0].actions[1].message, /^Show the compliance status for my renovation Deck\.$/);
  assert.equal(rows[1].actions, undefined);
});

test('the real answer is schema-valid, uses only blocks the operation allows, and survives the answer-trust validator', async () => {
  const saved = { s: prisma.renovationScopeVersion, c: prisma.renovationCase, l: prisma.renovationCaseLink, p: prisma.propertyPermitRecord, h: prisma.hoaApprovalRecord, k: prisma.renovationComplianceCondition, r: prisma.hoaApprovalDocumentReview };
  const w = workflow();
  prisma.renovationCase = { findFirst: async () => ({ id: CASE, currentScopeVersionId: SCOPE }) };
  prisma.renovationScopeVersion = { findFirst: async () => ({ id: SCOPE }) };
  prisma.renovationCaseLink = { findMany: async () => [{ linkType: 'PERMIT', targetId: 'p1' }, { linkType: 'HOA_APPROVAL', targetId: 'h1' }] };
  prisma.propertyPermitRecord = { findMany: async () => w.permits };
  prisma.hoaApprovalRecord = { findMany: async () => w.hoaApprovals };
  prisma.renovationComplianceCondition = { findMany: async () => w.conditions };
  prisma.hoaApprovalDocumentReview = { findMany: async () => w.hoaDocumentReviews };
  try {
    const result = await renovationComplianceResult('prop-1', { id: CASE, name: 'Kitchen remodel', updatedAt: UPDATED }, null);
    assert.equal(result.status, 'ANSWERED');
    const allowed = new Set(getAskOperationDefinition('RENOVATION_PERMIT_READINESS').allowedBlockTypes ?? getAskOperationDefinition('RENOVATION_PERMIT_READINESS').resultBlocks ?? []);
    if (allowed.size) for (const block of result.blocks) assert.ok(allowed.has(block.type), `${block.type} is allowed for the operation`);
    for (const block of result.blocks) assert.ok(AskPresentationBlockSchema.safeParse(block).success, block.id);
    assert.match(result.blocks[0].title, /1 approval condition still blocks closeout/);
    assert.match(result.blocks[0].body, /Expiring soon: Permit expiration is approaching/);
    result.parameters = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'renovation-permit.readiness', operationId: 'RENOVATION_PERMIT_READINESS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-26T00:00:00.000Z' }] } };
    const { result: validated } = validateAskAnswerTrust({ question: 'Show the compliance status for my renovation', operationId: 'RENOVATION_PERMIT_READINESS', result, propertyId: 'prop-1' });
    assert.ok(validated.blocks.some((block) => block.id === 'renovation-compliance'), 'the compliance list is kept');
  } finally { Object.assign(prisma, { renovationScopeVersion: saved.s, renovationCase: saved.c, renovationCaseLink: saved.l, propertyPermitRecord: saved.p, hoaApprovalRecord: saved.h, renovationComplianceCondition: saved.k, hoaApprovalDocumentReview: saved.r }); }
});

test('a case with no scope says so instead of erroring', async () => {
  const saved = prisma.renovationCase;
  prisma.renovationCase = { findFirst: async () => ({ id: CASE, currentScopeVersionId: null }) };
  try {
    const result = await renovationComplianceResult('prop-1', { id: CASE, name: 'Kitchen remodel', updatedAt: UPDATED }, null);
    assert.equal(result.reasonCode, 'RENOVATION_COMPLIANCE_UNAVAILABLE');
  } finally { prisma.renovationCase = saved; }
});
