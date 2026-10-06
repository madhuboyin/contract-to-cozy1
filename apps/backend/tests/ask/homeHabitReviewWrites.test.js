const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Habit Coach inline review + confirmed actions. The service, analytics and property access are replaced with
// recording fakes, so the real registered handlers run without a database; the fake prisma throws on any model it was
// not given.

const prismaModule = require('../../src/lib/prisma.ts');
const orchestrator = require('../../src/services/ask/askOrchestrator.service.ts');
const { homeHabitsFromView, habitActionsAllowed, habitActionFromMessage, HABIT_ACTION_MESSAGES } = require('../../src/services/ask/handlers/homeHabitCoach.handler.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { HomeHabitCoachService } = require('../../src/services/homeHabitCoach/homeHabitCoachService.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');
const analytics = require('../../src/services/analytics');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

void orchestrator;
const NOW = new Date('2026-09-23T12:00:00.000Z');
const proto = HomeHabitCoachService.prototype;
const names = ['listActiveHabits', 'getHabitDetail', 'adoptHabit', 'completeHabit', 'snoozeHabit', 'skipHabit', 'dismissHabit'];
const originals = { prisma: prismaModule.prisma, track: analytics.analyticsEmitter.track, resolveAccess: propertyAccess.resolvePropertyAccess, ...Object.fromEntries(names.map((name) => [name, proto[name]])) };

let calls;
let live;
let exists;
let role;

const baseHabit = (overrides = {}) => ({
  id: 'h1', status: 'ACTIVE', titleOverride: null, descriptionOverride: null, reasonSummary: 'Smoke detectors need a monthly test.',
  dueAt: new Date('2026-09-20T00:00:00.000Z'), snoozedUntil: null, lastCompletedAt: null, linkedMaintenanceTaskId: null, routineAdherence: null,
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  reminderSchedule: { channel: 'IN_APP', nextReminderAt: null, cadenceLabel: 'Monthly' },
  habitTemplate: { title: 'Test Smoke and CO Detectors', shortDescription: 'Test each detector.', description: 'Test each detector and confirm its status.', category: 'SAFETY', cadence: 'MONTHLY', difficulty: 'EASY', estimatedMinutes: 10, safetyTier: 'LOW_CONSEQUENCE', tipText: 'Press and hold the test button.' },
  actions: [{ id: 'a1', actionType: 'SNOOZED', note: null, createdAt: new Date('2026-08-30T00:00:00.000Z') }],
  ...overrides,
});

function install() {
  calls = { adopt: [], complete: [], snooze: [], skip: [], dismiss: [], track: [] };
  live = baseHabit();
  exists = true;
  role = 'CONTRIBUTOR';
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'askExecution') return { findMany: async () => [] };
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  proto.listActiveHabits = async () => ({ habits: [live], hasMore: false, nextCursor: null });
  proto.getHabitDetail = async () => {
    if (!exists) throw new APIError('Habit not found', 404, 'HABIT_NOT_FOUND');
    return { habit: live };
  };
  proto.adoptHabit = async (...args) => { calls.adopt.push(args); live = { ...live, linkedMaintenanceTaskId: 't1', updatedAt: new Date() }; return {}; };
  proto.completeHabit = async (...args) => { calls.complete.push(args); live = { ...live, status: 'COMPLETED', updatedAt: new Date() }; return {}; };
  proto.snoozeHabit = async (...args) => { calls.snooze.push(args); live = { ...live, status: 'SNOOZED', snoozedUntil: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date() }; return {}; };
  proto.skipHabit = async (...args) => { calls.skip.push(args); live = { ...live, status: 'SKIPPED', updatedAt: new Date() }; return {}; };
  proto.dismissHabit = async (...args) => { calls.dismiss.push(args); live = { ...live, status: 'DISMISSED', updatedAt: new Date() }; return {}; };
  analytics.analyticsEmitter.track = (event) => { calls.track.push(event); };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  for (const name of names) proto[name] = originals[name];
  analytics.analyticsEmitter.track = originals.track;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const reviewLaunch = (overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'HOME_HABIT', entityId: 'h1', operationId: 'HOME_HABITS', ...overrides });
const review = (overrides) => capabilityInvoke('HOME_HABITS', { userId: 'u1', propertyId: 'p1', message: 'Review the home habit "x".', launchContext: reviewLaunch(overrides) });
const writeLaunch = (overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'HOME_HABIT', entityId: 'h1', operationId: 'HOME_HABIT_UPDATE', sourceExecutionId: 'exec-review', ...overrides });
const propose = (action, launchOverrides, message = HABIT_ACTION_MESSAGES[action]) => capabilityInvoke('HOME_HABIT_UPDATE', { userId: 'u1', propertyId: 'p1', message, launchContext: writeLaunch(launchOverrides) });
const execution = () => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'HOME_HABIT_UPDATE', createdAt: new Date('2026-09-22T00:00:00.000Z') });
const confirm = (parameters, asRole = 'CONTRIBUTOR') => confirmCapabilityInvoke('HOME_HABIT_UPDATE', {
  userId: 'u1', execution: execution(), parameters, access: { role: asRole }, command: getAskDomainCommandByOperation('HOME_HABIT_UPDATE'),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const proposed = async (action) => (await propose(action)).parameters;

// ───────────────────────────── the list ─────────────────────────────

test('a habit row opens the review inside Ask: no link, an entity type, and a Review action', () => {
  const result = homeHabitsFromView({ habits: [baseHabit()], hasMore: false, nextCursor: null }, 'p1', NOW);
  const row = result.blocks.find((block) => block.id === 'home-habits-items').sections[0].items[0];
  assert.equal(row.href, undefined, 'a row must not navigate to the desktop page');
  assert.equal(row.entityType, 'HOME_HABIT');
  assert.deepEqual(row.actions.map((action) => [action.label, action.interactionType, action.operationId]), [['Review', 'CONVERSATION_CONTINUE', 'HOME_HABITS']]);
  assert.deepEqual(result.blocks[0].actions, [], 'with habits listed the page link only repeats them');
  AskPresentationBlockSchema.parse(result.blocks.find((block) => block.id === 'home-habits-items'));
});

test('only the empty state keeps the page link, because generating habits is not an Ask action', () => {
  const empty = homeHabitsFromView({ habits: [], hasMore: false, nextCursor: null }, 'p1', NOW);
  assert.deepEqual(empty.blocks[0].actions.map((action) => action.id), ['open-home-habit-coach']);
});

test('an unadopted suggestion is "suggested for" a date, never "overdue"', () => {
  const result = homeHabitsFromView({ habits: [baseHabit()], hasMore: false, nextCursor: null }, 'p1', NOW);
  assert.equal(result.blocks[0].title, '1 habit to work on, 1 past their suggested date');
  const row = result.blocks.find((block) => block.id === 'home-habits-items').sections[0].items[0];
  assert.ok(row.meta.includes('Suggested for Sep 20, 2026'), row.meta.join('|'));
  assert.doesNotMatch(JSON.stringify(result.blocks), /overdue/i);
  const routine = homeHabitsFromView({ habits: [baseHabit({ linkedMaintenanceTaskId: 't1', routineAdherence: { nextDueDate: '2026-09-01T00:00:00.000Z', lastCompletedDate: null } })], hasMore: false, nextCursor: null }, 'p1', NOW);
  assert.ok(routine.blocks.find((block) => block.id === 'home-habits-items').sections[0].items[0].meta.includes('Overdue since Sep 1, 2026'), 'a routine task really is overdue');
});

// ───────────────────────────── the review ─────────────────────────────

test('the review is one guide card that explains the habit and offers exactly the actions the service will accept', async () => {
  const result = await review();
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.blocks.length, 1);
  const guide = result.blocks[0];
  assert.equal(guide.type, 'TASK_GUIDE');
  assert.equal(guide.title, 'Test Smoke and CO Detectors');
  assert.match(guide.summary, /monthly test/);
  assert.deepEqual(guide.eyebrow, ['Home habits', 'Suggested']);
  assert.deepEqual(guide.chips.map((chip) => [chip.kind, chip.label]), [['TAG', 'Monthly'], ['TIME', '~10 minutes'], ['DIY', 'Easy'], ['STATUS', 'Suggested']]);
  assert.deepEqual(guide.tip, { title: 'Before you start', body: 'Press and hold the test button.' });
  assert.equal(guide.main.title, 'What it involves');
  assert.deepEqual(guide.main.facts.map((fact) => [fact.label, fact.value]), [['Status', 'Suggested'], ['How often', 'Monthly'], ['Area', 'safety'], ['Suggested for', 'Sep 20, 2026']]);
  assert.deepEqual(guide.history, [{ label: 'Snoozed', value: 'Aug 30, 2026' }]);
  assert.deepEqual(guide.actions.map((action) => action.id), ['habit-adopt', 'habit-complete', 'habit-snooze', 'habit-skip', 'habit-dismiss', 'habits-back-to-list']);
  for (const action of guide.actions.filter((candidate) => candidate.id !== 'habits-back-to-list')) {
    assert.equal(action.operationId, 'HOME_HABIT_UPDATE');
    assert.equal(action.entityType, 'HOME_HABIT');
    assert.equal(action.entityId, 'h1');
    assert.equal(action.href, undefined);
    assert.ok(habitActionFromMessage(action.message), action.id);
  }
  AskPresentationBlockSchema.parse(guide);
});

test('review actions follow the live status, and a habit in the routine offers none', () => {
  const allowed = (overrides) => habitActionsAllowed(baseHabit(overrides));
  assert.deepEqual(allowed({ status: 'SNOOZED' }), ['ADOPT', 'COMPLETE', 'SKIP', 'DISMISS']);
  assert.deepEqual(allowed({ status: 'SKIPPED' }), ['ADOPT', 'DISMISS']);
  assert.deepEqual(allowed({ status: 'COMPLETED' }), ['ADOPT']);
  assert.deepEqual(allowed({ linkedMaintenanceTaskId: 't1' }), []);
  assert.deepEqual(allowed({ habitTemplate: { ...baseHabit().habitTemplate, safetyTier: 'MATERIAL_FINANCIAL' } }), ['COMPLETE', 'SNOOZE', 'SKIP', 'DISMISS']);
  assert.deepEqual(allowed({ habitTemplate: { ...baseHabit().habitTemplate, cadence: 'AD_HOC' } }), ['COMPLETE', 'SNOOZE', 'SKIP', 'DISMISS']);
});

test('a viewer sees the review but no actions; a missing habit is a boundary, not an error', async () => {
  role = 'VIEWER';
  const viewer = (await review()).blocks[0];
  assert.deepEqual(viewer.actions.map((action) => action.id), ['habits-back-to-list']);
  assert.ok(viewer.notes.some((note) => note.id === 'role'));
  role = 'CONTRIBUTOR';
  exists = false;
  const gone = await review();
  assert.equal(gone.reasonCode, 'HOME_HABIT_NOT_FOUND');
  exists = true;
  live = baseHabit({ linkedMaintenanceTaskId: 't1', routineAdherence: { nextDueDate: '2026-10-01T00:00:00.000Z', lastCompletedDate: null } });
  const routine = (await review()).blocks[0];
  assert.deepEqual(routine.actions.map((action) => action.id), ['habits-back-to-list']);
  assert.ok(routine.notes.some((note) => note.id === 'routine'));
  assert.equal(routine.main.facts.find((fact) => fact.label === 'Next due').value, 'Oct 1, 2026');
});

// ───────────────────────────── proposing ─────────────────────────────

test('an action starts a confirmation only from its declared launch: not a refresh, not another message, not another operation', async () => {
  const ok = await propose('COMPLETE');
  assert.equal(ok.status, 'NEEDS_CONFIRMATION');
  assert.equal(ok.confirmation.editableFields.length, 0);
  assert.equal(calls.complete.length, 0, 'proposing writes nothing');
  for (const result of [
    await propose('COMPLETE', { surface: 'ASK_REFRESH' }),
    await propose('COMPLETE', { operationId: undefined }),
    await propose('COMPLETE', { entityType: 'INVENTORY_ITEM' }),
    await propose('COMPLETE', {}, 'Please mark every habit as done'),
  ]) {
    assert.equal(result.status, 'NOT_APPLICABLE');
    assert.equal(result.confirmation, undefined);
  }
  assert.equal(calls.complete.length + calls.adopt.length, 0);
});

test('proposing is refused for a viewer, a missing habit, and an action the habit cannot take', async () => {
  role = 'VIEWER';
  assert.equal((await propose('COMPLETE')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  role = 'CONTRIBUTOR';
  live = baseHabit({ linkedMaintenanceTaskId: 't1' });
  assert.equal((await propose('COMPLETE')).reasonCode, 'HOME_HABIT_ACTION_NOT_ALLOWED');
  live = baseHabit({ status: 'SNOOZED' });
  assert.equal((await propose('SNOOZE')).reasonCode, 'HOME_HABIT_ACTION_NOT_ALLOWED');
  exists = false;
  assert.equal((await propose('COMPLETE')).reasonCode, 'HOME_HABIT_NOT_FOUND');
});

// ───────────────────────────── confirming ─────────────────────────────

test('each confirmed action calls the matching service method once, repeats the controller analytics, and returns a receipt', async () => {
  const expectations = {
    ADOPT: ['adopt', ['p1', 'h1', 'u1'], 'adopt_habit'],
    COMPLETE: ['complete', ['p1', 'h1', 'u1', {}], 'complete_habit'],
    SNOOZE: ['snooze', ['p1', 'h1', 'u1', { snoozePreset: '7d' }], 'snooze_habit'],
    SKIP: ['skip', ['p1', 'h1', 'u1', {}], 'skip_habit'],
    DISMISS: ['dismiss', ['p1', 'h1', 'u1', {}], 'dismiss_habit'],
  };
  for (const [action, [key, args, analyticsAction]] of Object.entries(expectations)) {
    install();
    const { result, artifactType, artifactId } = await confirm(await proposed(action));
    assert.deepEqual(calls[key], [args], action);
    assert.equal(calls.track.length, 1, action);
    assert.equal(calls.track[0].metadataJson.actionType, analyticsAction);
    assert.equal(calls.track[0].featureKey, analytics.AnalyticsFeature.HOME_HABIT_COACH);
    assert.equal(result.status, 'COMPLETED', action);
    assert.equal(result.blocks[0].type, 'WORKFLOW_PROGRESS');
    assert.deepEqual(result.blocks[0].actions.map((entry) => entry.id), ['habits-back-to-list']);
    assert.equal(artifactType, 'PROPERTY_HABIT');
    assert.equal(artifactId, 'h1');
  }
});

test('a repeat confirmation writes nothing twice; a habit that moved while the card was open conflicts', async () => {
  const parameters = await proposed('COMPLETE');
  await confirm(parameters);
  const again = await confirm(parameters);
  assert.equal(calls.complete.length, 1, 'already applied: no second write');
  assert.equal(again.result.status, 'COMPLETED');
  assert.equal(calls.track.length, 1);

  install();
  const stale = await proposed('SKIP');
  live = { ...live, status: 'SNOOZED', snoozedUntil: new Date('2026-10-05T00:00:00.000Z'), updatedAt: new Date('2026-09-22T00:00:00.000Z') };
  assert.equal(await codeOf(confirm(stale)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.skip.length, 0);
});

test('confirming is refused for a viewer, bad parameters, a vanished habit, and a service refusal', async () => {
  const parameters = await proposed('COMPLETE');
  assert.equal(await codeOf(confirm(parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(await codeOf(confirm({ ...parameters, homeHabitAction: 'EXPLODE' })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(await codeOf(confirm({ ...parameters, homeHabitId: 7 })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  proto.completeHabit = async () => { throw new APIError('Cannot complete a habit with status SKIPPED', 422, 'INVALID_STATUS_TRANSITION'); };
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE');
  exists = false;
  assert.equal(await codeOf(confirm(parameters)), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.track.length, 0, 'no analytics for a write that did not happen');
});

// ───────────────────────────── registration and trust ─────────────────────────────

test('the habit command is confirmation-gated, contributor-floor, and unreachable by message', () => {
  const command = getAskDomainCommandByOperation('HOME_HABIT_UPDATE');
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.equal(command.adapterKey, 'home-habits.update');
  for (const message of Object.values(HABIT_ACTION_MESSAGES)) {
    assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId, 'HOME_HABIT_UPDATE', message);
  }
});

// The answer-trust validator silently removes any action whose id is not allowlisted for the operation.
test('the review actions, the receipt action and the empty-state link survive the answer-trust validator', async () => {
  const validate = (operationId, result) => validateAskAnswerTrust({
    question: 'q', operationId, propertyId: 'p1',
    result: { ...result, parameters: { audiencePresentation: { householdRole: 'OWNER' }, answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: getAskOperationDefinition(operationId).adapterKey, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: NOW.toISOString() }] } } },
  }).result;
  const reviewed = validate('HOME_HABITS', await review());
  assert.deepEqual(reviewed.blocks.flatMap((block) => block.actions ?? []).map((action) => action.id), ['habit-adopt', 'habit-complete', 'habit-snooze', 'habit-skip', 'habit-dismiss', 'habits-back-to-list']);
  assert.equal(reviewed.blocks[0].type, 'TASK_GUIDE', 'the guide block must be allowed for the operation');
  const list = validate('HOME_HABITS', homeHabitsFromView({ habits: [baseHabit()], hasMore: false, nextCursor: null }, 'p1', NOW));
  assert.deepEqual(list.blocks.flatMap((block) => block.actions ?? []).map((action) => action.id), ['habits-review-first', 'habits-show-maintenance'], 'the list\'s next steps must be allowlisted');
  assert.ok(list.blocks.some((block) => block.id === 'home-habits-boundary'));
  const empty = validate('HOME_HABITS', homeHabitsFromView({ habits: [], hasMore: false, nextCursor: null }, 'p1', NOW));
  assert.deepEqual(empty.blocks[0].actions.map((action) => action.id), ['open-home-habit-coach']);
  const { result: receipt } = await confirm(await proposed('ADOPT'));
  assert.deepEqual(validate('HOME_HABIT_UPDATE', receipt).blocks[0].actions.map((action) => action.id), ['habits-back-to-list']);
  const boundary = validate('HOME_HABIT_UPDATE', await propose('COMPLETE', { surface: 'ASK_REFRESH' }));
  assert.ok(boundary.blocks.some((block) => block.id === 'home-habit-write-boundary'), 'the write boundary must be allowlisted');
});
