const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('ts-node/register');

// The canonical coverage analysis command (continuation FRD section 34): the same persisted analysis the page runs, scoped to the journey's subject, completing only a coverage check step with a
// fresh evaluation for that subject. No database, browser or native module.

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { CoverageIntelligenceService } = require('../../src/services/coverageAnalysis.service.ts');
const { InventoryService } = require('../../src/services/inventory.service.ts');
const featureContext = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const analytics = require('../../src/services/analytics/index.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const ops = require('../../src/services/coverageAnalysisOperations.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { COVERAGE_ANALYSIS_RUN_MESSAGE } = require('../../src/services/ask/support/coverageAnalysisRun.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');

const OP = 'COVERAGE_ANALYSIS_RUN';
let step; let runs; let reports; let reportFails; let role; let canExecute; let coverageState; let tracked; let saved;
const ANALYSIS = { id: 'an-1', propertyId: 'p1', status: 'READY', confidence: 'MEDIUM', computedAt: '2026-10-24T12:00:00.000Z', insuranceReviewState: 'POLICY_RECORD_INCOMPLETE', scenarioState: 'MODELED', summary: 'The warranty roughly covers the modeled repair risk.', assumptionSetId: 'as-1', preferenceProfileId: null };
const stepRow = (over = {}) => ({ id: 'step-c', label: 'Check coverage and deductible exposure', stepKey: 'check_coverage', toolKey: 'coverage-intelligence', status: 'PENDING', updatedAt: new Date('2026-10-24T00:00:00Z'),
  journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: { signalIntentFamily: 'lifecycle_end_or_past_life' } }, ...over });
const propertyJourney = (over = {}) => stepRow({ journey: { id: 'j2', status: 'ACTIVE', inventoryItemId: null, primarySignal: { signalIntentFamily: 'coverage_gap' } }, ...over });

test.beforeEach(() => {
  step = stepRow(); runs = []; reports = []; reportFails = false; role = 'CONTRIBUTOR'; canExecute = true; coverageState = 'CONFIRMED'; tracked = [];
  saved = { models: ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'inventoryItem'].map((name) => [name, prisma[name]]),
    run: CoverageIntelligenceService.prototype.run, runItem: CoverageIntelligenceService.prototype.runItemAnalysis, getItem: InventoryService.prototype.getItem, evalCtx: featureContext.evaluateFeatureContext,
    track: analytics.analyticsEmitter.track, resolve: propertyAccess.resolvePropertyAccess, rec: guidanceJourneyService.recordToolCompletion, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  prisma.inventoryItem = { findFirst: async () => ({ name: 'Water heater' }) };
  CoverageIntelligenceService.prototype.run = async function (...args) { runs.push(['property', ...args]); return ANALYSIS; };
  CoverageIntelligenceService.prototype.runItemAnalysis = async function (...args) { runs.push(['item', ...args]); return { ...ANALYSIS, id: 'an-item' }; };
  InventoryService.prototype.getItem = async function () { return { coverageState, responsibilityScope: 'OWNER', replacementValueSource: 'RECORDED' }; };
  featureContext.evaluateFeatureContext = async () => ({ canExecute });
  analytics.analyticsEmitter.track = (event) => { tracked.push(event.metadataJson.actionType); };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.recordToolCompletion = async (input) => { reports.push(input); if (reportFails) throw new Error('down'); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => {
  for (const [name, model] of saved.models) prisma[name] = model;
  CoverageIntelligenceService.prototype.run = saved.run; CoverageIntelligenceService.prototype.runItemAnalysis = saved.runItem; InventoryService.prototype.getItem = saved.getItem; featureContext.evaluateFeatureContext = saved.evalCtx;
  analytics.analyticsEmitter.track = saved.track; propertyAccess.resolvePropertyAccess = saved.resolve; guidanceJourneyService.recordToolCompletion = saved.rec; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile;
});

test('the scope is the journey\'s subject: its item, or the property when it has none', () => {
  assert.deepEqual(ops.coverageScopeForBinding({ inventoryItemId: 'item-1' }), { kind: 'ITEM', itemId: 'item-1' });
  assert.deepEqual(ops.coverageScopeForBinding({ inventoryItemId: null }), { kind: 'PROPERTY' });
  assert.equal(ops.COVERAGE_CHECK_STEP_KEYS.length, 8);
  assert.equal(ops.COVERAGE_CHECK_STEP_KEYS.includes('compare_coverage_options'), false, 'the decision step has its own proof');
});

test('running the property analysis saves it, emits the page\'s event, and with a step reports a typed fresh evaluation', async () => {
  step = propertyJourney();
  const out = await ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'PROPERTY' }, { guidanceStepId: 'step-c', assumptionSetId: 'as-1' });
  assert.deepEqual(runs[0].slice(0, 2), ['property', 'p1']);
  assert.deepEqual(tracked, ['run_analysis']);
  assert.equal(out.guidanceReported, true);
  const done = reports[0];
  assert.deepEqual({ j: done.journeyId, s: done.stepKey, st: done.status, tool: done.sourceToolKey, et: done.sourceEntityType, id: done.sourceEntityId, item: done.inventoryItemId }, { j: 'j2', s: 'check_coverage', st: 'COMPLETED', tool: 'coverage-intelligence', et: 'COVERAGE_ANALYSIS', id: 'an-1', item: null });
  assert.deepEqual({ proof: done.producedData.proofType, scope: done.producedData.scope, status: done.producedData.coverageStatus, at: done.producedData.evaluatedAt, conf: done.producedData.confidence }, { proof: 'coverage_evaluation', scope: 'PROPERTY', status: 'POLICY_RECORD_INCOMPLETE', at: ANALYSIS.computedAt, conf: 'MEDIUM' });
  assert.equal(done.dedupeKey, 'coverage-evaluation:p1:an-1:check_coverage');
});

test('the item analysis runs the page\'s gates first, and a refused gate saves nothing', async () => {
  const out = await ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'ITEM', itemId: 'item-1' }, { guidanceStepId: 'step-c' });
  assert.deepEqual([runs[0][0], tracked, out.guidanceReported, reports[0].sourceEntityType, reports[0].inventoryItemId, reports[0].producedData.coverageStatus], ['item', ['run_item_analysis'], true, 'COVERAGE_ITEM_ANALYSIS', 'item-1', 'MODELED']);
  runs.length = 0; canExecute = false;
  await assert.rejects(() => ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'ITEM', itemId: 'item-1' }), (e) => e instanceof APIError && e.code === 'PROPERTY_CONTEXT_REQUIRED');
  canExecute = true; coverageState = 'MANAGED_ELSEWHERE';
  await assert.rejects(() => ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'ITEM', itemId: 'item-1' }), /managed by another responsible party/);
  assert.equal(runs.length, 0);
});

test('the evaluation must be for the journey\'s own subject: a property analysis cannot prove an item journey and an item analysis cannot prove a property journey', async () => {
  step = stepRow();
  let out = await ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'PROPERTY' }, { guidanceStepId: 'step-c' });
  assert.deepEqual([out.guidanceReported, out.guidanceRefusal, reports.length, runs.length], [false, 'WRONG_SUBJECT', 0, 1], 'saved, not reported');
  step = propertyJourney();
  out = await ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'ITEM', itemId: 'item-1' }, { guidanceStepId: 'step-c' });
  assert.deepEqual([out.guidanceReported, out.guidanceRefusal, reports.length], [false, 'WRONG_SUBJECT', 0]);
  step = stepRow();
  out = await ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'ITEM', itemId: 'item-OTHER' }, { guidanceStepId: 'step-c' });
  assert.deepEqual([out.guidanceReported, out.guidanceRefusal], [false, 'WRONG_SUBJECT'], 'another item');
});

test('a stale, closed or other-tool step reports nothing and no other step is used; a failed report never undoes the analysis', async () => {
  for (const [stale, reason] of [[null, 'NOT_FOUND'], [stepRow({ toolKey: 'price-finalization' }), 'WRONG_TOOL'], [stepRow({ stepKey: 'compare_coverage_options' }), 'WRONG_STEP'], [stepRow({ status: 'COMPLETED' }), 'STEP_DONE'], [stepRow({ journey: { id: 'j1', status: 'DISMISSED', inventoryItemId: 'item-1', primarySignal: null } }), 'JOURNEY_CLOSED']]) {
    step = stale; reports.length = 0;
    const out = await ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'ITEM', itemId: 'item-1' }, { guidanceStepId: 'step-c' });
    assert.deepEqual([out.guidanceReported, out.guidanceRefusal, reports.length], [false, reason, 0], reason);
    assert.equal(out.analysis.id, 'an-item');
  }
  step = stepRow(); reportFails = true;
  const failed = await ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'ITEM', itemId: 'item-1' }, { guidanceStepId: 'step-c' });
  assert.deepEqual([failed.guidanceReported, failed.guidanceRefusal, failed.analysis.id], [false, null, 'an-item']);
  reportFails = false; reports.length = 0;
  assert.equal((await ops.runCoverageAnalysisWithEffects('p1', 'u1', { kind: 'ITEM', itemId: 'item-1' })).guidanceReported, null, 'no step named: nothing reported');
  assert.equal(reports.length, 0);
});

const launch = (over = {}) => ({ surface: 'ASK_WORKSPACE', operationId: OP, entityType: 'GUIDANCE_STEP', entityId: 'step-c', sourceExecutionId: 'src-1', ...over });
const propose = (launchContext = launch(), message = COVERAGE_ANALYSIS_RUN_MESSAGE) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'p1', message, launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('every coverage check step opens this command carrying the step; other coverage steps do not', () => {
  for (const key of ops.COVERAGE_CHECK_STEP_KEYS) {
    const mode = askGuidanceStepMode('coverage-intelligence', key);
    assert.deepEqual({ m: mode.mode, o: mode.inAsk.operationId, c: mode.inAsk.carriesStep }, { m: 'IN_ASK', o: OP, c: 'ENTITY' }, key);
  }
  // The term-review steps are in Ask too, but they open their own command, not this one.
  const review = askGuidanceStepMode('coverage-intelligence', 'review_current_policy_context');
  assert.deepEqual({ m: review.mode, o: review.inAsk.operationId }, { m: 'IN_ASK', o: 'COVERAGE_TERM_REVIEW' });
  assert.notEqual(review.inAsk.operationId, OP);
});

test('Ask: the proposal derives the scope from the journey, shows what will run, and writes nothing; only the declared action starts it', async () => {
  const item = await propose();
  assert.equal(item.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(item.confirmation.fields.map((f) => [f.label, f.value]), [['Step', 'Check coverage and deductible exposure'], ['Checks', 'Water heater'], ['Scope', 'This item']]);
  step = propertyJourney();
  assert.equal((await propose()).confirmation.fields[2].value, 'The whole home');
  assert.equal(runs.length, 0);
  assert.equal((await propose(launch({ entityType: null, entityId: null }))).reasonCode, 'COVERAGE_ANALYSIS_STEP_REQUIRED');
  assert.equal((await propose(launch(), 'run a coverage check')).reasonCode, 'COVERAGE_ANALYSIS_STEP_REQUIRED');
  assert.equal((await propose(launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'COVERAGE_ANALYSIS_STEP_REQUIRED');
  role = 'VIEWER';
  assert.match((await propose()).reasonCode, /PERMISSION_REQUIRED/);
  role = 'CONTRIBUTOR';
  for (const stale of [null, stepRow({ toolKey: 'recalls' }), stepRow({ stepKey: 'review_current_policy_context' }), stepRow({ status: 'COMPLETED' })]) {
    step = stale;
    assert.equal((await propose()).reasonCode, 'COVERAGE_ANALYSIS_STEP_UNAVAILABLE');
  }
});

test('Ask: confirming runs the canonical analysis for the derived scope, saves it, and completes the step; a changed step rejects the confirmation', async () => {
  const proposal = await propose();
  const out = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(runs[0][0], 'item');
  assert.equal(runs[0][2], 'item-1', 'the item is the journey\'s, not a parameter the caller supplied');
  assert.equal(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, 'This step is recorded as done');
  assert.equal(out.artifactType, 'COVERAGE_ITEM_ANALYSIS');
  runs.length = 0; reports.length = 0;
  step = stepRow({ updatedAt: new Date('2026-10-25T00:00:00Z') });
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  step = stepRow({ status: 'SKIPPED' });
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(runs.length + reports.length, 0);
  role = 'VIEWER';
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
});

test('Ask: a failed journey report keeps the saved analysis and says so; a refused gate is the homeowner\'s answer in its own words', async () => {
  const proposal = await propose();
  reportFails = true;
  const out = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(out.result.status, 'COMPLETED');
  assert.match(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, /check is saved, but the journey step could not be updated/);
  reportFails = false; coverageState = 'MANAGED_ELSEWHERE';
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /managed by another responsible party/.test(e.message));
});

test('the page\'s run routes call the same shared service and accept the step as a hint', () => {
  const controller = fs.readFileSync(require.resolve('../../src/controllers/coverageAnalysis.controller.ts'), 'utf8');
  assert.equal((controller.match(/runCoverageAnalysisWithEffects\(/g) ?? []).length, 2);
  assert.equal(/service\.run\(|service\.runItemAnalysis\(/.test(controller), false, 'the controller must not run the analysis directly');
  assert.match(fs.readFileSync(require.resolve('../../src/routes/coverageAnalysis.routes.ts'), 'utf8'), /guidanceStepId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(fs.readFileSync(require.resolve('../../src/routes/inventory.routes.ts'), 'utf8'), /guidanceStepId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
});

test('on-demand run from the coverage answer (FRD v1.491): the whole home, reviewed then run through the shared service with no journey step, refused if another run landed meanwhile', async () => {
  const { COVERAGE_PROPERTY_ANALYSIS_MESSAGE, COVERAGE_PROPERTY_ANALYSIS_ACTION_ID } = require('../../src/services/ask/support/coverageAnalysisRun.ts');
  let latest = { id: 'an-0', computedAt: new Date('2026-10-01T00:00:00Z') };
  prisma.coverageAnalysis = { findFirst: async () => latest };
  const own = (over = {}) => ({ surface: 'ASK_PAGE', operationId: OP, actionId: COVERAGE_PROPERTY_ANALYSIS_ACTION_ID, entityType: 'COVERAGE_PROPERTY', entityId: 'p1', ...over });
  try {
    const review = await propose(own(), COVERAGE_PROPERTY_ANALYSIS_MESSAGE);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.confirmation.fields[0].value, 'The whole home');
    assert.match(review.confirmation.description, /says nothing about what a claim would pay/);
    assert.equal(runs.length, 0);
    const done = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].slice(0, 2), ['property', 'p1']);
    assert.deepEqual(tracked, ['run_analysis']);
    assert.equal(reports.length, 0, 'no journey step is touched');
    assert.equal(done.artifactType, 'COVERAGE_ANALYSIS');
    assert.equal(done.result.blocks[0].title, 'Coverage analysis saved');
    latest = { id: 'an-1', computedAt: new Date('2026-10-24T00:00:00Z') };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(runs.length, 1);
    // Only the declared action starts it: a typed request, another property or a refresh does not.
    for (const bad of [[own(), 'Run a coverage analysis.'], [own({ entityId: 'other' }), COVERAGE_PROPERTY_ANALYSIS_MESSAGE], [own({ surface: 'ASK_REFRESH' }), COVERAGE_PROPERTY_ANALYSIS_MESSAGE], [own({ actionId: 'x' }), COVERAGE_PROPERTY_ANALYSIS_MESSAGE]]) {
      assert.equal((await propose(bad[0], bad[1])).reasonCode, 'COVERAGE_ANALYSIS_STEP_REQUIRED');
    }
    role = 'VIEWER';
    assert.match((await propose(own(), COVERAGE_PROPERTY_ANALYSIS_MESSAGE)).reasonCode, /PERMISSION_REQUIRED/);
    role = 'CONTRIBUTOR';
    CoverageIntelligenceService.prototype.run = async function () { throw new APIError('Complete the policy record first.', 409, 'PROPERTY_CONTEXT_REQUIRED'); };
    const refused = await propose(own(), COVERAGE_PROPERTY_ANALYSIS_MESSAGE);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(refused.parameters)), (e) => e.message === 'Complete the policy record first.' && e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  } finally { prisma.coverageAnalysis = undefined; }
});

test('the coverage answer shows the latest saved analysis as text with the run action only for a contributor or owner; stale is said; no link', () => {
  const { coverageAnalysisBlocks } = require('../../src/services/ask/handlers/coverageReview.handler.ts');
  const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  const read = { exists: true, analysis: { id: 'an-1', status: 'STALE', computedAt: '2026-10-24T12:00:00.000Z', confidence: 'MEDIUM', scenarioState: 'COSTS_ARE_CLOSE', insuranceReviewState: 'POLICY_RECORD_INCOMPLETE', summary: 'The warranty roughly breaks even.',
    nextSteps: [{ title: 'Confirm your deductible', detail: 'It changes the result.' }] } };
  const own = coverageAnalysisBlocks(read, true, 'p1');
  assert.match(own[0].title, /Coverage analysis · /);
  assert.match(own[0].body, /roughly breaks even.*close.*Confidence: medium.*not advice/);
  assert.equal(own[0].actions[0].label, 'Run a new analysis');
  assert.equal(own[0].actions[0].entityId, 'p1');
  assert.equal(own[1].id, 'coverage-analysis-stale');
  assert.equal(own[2].sections[0].items[0].href, null);
  assert.deepEqual(coverageAnalysisBlocks(read, false, 'p1')[0].actions, []);
  assert.equal(coverageAnalysisBlocks({ exists: false }, true, 'p1')[0].actions[0].label, 'Run a coverage analysis');
  assert.deepEqual(coverageAnalysisBlocks(null, true, 'p1'), []);
  assert.ok(!JSON.stringify(own).includes('/dashboard'));
  for (const [id, operationId] of [['coverage-analysis-run-property', 'COVERAGE_REVIEW_STATUS'], ['coverage-analysis-see', 'COVERAGE_ANALYSIS_RUN']]) {
    assert.equal(isAskActionApplicable({ action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'COVERAGE_ANALYSIS_RUN', style: 'SECONDARY' }, operationId, propertyId: 'p1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, id);
  }
});

test('item coverage comparison (FRD v1.492): the form, a review of exactly the numbers entered, the page\'s item analysis with only those overrides, the gates\' own words, and a stale item refused', async () => {
  const s = require('../../src/services/ask/support/coverageAnalysisRun.ts');
  const { itemAnalysisResult } = require('../../src/services/ask/handlers/coverageAnalysisRun.handler.ts');
  let item = { id: 'item-1', name: 'Water heater', coverageState: 'MISSING', updatedAt: new Date('2026-10-01T00:00:00Z') };
  prisma.inventoryItem = { findFirst: async (args) => (args.where.id === item.id ? item : null) };
  prisma.coverageAnalysis = { findFirst: async () => null };
  CoverageIntelligenceService.prototype.runItemAnalysis = async function (...args) { runs.push(['item', ...args]); return { ...ANALYSIS, id: 'an-item', warranty: { expectedNetImpactUsd: -120, expectedAnnualRepairRiskUsd: 180, breakEvenMonths: 18.4, planningState: 'COMPARE_COST_INPUTS' } }; };
  const own = (over = {}) => ({ surface: 'ASK_PAGE', operationId: OP, actionId: s.COVERAGE_ITEM_ANALYSIS_ACTION_ID, entityType: 'INVENTORY_ITEM', entityId: 'item-1', ...over });
  try {
    const form = await propose(own(), s.COVERAGE_ITEM_ANALYSIS_MESSAGE);
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, s.COVERAGE_ITEM_ANALYSIS_CAPTURE_KEY);
    assert.equal(runs.length, 0);
    assert.equal((await itemAnalysisResult('u1', 'p1', own(), { coverageType: 'NOPE', riskTolerance: 'MEDIUM' })).reasonCode, 'COVERAGE_ITEM_ANALYSIS_INPUT_INVALID');
    assert.equal((await itemAnalysisResult('u1', 'p1', own(), { coverageType: 'WARRANTY', riskTolerance: 'MEDIUM', annualCostUsd: -5 })).reasonCode, 'COVERAGE_ITEM_ANALYSIS_INPUT_INVALID');
    const review = await itemAnalysisResult('u1', 'p1', own(), { coverageType: 'WARRANTY', riskTolerance: 'LOW', annualCostUsd: '450', serviceFeeUsd: '', expectedRemainingYears: 6 });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.slice(0, 4).map((f) => f.value), ['Water heater', 'A warranty', '$450', 'From your home records']);
    assert.match(review.confirmation.description, /does not buy coverage/);
    assert.equal(runs.length, 0);
    const done = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.deepEqual(runs[0].slice(0, 3), ['item', 'p1', 'item-1']);
    assert.deepEqual(runs[0][4], { coverageType: 'WARRANTY', riskTolerance: 'LOW', annualCostUsd: 450, expectedRemainingYears: 6 });
    assert.equal(done.artifactType, 'COVERAGE_ITEM_ANALYSIS');
    assert.ok(done.result.blocks[0].details.some((d) => d.value === '-$120'));
    assert.ok(done.result.blocks[0].details.some((d) => d.label === 'Months to break even' && d.value === '18'));
    assert.deepEqual(reports, [], 'no journey step is touched');
    item = { ...item, updatedAt: new Date('2026-10-20T00:00:00Z') };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    // Not ready, missing, a viewer, a typed request and another action do not start it.
    item = { ...item, coverageState: 'MANAGED_ELSEWHERE' };
    assert.equal((await propose(own(), s.COVERAGE_ITEM_ANALYSIS_MESSAGE)).reasonCode, 'COVERAGE_ITEM_NOT_READY');
    item = { ...item, coverageState: 'MISSING' };
    assert.equal((await propose(own({ entityId: 'nope' }), s.COVERAGE_ITEM_ANALYSIS_MESSAGE)).reasonCode, 'COVERAGE_ITEM_NOT_FOUND');
    assert.equal((await propose(own(), 'Is coverage worth it?')).reasonCode, 'COVERAGE_ANALYSIS_STEP_REQUIRED');
    role = 'VIEWER';
    assert.match((await propose(own(), s.COVERAGE_ITEM_ANALYSIS_MESSAGE)).reasonCode, /PERMISSION_REQUIRED/);
    role = 'CONTRIBUTOR';
    // The page's own gate refuses (an incomplete item): the household gets its words.
    featureContext.evaluateFeatureContext = async () => ({ canExecute: false });
    const refused = await itemAnalysisResult('u1', 'p1', own(), { coverageType: 'SERVICE_PLAN', riskTolerance: 'MEDIUM' });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(refused.parameters)), (e) => /Complete the item coverage information/.test(e.message) && e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  } finally { prisma.coverageAnalysis = undefined; }
});

test('the coverage gap cards offer "Is coverage worth it?" only to a contributor or owner and only where coverage is missing or ending', () => {
  const source = fs.readFileSync(require.resolve('../../src/services/ask/handlers/coverage.handler.ts'), 'utf8');
  assert.match(source, /access\.role === HouseholdRole\.VIEWER \? undefined/);
  assert.match(source, /group === 'NO_COVERAGE' \|\| group === 'EXPIRED' \|\| group === 'EXPIRING_SOON'/);
  assert.match(source, /operationId: 'COVERAGE_ANALYSIS_RUN' as const, actionId: COVERAGE_ITEM_ANALYSIS_ACTION_ID, entityType: 'INVENTORY_ITEM', entityId: item\.inventoryItemId/);
});
