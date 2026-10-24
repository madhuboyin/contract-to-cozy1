const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('ts-node/register');

// Project Tracker and the guided journey (continuation FRD section 25): creating a project for a journey's step stores the journey and reports the step; completing a project
// with a verified outcome reports the closing steps to the journey the project stores, through reporters the Desktop controller shares. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const projectService = require('../../src/services/projectTracker.service.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const reporting = require('../../src/services/guidanceEngine/projectJourneyReporting.ts');
const { PROJECT_TRACKER_CREATE_MESSAGE } = require('../../src/services/ask/support/projectTrackerConstants.ts');
const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const featureContext = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const compliance = require('../../src/services/projectCompliance/context.ts');
const analytics = require('../../src/services/analytics/index.ts');

const OP = 'PROJECT_TRACKER_CREATE';
const FORM = { name: 'New roof', projectType: 'ROOF_REPLACEMENT', fulfillmentMode: 'PROVIDER', contractorName: 'Acme Roofing', contractAmountDollars: 18500, startDate: '2026-11-01', expectedEndDate: null,
  permitApplicability: 'UNKNOWN', hoaApplicability: 'UNKNOWN', initialMilestoneName: 'Tear off', initialMilestoneDate: null, contractDocumentIds: [] };
let step; let existingProject; let created; let completions; let recordFails; let saved; let gates;
const stepRow = (over = {}) => ({ stepKey: 'confirm_scope_and_provider', toolKey: 'project-tracker', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: { signalIntentFamily: 'lifecycle_end_or_past_life' } }, ...over });

test.beforeEach(() => {
  step = stepRow(); existingProject = null; created = []; completions = []; recordFails = false;
  saved = { models: ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep', 'projectRecord', 'propertyRecord', 'document', 'property'].map((name) => [name, prisma[name]]),
    resolve: propertyAccess.resolvePropertyAccess, create: projectService.createProject, evalCtx: featureContext.evaluateFeatureContext, compliance: compliance.assertProjectComplianceApplicable, track: analytics.analyticsEmitter.track, rec: guidanceJourneyService.recordToolCompletion, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  prisma.guidanceSignal = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourney = { findFirst: async (args) => (args.where.id === 'j-open' ? { id: 'j-open' } : null) };
  prisma.guidanceJourneyStep = { findFirst: async () => step };
  prisma.projectRecord = { findFirst: async (args) => (args.where.guidanceJourneyId ? existingProject : null), findMany: async () => [] };
  prisma.propertyRecord = { findMany: async () => [] };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
  projectService.createProject = async (propertyId, data) => { created.push(data); return { id: 'proj-1', milestones: [] }; };
  gates = { feature: 0, compliance: 0 };
  featureContext.evaluateFeatureContext = async () => { gates.feature += 1; return { canExecute: true }; };
  compliance.assertProjectComplianceApplicable = async () => { gates.compliance += 1; return { contextVersion: 'ctx' }; };
  analytics.analyticsEmitter.track = () => {};
  guidanceJourneyService.recordToolCompletion = async (input) => { completions.push(input); if (recordFails) throw new Error('down'); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
});
test.afterEach(() => {
  for (const [name, model] of saved.models) prisma[name] = model;
  propertyAccess.resolvePropertyAccess = saved.resolve; projectService.createProject = saved.create; featureContext.evaluateFeatureContext = saved.evalCtx; compliance.assertProjectComplianceApplicable = saved.compliance; analytics.analyticsEmitter.track = saved.track; guidanceJourneyService.recordToolCompletion = saved.rec; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile;
});

const start = (entity) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'p1', message: PROJECT_TRACKER_CREATE_MESSAGE, launchContext: { surface: 'ASK_WORKSPACE', operationId: OP, sourceExecutionId: 'src-1', ...(entity ? { entityType: 'GUIDANCE_STEP', entityId: 'step-p' } : {}) } });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the journey step offers starting a project, and the four closing steps and tracking offer the project itself', () => {
  const create = askGuidanceStepMode('project-tracker', 'confirm_scope_and_provider');
  assert.deepEqual({ m: create.mode, o: create.inAsk.operationId, c: create.inAsk.carriesStep }, { m: 'IN_ASK', o: OP, c: 'ENTITY' });
  for (const [tool, key] of [['project-tracker', 'track_work'], ['project-completion', 'capture_proof'], ['project-completion', 'set_future_care'], ['project-completion', 'update_home_record'], ['project-completion', 'verify_outcome']]) {
    assert.equal(askGuidanceStepMode(tool, key).inAsk.operationId, 'PROJECT_TRACKER_PROJECTS', key);
  }
});

test('a step-bound start re-reads the step, refuses a second project for the same journey, and carries the step to the form', async () => {
  const form = await start(true);
  assert.deepEqual([form.reasonCode, form.parameters.guidanceStepId, form.parameters.sourceExecutionId], ['PROJECT_TRACKER_CREATE_INPUT_REQUIRED', 'step-p', 'src-1']);
  existingProject = { id: 'proj-0', name: 'Roof project' };
  const second = await start(true);
  assert.equal(second.reasonCode, 'PROJECT_TRACKER_JOURNEY_STEP_UNAVAILABLE');
  assert.match(second.blocks[0].body, /already tracks this journey/);
  existingProject = null;
  for (const stale of [null, stepRow({ toolKey: 'coverage-intelligence' }), stepRow({ stepKey: 'track_work' }), stepRow({ status: 'COMPLETED' }), stepRow({ journey: { id: 'j1', status: 'DISMISSED', inventoryItemId: null, primarySignal: null } })]) {
    step = stale;
    assert.equal((await start(true)).reasonCode, 'PROJECT_TRACKER_JOURNEY_STEP_UNAVAILABLE');
  }
  step = stepRow();
  assert.equal('guidanceStepId' in (await start(false)).parameters, false, 'outside a journey nothing is carried');
});

test('confirming the project stores its journey, reports the step with the project as proof, and says so in the receipt', async () => {
  const proposal = await require('../../src/services/ask/handlers/projectTracker.handler.ts').projectTrackerCreateResult('u1', 'p1', FORM, 'src-1', 'step-p');
  assert.equal(proposal.parameters.guidanceStepId, 'step-p');
  const out = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.deepEqual({ j: created[0].guidanceJourneyId, i: created[0].inventoryItemId }, { j: 'j1', i: 'item-1' });
  assert.deepEqual({ j: completions[0].journeyId, s: completions[0].stepKey, p: completions[0].producedData.proofType, id: completions[0].producedData.proofId, t: completions[0].sourceToolKey }, { j: 'j1', s: 'confirm_scope_and_provider', p: 'project_scope_confirmation', id: 'proj-1', t: 'project-tracker' });
  assert.equal(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, 'This step is recorded as done');
});

test('a failed report never undoes the project; a step that went stale starts a plain project; no step changes nothing', async () => {
  const proposal = await require('../../src/services/ask/handlers/projectTracker.handler.ts').projectTrackerCreateResult('u1', 'p1', FORM, null, 'step-p');
  recordFails = true;
  const failed = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(failed.result.status, 'COMPLETED');
  assert.match(failed.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, /project is started, but the journey step could not be updated/);
  recordFails = false; completions.length = 0; created.length = 0; step = stepRow({ status: 'SKIPPED' });
  const plain = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(plain.result.status, 'COMPLETED');
  assert.equal('guidanceJourneyId' in created[0], false);
  assert.equal(completions.length, 0);
  created.length = 0;
  await confirmCapabilityInvoke(OP, ctx({ projectTrackerCreate: FORM }));
  assert.equal('guidanceJourneyId' in created[0], false);
  assert.equal(completions.length, 0);
});

test('the closure reporter sends the five closing steps to the journey the project stores, only for a verified success on an open journey', async () => {
  const closure = (over = {}) => ({ projectId: 'proj-1', journeyId: 'j-open', outcomeStatus: 'VERIFIED_SUCCESS', homeEventId: 'he-1', documentIds: ['doc-1'], futureCareTaskIds: [], ...over });
  assert.equal(await reporting.reportProjectClosure('p1', 'u1', closure()), true);
  assert.deepEqual(completions.map((c) => [c.stepKey, c.producedData.proofType, c.producedData.proofId, c.sourceToolKey]), [
    ['track_work', 'project_execution_record', 'proj-1', 'project-completion'], ['verify_outcome', 'project_verified_outcome', 'he-1', 'project-completion'],
    ['capture_proof', 'project_completion_proof', 'doc-1', 'project-completion'], ['update_home_record', 'living_home_record_writeback', 'he-1', 'project-completion'],
    ['set_future_care', 'future_care_plan', 'he-1', 'project-completion']]);
  assert.ok(completions.every((c) => c.journeyId === 'j-open' && /^project-completion:p1:proj-1:/.test(c.dedupeKey)));
  completions.length = 0;
  assert.equal(await reporting.reportProjectClosure('p1', 'u1', closure({ journeyId: null })), null);
  assert.equal(await reporting.reportProjectClosure('p1', 'u1', closure({ outcomeStatus: 'PARTIAL' })), null);
  assert.equal(await reporting.reportProjectClosure('p1', 'u1', closure({ journeyId: 'j-closed' })), false, 'a journey that is no longer open is not reported to');
  assert.equal(completions.length, 0);
  recordFails = true;
  assert.equal(await reporting.reportProjectClosure('p1', 'u1', closure()), false);
});

test('Ask\'s completion command reports through the shared closure reporter and the Desktop controller uses the same two reporters', () => {
  const handler = fs.readFileSync(require.resolve('../../src/services/ask/handlers/projectTracker.handler.ts'), 'utf8');
  assert.match(handler, /reportProjectClosure\(ctx\.execution\.propertyId, ctx\.userId/);
  const controller = fs.readFileSync(require.resolve('../../src/controllers/projectTracker.controller.ts'), 'utf8');
  assert.match(controller, /createProjectWithEffects\(/, 'the page creates through the shared service, which reports the created project');
  assert.match(controller, /reportProjectClosure\(/);
  assert.match(fs.readFileSync(require.resolve('../../src/services/projectTrackerOperations.ts'), 'utf8'), /reportProjectCreated\(/);
  assert.equal(/producedData: \{\s*proofType: 'project_scope_confirmation'/.test(controller), false, 'the inline create report is gone');
});

test('Ask now runs the page\'s gates: a refused gate is the homeowner\'s answer in the gate\'s own words, and nothing is created or reported', async () => {
  const proposal = await require('../../src/services/ask/handlers/projectTracker.handler.ts').projectTrackerCreateResult('u1', 'p1', FORM, null, 'step-p');
  featureContext.evaluateFeatureContext = async () => ({ canExecute: false });
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /Complete the required property responsibility/.test(error.message));
  assert.equal(created.length, 0);
  assert.equal(completions.length, 0);
  featureContext.evaluateFeatureContext = async () => ({ canExecute: true });
  assert.equal(gates.compliance >= 0, true);
  const ok = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.equal(ok.result.status, 'COMPLETED');
  assert.ok(gates.compliance >= 1, 'the compliance applicability check runs for an Ask create too');
});
