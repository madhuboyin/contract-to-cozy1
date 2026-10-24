const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// The Ask coverage-term review command (continuation FRD section 39).
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const handler = require('../../src/services/ask/handlers/coverageTermReview.handler.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { COVERAGE_TERM_REVIEW_MESSAGE } = require('../../src/services/ask/support/coverageTermReview.ts');

const OP = 'COVERAGE_TERM_REVIEW';
let role; let policies; let reviews; let reports; let step; let saved; let rec; let rc;
const stepRow = (over = {}) => ({ id: 's1', stepKey: 'review_current_policy_context', toolKey: 'coverage-intelligence', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: null }, ...over });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'e1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
const launch = { operationId: OP, entityType: 'GUIDANCE_STEP', entityId: 's1' };
test.beforeEach(() => {
  role = 'CONTRIBUTOR'; step = stepRow(); reviews = []; reports = [];
  policies = [{ id: 'pol1', carrierName: 'Acme', policyNumber: '1', coverageType: 'Homeowner', startDate: new Date('2026-01-01'), expiryDate: new Date('2099-01-01'), deductibleCents: 100000, updatedAt: new Date('2026-02-01') }];
  saved = ['insurancePolicy', 'warranty', 'coverageTermReview', 'guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion; rc = executeOperation.reconcileAskExecutionSideEffects;
  prisma.insurancePolicy = { findMany: async () => policies }; prisma.warranty = { findMany: async () => [] };
  prisma.coverageTermReview = { findFirst: async () => null, create: async ({ data }) => { const r = { id: 'r1', reviewedAt: new Date(), ...data }; reviews.push(r); return r; } };
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; executeOperation.reconcileAskExecutionSideEffects = rc; });

test('both review steps open this command carrying the step', () => {
  for (const key of ['review_current_policy_context', 'review_current_warranty_context']) {
    const m = askGuidanceStepMode('coverage-intelligence', key);
    assert.deepEqual([m.inAsk?.operationId, m.inAsk?.carriesStep], [OP, 'ENTITY'], key);
  }
});

test('the proposal lists the current terms and is tied to their fingerprint; it needs the declared step action', async () => {
  const undeclared = await handler.coverageTermReviewResult('u1', 'p1', 'review my policy', undefined);
  assert.equal(undeclared.reasonCode, 'COVERAGE_TERM_REVIEW_STEP_REQUIRED');
  const out = await handler.coverageTermReviewResult('u1', 'p1', COVERAGE_TERM_REVIEW_MESSAGE, launch);
  assert.equal(out.status, 'NEEDS_CONFIRMATION');
  assert.match(out.confirmation.fields[0].value, /Acme/);
  assert.equal(out.contextVersion, out.parameters.coverageTermFingerprint);
});

test('no current term, a viewer, and a closed step are refused', async () => {
  policies = [];
  assert.equal((await handler.coverageTermReviewResult('u1', 'p1', COVERAGE_TERM_REVIEW_MESSAGE, launch)).reasonCode, 'COVERAGE_TERM_REVIEW_NO_TERMS');
  policies = [{ id: 'pol1', carrierName: 'Acme', updatedAt: new Date() }];
  role = 'VIEWER';
  assert.equal((await handler.coverageTermReviewResult('u1', 'p1', COVERAGE_TERM_REVIEW_MESSAGE, launch)).status, 'BLOCKED');
  role = 'CONTRIBUTOR'; step = stepRow({ status: 'COMPLETED' });
  assert.equal((await handler.coverageTermReviewResult('u1', 'p1', COVERAGE_TERM_REVIEW_MESSAGE, launch)).reasonCode, 'COVERAGE_TERM_REVIEW_STEP_UNAVAILABLE');
});

test('confirming records the review and reports the step; terms that changed meanwhile are refused', async () => {
  const proposal = await handler.coverageTermReviewResult('u1', 'p1', COVERAGE_TERM_REVIEW_MESSAGE, launch);
  const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(reviews.length, 1);
  assert.equal(reports[0].stepKey, 'review_current_policy_context');
  assert.ok(done.result.blocks[0].details.some((d) => /recorded as done/.test(d.value)));
  policies[0].deductibleCents = 999; policies[0].updatedAt = new Date('2026-05-01');
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
});
