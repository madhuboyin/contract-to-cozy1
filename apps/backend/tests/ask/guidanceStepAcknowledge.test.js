const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Guidance step acknowledgement (continuation FRD section 28): a typed, durable acknowledgement completes a true review step and nothing else.

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const ack = require('../../src/services/guidanceEngine/guidanceAcknowledgement.ts');
const { GUIDANCE_STEP_ACKNOWLEDGE_MESSAGE } = require('../../src/services/ask/support/guidanceAcknowledge.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { guidanceJourneyContinuation } = require('../../src/services/ask/askOrchestrator.service.ts');

const OP = 'GUIDANCE_STEP_ACKNOWLEDGE';
const SIGNAL_AT = new Date('2026-10-20T08:00:00.000Z');
let step; let completions; let recordFails; let saved; let role;
const stepRow = (over = {}) => ({ id: 'step-r', label: 'Review guidance signal', stepKey: 'review_signal', toolKey: 'guidance-overview', status: 'PENDING', updatedAt: new Date('2026-10-21T00:00:00.000Z'),
  journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: { id: 'sig-1', signalIntentFamily: 'generic_actionable_signal', updatedAt: SIGNAL_AT } }, ...over });

test.beforeEach(() => {
  step = stepRow(); completions = []; recordFails = false; role = 'CONTRIBUTOR';
  saved = { models: ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep'].map((name) => [name, prisma[name]]),
    resolve: propertyAccess.resolvePropertyAccess, rec: guidanceJourneyService.recordToolCompletion, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  guidanceJourneyService.recordToolCompletion = async (input) => { completions.push(input); if (recordFails) throw new Error('down'); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => {
  for (const [name, model] of saved.models) prisma[name] = model;
  propertyAccess.resolvePropertyAccess = saved.resolve; guidanceJourneyService.recordToolCompletion = saved.rec; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile;
});

const launch = (over = {}) => ({ surface: 'ASK_WORKSPACE', operationId: OP, entityType: 'GUIDANCE_STEP', entityId: 'step-r', sourceExecutionId: 'src-1', ...over });
const propose = (launchContext = launch(), message = GUIDANCE_STEP_ACKNOWLEDGE_MESSAGE) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'p1', message, launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('only the review step is acknowledgeable, and the journey offers it as its in-Ask action', () => {
  assert.deepEqual([...ack.ACKNOWLEDGEABLE_STEP_KEYS], ['review_signal']);
  const mode = askGuidanceStepMode('guidance-overview', 'review_signal');
  assert.deepEqual({ m: mode.mode, o: mode.inAsk.operationId, c: mode.inAsk.carriesStep }, { m: 'IN_ASK', o: OP, c: 'ENTITY' });
  for (const other of ['act_on_inspection_findings', 'update_budget', 'confirm_cleaning_complete', 'track_resolution', 'prepare_property_access', 'review_compliance_requirement']) {
    assert.equal(askGuidanceStepMode('guidance-overview', other).mode, 'NAVIGATE', `${other}: not a true review step`);
  }
  const journey = { id: 'j1', status: 'ACTIVE', issueDomain: 'OTHER', executionReadiness: 'READY', isLowContext: false, primarySignalId: 'sig-1', primarySignal: { id: 'sig-1', signalIntentFamily: 'generic_actionable_signal' }, inventoryItem: null, currentStepKey: 'review_signal', missingContextKeys: [], evidences: [],
    steps: [{ id: 'step-r', journeyId: 'j1', stepKey: 'review_signal', stepOrder: 1, label: 'Review guidance signal', status: 'PENDING', toolKey: 'guidance-overview', governanceJson: { safetyTier: 'LOW_CONSEQUENCE' } }] };
  const action = guidanceJourneyContinuation(journey, 'p1', { requestedJourneyId: 'j1', canContribute: true }).blocks.find((b) => b.id === 'guidance-journey-workspace').actions[0];
  assert.deepEqual({ id: action.id, o: action.operationId, m: action.message, et: action.entityType, ei: action.entityId }, { id: 'continue-step-in-ask', o: OP, m: GUIDANCE_STEP_ACKNOWLEDGE_MESSAGE, et: 'GUIDANCE_STEP', ei: 'step-r' });
});

test('the proposal re-reads the step and ties the confirmation to the step and the signal as they stand; nothing is written yet', async () => {
  const result = await propose();
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.parameters.guidanceStepId, 'step-r');
  assert.equal(result.confirmation.confirmLabel, 'Mark as reviewed');
  assert.equal(completions.length, 0);
});

test('only the declared action starts it; a viewer, another tool\'s step, another step key, a done step and a closed journey are each refused before any confirmation', async () => {
  assert.equal((await propose(launch({ entityType: null, entityId: null }))).reasonCode, 'GUIDANCE_STEP_REQUIRED');
  assert.equal((await propose(launch(), 'mark it reviewed')).reasonCode, 'GUIDANCE_STEP_REQUIRED');
  assert.equal((await propose(launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'GUIDANCE_STEP_REQUIRED');
  role = 'VIEWER';
  assert.match((await propose()).reasonCode, /PERMISSION_REQUIRED/);
  role = 'CONTRIBUTOR';
  for (const [stale, code] of [[null, 'GUIDANCE_STEP_ACKNOWLEDGE_UNAVAILABLE'], [stepRow({ toolKey: 'price-finalization' }), 'GUIDANCE_STEP_ACKNOWLEDGE_UNAVAILABLE'], [stepRow({ stepKey: 'update_budget', toolKey: 'guidance-overview' }), 'GUIDANCE_STEP_ACKNOWLEDGE_UNAVAILABLE'], [stepRow({ status: 'COMPLETED' }), 'GUIDANCE_STEP_ALREADY_COMPLETED'], [stepRow({ journey: { id: 'j1', status: 'DISMISSED', inventoryItemId: null, primarySignal: null } }), 'GUIDANCE_STEP_ACKNOWLEDGE_UNAVAILABLE']]) {
    step = stale;
    assert.equal((await propose()).reasonCode, code);
  }
  assert.equal(completions.length, 0);
});

test('confirming records one typed acknowledgement: exact signal and version, step, actor, time and outcome, with a dedupe key', async () => {
  const proposal = await propose();
  const out = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(completions.length, 1);
  const done = completions[0];
  assert.deepEqual({ j: done.journeyId, s: done.stepKey, st: done.status, tool: done.sourceToolKey, actor: done.actorUserId }, { j: 'j1', s: 'review_signal', st: 'COMPLETED', tool: 'guidance-overview', actor: 'u1' });
  assert.deepEqual({ ...done.producedData, acknowledgedAt: typeof done.producedData.acknowledgedAt }, {
    proofType: 'acknowledgement', proofId: 'sig-1', outcome: 'REVIEWED', stepId: 'step-r', signalId: 'sig-1', signalVersion: SIGNAL_AT.toISOString(), actorUserId: 'u1', acknowledgedAt: 'string' });
  assert.ok(!Number.isNaN(Date.parse(completions[0].producedData.acknowledgedAt)));
  assert.equal(done.dedupeKey, `acknowledgement:p1:step-r:sig-1:${SIGNAL_AT.toISOString()}`);
  assert.equal(out.result.status, 'COMPLETED');
  assert.equal(out.result.blocks[0].title, 'Marked as reviewed');
});

test('a stale step or a changed signal rejects the confirmation; a step already done is a no-op; a failed record is a refusal, not a silent success', async () => {
  const proposal = await propose();
  step = stepRow({ updatedAt: new Date('2026-10-22T00:00:00.000Z') });
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  step = stepRow({ journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: { id: 'sig-1', signalIntentFamily: 'x', updatedAt: new Date('2026-10-23T00:00:00.000Z') } } });
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT', 'the signal changed since it was shown');
  step = stepRow({ status: 'COMPLETED' });
  const again = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(again.result.reasonCode, 'GUIDANCE_STEP_ALREADY_REVIEWED');
  assert.equal(completions.length, 0);
  step = stepRow(); recordFails = true;
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), /could not be recorded/);
  role = 'VIEWER';
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
});

test('the recorder refuses any step that is not a review step, so a safety, financial, compliance, execution or repair step can never be completed by self-attestation', async () => {
  for (const stepKey of ['update_budget', 'safety_alert', 'repair_replace_decision', 'finalize_price', 'complete_compliance_task', 'book_service']) {
    assert.equal(await ack.acknowledgeGuidanceStep('p1', 'u1', { stepId: 's', stepKey, journeyId: 'j', signalId: 'sig', signalVersion: 'v', acknowledgedAt: new Date() }), false, stepKey);
  }
  assert.equal(completions.length, 0);
  assert.equal(await ack.acknowledgeGuidanceStep('p1', 'u1', { stepId: 's', stepKey: 'review_signal', journeyId: 'j', signalId: null, signalVersion: null, acknowledgedAt: new Date() }), true);
  assert.equal(completions[0].dedupeKey, 'acknowledgement:p1:s:none:none');
});

test('the command is registered like the other guided-journey writes: confirmation-gated, contributor floor, non-routable', () => {
  const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
  assert.equal(ASK_OPERATION_DEFINITIONS[OP].messageRoutable, false);
  assert.equal(ASK_OPERATION_DEFINITIONS[OP].propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  assert.equal(require('../../src/services/skills/skillRegistry.ts').getSkillForOperation(OP).id, 'guidance-overview');
});
