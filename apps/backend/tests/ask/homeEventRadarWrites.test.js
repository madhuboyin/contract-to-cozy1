const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.40: Home Event Radar filters + per-user writes.
// Runtime tests: prisma, the radar services, analytics and property access are
// replaced with recording fakes before any handler runs, so the real registered
// handlers execute end to end without a database. The fake prisma throws on any
// model it was not given, so an unexpected read or write fails loudly.

const prismaModule = require('../../src/lib/prisma.ts');
const orchestrator = require('../../src/services/ask/askOrchestrator.service.ts');
const {
  parseRadarFeedFilters, radarFeedFilterMessage, radarStateTransition, radarEventItemActions, radarStateContextVersion,
  RADAR_STATE_MESSAGES, RADAR_MARK_DONE_MESSAGE, RADAR_FEEDBACK_MESSAGE, editHomeEventRadarFeedbackConfirmation,
} = orchestrator;
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { radarQueryService } = require('../../src/modules/homeEventRadar/services/radarQuery.service.ts');
const { radarInteractionService } = require('../../src/modules/homeEventRadar/services/radarInteraction.service.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');
const analytics = require('../../src/services/analytics');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  getDetail: radarQueryService.getDetail, listFeed: radarQueryService.listFeed,
  updateState: radarInteractionService.updateState, submitFeedback: radarInteractionService.submitFeedback,
  track: analytics.analyticsEmitter.track, resolveAccess: propertyAccess.resolvePropertyAccess,
};

let calls;
let liveState;
let liveFeedback;
let matchExists;
let feedPage;
let accessRole;

function install() {
  calls = { updateState: [], submitFeedback: [], track: [], listFeed: [] };
  liveState = 'seen';
  liveFeedback = null;
  matchExists = true;
  accessRole = 'CONTRIBUTOR';
  feedPage = { items: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0, feedState: 'CONFIRMED_CLEAR', asOf: '2026-09-22T00:00:00.000Z' };
  const models = { askExecution: { findMany: async () => [] } };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return models[model];
    },
  });
  radarQueryService.getDetail = async (propertyId, matchId) => {
    if (!matchExists) throw new APIError('Radar match not found', 404, 'RADAR_MATCH_NOT_FOUND');
    return { propertyMatchId: matchId, title: 'Hail warning', userState: liveState, userFeedback: liveFeedback };
  };
  radarQueryService.listFeed = async (...args) => { calls.listFeed.push(args); return feedPage; };
  radarInteractionService.updateState = async (...args) => { calls.updateState.push(args); liveState = args[3]; return {}; };
  radarInteractionService.submitFeedback = async (...args) => { calls.submitFeedback.push(args); return {}; };
  analytics.analyticsEmitter.track = (event) => { calls.track.push(event); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = realPrisma;
  radarQueryService.getDetail = originals.getDetail;
  radarQueryService.listFeed = originals.listFeed;
  radarInteractionService.updateState = originals.updateState;
  radarInteractionService.submitFeedback = originals.submitFeedback;
  analytics.analyticsEmitter.track = originals.track;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const launch = (operationId, overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'RADAR_MATCH', entityId: 'match-1', operationId, sourceExecutionId: 'exec-feed', ...overrides });
const propose = (operationId, message, launchOverrides) => capabilityInvoke(operationId, { userId: 'u1', propertyId: 'p1', message, launchContext: launch(operationId, launchOverrides) });
const execution = (operationId) => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId, createdAt: new Date('2026-09-22T00:00:00.000Z') });
const confirm = (operationId, parameters, role = 'CONTRIBUTOR') => confirmCapabilityInvoke(operationId, {
  userId: 'u1', execution: execution(operationId), parameters, access: { role }, command: getAskDomainCommandByOperation(operationId),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const feedItem = (id, sourceFamily = 'weather', userState = 'new') => ({ id, title: `Event ${id}`, summary: 's', severity: 'high', sourceName: 'NWS', sourceFamily, userState });

// ───────────────────────────── filters ─────────────────────────────

test('feed filters parse from the chip message they generate (round trip), for every combination', () => {
  for (const lifecycle of [null, 'now', 'upcoming', 'recently_ended']) {
    for (const sourceFamily of [null, 'weather', 'air_quality', 'insurance']) {
      for (const includeDismissed of [false, true]) {
        const state = { lifecycle, sourceFamily, includeDismissed };
        assert.deepEqual(parseRadarFeedFilters(radarFeedFilterMessage(state)), state, JSON.stringify(state));
      }
    }
  }
});

test('a plain radar question applies no filter, and a routing phrase naming weather does not silently narrow to weather', () => {
  assert.deepEqual(parseRadarFeedFilters('Show my home event radar feed'), { lifecycle: null, sourceFamily: null, includeDismissed: false });
  assert.equal(parseRadarFeedFilters('Any severe weather near my home?').sourceFamily, null);
});

test('"Show more" paging keeps the filters: the continuation message prefixes the prior filtered message', () => {
  const prior = radarFeedFilterMessage({ lifecycle: 'upcoming', sourceFamily: 'utility', includeDismissed: true });
  assert.deepEqual(parseRadarFeedFilters(`${prior}. Show more monitored events`), { lifecycle: 'upcoming', sourceFamily: 'utility', includeDismissed: true });
});

test('the feed hides dismissed events by default (traditional-page parity) and passes each filter to the canonical listFeed', async () => {
  feedPage = { ...feedPage, items: [feedItem('match-1')], totalCount: 1, feedState: 'ACTIVE' };
  await capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: 'Show my home event radar feed' });
  assert.deepEqual(calls.listFeed[0][2].state, ['new', 'seen', 'saved', 'acted_on']);
  assert.equal(calls.listFeed[0][2].lifecycle, undefined);
  await capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: radarFeedFilterMessage({ lifecycle: 'now', sourceFamily: 'tax', includeDismissed: true }) });
  assert.equal(calls.listFeed[1][2].state, undefined, 'including dismissed drops the state filter');
  assert.deepEqual(calls.listFeed[1][2].lifecycle, ['now']);
  assert.deepEqual(calls.listFeed[1][2].sourceFamily, ['tax']);
});

test('filter chips mark exactly one active chip per dimension and only offer present source families (plus the active one)', async () => {
  feedPage = { ...feedPage, items: [feedItem('match-1', 'weather'), feedItem('match-2', 'utility')], totalCount: 2, feedState: 'ACTIVE' };
  const result = await capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: radarFeedFilterMessage({ lifecycle: 'upcoming', sourceFamily: 'tax', includeDismissed: false }) });
  const list = result.blocks.find((block) => block.id === 'home-event-radar-feed');
  const active = list.filters.filter((chip) => chip.active).map((chip) => chip.id);
  assert.deepEqual(active, ['radar-lifecycle-upcoming', 'radar-family-tax', 'radar-hide-dismissed']);
  assert.deepEqual(list.filters.filter((chip) => chip.id.startsWith('radar-family-') && chip.id !== 'radar-family-all').map((chip) => chip.id), ['radar-family-tax', 'radar-family-utility', 'radar-family-weather']);
  // Each chip keeps the other dimensions.
  assert.deepEqual(parseRadarFeedFilters(list.filters.find((chip) => chip.id === 'radar-lifecycle-now').message), { lifecycle: 'now', sourceFamily: 'tax', includeDismissed: false });
});

test('an empty unfiltered feed keeps its coverage copy and offers to include dismissed events; an empty filtered feed keeps its chips', async () => {
  const empty = await capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: 'Show my home event radar feed' });
  assert.equal(empty.blocks[0].type, 'EMPTY_STATE');
  assert.match(empty.blocks[0].body, /Dismissed events are hidden/);
  assert.ok(empty.blocks[0].actions.some((action) => action.id === 'radar-include-dismissed' && parseRadarFeedFilters(action.message).includeDismissed));
  const filtered = await capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: radarFeedFilterMessage({ lifecycle: 'now', sourceFamily: null, includeDismissed: false }) });
  const list = filtered.blocks.find((block) => block.id === 'home-event-radar-feed');
  assert.ok(list.filters.length > 0);
  assert.equal(list.sections[0].count, 0);
});

// ───────────────────────────── item actions ─────────────────────────────

test('feed items declare the role-allowed actions their recorded state allows; viewers get the direct state actions only (FRD v1.92)', async () => {
  feedPage = { ...feedPage, items: [feedItem('match-1')], totalCount: 1, feedState: 'ACTIVE' };
  const contributor = await capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: 'Show my home event radar feed' });
  const ids = (result) => result.blocks.find((block) => block.id === 'home-event-radar-feed').sections[0].items[0].actions.map((action) => action.id);
  // A new event: Save and Dismiss (not Remove from saved or Restore), + radar-plan-task (FRD v1.41), rendered per
  // recommended action rather than as its own button.
  assert.deepEqual(ids(contributor), ['radar-save', 'radar-dismiss', 'radar-mark-done', 'radar-feedback', 'radar-plan-task']);
  accessRole = 'VIEWER';
  const viewer = await capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: 'Show my home event radar feed' });
  assert.deepEqual(ids(viewer), ['radar-save', 'radar-dismiss']);
});

test('the declared actions follow the recorded state, and without a state every action is declared as before', () => {
  const ids = (role, state) => radarEventItemActions(role, state).map((action) => action.id);
  assert.deepEqual(ids('OWNER', 'saved'), ['radar-unsave', 'radar-dismiss', 'radar-mark-done', 'radar-feedback', 'radar-plan-task']);
  assert.deepEqual(ids('OWNER', 'dismissed'), ['radar-save', 'radar-restore', 'radar-mark-done', 'radar-feedback', 'radar-plan-task']);
  assert.deepEqual(ids('OWNER', 'acted_on'), ['radar-feedback', 'radar-plan-task']);
  assert.deepEqual(ids('OWNER', null), ids('OWNER', 'new'));
  assert.deepEqual(ids('VIEWER', 'saved'), ['radar-unsave', 'radar-dismiss']);
  assert.deepEqual(ids('OWNER'), ['radar-save', 'radar-unsave', 'radar-dismiss', 'radar-restore', 'radar-mark-done', 'radar-feedback', 'radar-plan-task']);
});

test('the feed declares a card deck with Save on a right swipe and Dismiss on a left swipe, and satisfies the contract', async () => {
  const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
  feedPage = { ...feedPage, items: [feedItem('match-1'), feedItem('match-2', 'weather', 'dismissed')], totalCount: 2, feedState: 'ACTIVE' };
  accessRole = 'OWNER';
  const result = await capabilityInvoke('HOME_EVENT_RADAR_FEED', { userId: 'u1', propertyId: 'p1', message: 'Show my home event radar feed' });
  const block = result.blocks.find((entry) => entry.id === 'home-event-radar-feed');
  assert.deepEqual(block.presentation, { pattern: 'DECK', swipeRightActionId: 'radar-save', swipeLeftActionId: 'radar-dismiss' });
  assert.deepEqual(block.sections[0].items[1].actions.slice(0, 2).map((action) => action.id), ['radar-save', 'radar-restore']);
  AskPresentationBlockSchema.parse(block);
});

test('every item action and the include-dismissed action survive the answer-trust whitelist', () => {
  for (const action of [...radarEventItemActions('OWNER'), { id: 'radar-include-dismissed', label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'HOME_EVENT_RADAR_FEED', style: 'SECONDARY' }]) {
    assert.equal(isAskActionApplicable({ action, operationId: 'HOME_EVENT_RADAR_FEED', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, action.id);
  }
});

// ───────────────────────────── HOME_EVENT_RADAR_STATE (direct) ─────────────────────────────

test('state transitions from each live state; a done event is refused for every request', () => {
  assert.deepEqual(radarStateTransition('save', 'new'), { target: 'saved', alreadyApplied: false });
  assert.deepEqual(radarStateTransition('save', 'saved'), { target: 'saved', alreadyApplied: true });
  assert.deepEqual(radarStateTransition('unsave', 'saved'), { target: 'seen', alreadyApplied: false });
  assert.deepEqual(radarStateTransition('unsave', 'seen'), { target: 'seen', alreadyApplied: true });
  assert.deepEqual(radarStateTransition('dismiss', 'saved'), { target: 'dismissed', alreadyApplied: false });
  assert.deepEqual(radarStateTransition('restore', 'dismissed'), { target: 'seen', alreadyApplied: false });
  assert.deepEqual(radarStateTransition('restore', 'new'), { target: 'seen', alreadyApplied: true });
  for (const request of ['save', 'unsave', 'dismiss', 'restore']) assert.ok('refused' in radarStateTransition(request, 'acted_on'), request);
});

test('a declared Save click writes the live match directly (no confirmation), repeats the controller analytics, and returns a receipt', async () => {
  const result = await propose('HOME_EVENT_RADAR_STATE', RADAR_STATE_MESSAGES.save);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.confirmation, undefined);
  assert.deepEqual(calls.updateState, [['p1', 'match-1', 'u1', 'saved']]);
  assert.equal(calls.track[0].metadataJson.actionType, 'update_match_state');
  assert.equal(calls.track[0].metadataJson.state, 'saved');
  assert.equal(result.blocks[0].title, 'Event saved');
});

test('an already-applied request, a done event, a missing event, a refresh re-run, or an undeclared message never writes', async () => {
  liveState = 'saved';
  assert.equal((await propose('HOME_EVENT_RADAR_STATE', RADAR_STATE_MESSAGES.save)).blocks[0].title, 'Already saved');
  liveState = 'acted_on';
  const done = await propose('HOME_EVENT_RADAR_STATE', RADAR_STATE_MESSAGES.dismiss);
  assert.equal(done.status, 'BLOCKED');
  assert.equal(done.blocks[0].id, 'radar-write-boundary');
  liveState = 'seen';
  matchExists = false;
  assert.equal((await propose('HOME_EVENT_RADAR_STATE', RADAR_STATE_MESSAGES.dismiss)).blocks[0].title, 'Event no longer available');
  matchExists = true;
  assert.equal((await propose('HOME_EVENT_RADAR_STATE', RADAR_STATE_MESSAGES.dismiss, { surface: 'ASK_REFRESH', operationId: undefined })).status, 'NOT_APPLICABLE');
  assert.equal((await propose('HOME_EVENT_RADAR_STATE', 'Dismiss every monitored event.')).status, 'NOT_APPLICABLE');
  assert.equal((await propose('HOME_EVENT_RADAR_STATE', RADAR_STATE_MESSAGES.dismiss, { entityId: null })).status, 'NOT_APPLICABLE');
  assert.deepEqual(calls.updateState, []);
  assert.deepEqual(calls.track, []);
});

test('a viewer may save (per-user state, same as the traditional route)', async () => {
  accessRole = 'VIEWER';
  await propose('HOME_EVENT_RADAR_STATE', RADAR_STATE_MESSAGES.save);
  assert.equal(calls.updateState.length, 1);
});

// ───────────────────────────── HOME_EVENT_RADAR_MARK_DONE (confirmed) ─────────────────────────────

test('Mark done proposes a confirmation and writes nothing', async () => {
  const result = await propose('HOME_EVENT_RADAR_MARK_DONE', RADAR_MARK_DONE_MESSAGE);
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.parameters.radarMatchId, 'match-1');
  assert.equal(result.parameters.radarStateContextVersion, radarStateContextVersion('match-1', 'seen'));
  assert.match(result.confirmation.description, /recheck this home's radar risk/);
  assert.deepEqual(calls.updateState, []);
});

test('Mark done confirm writes acted_on; a state that moved while the card was open conflicts; already done writes nothing; a viewer is refused', async () => {
  const params = { radarMatchId: 'match-1', radarStateContextVersion: radarStateContextVersion('match-1', 'seen'), confirmationVersion: 1 };
  const { result } = await confirm('HOME_EVENT_RADAR_MARK_DONE', params);
  assert.deepEqual(calls.updateState, [['p1', 'match-1', 'u1', 'acted_on']]);
  assert.equal(result.reasonCode, 'HOME_EVENT_RADAR_MARKED_DONE');
  const again = await confirm('HOME_EVENT_RADAR_MARK_DONE', params);
  assert.equal(again.result.reasonCode, 'HOME_EVENT_RADAR_ALREADY_DONE');
  assert.equal(calls.updateState.length, 1);
  liveState = 'saved';
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_MARK_DONE', params)), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_MARK_DONE', params, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(calls.updateState.length, 1);
});

// ───────────────────────────── HOME_EVENT_RADAR_FEEDBACK (confirmed) ─────────────────────────────

test('Feedback proposes the traditional page\'s five reasons, prefilled from existing feedback, with an empty comment', async () => {
  liveFeedback = { feedbackType: 'stale', note: 'old' };
  const result = await propose('HOME_EVENT_RADAR_FEEDBACK', RADAR_FEEDBACK_MESSAGE);
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  const [reason, comment] = result.confirmation.editableFields;
  assert.deepEqual(reason.options.map((option) => option.value), ['wrong_location', 'not_relevant', 'duplicate', 'stale', 'other']);
  assert.equal(reason.value, 'stale');
  assert.equal(comment.value, '');
  assert.deepEqual(calls.submitFeedback, []);
});

test('Feedback confirm writes through submitFeedback with the controller analytics; no reason or a viewer never writes', async () => {
  const { result } = await confirm('HOME_EVENT_RADAR_FEEDBACK', { radarFeedback: { matchId: 'match-1', feedbackType: 'not_relevant', comment: 'We are inland' } });
  assert.deepEqual(calls.submitFeedback, [['p1', 'match-1', 'u1', 'not_relevant', 'We are inland']]);
  assert.equal(calls.track[0].metadataJson.actionType, 'submit_match_feedback');
  assert.equal(result.reasonCode, 'HOME_EVENT_RADAR_FEEDBACK_SENT');
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_FEEDBACK', { radarFeedback: { matchId: 'match-1', feedbackType: null, comment: null } })), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await codeOf(confirm('HOME_EVENT_RADAR_FEEDBACK', { radarFeedback: { matchId: 'match-1', feedbackType: 'stale', comment: null } }, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  assert.equal(calls.submitFeedback.length, 1);
});

test('Feedback edits reject an unknown field, an unlisted reason, and an over-long comment before touching anything', async () => {
  const parameters = { radarFeedback: { matchId: 'match-1', feedbackType: null, comment: null }, confirmationVersion: 1 };
  const edit = (edits) => codeOf(editHomeEventRadarFeedbackConfirmation(execution('HOME_EVENT_RADAR_FEEDBACK'), parameters, { confirmationVersion: 1, edits }, 'u1'));
  assert.equal(await edit({ matchId: 'match-2' }), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await edit({ feedbackType: 'helpful' }), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await edit({ comment: 'x'.repeat(501) }), 'ASK_INVALID_CONFIRMATION_EDIT');
});
