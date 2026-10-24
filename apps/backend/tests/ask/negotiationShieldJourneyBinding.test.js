const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// A guided journey's prepare_negotiation step starts and analyses a Negotiation Shield review in Ask with an exact step binding (continuation FRD section 21): the
// step id rides every stage (start, form, review, receipt, analysis) and is re-read at each one; the step completes only when the analysis is saved; a stale or
// incompatible step completes nothing and falls back to nothing; a review already on file is offered before a second one is made.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const projectCompliance = require('../../src/services/projectCompliance/context.ts');
const completion = require('../../src/services/negotiationShieldJourneyCompletion.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { NEGOTIATION_SHIELD_START_MESSAGE } = require('../../src/services/ask/support/negotiationShieldStart.ts');
const { NEGOTIATION_SHIELD_ANALYZE_MESSAGE } = require('../../src/services/ask/support/negotiationShieldAnalyze.ts');
const caseList = require('../../src/services/negotiationShieldCaseList.ts');

const START = 'NEGOTIATION_SHIELD_CASE_START';
const ANALYZE = 'NEGOTIATION_SHIELD_CASE_ANALYZE';
let step; let existingCase; let seen; let recordResult; let analysedCase; let analysisSaved;
const saved = {};

const stepRow = (over = {}) => ({ stepKey: 'prepare_negotiation', toolKey: 'negotiation-shield', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: { signalIntentFamily: 'lifecycle_end_or_past_life' } }, ...over });

test.beforeEach(() => {
  step = stepRow(); existingCase = null; recordResult = true; analysisSaved = false; seen = { lookups: [], created: [], completion: [], gate: 0 };
  analysedCase = { case: { id: 'case-new', title: 'Roof quote', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'ANALYZED' }, latestAnalysis: { id: 'an-1', summary: 's' }, latestDraft: null };
  Object.assign(saved, {
    models: ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'negotiationShieldCase'].map((name) => [name, prisma[name]]),
    resolve: propertyAccess.resolvePropertyAccess, create: NegotiationShieldService.prototype.createCase, analyze: NegotiationShieldService.prototype.analyzeCase,
    gate: projectCompliance.assertProjectComplianceApplicable, record: completion.recordNegotiationShieldAnalysisCompletion, reconcile: executeOperation.reconcileAskExecutionSideEffects,
    review: caseList.getNegotiationShieldCaseReviewForProperty,
  });
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async (args) => { seen.lookups.push(args.where); return step; } };
  prisma.negotiationShieldCase = { findFirst: async (args) => { seen.reuse = args.where; return existingCase; } };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
  NegotiationShieldService.prototype.createCase = async function (...args) { seen.created.push(args); return { case: { id: 'case-new', title: 'Roof quote' } }; };
  NegotiationShieldService.prototype.analyzeCase = async function () { analysisSaved = true; return analysedCase; };
  projectCompliance.assertProjectComplianceApplicable = async () => { seen.gate += 1; return { contextVersion: 'ctx' }; };
  completion.recordNegotiationShieldAnalysisCompletion = async (input) => { seen.completion.push(input); return recordResult; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  caseList.getNegotiationShieldCaseReviewForProperty = async () => ({
    case: { id: 'case-new', title: 'Roof quote', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'ANALYZED', propertyId: 'p1', perspective: 'HOMEOWNER', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    hasInput: true, inputsUpdatedAt: new Date().toISOString(), latestDraft: null,
    latestAnalysis: analysisSaved && { id: 'an-1', caseId: 'case-new', summary: 's', findings: [], negotiationLeverage: [], recommendedActions: [], pricingAssessment: null, confidence: 0.5, generatedAt: new Date(Date.now() + 1000).toISOString(), confidenceExplanation: null },
  });
});
test.afterEach(() => {
  for (const [name, model] of saved.models) prisma[name] = model;
  propertyAccess.resolvePropertyAccess = saved.resolve; NegotiationShieldService.prototype.createCase = saved.create; NegotiationShieldService.prototype.analyzeCase = saved.analyze;
  projectCompliance.assertProjectComplianceApplicable = saved.gate; completion.recordNegotiationShieldAnalysisCompletion = saved.record;
  executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; caseList.getNegotiationShieldCaseReviewForProperty = saved.review;
});

const startLaunch = (over = {}) => ({ surface: 'ASK_WORKSPACE', operationId: START, entityType: 'GUIDANCE_STEP', entityId: 'step-n', sourceExecutionId: 'src-1', ...over });
const start = (launchContext) => capabilityInvoke(START, { userId: 'u1', propertyId: 'p1', message: NEGOTIATION_SHIELD_START_MESSAGE, launchContext });
const analyze = (launchContext) => capabilityInvoke(ANALYZE, { userId: 'u1', propertyId: 'p1', message: NEGOTIATION_SHIELD_ANALYZE_MESSAGE, launchContext });
const ctx = (operationId, parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', createdAt: new Date(Date.now() - 60_000) }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(operationId) });

test('the journey step offers the start as its in-Ask action, carrying the step', () => {
  const mode = askGuidanceStepMode('negotiation-shield', 'prepare_negotiation');
  assert.equal(mode.mode, 'IN_ASK');
  assert.deepEqual({ o: mode.inAsk.operationId, m: mode.inAsk.message, carries: mode.inAsk.carriesStep }, { o: START, m: NEGOTIATION_SHIELD_START_MESSAGE, carries: true });
  assert.equal(askGuidanceStepMode('negotiation-shield', 'other_step').mode, 'NAVIGATE');
});

test('a step-bound start re-reads the step in this home and opens the form for the review type the journey\'s signal calls for', async () => {
  const result = await start(startLaunch());
  assert.deepEqual(seen.lookups[0], { id: 'step-n', journey: { propertyId: 'p1' } });
  assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_START_INPUT_REQUIRED');
  assert.deepEqual(result.parameters.negotiationStartLaunch, { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', sourceExecutionId: 'src-1', guidanceStepId: 'step-n' });
  step = stepRow({ journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: { signalIntentFamily: 'coverage_gap' } } });
  assert.equal((await start(startLaunch())).parameters.negotiationStartLaunch.scenarioType, 'INSURANCE_PREMIUM_INCREASE');
  step = stepRow({ journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: null, primarySignal: { signalIntentFamily: 'inspection_followup_needed' } } });
  assert.equal((await start(startLaunch())).reasonCode, 'NEGOTIATION_SHIELD_JOURNEY_STEP_UNAVAILABLE', 'a buyer-inspection review is another flow');
});

test('a stale or incompatible step starts nothing and does not fall back to another step', async () => {
  for (const stale of [null, stepRow({ toolKey: 'coverage-intelligence' }), stepRow({ stepKey: 'other_step' }), stepRow({ status: 'COMPLETED' }), stepRow({ status: 'SKIPPED' }), stepRow({ journey: { id: 'j1', status: 'DISMISSED', inventoryItemId: null, primarySignal: null } })]) {
    step = stale;
    const result = await start(startLaunch());
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_JOURNEY_STEP_UNAVAILABLE');
    assert.equal(result.captureRequests, undefined);
  }
});

test('a legacy journey whose step the page already completed is refused, so Ask makes no duplicate review', async () => {
  step = stepRow({ status: 'COMPLETED' });
  const result = await start(startLaunch());
  assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_JOURNEY_STEP_UNAVAILABLE');
  assert.match(result.blocks[0].body, /already done/);
  assert.equal(seen.created.length, 0);
});

test('a review of the kind already on file is offered for the step before a second is made, and "start a separate review" skips the offer', async () => {
  existingCase = { id: 'case-old', title: 'Old roof quote' };
  const offer = await start(startLaunch());
  assert.equal(offer.reasonCode, 'NEGOTIATION_SHIELD_JOURNEY_EXISTING_REVIEW');
  assert.deepEqual({ ...seen.reuse }, { propertyId: 'p1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: { not: 'ARCHIVED' }, inputs: { some: {} } });
  const [useIt, separate] = offer.blocks[0].actions;
  assert.deepEqual({ o: useIt.operationId, et: useIt.entityType, ei: useIt.entityId, g: useIt.guidanceStepId, m: useIt.message }, { o: ANALYZE, et: 'NEGOTIATION_SHIELD_CASE', ei: 'case-old', g: 'step-n', m: NEGOTIATION_SHIELD_ANALYZE_MESSAGE });
  assert.deepEqual({ o: separate.operationId, et: separate.entityType, ei: separate.entityId, a: separate.actionId }, { o: START, et: 'GUIDANCE_STEP', ei: 'step-n', a: 'negotiation-shield-start-new' });
  const fresh = await start(startLaunch({ actionId: 'negotiation-shield-start-new' }));
  assert.equal(fresh.reasonCode, 'NEGOTIATION_SHIELD_START_INPUT_REQUIRED');
});

test('the offer survives the answer-trust validator with the step intact', async () => {
  existingCase = { id: 'case-old', title: 'Old roof quote' };
  const raw = await start(startLaunch());
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'negotiation-shield.start', operationId: START, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: NEGOTIATION_SHIELD_START_MESSAGE, operationId: START, result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks[0].actions.map((a) => [a.id, a.guidanceStepId]), [['negotiation-shield-journey-use-existing', 'step-n'], ['negotiation-shield-start-new', undefined]]);
});

test('confirming the start saves the review, then carries the step to the analysis only while it is still this tool\'s open step', async () => {
  const parameters = { negotiationShieldStart: { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'Roof quote', structuredData: { quoteAmount: 18500 } }, guidanceStepId: 'step-n' };
  const outcome = await confirmCapabilityInvoke(START, ctx(START, parameters));
  assert.equal(seen.created.length, 1);
  const run = outcome.result.blocks[0].actions.find((a) => a.id === 'negotiation-shield-analyze');
  assert.deepEqual({ g: run.guidanceStepId, ei: run.entityId, o: run.operationId }, { g: 'step-n', ei: 'case-new', o: ANALYZE });
  assert.equal(seen.completion.length, 0, 'starting a review completes nothing: only a saved analysis does');
  step = stepRow({ status: 'SKIPPED' });
  const later = await confirmCapabilityInvoke(START, ctx(START, parameters));
  assert.equal(later.result.status, 'COMPLETED', 'the saved review is kept');
  assert.equal(later.result.blocks[0].actions.find((a) => a.id === 'negotiation-shield-analyze').guidanceStepId, undefined);
  assert.match(later.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, /no longer open/);
});

test('the analysis launched with the step is confirmed against that exact step and records the saved analysis on its journey', async () => {
  const proposal = await analyze({ surface: 'ASK_WORKSPACE', operationId: ANALYZE, entityType: 'NEGOTIATION_SHIELD_CASE', entityId: 'case-new', guidanceStepId: 'step-n', sourceExecutionId: 'src-1' });
  assert.equal(proposal.parameters.guidanceStepId, 'step-n');
  const outcome = await confirmCapabilityInvoke(ANALYZE, ctx(ANALYZE, proposal.parameters));
  assert.equal(seen.completion.length, 1);
  assert.deepEqual({ j: seen.completion[0].journeyId, s: seen.completion[0].stepKey, f: seen.completion[0].signalIntentFamily, a: seen.completion[0].actorUserId }, { j: 'j1', s: 'prepare_negotiation', f: 'lifecycle_end_or_past_life', a: 'u1' });
  assert.equal(outcome.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, 'This step is recorded as done');
});

test('a failed journey report never fails or undoes the saved analysis, and the receipt says so', async () => {
  recordResult = false;
  const outcome = await confirmCapabilityInvoke(ANALYZE, ctx(ANALYZE, { negotiationShieldAnalyze: { caseId: 'case-new', title: 'Roof quote', scenarioType: 'CONTRACTOR_QUOTE_REVIEW' }, guidanceStepId: 'step-n' }));
  assert.equal(outcome.result.status, 'COMPLETED');
  assert.match(outcome.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, /analysis is saved, but the journey step could not be updated/);
});

test('a stale step at analysis time reports nothing and falls back to no other step; with no step the older behaviour is unchanged', async () => {
  for (const stale of [null, stepRow({ toolKey: 'price-finalization' }), stepRow({ status: 'COMPLETED' }), stepRow({ journey: { id: 'j1', status: 'DISMISSED', inventoryItemId: null, primarySignal: null } })]) {
    step = stale; seen.completion.length = 0; analysisSaved = false;
    const outcome = await confirmCapabilityInvoke(ANALYZE, ctx(ANALYZE, { negotiationShieldAnalyze: { caseId: 'case-new', title: 'Roof quote', scenarioType: 'CONTRACTOR_QUOTE_REVIEW' }, guidanceStepId: 'step-n', journeyId: 'j-other' }));
    assert.equal(seen.completion.length, 0, 'not even the journey id the launch also carried is used as a fallback');
    assert.equal(outcome.result.status, 'COMPLETED');
  }
  seen.completion.length = 0; analysisSaved = false;
  await confirmCapabilityInvoke(ANALYZE, ctx(ANALYZE, { negotiationShieldAnalyze: { caseId: 'case-new', title: 'Roof quote', scenarioType: 'CONTRACTOR_QUOTE_REVIEW' }, journeyId: 'journey-9', stepKey: null }));
  assert.deepEqual([seen.completion.length, seen.completion[0].journeyId, seen.completion[0].stepKey], [1, 'journey-9', null], 'outside a journey the compatibility path is exactly as before');
});
