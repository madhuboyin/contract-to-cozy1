const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.41: Home Event Radar task create-or-link and notification settings.
// Same harness as homeEventRadarWrites.test.js: prisma, the radar services, analytics and property access are
// replaced with recording fakes, so the real registered handlers run without a database. The fake prisma throws on
// any model it was not given.

const prismaModule = require('../../src/lib/prisma.ts');
const orchestrator = require('../../src/services/ask/askOrchestrator.service.ts');
const {
  RADAR_TASK_MESSAGE, RADAR_PREFERENCES_MESSAGE, radarTaskFormResult, radarPreferencesFormResult, radarPreferencesBodyFromAnswer,
  radarPreferencesContextVersion, radarZonedWallClockToUtc, radarEventItemActions,
} = orchestrator;
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { radarQueryService } = require('../../src/modules/homeEventRadar/services/radarQuery.service.ts');
const { radarTaskIntegrationService } = require('../../src/modules/homeEventRadar/services/radarTaskIntegration.service.ts');
const { radarNotificationPreferenceService } = require('../../src/modules/homeEventRadar/services/radarNotificationPreference.service.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');
const analytics = require('../../src/services/analytics');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  getDetail: radarQueryService.getDetail, listFeed: radarQueryService.listFeed,
  listCandidateTasks: radarTaskIntegrationService.listCandidateTasks, createOrLink: radarTaskIntegrationService.createOrLink,
  getPreferences: radarNotificationPreferenceService.get, updatePreferences: radarNotificationPreferenceService.update,
  track: analytics.analyticsEmitter.track, resolveAccess: propertyAccess.resolvePropertyAccess,
};

const DAY = 24 * 60 * 60 * 1000;
let calls;
let accessRole;
let action;
let candidates;
let detailTiming;
let preferences;
let createOrLinkImpl;

const task = { id: 'task-1', title: 'Secure outdoor items', href: '/dashboard/maintenance?taskId=task-1', nextDueDate: '2026-09-25T13:00:00.000Z' };
const defaultPreferences = () => ({
  propertyId: 'p1', userId: 'u1', isEnabled: true, enabledCategories: ['weather', 'air_quality', 'disaster', 'utility', 'tax', 'insurance', 'other'],
  channels: ['in_app'], minimumSeverity: 'moderate', minimumImpact: 'moderate', deliveryMode: 'immediate', criticalSafetyOverrideEnabled: false,
  quietHours: null, timezone: 'America/New_York', persisted: false, updatedAt: null,
});

function install() {
  calls = { listCandidateTasks: [], createOrLink: [], updatePreferences: [], track: [], listFeed: [] };
  accessRole = 'CONTRIBUTOR';
  action = { code: 'SECURE_OUTDOOR_ITEMS', label: 'Secure outdoor items', priority: 'medium', supportedTaskOperations: ['create_task', 'create_reminder', 'link_existing_task'], taskLink: null };
  candidates = [{ id: 'task-9', title: 'Clean gutters' }];
  detailTiming = { effectiveAt: null, expiresAt: null };
  preferences = defaultPreferences();
  createOrLinkImpl = async () => ({ link: { task }, deduped: false });
  const models = {
    askExecution: { findMany: async () => [] },
    householdMember: { findMany: async () => [
      { userId: 'u1', displayName: 'Sam', user: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' } },
      { userId: 'u2', displayName: null, user: { firstName: 'Alex', lastName: 'Kim', email: 'alex@example.com' } },
    ] },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return models[model];
    },
  });
  radarQueryService.getDetail = async (propertyId, matchId) => ({ propertyMatchId: matchId, title: 'High wind warning', userState: 'seen', recommendedActions: [action], ...detailTiming });
  radarQueryService.listFeed = async (...args) => { calls.listFeed.push(args); return { items: [{ id: 'match-1', title: 'High wind warning', summary: 's', severity: 'high', sourceName: 'NWS', sourceFamily: 'weather', userState: 'seen' }], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 1, feedState: 'ACTIVE', asOf: '2026-09-22T00:00:00.000Z' }; };
  radarTaskIntegrationService.listCandidateTasks = async (...args) => { calls.listCandidateTasks.push(args); return candidates; };
  radarTaskIntegrationService.createOrLink = async (...args) => { calls.createOrLink.push(args); return createOrLinkImpl(...args); };
  radarNotificationPreferenceService.get = async () => preferences;
  radarNotificationPreferenceService.update = async (propertyId, userId, body) => {
    calls.updatePreferences.push([propertyId, userId, body]);
    preferences = { ...preferences, ...body, persisted: true, updatedAt: '2026-09-22T12:00:00.000Z' };
    return preferences;
  };
  analytics.analyticsEmitter.track = (event) => { calls.track.push(event); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = realPrisma;
  radarQueryService.getDetail = originals.getDetail;
  radarQueryService.listFeed = originals.listFeed;
  radarTaskIntegrationService.listCandidateTasks = originals.listCandidateTasks;
  radarTaskIntegrationService.createOrLink = originals.createOrLink;
  radarNotificationPreferenceService.get = originals.getPreferences;
  radarNotificationPreferenceService.update = originals.updatePreferences;
  analytics.analyticsEmitter.track = originals.track;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const launch = (operationId, overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'RADAR_MATCH', entityId: 'match-1', actionId: 'SECURE_OUTDOOR_ITEMS', operationId, sourceExecutionId: 'exec-feed', ...overrides });
const propose = (operationId, message, launchOverrides) => capabilityInvoke(operationId, { userId: 'u1', propertyId: 'p1', message, launchContext: launch(operationId, launchOverrides) });
const execution = (operationId) => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId, createdAt: new Date('2026-09-22T00:00:00.000Z') });
const confirm = (operationId, parameters, role = 'CONTRIBUTOR') => confirmCapabilityInvoke(operationId, {
  userId: 'u1', execution: execution(operationId), parameters, access: { role }, command: getAskDomainCommandByOperation(operationId),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const target = { matchId: 'match-1', actionCode: 'SECURE_OUTDOOR_ITEMS' };
const fieldKeys = (result) => result.captureRequests[0].inputSchema.fields.map((field) => field.key);
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

// ───────────────────────────── entry points ─────────────────────────────

test('contributors get "Plan this action" on events and "Notification settings" on the feed; viewers get neither', async () => {
  const feed = () => capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: 'Show my home event radar feed' });
  const list = (result) => result.blocks.find((block) => block.id === 'home-event-radar-feed');
  const contributor = list(await feed());
  assert.ok(contributor.sections[0].items[0].actions.some((item) => item.id === 'radar-plan-task' && item.operationId === 'HOME_EVENT_RADAR_TASK'));
  assert.ok(contributor.actions.some((item) => item.id === 'radar-notification-settings' && item.operationId === 'HOME_EVENT_RADAR_PREFERENCES' && item.message === RADAR_PREFERENCES_MESSAGE));
  accessRole = 'VIEWER';
  const viewer = list(await feed());
  assert.ok(!viewer.sections[0].items[0].actions.some((item) => item.id === 'radar-plan-task'));
  assert.ok(!viewer.actions.some((item) => item.id === 'radar-notification-settings'));
});

test('the new feed and receipt actions survive the answer-trust whitelist', () => {
  const settings = { id: 'radar-notification-settings', label: 'x', interactionType: 'START_WORKFLOW', message: RADAR_PREFERENCES_MESSAGE, operationId: 'HOME_EVENT_RADAR_PREFERENCES', style: 'SECONDARY' };
  for (const item of [...radarEventItemActions('OWNER'), settings]) {
    assert.equal(isAskActionApplicable({ action: item, operationId: 'HOME_EVENT_RADAR_FEED', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, item.id);
  }
  const openTask = { id: 'open-task', label: 'Open task', href: task.href, style: 'PRIMARY' };
  assert.equal(isAskActionApplicable({ action: openTask, operationId: 'HOME_EVENT_RADAR_TASK', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
});

// ───────────────────────────── HOME_EVENT_RADAR_TASK ─────────────────────────────

test('a declared "Plan this action" opens a form offering only the supported operations, the open tasks and household members', async () => {
  const result = await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE);
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.deepEqual(result.parameters.radarTaskTarget, target);
  assert.deepEqual(fieldKeys(result), ['operation', 'maintenanceTaskId', 'dueDate', 'dueTime', 'assigneeUserId']);
  const [operation, taskField, , , assignee] = result.captureRequests[0].inputSchema.fields;
  assert.deepEqual(operation.inputSchema.options.map((option) => option.value), ['create_task', 'create_reminder', 'link_existing_task']);
  assert.deepEqual(taskField.inputSchema.options, [{ label: 'Clean gutters', value: 'task-9' }]);
  assert.deepEqual(assignee.inputSchema.options.map((option) => option.label), ['Unassigned', 'Sam', 'Alex Kim']);
  assert.deepEqual(calls.createOrLink, []);
});

test('linking is dropped when no open task exists, and an action with nothing left to offer is a boundary', async () => {
  candidates = [];
  const result = await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE);
  assert.deepEqual(result.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((option) => option.value), ['create_task', 'create_reminder']);
  assert.ok(!fieldKeys(result).includes('maintenanceTaskId'));
  action.supportedTaskOperations = ['link_existing_task'];
  const none = await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE);
  assert.equal(none.blocks[0].id, 'radar-write-boundary');
  assert.match(none.blocks[0].body, /no open maintenance tasks/);
  // An action that only supports creating never asks for candidates (listCandidateTasks throws for it).
  action.supportedTaskOperations = ['create_task'];
  calls.listCandidateTasks = [];
  await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE);
  assert.deepEqual(calls.listCandidateTasks, []);
});

test('an action that already has a task reports it instead of offering a form', async () => {
  action.taskLink = { operation: 'create_task', task };
  const result = await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.reasonCode, 'HOME_EVENT_RADAR_TASK_ALREADY_LINKED');
  assert.ok(result.blocks[0].actions.some((item) => item.id === 'open-task' && item.href === task.href));
});

test('an undeclared start, a refresh, a missing or unknown action code, or a viewer never opens the form', async () => {
  assert.equal((await propose('HOME_EVENT_RADAR_TASK', 'Add a task for everything.')).status, 'NOT_APPLICABLE');
  assert.equal((await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE, { surface: 'ASK_REFRESH' })).status, 'NOT_APPLICABLE');
  assert.equal((await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE, { actionId: null })).status, 'NOT_APPLICABLE');
  assert.equal((await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE, { actionId: 'NOT_A_CODE' })).status, 'NOT_APPLICABLE');
  accessRole = 'VIEWER';
  assert.equal((await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE)).status, 'BLOCKED');
  action.code = 'CHECK_GUTTERS';
  accessRole = 'CONTRIBUTOR';
  assert.equal((await propose('HOME_EVENT_RADAR_TASK', RADAR_TASK_MESSAGE)).blocks[0].title, 'Action no longer recommended');
});

test('a submitted answer becomes a review card with the resolved due instant, keeps the form under a new requirement id, and writes nothing', async () => {
  const dueDate = isoDate(10);
  const result = await radarTaskFormResult('u1', 'p1', target, { operation: 'create_reminder', dueDate: { precision: 'EXACT_DATE', value: dueDate }, dueTime: '07:30', assigneeUserId: 'u2' }, 'exec-feed');
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  // No execution context in this harness, so the property timezone is UTC.
  assert.deepEqual(result.parameters.radarTask, { ...target, operation: 'create_reminder', maintenanceTaskId: null, dueAt: `${dueDate}T07:30:00.000Z`, assigneeUserId: 'u2' });
  const fields = Object.fromEntries(result.confirmation.fields.map((field) => [field.label, field.value]));
  assert.equal(fields['Task title'], 'Reminder: Secure outdoor items');
  assert.equal(fields['Assigned to'], 'Alex Kim');
  assert.equal(result.confirmation.editableFields.length, 0);
  assert.notEqual(result.captureRequests[0].requirementId, 'radar-task-inputs');
  assert.deepEqual(calls.createOrLink, []);
});

test('linking ignores any due date and requires one of the listed tasks; the form validates due dates like the service does', async () => {
  const linked = await radarTaskFormResult('u1', 'p1', target, { operation: 'link_existing_task', maintenanceTaskId: 'task-9', dueDate: { precision: 'EXACT_DATE', value: isoDate(3) }, assigneeUserId: 'UNASSIGNED' }, null);
  assert.equal(linked.parameters.radarTask.dueAt, null);
  assert.equal(linked.parameters.radarTask.maintenanceTaskId, 'task-9');
  const code = (answer) => codeOf(radarTaskFormResult('u1', 'p1', target, answer, null));
  assert.equal(await code({ operation: 'link_existing_task', maintenanceTaskId: 'task-other' }), 'ASK_CAPTURE_VALIDATION_ERROR');
  assert.equal(await code({ operation: 'create_task', dueDate: { precision: 'EXACT_DATE', value: isoDate(-2) } }), 'ASK_CAPTURE_VALIDATION_ERROR');
  assert.equal(await code({ operation: 'create_task', dueDate: { precision: 'EXACT_DATE', value: isoDate(400) } }), 'ASK_CAPTURE_VALIDATION_ERROR');
  assert.equal(await code({ operation: 'create_task', dueTime: '08:00' }), 'ASK_CAPTURE_VALIDATION_ERROR', 'a time needs a date');
  assert.equal(await code({ operation: 'create_task', assigneeUserId: 'stranger' }), 'ASK_CAPTURE_VALIDATION_ERROR');
  // A reminder with no date on an event with no safe timing is refused (RADAR_REMINDER_DUE_DATE_REQUIRED).
  assert.equal(await code({ operation: 'create_reminder' }), 'ASK_CAPTURE_VALIDATION_ERROR');
  // With event timing, no date is fine and the review says where the due date came from.
  detailTiming = { effectiveAt: new Date(Date.now() + 3 * DAY).toISOString(), expiresAt: null };
  const derived = await radarTaskFormResult('u1', 'p1', target, { operation: 'create_reminder' }, null);
  assert.match(derived.confirmation.fields.find((field) => field.label === 'Due').value, /from the event timing/);
  assert.equal(derived.parameters.radarTask.dueAt, null, 'the service derives it again at confirm');
});

test('confirm writes through createOrLink with the controller analytics; a dedupe is reported as already planned', async () => {
  const input = { ...target, operation: 'create_task', maintenanceTaskId: null, dueAt: null, assigneeUserId: 'u2' };
  const { result } = await confirm('HOME_EVENT_RADAR_TASK', { radarTask: input });
  assert.deepEqual(calls.createOrLink, [['p1', 'match-1', 'SECURE_OUTDOOR_ITEMS', 'u1', { operation: 'create_task', maintenanceTaskId: null, dueAt: null, assigneeUserId: 'u2' }]]);
  assert.equal(result.reasonCode, 'HOME_EVENT_RADAR_TASK_LINKED');
  assert.equal(result.blocks[0].title, 'Task added');
  assert.deepEqual(calls.track[0].metadataJson, { actionType: 'create_task', matchId: 'match-1', actionCode: 'SECURE_OUTDOOR_ITEMS', maintenanceTaskId: 'task-1', deduped: false, surface: 'ASK' });
  createOrLinkImpl = async () => ({ link: { task }, deduped: true });
  const again = await confirm('HOME_EVENT_RADAR_TASK', { radarTask: input });
  assert.equal(again.result.reasonCode, 'HOME_EVENT_RADAR_TASK_ALREADY_LINKED');
});

test('confirm maps the service\'s own refusals, refuses a viewer, and rethrows anything unexpected', async () => {
  const input = { radarTask: { ...target, operation: 'link_existing_task', maintenanceTaskId: 'task-9', dueAt: null, assigneeUserId: null } };
  createOrLinkImpl = async () => { throw new APIError('Maintenance task not found', 404, 'RADAR_MAINTENANCE_TASK_NOT_FOUND'); };
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_TASK', input)), 'ASK_CONTEXT_VERSION_CONFLICT');
  createOrLinkImpl = async () => { throw new APIError('Due date must be at least five minutes and no more than one year in the future.', 400, 'RADAR_DUE_DATE_INVALID'); };
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_TASK', input)), 'ASK_INVALID_CONFIRMATION_EDIT');
  createOrLinkImpl = async () => { throw new Error('database down'); };
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_TASK', input)), 'NO_CODE:database down');
  const before = calls.createOrLink.length;
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_TASK', input, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_TASK', { radarTask: { ...input.radarTask, actionCode: 'NOPE' } })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.createOrLink.length, before);
  assert.deepEqual(calls.track, []);
});

test('wall-clock due times convert through the timezone, including across a DST change', () => {
  assert.equal(radarZonedWallClockToUtc('2026-07-01', '09:00', 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(radarZonedWallClockToUtc('2026-12-01', '09:00', 'America/New_York').toISOString(), '2026-12-01T14:00:00.000Z');
  assert.equal(radarZonedWallClockToUtc('2026-11-01', '09:00', 'America/New_York').toISOString(), '2026-11-01T14:00:00.000Z');
  assert.equal(radarZonedWallClockToUtc('2026-03-08', '12:00', 'America/New_York').toISOString(), '2026-03-08T16:00:00.000Z');
  assert.equal(radarZonedWallClockToUtc('2026-07-01', '09:00', 'UTC').toISOString(), '2026-07-01T09:00:00.000Z');
});

// ───────────────────────────── HOME_EVENT_RADAR_PREFERENCES ─────────────────────────────

const answerFrom = (overrides = {}) => ({
  isEnabled: true, enabledCategories: ['weather'], channels: ['in_app', 'email'], minimumSeverity: 'high', minimumImpact: 'moderate',
  deliveryMode: 'digest', criticalSafetyOverrideEnabled: true, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00',
  timezone: 'America/New_York', ...overrides,
});

test('the settings form carries every traditional control, prefilled from the current (or default) settings', async () => {
  const result = await propose('HOME_EVENT_RADAR_PREFERENCES', RADAR_PREFERENCES_MESSAGE, { entityType: null, entityId: null, actionId: null });
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.deepEqual(fieldKeys(result), ['isEnabled', 'enabledCategories', 'channels', 'minimumSeverity', 'minimumImpact', 'deliveryMode', 'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd', 'criticalSafetyOverrideEnabled', 'timezone']);
  assert.equal(result.captureRequests[0].currentAnswer.quietHoursEnabled, false);
  assert.equal(result.captureRequests[0].currentAnswer.timezone, 'America/New_York');
  assert.equal(result.captureRequests[0].expectedContextVersion, radarPreferencesContextVersion(preferences));
  assert.match(result.blocks[0].body, /defaults/);
});

test('an undeclared start or a refresh never opens the settings form; a viewer is blocked by the CONTRIBUTOR floor', async () => {
  assert.equal((await propose('HOME_EVENT_RADAR_PREFERENCES', 'Turn off all my notifications.')).status, 'NOT_APPLICABLE');
  assert.equal((await propose('HOME_EVENT_RADAR_PREFERENCES', RADAR_PREFERENCES_MESSAGE, { surface: 'ASK_REFRESH' })).status, 'NOT_APPLICABLE');
  accessRole = 'VIEWER';
  const viewer = await propose('HOME_EVENT_RADAR_PREFERENCES', RADAR_PREFERENCES_MESSAGE);
  assert.equal(viewer.status, 'BLOCKED');
  assert.equal(viewer.captureRequests, undefined);
});

test('a form answer is validated by the traditional PUT schema, with a message naming what to fix', () => {
  const body = radarPreferencesBodyFromAnswer(answerFrom({ enabledCategories: ['insurance', 'weather'] }));
  assert.deepEqual(body.enabledCategories, ['weather', 'insurance'], 'ordered like the traditional route');
  assert.deepEqual(body.quietHours, { start: '22:00', end: '07:00' });
  assert.equal(radarPreferencesBodyFromAnswer(answerFrom({ quietHoursEnabled: false })).quietHours, null);
  const message = (answer) => { try { radarPreferencesBodyFromAnswer(answer); return null; } catch (error) { assert.equal(error.code, 'ASK_CAPTURE_VALIDATION_ERROR'); return error.message; } };
  assert.match(message(answerFrom({ enabledCategories: [] })), /category/);
  assert.match(message(answerFrom({ channels: [] })), /channel/);
  assert.match(message(answerFrom({ quietHoursEnd: '22:00' })), /Quiet hours/);
  assert.match(message(answerFrom({ timezone: 'Mars/Olympus' })), /IANA timezone/);
  assert.match(message(answerFrom({ minimumSeverity: 'apocalyptic' })), /Check the notification settings/);
  assert.match(message({ isEnabled: true }), /every notification setting/);
});

test('the review names what changes and writes nothing; confirm saves, and a save elsewhere in between conflicts', async () => {
  const body = radarPreferencesBodyFromAnswer(answerFrom());
  const review = await radarPreferencesFormResult('u1', 'p1', body, 'exec-feed');
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.match(review.blocks[0].body, /Changing: Categories, Channels, Minimum severity, Delivery, Quiet hours, Extreme safety alerts in quiet hours/);
  assert.deepEqual(calls.updatePreferences, []);
  const { result } = await confirm('HOME_EVENT_RADAR_PREFERENCES', review.parameters);
  assert.deepEqual(calls.updatePreferences, [['p1', 'u1', body]]);
  assert.equal(result.reasonCode, 'HOME_EVENT_RADAR_PREFERENCES_SAVED');
  assert.deepEqual(calls.track, [], 'the traditional PUT emits no analytics');
  // The first save moved updatedAt, so the same review no longer matches.
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_PREFERENCES', review.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_PREFERENCES', review.parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_PREFERENCES', { ...review.parameters, radarPreferences: { isEnabled: true } })), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.updatePreferences.length, 1);
});

test('an unchanged review says so', async () => {
  const unchanged = radarPreferencesBodyFromAnswer(answerFrom({
    enabledCategories: preferences.enabledCategories, channels: ['in_app'], minimumSeverity: 'moderate', deliveryMode: 'immediate', criticalSafetyOverrideEnabled: false, quietHoursEnabled: false,
  }));
  const review = await radarPreferencesFormResult('u1', 'p1', unchanged, null);
  assert.match(review.blocks[0].body, /match your current settings/);
});

// ───────────────────────────── submitAskCapture wiring (source governance) ─────────────────────────────
// submitAskCapture touches the database directly and has no runtime harness (see conversationalCapture.test.js).

const orchestratorSource = readAskOrchestratorSources();

test('submitAskCapture allows both radar forms, checks key, role and version before building the review, and never writes', () => {
  const start = orchestratorSource.indexOf('export async function submitAskCapture(');
  const allowList = orchestratorSource.slice(start, orchestratorSource.indexOf(".includes(execution.operationId ?? '')", start));
  assert.match(allowList, /'HOME_EVENT_RADAR_TASK', 'HOME_EVENT_RADAR_PREFERENCES'/);
  const branchStart = orchestratorSource.indexOf("} else if (execution.operationId === 'HOME_EVENT_RADAR_TASK' || execution.operationId === 'HOME_EVENT_RADAR_PREFERENCES')", start);
  const branch = orchestratorSource.slice(branchStart, orchestratorSource.indexOf("} else if (execution.operationId === 'INVENTORY_ITEM_CREATE')", branchStart));
  const keyCheck = branch.indexOf('input.captureKey !==');
  const roleCheck = branch.indexOf('HouseholdRole.VIEWER');
  const taskVersion = branch.indexOf('currentVersion !== input.expectedContextVersion');
  const taskForm = branch.indexOf('radarTaskFormResult(');
  const prefVersion = branch.indexOf('currentVersion !== input.expectedContextVersion', taskForm);
  const prefForm = branch.indexOf('radarPreferencesFormResult(');
  assert.ok(keyCheck > 0 && roleCheck > keyCheck && taskVersion > roleCheck && taskForm > taskVersion && prefVersion > taskForm && prefForm > prefVersion);
  assert.doesNotMatch(branch, /createOrLink\(|radarNotificationPreferenceService\.update\(/);
});

test('an idempotent replay of a radar form returns the stored execution instead of re-routing its canned message', () => {
  const start = orchestratorSource.indexOf('export async function submitAskCapture(');
  const replay = orchestratorSource.indexOf('if (previousCapture) {', start);
  const guard = orchestratorSource.indexOf("execution.operationId === 'HOME_EVENT_RADAR_TASK' || execution.operationId === 'HOME_EVENT_RADAR_PREFERENCES'", replay);
  assert.ok(guard > replay && guard < orchestratorSource.indexOf('resolveAskOperation(execution.message)', replay));
});
