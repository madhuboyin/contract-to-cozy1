const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('ts-node/register');

// The inspection report review (continuation FRD section 35): an append-only record that a person reviewed THIS version of the report, which alone can complete a review step. No database, browser or native module.

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const ops = require('../../src/services/inspectionReportReviewOperations.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { INSPECTION_REPORT_REVIEW_MESSAGE } = require('../../src/services/ask/support/inspectionReportReview.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');

const OP = 'INSPECTION_REPORT_REVIEW';
let report; let findings; let reviews; let step; let reports; let reportFails; let role; let findingForSignal; let saved;
const stepRow = (over = {}) => ({ id: 'step-i', stepKey: 'review_inspection_report', toolKey: 'inspection-report', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null,
  primarySignal: { signalIntentFamily: 'inspection_followup_needed', sourceToolKey: 'inspection-hub', sourceEntityType: 'INSPECTION_FINDING', sourceEntityId: 'f1' } }, ...over });

test.beforeEach(() => {
  report = { id: 'r1', propertyId: 'p1', reportType: 'GENERAL', status: 'CONFIRMED', totalFindings: 2, openFindings: 2, safetyFindings: 0, majorFindings: 1, confirmedAt: new Date('2026-10-02T00:00:00Z'), processedAt: new Date('2026-10-01T00:00:00Z'),
    inspectionDate: new Date('2026-09-28T00:00:00Z'), inspectorCompany: 'Acme Inspect', sourceJourneyId: null, createdAt: new Date('2026-10-01T00:00:00Z') };
  findings = [{ id: 'f1', status: 'OPEN', severity: 'MAJOR', updatedAt: new Date() }, { id: 'f2', status: 'OPEN', severity: 'MINOR', updatedAt: new Date() }];
  reviews = []; step = stepRow(); reports = []; reportFails = false; role = 'CONTRIBUTOR'; findingForSignal = { id: 'f1', reportId: 'r1', propertyId: 'p1' };
  saved = { models: ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'inspectionReport', 'inspectionFinding', 'inspectionReportReview'].map((name) => [name, prisma[name]]),
    resolve: propertyAccess.resolvePropertyAccess, rec: guidanceJourneyService.recordToolCompletion, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  prisma.inspectionReport = { findFirst: async (args) => (args.where.id === report.id || args.where.sourceJourneyId ? { ...report, findings } : null) };
  prisma.inspectionFinding = { findFirst: async (args) => (findingForSignal && args.where.id === findingForSignal.id && (!args.where.reportId || args.where.reportId === findingForSignal.reportId) ? findingForSignal : null) };
  prisma.inspectionReportReview = {
    findFirst: async (args) => reviews.filter((row) => Object.entries(args.where).every(([k, v]) => row[k] === v)).at(-1) ?? null,
    create: async ({ data }) => { const row = { id: `rev-${reviews.length + 1}`, reviewedAt: new Date(), ...data }; reviews.push(row); return row; },
  };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.recordToolCompletion = async (input) => { reports.push(input); if (reportFails) throw new Error('down'); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => {
  for (const [name, model] of saved.models) prisma[name] = model;
  propertyAccess.resolvePropertyAccess = saved.resolve; guidanceJourneyService.recordToolCompletion = saved.rec; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile;
});

test('the fingerprint is the report as a person would see it: any change to the report or a finding is a different version', async () => {
  const first = (await ops.inspectionReportFingerprint('p1', 'r1')).fingerprint;
  assert.equal((await ops.inspectionReportFingerprint('p1', 'r1')).fingerprint, first, 'stable');
  findings[1].status = 'RESOLVED';
  const second = (await ops.inspectionReportFingerprint('p1', 'r1')).fingerprint;
  assert.notEqual(second, first, 'a finding\'s status changed');
  report.openFindings = 1;
  assert.notEqual((await ops.inspectionReportFingerprint('p1', 'r1')).fingerprint, second, 'the report\'s own counts changed');
  assert.equal(await ops.inspectionReportFingerprint('p1', 'other'), null);
});

test('reviewing appends a record of this version; the same review again is not duplicated, and a changed report needs a new one', async () => {
  const one = await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1');
  assert.deepEqual([one.reused, reviews.length, reviews[0].outcome, reviews[0].reviewedByUserId, reviews[0].journeyId, reviews[0].stepId], [false, 1, 'REVIEWED', 'u1', null, null]);
  assert.equal((await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1')).reused, true);
  assert.equal(reviews.length, 1, 'append-only, and not duplicated');
  findings[0].status = 'IN_PROGRESS';
  await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1');
  assert.equal(reviews.length, 2);
  assert.notEqual(reviews[0].contentFingerprint, reviews[1].contentFingerprint);
  await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { outcome: 'ACCEPTED' });
  assert.deepEqual(reviews.map((row) => row.outcome), ['REVIEWED', 'REVIEWED', 'ACCEPTED'], 'reviewed and accepted stay distinct');
  await assert.rejects(() => ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { outcome: 'LOOKS_GOOD' }), (e) => e.code === 'INSPECTION_REVIEW_OUTCOME_INVALID');
});

test('a missing, unprocessed or archived report cannot be reviewed, and neither can a version other than the one shown', async () => {
  await assert.rejects(() => ops.reviewInspectionReportWithEffects('p1', 'u1', 'nope'), (e) => e.code === 'INSPECTION_REPORT_NOT_FOUND');
  for (const status of ['PROCESSING', 'ARCHIVED']) { report.status = status; await assert.rejects(() => ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1'), (e) => e.code === 'INSPECTION_REPORT_NOT_REVIEWABLE', status); }
  report.status = 'REVIEW_PENDING';
  await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1');
  await assert.rejects(() => ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { expectedFingerprint: 'an-older-version' }), (e) => e instanceof APIError && e.code === 'INSPECTION_REPORT_CHANGED');
  assert.equal(reviews.length, 1);
});

test('launched from a journey step it records the journey and step on the row and reports a typed proof', async () => {
  const out = await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { guidanceStepId: 'step-i' });
  assert.deepEqual([out.guidanceReported, reviews[0].journeyId, reviews[0].stepId], [true, 'j1', 'step-i']);
  const done = reports[0];
  assert.deepEqual({ j: done.journeyId, s: done.stepKey, st: done.status, tool: done.sourceToolKey, et: done.sourceEntityType, id: done.sourceEntityId }, { j: 'j1', s: 'review_inspection_report', st: 'COMPLETED', tool: 'inspection-report', et: 'INSPECTION_REPORT', id: 'r1' });
  assert.deepEqual({ proof: done.producedData.proofType, review: done.producedData.reviewId, fp: done.producedData.contentFingerprint === reviews[0].contentFingerprint, outcome: done.producedData.outcome, by: done.producedData.reviewedByUserId }, { proof: 'inspection_report_review', review: 'rev-1', fp: true, outcome: 'REVIEWED', by: 'u1' });
});

test('the journey must be about this very report: another report, a pre-purchase step with a general report, a stale step or a closed journey report nothing (the review is still saved, without journey lineage)', async () => {
  findingForSignal = { id: 'f1', reportId: 'r-OTHER', propertyId: 'p1' };
  let out = await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { guidanceStepId: 'step-i' });
  assert.deepEqual([out.guidanceReported, out.guidanceRefusal, reports.length, reviews.at(-1).journeyId], [false, 'WRONG_SUBJECT', 0, null]);
  findingForSignal = { id: 'f1', reportId: 'r1', propertyId: 'p1' };
  step = stepRow({ stepKey: 'review_pre_purchase_report' });
  out = await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { guidanceStepId: 'step-i' });
  assert.deepEqual([out.guidanceReported, out.guidanceRefusal], [false, 'WRONG_SUBJECT']);
  report.reportType = 'PRE_PURCHASE';
  assert.equal((await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { guidanceStepId: 'step-i' })).guidanceReported, true);
  for (const [stale, reason] of [[null, 'NOT_FOUND'], [stepRow({ toolKey: 'coverage-intelligence' }), 'WRONG_TOOL'], [stepRow({ stepKey: 'assess_urgency' }), 'WRONG_STEP'], [stepRow({ status: 'COMPLETED' }), 'STEP_DONE'], [stepRow({ journey: { id: 'j1', status: 'DISMISSED', inventoryItemId: null, primarySignal: null } }), 'JOURNEY_CLOSED']]) {
    step = stale; reports.length = 0;
    out = await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { guidanceStepId: 'step-i' });
    assert.deepEqual([out.guidanceReported, out.guidanceRefusal, reports.length], [false, reason, 0], reason);
  }
  step = stepRow(); reportFails = true;
  assert.equal((await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { guidanceStepId: 'step-i' })).guidanceReported, false, 'a failed report never undoes the review');
});

test('a report made for the journey (sourceJourneyId) also counts as the journey\'s report', async () => {
  findingForSignal = null; report.sourceJourneyId = 'j1';
  assert.equal((await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { guidanceStepId: 'step-i' })).guidanceReported, true);
  report.sourceJourneyId = 'j-other';
  assert.equal((await ops.reviewInspectionReportWithEffects('p1', 'u1', 'r1', { guidanceStepId: 'step-i' })).guidanceRefusal, 'WRONG_SUBJECT');
});

const launch = (over = {}) => ({ surface: 'ASK_WORKSPACE', operationId: OP, entityType: 'GUIDANCE_STEP', entityId: 'step-i', sourceExecutionId: 'src-1', ...over });
const propose = (launchContext = launch(), message = INSPECTION_REPORT_REVIEW_MESSAGE) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'p1', message, launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the four review steps open this command carrying the step; the other inspection steps do not', () => {
  for (const key of ops.INSPECTION_REVIEW_STEP_KEYS) assert.deepEqual({ o: askGuidanceStepMode('inspection-report', key).inAsk?.operationId, c: askGuidanceStepMode('inspection-report', key).inAsk?.carriesStep }, { o: OP, c: 'ENTITY' }, key);
  assert.equal(askGuidanceStepMode('inspection-report', 'assess_urgency').mode, 'NAVIGATE', 'assessing urgency is a decision, not a review');
});

test('Ask: the proposal derives the report from the journey, shows what was found, ties the confirmation to the version, and writes nothing', async () => {
  const result = await propose();
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.confirmation.fields.map((f) => f.label), ['Report', 'Inspected', 'Findings', 'Outcome']);
  assert.match(result.confirmation.fields[0].value, /general inspection by Acme Inspect/);
  assert.equal(result.parameters.inspectionReportId, 'r1');
  assert.equal(result.contextVersion, result.parameters.inspectionReportFingerprint);
  assert.equal(reviews.length, 0);
  assert.equal((await propose(launch({ entityType: null, entityId: null }))).reasonCode, 'INSPECTION_REVIEW_STEP_REQUIRED');
  assert.equal((await propose(launch(), 'review it')).reasonCode, 'INSPECTION_REVIEW_STEP_REQUIRED');
  findingForSignal = { id: 'f1', reportId: 'r-OTHER', propertyId: 'p1' };
  assert.equal((await propose()).reasonCode, 'INSPECTION_REVIEW_REPORT_NOT_FOUND', 'the report a journey is about is derived, never guessed');
  findingForSignal = { id: 'f1', reportId: 'r1', propertyId: 'p1' };
  report.status = 'PROCESSING';
  assert.equal((await propose()).reasonCode, 'INSPECTION_REVIEW_REPORT_NOT_REVIEWABLE');
  report.status = 'CONFIRMED'; role = 'VIEWER';
  assert.match((await propose()).reasonCode, /PERMISSION_REQUIRED/);
});

test('Ask: confirming records the review of the version shown and completes the step; a report that changed since is refused and nothing is written', async () => {
  const proposal = await propose();
  const out = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(reviews.length, 1);
  assert.equal(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, 'This step is recorded as done');
  assert.equal(reviews[0].contentFingerprint, proposal.parameters.inspectionReportFingerprint);
  reviews.length = 0; reports.length = 0; findings[0].status = 'RESOLVED';
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(reviews.length + reports.length, 0);
  role = 'VIEWER';
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
});

test('the page\'s review route is the contributor-only shared write, and report status and confirmedAt are never used as review', () => {
  const routes = fs.readFileSync(require.resolve('../../src/routes/inspectionHub.routes.ts'), 'utf8');
  assert.match(routes, /reports\/:reportId\/review',\s*propertyAuthMiddleware,\s*requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(fs.readFileSync(require.resolve('../../src/controllers/inspectionHub.controller.ts'), 'utf8'), /reviewInspectionReportWithEffects\(/);
  const service = fs.readFileSync(require.resolve('../../src/services/inspectionReportReviewOperations.ts'), 'utf8');
  assert.equal(/inspectionReport\.update\(|confirmedAt:\s*new Date|status:\s*['"]CONFIRMED/.test(service), false, 'review never touches the report\'s processing or confirmation state');
});
