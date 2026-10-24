const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// HOME_HABITS_GENERATE, DO_NOTHING_SIMULATION_RUN and SERVICE_PRICE_CHECK_RUN (FRD v1.254), the three starts the empty-state sweep recommended. The real
// registered handlers run; prisma, the access check, the three services, the controller's compliance check and analytics are recording fakes. The
// states covered for each: empty (the answer's button), unavailable, unauthorized, cancel, confirmed write, and revalidation at execution.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { homeHabitsGenerateResult, doNothingRunResult, servicePriceCheckResult, habitsGenerateContextVersion, doNothingRunContextVersion } = require('../../src/services/ask/handlers/homeToolRuns.handler.ts');
const { DoNothingRunInputSchema, ServicePriceCheckInputSchema } = require('../../src/services/ask/support/commandInputs.ts');
const { HOME_HABITS_GENERATE_MESSAGE, DO_NOTHING_RUN_MESSAGE, SERVICE_PRICE_CHECK_MESSAGE } = require('../../src/services/ask/support/homeToolRunConstants.ts');
const { homeHabitsFromView } = require('../../src/services/ask/handlers/homeHabitCoach.handler.ts');
const { servicePriceChecksFromView } = require('../../src/services/ask/handlers/servicePriceRadar.handler.ts');
const { doNothingSimulationFromView } = require('../../src/services/ask/handlers/doNothingSimulator.handler.ts');
const { HomeHabitCoachService } = require('../../src/services/homeHabitCoach/homeHabitCoachService.ts');
const { DoNothingSimulatorService } = require('../../src/services/doNothingSimulator.service.ts');
const { ServicePriceRadarService } = require('../../src/services/servicePriceRadar.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const compliance = require('../../src/services/projectCompliance/context.ts');
const analytics = require('../../src/services/analytics/index.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  resolveAccess: propertyAccess.resolvePropertyAccess, generate: HomeHabitCoachService.prototype.generateHabits, listScenarios: DoNothingSimulatorService.prototype.listScenarios,
  run: DoNothingSimulatorService.prototype.run, recordCompletion: guidanceJourneyService.recordToolCompletion, createCheck: ServicePriceRadarService.prototype.createCheck, assertCompliance: compliance.assertProjectComplianceApplicable, track: analytics.analyticsEmitter.track,
};
let stepRow; let recordFails; let calls; let accessRole; let primaryHolder; let coachEnabled; let aliveTemplates; let scenarios; let coverageConflict; let earlierRun; let earlierCheck; let generateResult;

test.beforeEach(() => {
  calls = { generate: [], run: [], createCheck: [], compliance: [], track: [], guidance: [] };
  stepRow = null; recordFails = false;
  accessRole = 'OWNER'; primaryHolder = true; coachEnabled = null; aliveTemplates = ['t1']; coverageConflict = false; earlierRun = null; earlierCheck = null; generateResult = { created: 3, skipped: 1, details: [] };
  scenarios = [{ id: 's1', name: 'Skip a year', horizonMonths: 12 }];
  const models = {
    property: { findFirst: async () => (primaryHolder ? { id: 'p1' } : null) },
    propertyHabitPreference: { findUnique: async () => (coachEnabled === null ? null : { isEnabled: coachEnabled }) },
    propertyHabit: { findMany: async () => aliveTemplates.map((habitTemplateId) => ({ habitTemplateId })) },
    doNothingSimulationRun: { findFirst: async () => earlierRun },
    serviceRadarCheck: { findFirst: async () => earlierCheck },
    askExecution: { findMany: async () => [] },
    guidanceSignal: {}, guidanceJourney: {}, guidanceJourneyEvent: {}, guidanceStepEvidence: {},
    guidanceJourneyStep: { findFirst: async (args) => { calls.guidance.push(['lookup', args.where]); return stepRow; } },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return new Proxy({}, { get(_t, method) { if (!models[model][method]) throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); return models[model][method]; } });
    },
  });
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
  HomeHabitCoachService.prototype.generateHabits = async function (...args) { calls.generate.push(args); return generateResult; };
  DoNothingSimulatorService.prototype.listScenarios = async function () {
    if (coverageConflict) throw Object.assign(new Error('conflict'), { code: 'COVERAGE_CONFLICT_REVIEW_REQUIRED' });
    return { scenarios };
  };
  DoNothingSimulatorService.prototype.run = async function (...args) {
    calls.run.push(args);
    if (!primaryHolder) throw new Error('Property not found or access denied.');
    return { run: { id: 'run-1', horizonMonths: args[2].horizonMonths, confidence: 'MEDIUM', riskScoreDelta: 12, expectedCostDeltaCentsMin: 320000, expectedCostDeltaCentsMax: 780000 } };
  };
  ServicePriceRadarService.prototype.createCheck = async function (...args) {
    calls.createCheck.push(args);
    return { check: { id: 'check-1', verdict: 'HIGH', expectedLow: 4000, expectedHigh: 6000, explanationShort: 'Above the typical range for this service.' } };
  };
  compliance.assertProjectComplianceApplicable = async (...args) => { calls.compliance.push(args); return { contextVersion: 'ctx-7' }; };
  analytics.analyticsEmitter.track = (event) => { calls.track.push(event); };
  guidanceJourneyService.recordToolCompletion = async (input) => { calls.guidance.push(['record', input]); if (recordFails) throw new Error('guidance down'); return {}; };
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
  HomeHabitCoachService.prototype.generateHabits = originals.generate;
  DoNothingSimulatorService.prototype.listScenarios = originals.listScenarios;
  DoNothingSimulatorService.prototype.run = originals.run;
  ServicePriceRadarService.prototype.createCheck = originals.createCheck;
  compliance.assertProjectComplianceApplicable = originals.assertCompliance;
  analytics.analyticsEmitter.track = originals.track;
  guidanceJourneyService.recordToolCompletion = originals.recordCompletion;
});

const declared = (operationId) => ({ surface: 'ASK_WORKSPACE', operationId, sourceExecutionId: 'source-1' });
const start = (operationId, message, launchContext = declared(operationId)) => capabilityInvoke(operationId, { userId: 'u1', propertyId: 'p1', message, launchContext });
const execution = (operationId) => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId, createdAt: new Date('2026-10-10T00:00:00.000Z') });
const confirm = (operationId, parameters) => confirmCapabilityInvoke(operationId, { userId: 'u1', execution: execution(operationId), parameters, access: { role: 'OWNER' }, command: getAskDomainCommandByOperation(operationId) });
const NO_LINK = /\/dashboard\/|"href"/;

// ───────────────────────────── Home Habit Coach: suggest habits ─────────────────────────────
test('habits: the empty answer offers Suggest habits only to someone who can change the home', () => {
  const view = { habits: [], hasMore: false, nextCursor: null };
  assert.deepEqual(homeHabitsFromView(view, 'p1', new Date(), true).blocks[0].actions.map((action) => [action.id, action.operationId, action.interactionType]), [['generate-home-habits', 'HOME_HABITS_GENERATE', 'START_WORKFLOW']]);
  assert.deepEqual(homeHabitsFromView(view, 'p1', new Date(), false).blocks[0].actions, []);
});

test('habits: the declared action opens a confirmation with no form, and writes nothing', async () => {
  const result = await start('HOME_HABITS_GENERATE', HOME_HABITS_GENERATE_MESSAGE);
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.confirmation.confirmLabel, 'Suggest habits');
  assert.equal(result.captureRequests, undefined, 'there is nothing to fill in');
  assert.equal(result.parameters.sourceExecutionId, 'source-1');
  assert.doesNotMatch(JSON.stringify(result), NO_LINK);
  assert.equal(calls.generate.length, 0);
});

test('habits: unauthorized, unavailable and undeclared starts never open a confirmation', async () => {
  accessRole = 'VIEWER';
  assert.equal((await start('HOME_HABITS_GENERATE', HOME_HABITS_GENERATE_MESSAGE)).status, 'BLOCKED');
  accessRole = 'CONTRIBUTOR'; coachEnabled = false;
  const off = await start('HOME_HABITS_GENERATE', HOME_HABITS_GENERATE_MESSAGE);
  assert.equal(off.reasonCode, 'HOME_HABITS_COACH_OFF');
  assert.equal(off.confirmation, undefined, 'a switched-off coach is explained, not offered');
  coachEnabled = null;
  for (const [message, launchContext] of [[HOME_HABITS_GENERATE_MESSAGE, { surface: 'ASK_REFRESH', operationId: 'HOME_HABITS_GENERATE' }], ['suggest habits', declared('HOME_HABITS_GENERATE')], [HOME_HABITS_GENERATE_MESSAGE, null]]) {
    assert.equal((await start('HOME_HABITS_GENERATE', message, launchContext)).reasonCode, 'ASK_HOME_HABITS_GENERATE_NOT_DIRECTLY_ROUTABLE', JSON.stringify([message, launchContext]));
  }
  assert.equal(calls.generate.length, 0);
});

test('habits: declining is declared, and confirming writes once through the coach and reports honestly, including none', async () => {
  const command = getAskDomainCommandByOperation('HOME_HABITS_GENERATE');
  assert.deepEqual([command.cancellation.title, command.cancellation.body, command.roleFloor], ['Habits not suggested', 'No habit was suggested.', 'CONTRIBUTOR']);
  const card = await homeHabitsGenerateResult('u1', 'p1', 'source-1');
  const { result } = await confirm('HOME_HABITS_GENERATE', card.parameters);
  assert.deepEqual(calls.generate, [['p1', 'u1']]);
  assert.equal(calls.track[0].metadataJson.actionType, 'generate_habits');
  assert.equal(result.reasonCode, 'HOME_HABITS_GENERATED');
  assert.equal(result.blocks[0].title, '3 habits suggested');
  assert.deepEqual(result.blocks[0].actions.map((action) => action.operationId), ['HOME_HABITS'], 'the receipt follows up inside Ask');
  generateResult = { created: 0, skipped: 5, details: [] };
  const none = await confirm('HOME_HABITS_GENERATE', card.parameters);
  assert.equal(none.result.reasonCode, 'HOME_HABITS_NOTHING_NEW');
  assert.equal(none.result.blocks[0].title, 'No new habits to suggest');
  assert.match(none.result.blocks[0].description, /does not mean nothing needs care/);
});

test('habits: a change to the coach\'s setting or the active habits since the card was shown is refused at execution', async () => {
  const card = await homeHabitsGenerateResult('u1', 'p1', null);
  aliveTemplates = ['t1', 't2'];
  assert.notEqual(await habitsGenerateContextVersion('p1'), card.contextVersion);
  await assert.rejects(confirm('HOME_HABITS_GENERATE', card.parameters), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.generate.length, 0);
});

// ───────────────────────────── Do-Nothing Simulator: run ─────────────────────────────
test('do-nothing: the answer offers Run to the primary account holder it reaches, in the empty and the latest-run states, and a blocked state offers nothing', () => {
  assert.deepEqual(doNothingSimulationFromView({ run: null, scenarios: [] }, 'p1').blocks[0].actions.map((action) => [action.id, action.operationId]), [['run-do-nothing', 'DO_NOTHING_SIMULATION_RUN']]);
  for (const blockedView of ['PRIMARY_OWNER_ONLY', 'COVERAGE_CONFLICT']) assert.deepEqual(doNothingSimulationFromView(blockedView, 'p1').blocks[0].actions, [], blockedView);
});

test('do-nothing: the declared action opens a form with the four horizons and the saved scenarios, and writes nothing', async () => {
  const result = await start('DO_NOTHING_SIMULATION_RUN', DO_NOTHING_RUN_MESSAGE);
  assert.equal(result.status, 'NEEDS_CONTEXT');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'DO_NOTHING_RUN_INPUTS');
  const byKey = Object.fromEntries(request.inputSchema.fields.map((field) => [field.key, field]));
  assert.deepEqual(byKey.horizonMonths.inputSchema.options.map((option) => option.value), ['6', '12', '24', '36']);
  assert.deepEqual(byKey.scenarioId.inputSchema.options.map((option) => option.label), ['None, use the current records', 'Skip a year (12 months)']);
  assert.deepEqual([byKey.horizonMonths.required, byKey.scenarioId.required], [true, false]);
  assert.equal(calls.run.length, 0);
});

test('do-nothing: a viewer, a household member who is not the primary account holder, and conflicting coverage are each stopped before a form', async () => {
  accessRole = 'VIEWER';
  assert.equal((await start('DO_NOTHING_SIMULATION_RUN', DO_NOTHING_RUN_MESSAGE)).reasonCode, 'ASK_PERMISSION_REQUIRED');
  accessRole = 'OWNER'; primaryHolder = false;
  const notPrimary = await start('DO_NOTHING_SIMULATION_RUN', DO_NOTHING_RUN_MESSAGE);
  assert.equal(notPrimary.reasonCode, 'DO_NOTHING_PRIMARY_OWNER_ONLY');
  assert.equal(notPrimary.captureRequests, undefined);
  primaryHolder = true; coverageConflict = true;
  const conflict = await start('DO_NOTHING_SIMULATION_RUN', DO_NOTHING_RUN_MESSAGE);
  assert.equal(conflict.reasonCode, 'DO_NOTHING_COVERAGE_CONFLICT');
  assert.equal(conflict.captureRequests, undefined);
  coverageConflict = false;
  assert.equal((await start('DO_NOTHING_SIMULATION_RUN', 'run it', declared('DO_NOTHING_SIMULATION_RUN'))).reasonCode, 'ASK_DO_NOTHING_RUN_NOT_DIRECTLY_ROUTABLE');
  assert.equal(calls.run.length, 0);
});

test('do-nothing: only the four horizons are accepted, the form answer is text and the stored input is a number, and a removed scenario asks again', async () => {
  assert.deepEqual(DoNothingRunInputSchema.parse({ horizonMonths: '24', scenarioId: '__NO_SCENARIO__' }), { horizonMonths: 24, scenarioId: null });
  for (const bad of ['7', '0', '48', 'soon']) assert.equal(DoNothingRunInputSchema.safeParse({ horizonMonths: bad }).success, false, bad);
  const gone = await doNothingRunResult('u1', 'p1', { horizonMonths: 12, scenarioId: 'removed' }, null);
  assert.equal(gone.reasonCode, 'DO_NOTHING_RUN_SCENARIO_UNAVAILABLE');
  assert.equal(gone.confirmation, undefined);
});

test('do-nothing: a valid entry becomes a review card; declining is declared; confirming runs once with the settings and reports the result', async () => {
  const command = getAskDomainCommandByOperation('DO_NOTHING_SIMULATION_RUN');
  assert.deepEqual([command.cancellation.title, command.cancellation.body], ['Simulation not run', 'No simulation was run.']);
  const card = await doNothingRunResult('u1', 'p1', DoNothingRunInputSchema.parse({ horizonMonths: '12', scenarioId: 's1' }), 'source-1');
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(card.confirmation.fields.map((field) => [field.label, field.value]), [['Looks ahead', '12 months'], ['Based on', 'Skip a year']]);
  assert.equal(calls.run.length, 0, 'nothing runs before confirmation');
  const { result } = await confirm('DO_NOTHING_SIMULATION_RUN', card.parameters);
  assert.deepEqual(calls.run[0], ['p1', 'u1', { horizonMonths: 12, scenarioId: 's1' }]);
  assert.equal(calls.track[0].metadataJson.actionType, 'run_simulation');
  assert.equal(result.reasonCode, 'DO_NOTHING_RUN_COMPLETED');
  assert.deepEqual(result.blocks[0].details.map((detail) => [detail.label, detail.value]), [['Looked ahead', '12 months'], ['Added cost if nothing is done', '$3,200 to $7,800'], ['Confidence', 'Medium']]);
  assert.deepEqual(result.blocks[0].actions.map((action) => action.operationId), ['DO_NOTHING_SIMULATION']);
});

test('do-nothing: execution re-checks everything: saved scenarios changed, conflicting coverage, the primary-holder test, a retry that finds its own run, an invalid input', async () => {
  const input = DoNothingRunInputSchema.parse({ horizonMonths: 24 });
  const card = await doNothingRunResult('u1', 'p1', input, null);
  scenarios = [];
  assert.notEqual(await doNothingRunContextVersion('u1', 'p1'), card.contextVersion);
  await assert.rejects(confirm('DO_NOTHING_SIMULATION_RUN', card.parameters), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  scenarios = [{ id: 's1', name: 'Skip a year', horizonMonths: 12 }];
  const fresh = await doNothingRunResult('u1', 'p1', input, null);
  primaryHolder = false;
  await assert.rejects(confirm('DO_NOTHING_SIMULATION_RUN', fresh.parameters), (error) => error.code === 'ASK_PERMISSION_REQUIRED');
  primaryHolder = true;
  earlierRun = { id: 'run-earlier', horizonMonths: 24, confidence: 'LOW', riskScoreDelta: null, expectedCostDeltaCentsMin: null, expectedCostDeltaCentsMax: null };
  const retried = await confirm('DO_NOTHING_SIMULATION_RUN', fresh.parameters);
  assert.equal(retried.result.blocks[0].title, 'Simulation already run');
  assert.match(retried.result.blocks[0].details[1].value, /Not enough recorded history/);
  assert.equal(calls.run.length, 1, 'only the permission attempt reached the simulator; the retry ran nothing');
  await assert.rejects(confirm('DO_NOTHING_SIMULATION_RUN', { doNothingRun: { horizonMonths: 7 } }), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
});

// ── Guided journey: a run started from a journey's step is reported to that step, as the page does ──
const journeyStep = (overrides = {}) => ({ stepKey: 'compare_action_options', toolKey: 'do-nothing-simulator', status: 'IN_PROGRESS', journey: { id: 'j1', status: 'ACTIVE', primarySignal: { signalIntentFamily: 'cost_of_inaction_risk' } }, ...overrides });
const journeyLaunch = { surface: 'ASK_WORKSPACE', operationId: 'DO_NOTHING_SIMULATION_RUN', sourceExecutionId: 'source-1', entityType: 'GUIDANCE_STEP', entityId: 'step-1' };

test('do-nothing from a journey step: the step rides through the form and the review, and confirming records it on the journey with proof', async () => {
  stepRow = journeyStep();
  const form = await start('DO_NOTHING_SIMULATION_RUN', DO_NOTHING_RUN_MESSAGE, journeyLaunch);
  assert.deepEqual([form.parameters.sourceExecutionId, form.parameters.guidanceStepId], ['source-1', 'step-1']);
  const card = await doNothingRunResult('u1', 'p1', DoNothingRunInputSchema.parse({ horizonMonths: '12' }), 'source-1', 'step-1');
  assert.equal(card.parameters.guidanceStepId, 'step-1');
  assert.equal(calls.guidance.length, 0, 'nothing is reported before the homeowner confirms');
  const { result } = await confirm('DO_NOTHING_SIMULATION_RUN', card.parameters);
  assert.deepEqual(calls.guidance[0], ['lookup', { id: 'step-1', journey: { propertyId: 'p1' } }], 'the step is looked up inside this home only');
  const report = calls.guidance[1][1];
  assert.deepEqual({ j: report.journeyId, s: report.stepKey, st: report.status, tool: report.sourceToolKey, proof: report.producedData.proofType, id: report.producedData.proofId, actor: report.actorUserId },
    { j: 'j1', s: 'compare_action_options', st: 'COMPLETED', tool: 'do-nothing-simulator', proof: 'simulation_run', id: 'run-1', actor: 'u1' });
  assert.match(report.dedupeKey, /^do-nothing-simulator:p1:run-1:/, 'a replay does not add a second evidence row');
  assert.deepEqual(result.blocks[0].details.find((detail) => detail.label === 'Guided journey'), { label: 'Guided journey', value: 'This step is recorded as done' });
});

test('do-nothing from a journey step: a failed report never fails the run and the receipt says so; a step that is not this tool\'s open step is never reported', async () => {
  const card = await doNothingRunResult('u1', 'p1', DoNothingRunInputSchema.parse({ horizonMonths: '12' }), 'source-1', 'step-1');
  stepRow = journeyStep(); recordFails = true;
  const failed = await confirm('DO_NOTHING_SIMULATION_RUN', card.parameters);
  assert.equal(failed.result.status, 'COMPLETED');
  assert.match(failed.result.blocks[0].details.find((detail) => detail.label === 'Guided journey').value, /simulation is saved, but the journey step could not be updated/);
  for (const stale of [null, journeyStep({ toolKey: 'recalls' }), journeyStep({ status: 'SKIPPED' }), journeyStep({ journey: { id: 'j1', status: 'DISMISSED', primarySignal: null } })]) {
    stepRow = stale; recordFails = false; calls.guidance.length = 0;
    const result = await confirm('DO_NOTHING_SIMULATION_RUN', card.parameters);
    assert.equal(calls.guidance.some((entry) => entry[0] === 'record'), false);
    assert.equal(result.result.blocks[0].details.some((detail) => detail.label === 'Guided journey'), false);
  }
  stepRow = journeyStep({ status: 'COMPLETED' }); calls.guidance.length = 0;
  const done = await confirm('DO_NOTHING_SIMULATION_RUN', card.parameters);
  assert.equal(calls.guidance.some((entry) => entry[0] === 'record'), false, 'a step already done is not reported twice');
  assert.equal(done.result.blocks[0].details.find((detail) => detail.label === 'Guided journey').value, 'This step was already done');
});

test('do-nothing without a journey step reports nothing to the guidance engine', async () => {
  const card = await doNothingRunResult('u1', 'p1', DoNothingRunInputSchema.parse({ horizonMonths: '12' }), 'source-1');
  assert.equal('guidanceStepId' in card.parameters, false);
  await confirm('DO_NOTHING_SIMULATION_RUN', card.parameters);
  assert.deepEqual(calls.guidance, []);
});

// ───────────────────────────── Service Price Radar: check a quote ─────────────────────────────
test('price check: the answer offers Check a quote to the primary account holder it reaches, and a blocked state offers nothing', () => {
  assert.deepEqual(servicePriceChecksFromView([], 'p1').blocks[0].actions.map((action) => [action.id, action.operationId]), [['check-service-quote', 'SERVICE_PRICE_CHECK_RUN']]);
  assert.deepEqual(servicePriceChecksFromView('PRIMARY_OWNER_ONLY', 'p1').blocks[0].actions, []);
});

test('price check: the declared action opens a form with the 29 supported services, never a regulated one, and writes nothing', async () => {
  const result = await start('SERVICE_PRICE_CHECK_RUN', SERVICE_PRICE_CHECK_MESSAGE);
  const [request] = result.captureRequests;
  const byKey = Object.fromEntries(request.inputSchema.fields.map((field) => [field.key, field]));
  const services = byKey.serviceCategory.inputSchema.options.map((option) => option.value);
  const labels = Object.fromEntries(byKey.serviceCategory.inputSchema.options.map((option) => [option.value, option.label]));
  assert.equal(services.length, 29);
  for (const regulated of ['INSURANCE', 'ATTORNEY', 'FINANCE']) assert.ok(!services.includes(regulated), regulated);
  assert.deepEqual([labels.HVAC, labels.WINDOWS_DOORS, labels.LANDSCAPING_DRAINAGE, labels.SECURITY_SAFETY], ['HVAC', 'Windows & doors', 'Landscaping & drainage', 'Security & safety']);
  assert.deepEqual([byKey.serviceCategory.required, byKey.quoteAmount.required, byKey.quoteVendorName.required], [true, true, false]);
  assert.equal(calls.createCheck.length, 0);
});

test('price check: a viewer and a household member who is not the primary account holder are stopped before a form; undeclared starts never open one', async () => {
  accessRole = 'VIEWER';
  assert.equal((await start('SERVICE_PRICE_CHECK_RUN', SERVICE_PRICE_CHECK_MESSAGE)).reasonCode, 'ASK_PERMISSION_REQUIRED');
  accessRole = 'OWNER'; primaryHolder = false;
  assert.equal((await start('SERVICE_PRICE_CHECK_RUN', SERVICE_PRICE_CHECK_MESSAGE)).reasonCode, 'SERVICE_PRICE_RADAR_PRIMARY_OWNER_ONLY');
  primaryHolder = true;
  for (const [message, launchContext] of [[SERVICE_PRICE_CHECK_MESSAGE, { surface: 'ASK_REFRESH', operationId: 'SERVICE_PRICE_CHECK_RUN' }], ['check a quote', declared('SERVICE_PRICE_CHECK_RUN')]]) {
    assert.equal((await start('SERVICE_PRICE_CHECK_RUN', message, launchContext)).reasonCode, 'ASK_SERVICE_PRICE_CHECK_NOT_DIRECTLY_ROUTABLE');
  }
});

test('price check: the amount must be a positive number up to $250,000 and the service a supported one', () => {
  const parse = (value) => ServicePriceCheckInputSchema.safeParse(value);
  assert.deepEqual(parse({ serviceCategory: 'ROOFING', quoteAmount: '12999.499', quoteVendorName: '' }).data, { serviceCategory: 'ROOFING', quoteAmount: 12999.5, quoteVendorName: null, serviceLabelRaw: null });
  for (const bad of [{ serviceCategory: 'ROOFING', quoteAmount: 0 }, { serviceCategory: 'ROOFING', quoteAmount: -5 }, { serviceCategory: 'ROOFING', quoteAmount: 250000.01 }, { serviceCategory: 'ROOFING', quoteAmount: 'lots' }, { serviceCategory: 'INSURANCE', quoteAmount: 500 }, { serviceCategory: 'NOT_A_SERVICE', quoteAmount: 500 }]) {
    assert.equal(parse(bad).success, false, JSON.stringify(bad));
  }
});

test('price check: declining is declared; confirming runs the controller\'s compliance check, writes one manual check, and reports the range and result as computed', async () => {
  const command = getAskDomainCommandByOperation('SERVICE_PRICE_CHECK_RUN');
  assert.deepEqual([command.cancellation.title, command.cancellation.body], ['Quote not checked', 'No quote was checked.']);
  const input = ServicePriceCheckInputSchema.parse({ serviceCategory: 'WATER_HEATER', quoteAmount: 9800, quoteVendorName: 'Acme Plumbing' });
  const card = await servicePriceCheckResult('u1', 'p1', input, 'source-1');
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.equal(card.confirmation.title, 'Check a $9,800 Water Heater quote?');
  assert.equal(calls.createCheck.length, 0);
  const { result } = await confirm('SERVICE_PRICE_CHECK_RUN', card.parameters);
  assert.deepEqual(calls.compliance[0].slice(0, 5), ['p1', 'u1', 'SERVICE_PRICE_RADAR', { serviceCategory: 'WATER_HEATER' }, 'localPriceBenchmarking']);
  const [propertyId, userId, payload, contextVersion] = calls.createCheck[0];
  assert.deepEqual([propertyId, userId, contextVersion], ['p1', 'u1', 'ctx-7']);
  assert.deepEqual(payload, { serviceCategory: 'WATER_HEATER', quoteAmount: 9800, quoteCurrency: 'USD', quoteSource: 'MANUAL', linkedEntities: [], quoteVendorName: 'Acme Plumbing' });
  assert.equal(calls.track[0].metadataJson.actionType, 'check_generated');
  assert.equal(result.reasonCode, 'SERVICE_PRICE_CHECK_COMPLETED');
  assert.deepEqual(result.blocks[0].details.map((detail) => [detail.label, detail.value]), [['Service', 'Water Heater'], ['Quote', '$9,800'], ['Expected range', '$4,000 to $6,000'], ['Result', 'Above the expected range']]);
  assert.deepEqual(result.blocks[0].actions.map((action) => action.operationId), ['SERVICE_PRICE_CHECKS']);
});

test('price check: execution re-checks the primary-holder test and the input, and a retry that finds its own check records nothing twice', async () => {
  const card = await servicePriceCheckResult('u1', 'p1', ServicePriceCheckInputSchema.parse({ serviceCategory: 'HVAC', quoteAmount: 7000 }), null);
  const denied = Object.assign(new Error('denied'), { code: 'PROPERTY_ACCESS_DENIED' });
  ServicePriceRadarService.prototype.createCheck = async () => { throw denied; };
  await assert.rejects(confirm('SERVICE_PRICE_CHECK_RUN', card.parameters), (error) => error.code === 'ASK_PERMISSION_REQUIRED');
  earlierCheck = { id: 'check-earlier' };
  const retried = await confirm('SERVICE_PRICE_CHECK_RUN', card.parameters);
  assert.equal(retried.result.blocks[0].title, 'Quote already checked');
  assert.equal(calls.createCheck.length, 0);
  await assert.rejects(confirm('SERVICE_PRICE_CHECK_RUN', { servicePriceCheck: { serviceCategory: 'INSURANCE', quoteAmount: 10 } }), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
});
