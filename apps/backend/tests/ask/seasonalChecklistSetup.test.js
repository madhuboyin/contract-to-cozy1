const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// SEASONAL_CHECKLIST_SETUP ("Add these to my tasks" on the seasonal answer): the service, analytics and property access are replaced with
// recording fakes, so the real registered handlers run without a database.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { SeasonalChecklistService } = require('../../src/services/seasonalChecklist.service.ts');
const { seasonalPlanWindow, seasonalPlanEntityId, seasonalSetupMessage, buildSeasonalHomeCareResult, buildSeasonalTaskWalkthrough } = require('../../src/services/ask/support/seasonalHomeCare.ts');
const analytics = require('../../src/services/analytics');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const original = {
  prisma: prismaModule.prisma, preview: SeasonalChecklistService.previewSeasonalChecklist, generate: SeasonalChecklistService.generateSeasonalChecklist,
  track: analytics.analyticsEmitter.track, resolveAccess: propertyAccess.resolvePropertyAccess,
};

const PLAN = seasonalPlanWindow(new Date(), 'NEXT_SEASON');
const template = (taskKey, priority) => ({ taskKey, title: `Task ${taskKey}`, priority });
let calls;
let role;
let previewResult;
let generated;

function install() {
  calls = { preview: [], generate: [], track: [] };
  role = 'OWNER';
  generated = { id: 'cl1', totalTasks: 3, tasksAdded: 3 };
  previewResult = {
    eligible: true, existingChecklistId: null,
    decisions: [{ decision: { status: 'APPLICABLE' } }, { decision: { status: 'APPLICABLE' } }, { decision: { status: 'UNKNOWN' } }],
    applicable: [template('A', 'CRITICAL'), template('B', 'RECOMMENDED')], alreadyOnChecklist: [], toAdd: [template('A', 'CRITICAL'), template('B', 'RECOMMENDED')],
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'askExecution') return { findMany: async () => [] };
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  SeasonalChecklistService.previewSeasonalChecklist = async (...args) => { calls.preview.push(args); return previewResult; };
  SeasonalChecklistService.generateSeasonalChecklist = async (...args) => { calls.generate.push(args); return generated; };
  analytics.analyticsEmitter.track = (event) => { calls.track.push(event); };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = original.prisma;
  SeasonalChecklistService.previewSeasonalChecklist = original.preview;
  SeasonalChecklistService.generateSeasonalChecklist = original.generate;
  analytics.analyticsEmitter.track = original.track;
  propertyAccess.resolvePropertyAccess = original.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const launch = (overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'SEASONAL_PLAN', entityId: seasonalPlanEntityId(PLAN.season, PLAN.year), operationId: 'SEASONAL_CHECKLIST_SETUP', sourceExecutionId: 'exec-plan', ...overrides });
const propose = (launchOverrides, message = seasonalSetupMessage(PLAN.season)) => capabilityInvoke('SEASONAL_CHECKLIST_SETUP', { userId: 'u1', propertyId: 'p1', message, launchContext: launch(launchOverrides) });
const execution = () => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'SEASONAL_CHECKLIST_SETUP', createdAt: new Date() });
const confirm = (parameters, asRole = 'OWNER') => confirmCapabilityInvoke('SEASONAL_CHECKLIST_SETUP', {
  userId: 'u1', execution: execution(), parameters, access: { role: asRole }, command: getAskDomainCommandByOperation('SEASONAL_CHECKLIST_SETUP'),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };

test('setup starts a confirmation only from its declared launch: not a refresh, not free text, not another plan or season', async () => {
  const ok = await propose();
  assert.equal(ok.status, 'NEEDS_CONFIRMATION');
  assert.equal(calls.generate.length, 0, 'proposing writes nothing');
  const otherSeason = PLAN.season === 'WINTER' ? 'SUMMER' : 'WINTER';
  for (const result of [
    await propose({ surface: 'ASK_REFRESH' }),
    await propose({ operationId: undefined }),
    await propose({ entityType: 'INVENTORY_ITEM' }),
    await propose({}, 'Please set up every checklist'),
    await propose({ entityId: seasonalPlanEntityId(otherSeason, PLAN.year) }),
    await propose({ entityId: seasonalPlanEntityId(PLAN.season, PLAN.year + 5) }),
  ]) {
    assert.equal(result.status, 'NOT_APPLICABLE');
    assert.equal(result.confirmation, undefined);
  }
  assert.equal(calls.generate.length, 0);
});

test('the review shows what the generator will really add, says it can differ from the general list, and counts what is held back', async () => {
  const result = await propose();
  assert.equal(calls.preview.length, 1);
  assert.deepEqual(calls.preview[0].slice(0, 4), ['p1', PLAN.season, PLAN.year, 'u1']);
  assert.equal(result.confirmation.editableFields.length, 0);
  assert.match(result.blocks[0].body, /can differ from the general list/);
  assert.match(result.blocks[0].body, /1 more task is held back/);
  assert.deepEqual(result.confirmation.fields.slice(0, 4).map((field) => [field.label, field.value]), [
    ['Checklist', result.confirmation.fields[0].value], ['Tasks to add', '2'], ['1. High priority', 'Task A'], ['2. Recommended', 'Task B'],
  ]);
  assert.ok(result.confirmation.fields.some((field) => field.label.startsWith('Held back') && field.value === '1'));
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

test('setup is refused for a non-owner, a home that is not owned, automatic checklists off, and nothing to add', async () => {
  role = 'CONTRIBUTOR';
  assert.equal((await propose()).reasonCode, 'ASK_PERMISSION_REQUIRED');
  role = 'OWNER';
  previewResult = { eligible: false, reason: 'NOT_OWNERSHIP_CARE' };
  assert.equal((await propose()).reasonCode, 'SEASONAL_SETUP_NOT_OWNERSHIP_CARE');
  previewResult = { eligible: false, reason: 'AUTO_GENERATE_OFF' };
  assert.equal((await propose()).reasonCode, 'SEASONAL_SETUP_AUTO_GENERATE_OFF');
  SeasonalChecklistService.previewSeasonalChecklist = async () => { throw new Error('Property not found'); };
  assert.equal((await propose()).reasonCode, 'SEASONAL_SETUP_NOT_OWNER');
  previewResult = { eligible: true, existingChecklistId: 'cl1', decisions: [], applicable: [template('A', 'CRITICAL')], alreadyOnChecklist: [template('A', 'CRITICAL')], toAdd: [] };
  SeasonalChecklistService.previewSeasonalChecklist = async () => previewResult;
  const done = await propose();
  assert.equal(done.reasonCode, 'SEASONAL_SETUP_ALREADY_DONE');
  assert.equal(done.confirmation, undefined);
  previewResult = { eligible: true, existingChecklistId: null, decisions: [{ decision: { status: 'UNKNOWN' } }], applicable: [], alreadyOnChecklist: [], toAdd: [] };
  const needs = await propose();
  assert.equal(needs.reasonCode, 'SEASONAL_SETUP_NEEDS_HOME_DETAILS');
  assert.deepEqual(needs.blocks[0].actions.map((action) => [action.id, action.operationId]), [['seasonal-update-home-details', 'PROPERTY_SUMMARY']]);
  assert.equal(calls.generate.length, 0);
});

test('a confirmed setup runs the generator once as the owner, repeats the page\'s analytics, and returns an inline receipt', async () => {
  const { parameters } = await propose();
  const { result, artifactType, artifactId } = await confirm(parameters);
  assert.deepEqual(calls.generate, [['p1', PLAN.season, PLAN.year, 'u1']]);
  assert.equal(calls.track.length, 1);
  assert.equal(calls.track[0].featureKey, analytics.AnalyticsFeature.SEASONAL_CHECKLIST);
  assert.deepEqual([calls.track[0].metadataJson.actionType, calls.track[0].metadataJson.source], ['generate_checklist', 'ask']);
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.blocks[0].details.map((detail) => detail.value), ['3', '3']);
  const open = result.blocks[0].actions[0];
  assert.deepEqual([open.id, open.operationId, open.href], ['seasonal-show-checklist', 'MAINTENANCE_STATUS', undefined]);
  assert.deepEqual([artifactType, artifactId], ['SEASONAL_CHECKLIST', 'cl1']);
});

test('a repeat confirmation writes nothing twice; a checklist that changed while the card was open conflicts', async () => {
  const { parameters } = await propose();
  previewResult = { ...previewResult, existingChecklistId: 'cl1', alreadyOnChecklist: previewResult.applicable, toAdd: [] };
  const again = await confirm(parameters);
  assert.equal(calls.generate.length, 0, 'nothing left to add: no second write');
  assert.equal(again.result.reasonCode, 'SEASONAL_SETUP_ALREADY_DONE');
  assert.equal(calls.track.length, 0);

  previewResult = { ...previewResult, existingChecklistId: null, alreadyOnChecklist: [], toAdd: [template('A', 'CRITICAL'), template('C', 'OPTIONAL')] };
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.generate.length, 0);
});

test('confirming is refused for a non-owner, bad parameters, a plan out of window, an ineligible home, and a generator that returns nothing', async () => {
  const { parameters } = await propose();
  assert.equal(await codeOf(confirm(parameters, 'CONTRIBUTOR')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(await codeOf(confirm({ ...parameters, seasonalSetupSeason: 'EXPLODE' })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(await codeOf(confirm({ ...parameters, seasonalSetupYear: PLAN.year + 5 })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  const good = previewResult;
  previewResult = { eligible: false, reason: 'AUTO_GENERATE_OFF' };
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE');
  previewResult = good;
  SeasonalChecklistService.generateSeasonalChecklist = async () => null;
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.track.length, 0, 'no analytics for a write that did not happen');
});

test('the command is owner-floor, confirmation-gated, and unreachable by message', () => {
  const command = getAskDomainCommandByOperation('SEASONAL_CHECKLIST_SETUP');
  assert.equal(command.roleFloor, 'OWNER');
  assert.equal(command.adapterKey, 'seasonal.checklist-setup');
  for (const season of ['SPRING', 'SUMMER', 'FALL', 'WINTER']) {
    assert.notEqual(resolveAskRoutingCascade(seasonalSetupMessage(season), { localRoutingEnabled: true }).operation.operationId, 'SEASONAL_CHECKLIST_SETUP', season);
  }
});

// The answer-trust validator silently removes any action whose id is not allowlisted for the operation.
test('every seasonal next-step, walkthrough, setup and receipt action survives the answer-trust validator', async () => {
  const validate = (operationId, result) => validateAskAnswerTrust({
    question: 'q', operationId, propertyId: 'p1',
    result: { ...result, parameters: { audiencePresentation: { householdRole: 'OWNER' }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: getAskOperationDefinition(operationId).adapterKey, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: new Date().toISOString() }] } } },
  }).result;
  const ids = (result) => result.blocks.flatMap((block) => block.actions ?? []).map((action) => action.id);
  const input = { zipCode: '78701', now: new Date(2026, 9, 15), focus: 'NEXT_SEASON', setup: { canSetUp: true, checklist: null } };
  const plan = buildSeasonalHomeCareResult(input);
  assert.deepEqual(ids(validate('SEASONAL_HOME_CARE', plan)), ['seasonal-add-tasks', 'seasonal-walkthrough', 'seasonal-update-home-details']);
  assert.ok(validate('SEASONAL_HOME_CARE', plan).blocks.some((block) => block.id === 'seasonal-home-care-boundary'));
  const existing = buildSeasonalHomeCareResult({ ...input, setup: { canSetUp: true, checklist: { totalTasks: 4, tasksAdded: 4 } } });
  assert.deepEqual(ids(validate('SEASONAL_HOME_CARE', existing)), ['seasonal-show-checklist', 'seasonal-walkthrough', 'seasonal-update-home-details']);
  const firstKey = plan.blocks[1].sections[0].items[0].id;
  const walk = buildSeasonalTaskWalkthrough({ ...input, taskKey: firstKey });
  assert.equal(walk.blocks[0].type, 'TASK_GUIDE');
  assert.deepEqual(ids(validate('SEASONAL_HOME_CARE', walk)), ['seasonal-next-task', 'seasonal-add-tasks', 'seasonal-back-to-plan', 'seasonal-update-home-details']);
  const { result: receipt } = await confirm((await propose()).parameters);
  assert.deepEqual(ids(validate('SEASONAL_CHECKLIST_SETUP', receipt)), ['seasonal-show-checklist']);
  previewResult = { eligible: true, existingChecklistId: null, decisions: [], applicable: [], alreadyOnChecklist: [], toAdd: [] };
  assert.deepEqual(ids(validate('SEASONAL_CHECKLIST_SETUP', await propose())), ['seasonal-update-home-details']);
  assert.ok(validate('SEASONAL_CHECKLIST_SETUP', await propose({ surface: 'ASK_REFRESH' })).blocks.some((block) => block.id === 'seasonal-setup-boundary'), 'the setup boundary must be allowlisted');
  for (const block of [...plan.blocks, ...walk.blocks]) AskPresentationBlockSchema.parse(block);
});
