const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Home Habit Coach": the property-wide coach settings (FRD v1.334). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { HomeHabitCoachService } = require('../../src/services/homeHabitCoach/homeHabitCoachService.ts');
const command = require('../../src/services/ask/support/habitCoachPreferencesCommand.ts');
const { homeHabitsFromView } = require('../../src/services/ask/handlers/homeHabitCoach.handler.ts');

const OP = 'HOME_HABIT_PREFERENCES_COMMAND';
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const row = (over = {}) => ({ isEnabled: true, preferredSurfaceCount: null, hiddenCategoriesJson: null, updatedAt: T, ...over });

test('the form mirrors the route: a count from 1 to 20 or blank, known categories only', () => {
  const p = command.parseHabitCoachPreferencesAnswer;
  assert.equal(p({ isEnabled: 'YES' }).success, true);
  assert.equal(p({ isEnabled: 'NO', preferredSurfaceCount: '5', hiddenCategories: ['SAFETY'] }).data.preferredSurfaceCount, 5);
  assert.equal(p({ isEnabled: 'YES', preferredSurfaceCount: 0 }).success, false);
  assert.equal(p({ isEnabled: 'YES', preferredSurfaceCount: 21 }).success, false);
  assert.equal(p({ isEnabled: 'YES', hiddenCategories: ['VIBES'] }).success, false);
  assert.deepEqual(command.habitCoachPreferencesBody(p({ isEnabled: 'NO', hiddenCategories: ['SAFETY', 'SAFETY'] }).data), { isEnabled: false, preferredSurfaceCount: null, hiddenCategories: ['SAFETY'] });
});

function install(role, prefs) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: HomeHabitCoachService.prototype.getPreferences, u: HomeHabitCoachService.prototype.updatePreferences, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  HomeHabitCoachService.prototype.getPreferences = async () => ({ preferences: prefs });
  HomeHabitCoachService.prototype.updatePreferences = async (propertyId, body) => { calls.push([propertyId, body]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; HomeHabitCoachService.prototype.getPreferences = saved.g; HomeHabitCoachService.prototype.updatePreferences = saved.u; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: 'prop-1', entityType: command.HABIT_COACH_PROPERTY_ENTITY_TYPE, ...over });
const invoke = (launchContext, message = command.HABIT_COACH_PREFERENCES_MESSAGE) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message, launchContext });

test('declared-action only, a contributor command; viewers refused; the form is seeded; a refresh is not routable', async () => {
  assert.notEqual(resolveAskRoutingCascade(command.HABIT_COACH_PREFERENCES_MESSAGE, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER', row());
  try { assert.equal((await invoke(launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', row({ preferredSurfaceCount: 7, hiddenCategoriesJson: ['SEASONAL'] }));
  try {
    assert.equal((await invoke(launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_HABIT_COACH_SETTINGS_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke(launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].currentAnswer, { isEnabled: 'YES', preferredSurfaceCount: 7, hiddenCategories: ['SEASONAL'] });
  } finally { w.restore(); }
});

test('the review shows only what changes, and an unchanged form is refused; nothing is written at review', async () => {
  const w = install('CONTRIBUTOR', row());
  const { habitCoachPreferencesResult } = require('../../src/services/ask/handlers/habitCoachPreferencesCommands.handler.ts');
  try {
    const parsed = command.parseHabitCoachPreferencesAnswer({ isEnabled: 'NO', preferredSurfaceCount: 5, hiddenCategories: [] });
    const review = await habitCoachPreferencesResult('u1', 'prop-1', null, parsed.data);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields, [{ label: 'The coach', value: 'On → Off' }, { label: 'Habits shown at once', value: 'The coach’s own default → 5' }]);
    const same = await habitCoachPreferencesResult('u1', 'prop-1', null, command.parseHabitCoachPreferencesAnswer({ isEnabled: 'YES' }).data);
    assert.equal(same.reasonCode, 'HABIT_COACH_SETTINGS_NO_CHANGE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('confirming calls the route\'s own update with the body; stale and invalid write nothing', async () => {
  const w = install('CONTRIBUTOR', row());
  const version = sha(`habit-coach-settings:prop-1:${T.toISOString()}`);
  try {
    await confirmCapabilityInvoke(OP, ctx({ habitCoachSettingsForm: { isEnabled: 'NO', preferredSurfaceCount: 5, hiddenCategories: ['SAFETY'] }, habitCoachSettingsContextVersion: version }));
    assert.deepEqual(w.calls[0], ['prop-1', { isEnabled: false, preferredSurfaceCount: 5, hiddenCategories: ['SAFETY'] }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ habitCoachSettingsForm: { isEnabled: 'NO' }, habitCoachSettingsContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ habitCoachSettingsForm: { isEnabled: 'MAYBE' }, habitCoachSettingsContextVersion: version })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
});

test('the habits answer offers the settings to a contributor only, and the id is allowlisted', () => {
  const view = { habits: [], hasMore: false };
  const contributor = homeHabitsFromView(view, 'prop-1', new Date(), true);
  assert.deepEqual(contributor.blocks[0].actions.map((a) => a.id), ['generate-home-habits', 'home-habit-coach-settings'].filter((id) => contributor.blocks[0].actions.some((a) => a.id === id)));
  assert.ok(contributor.blocks[0].actions.some((a) => a.id === 'home-habit-coach-settings'));
  assert.ok(!homeHabitsFromView(view, 'prop-1', new Date(), false).blocks[0].actions.some((a) => a.id === 'home-habit-coach-settings'));
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('home-habit-coach-settings', 'HOME_HABITS'), true);
  assert.equal(applicable('home-habits-back', OP), true);
});
