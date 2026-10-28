const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Bringing back a dismissed guided journey and the optional dismissal reason (FRD v1.462; owner rulings D3a and D3b, 2026-10-28).
// The service runs against an in-memory fake of the two guidance tables; the Ask layer runs over the real service. No database, browser or native module.

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const protectionContext = require('../../src/services/protection/context.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const handler = require('../../src/services/ask/handlers/guidanceOverview.handler.ts');
const restore = require('../../src/services/ask/support/guidanceJourneyRestore.ts');

const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, protection: protectionContext.getProtectionContextDecisions, reconcile: executeOperation.reconcileAskExecutionSideEffects };
const T0 = new Date('2026-10-01T00:00:00.000Z');
let db;
let role;

const journey = (over = {}) => ({
  id: 'j1', propertyId: 'p1', status: 'DISMISSED', version: 4, journeyTypeKey: 'asset_lifecycle_resolution', issueDomain: 'ASSET_LIFECYCLE', scopeCategory: 'ITEM', inventoryItemId: 'item-1', serviceKey: null,
  primarySignalId: 'sig-1', primarySignal: { id: 'sig-1', status: 'ACTIVE', signalIntentFamily: 'lifecycle_end_or_past_life' }, inventoryItem: { id: 'item-1', name: 'Water heater' },
  dismissedAt: new Date('2026-10-10T00:00:00.000Z'), dismissedReason: 'I already took care of it', steps: [], ...over,
});
const dismissal = (from = 'ACTIVE') => ({ id: 'e1', journeyId: 'j1', eventType: 'JOURNEY_DISMISSED', fromJourneyStatus: from, createdAt: new Date('2026-10-10T00:00:00.000Z') });

function install(over = {}) {
  db = { journeys: [journey(over.journey ?? {}), ...(over.others ?? [])], events: over.noEvent ? [] : [dismissal(over.from)], created: [], updates: [], raceLost: false };
  const matches = (row, where) => Object.entries(where).every(([key, want]) => {
    if (key === 'id' && want && typeof want === 'object' && 'not' in want) return row.id !== want.not;
    if (want && typeof want === 'object' && 'in' in want) return want.in.includes(row[key]);
    if (want && typeof want === 'object' && 'gte' in want) return row[key] && row[key] >= want.gte;
    return row[key] === want;
  });
  const guidanceJourney = {
    findFirst: async ({ where }) => db.journeys.find((row) => matches(row, where)) ?? null,
    findMany: async ({ where, take }) => db.journeys.filter((row) => matches(row, where)).slice(0, take),
    updateMany: async ({ where, data }) => {
      if (db.raceLost) return { count: 0 };
      const row = db.journeys.find((entry) => matches(entry, where)); if (!row) return { count: 0 };
      db.updates.push(data); Object.assign(row, { ...data, version: row.version + 1 }); return { count: 1 };
    },
  };
  const guidanceJourneyEvent = {
    findFirst: async ({ where }) => db.events.filter((row) => row.journeyId === where.journeyId && row.eventType === where.eventType).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
    create: async ({ data }) => { db.created.push(data); return data; },
  };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'guidanceJourney') return guidanceJourney;
    if (model === 'guidanceJourneyEvent') return guidanceJourneyEvent;
    if (['guidanceSignal', 'guidanceJourneyStep', 'guidanceStepEvidence'].includes(String(model))) return {};
    if (model === 'askExecution') return { findMany: async () => [] };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  role = 'CONTRIBUTOR';
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  protectionContext.getProtectionContextDecisions = async () => ({ reconciliation: { suppressedGuidanceSignalIds: [], suppressionReasons: {} } });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
}
test.beforeEach(() => install());
test.afterEach(() => { prismaModule.prisma = originals.prisma; propertyAccess.resolvePropertyAccess = originals.access; protectionContext.getProtectionContextDecisions = originals.protection; executeOperation.reconcileAskExecutionSideEffects = originals.reconcile; });

// ───────────────────────────── the dismissal reason (D3b) ─────────────────────────────

test('a reason is optional, closed-list plus a short note; "rather not say" and an empty answer store nothing', () => {
  const text = (answer) => restore.dismissalReasonText(restore.GuidanceDismissReasonAnswerSchema.parse(answer));
  assert.equal(text({}), null);
  assert.equal(text({ reason: '', note: '' }), null);
  assert.equal(text({ reason: 'PREFER_NOT_TO_SAY' }), null);
  assert.equal(text({ reason: 'NOT_NOW' }), 'It is not a priority right now');
  assert.equal(text({ reason: 'ALREADY_HANDLED', note: ' called a plumber ' }), 'I already took care of it: called a plumber');
  assert.equal(text({ note: 'just a note' }), 'just a note');
  for (const bad of [{ reason: 'MADE_UP' }, { note: 'x'.repeat(301) }, { reason: 'NOT_NOW', extra: 1 }]) assert.equal(restore.GuidanceDismissReasonAnswerSchema.safeParse(bad).success, false, JSON.stringify(bad));
});

const dismissLaunch = (over = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'GUIDANCE_JOURNEY', entityId: 'j1', operationId: 'GUIDANCE_JOURNEY_DISMISS', sourceExecutionId: 'exec-view', ...over });
const ctx = (parameters, accessRole = 'CONTRIBUTOR') => ({ userId: 'u1', execution: { id: 'exec-w', propertyId: 'p1', createdAt: new Date() }, access: { role: accessRole }, parameters, command: getAskDomainCommandByOperation('GUIDANCE_JOURNEY_DISMISS') });

test('dismissing with a reason records it, and the receipt offers to undo; with none it still dismisses', async () => {
  install({ journey: { status: 'ACTIVE', dismissedAt: null, dismissedReason: null } });
  const written = [];
  const saved = guidanceJourneyService.dismissJourney;
  guidanceJourneyService.dismissJourney = async (...args) => { written.push(args); db.journeys[0].status = 'DISMISSED'; return {}; };
  try {
    const withReason = await handler.guidanceJourneyDismissResult('u1', 'p1', handler.GUIDANCE_JOURNEY_DISMISS_MESSAGE, dismissLaunch(), { reason: 'NOT_NOW', note: 'after winter' });
    assert.equal(withReason.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(withReason.confirmation.fields.map((f) => [f.label, f.value]), [['Journey', 'Water heater: Aging System'], ['Reason', 'It is not a priority right now: after winter']]);
    const out = await confirmCapabilityInvoke('GUIDANCE_JOURNEY_DISMISS', ctx(withReason.parameters));
    assert.deepEqual(written, [['p1', 'j1', 'u1', 'It is not a priority right now: after winter']]);
    const undo = out.result.blocks[0].actions[0];
    assert.deepEqual([undo.id, undo.message, undo.operationId, undo.entityType, undo.entityId], ['restore-guided-journey', restore.GUIDANCE_JOURNEY_RESTORE_MESSAGE, 'GUIDANCE_JOURNEY_DISMISS', 'GUIDANCE_JOURNEY', 'j1']);

    install({ journey: { status: 'ACTIVE', dismissedAt: null, dismissedReason: null } });
    written.length = 0;
    for (const empty of [{}, { reason: 'PREFER_NOT_TO_SAY' }]) {
      db.journeys[0].status = 'ACTIVE';
      const none = await handler.guidanceJourneyDismissResult('u1', 'p1', handler.GUIDANCE_JOURNEY_DISMISS_MESSAGE, dismissLaunch(), empty);
      assert.equal(none.confirmation.fields[1].value, 'None given');
      await confirmCapabilityInvoke('GUIDANCE_JOURNEY_DISMISS', ctx(none.parameters));
    }
    assert.deepEqual(written.map((args) => args[3]), [null, null], 'no reason is stored, and none was required');
    db.journeys[0].status = 'ACTIVE';
    const invalid = await handler.guidanceJourneyDismissResult('u1', 'p1', handler.GUIDANCE_JOURNEY_DISMISS_MESSAGE, dismissLaunch(), { reason: 'MADE_UP' });
    assert.equal(invalid.reasonCode, 'GUIDANCE_JOURNEY_DISMISS_REASON_INVALID');
  } finally { guidanceJourneyService.dismissJourney = saved; }
});

// ───────────────────────────── the service (D3a) ─────────────────────────────

test('a dismissed journey returns to the status it held, read from its dismissal event, and nothing else about it changes', async () => {
  for (const from of ['ACTIVE', 'NOT_STARTED']) {
    install({ from });
    const assessed = await guidanceJourneyService.assessJourneyRestoration('p1', 'j1');
    assert.equal(assessed.outcome, 'RESTORABLE');
    assert.equal(assessed.restoreTo, from);
    const out = await guidanceJourneyService.restoreJourney('p1', 'j1', 'u1');
    assert.equal(out.restored, true);
    assert.deepEqual([db.journeys[0].status, db.journeys[0].dismissedAt, db.journeys[0].dismissedReason], [from, null, null]);
    assert.equal(db.updates[0].version.increment, 1);
    assert.equal(Object.keys(db.updates[0]).includes('steps'), false, 'steps and history are untouched');
  }
});

test('restoring records one auditable event naming the dismissal it undoes, and a second restore records nothing', async () => {
  const first = await guidanceJourneyService.restoreJourney('p1', 'j1', 'u1');
  assert.equal(first.restored, true);
  assert.equal(db.created.length, 1);
  const event = db.created[0];
  assert.deepEqual([event.eventType, event.fromJourneyStatus, event.toJourneyStatus, event.actorType, event.actorUserId, event.reasonCode], ['JOURNEY_STATUS_CHANGED', 'DISMISSED', 'ACTIVE', 'USER', 'u1', 'USER_RESTORED']);
  assert.deepEqual(event.payloadJson, { dismissedAt: '2026-10-10T00:00:00.000Z', dismissedReason: 'I already took care of it' });
  const again = await guidanceJourneyService.restoreJourney('p1', 'j1', 'u1');
  assert.equal(again.restored, false);
  assert.equal(db.created.length, 1, 'idempotent: no second event');
  db.journeys[0].status = 'DISMISSED'; db.raceLost = true; db.created.length = 0;
  assert.equal((await guidanceJourneyService.restoreJourney('p1', 'j1', 'u1')).restored, false, 'a concurrent restore that lost the race writes nothing');
  assert.deepEqual(db.created, []);
});

test('it is refused, with the reason, when its dismissal state, item, signal or place is gone', async () => {
  const refused = async (setup) => { install(setup); const out = await guidanceJourneyService.assessJourneyRestoration('p1', 'j1'); return [out.outcome, out.reasonCode]; };
  assert.deepEqual(await refused({ noEvent: true }), ['NOT_RESTORABLE', 'GUIDANCE_JOURNEY_NO_RECORDED_STATE']);
  assert.deepEqual(await refused({ from: 'COMPLETED' }), ['NOT_RESTORABLE', 'GUIDANCE_JOURNEY_NO_RECORDED_STATE']);
  assert.deepEqual(await refused({ journey: { inventoryItemId: null, inventoryItem: null } }), ['NOT_RESTORABLE', 'GUIDANCE_JOURNEY_ITEM_REMOVED']);
  assert.deepEqual(await refused({ journey: { primarySignal: { id: 'sig-1', status: 'RESOLVED' } } }), ['NOT_RESTORABLE', 'GUIDANCE_JOURNEY_SIGNAL_INACTIVE']);
  assert.deepEqual(await refused({ others: [journey({ id: 'j2', status: 'ACTIVE' })] }), ['NOT_RESTORABLE', 'GUIDANCE_JOURNEY_NEWER_EXISTS']);
  assert.deepEqual(await refused({ journey: { status: 'COMPLETED' } }), ['NOT_RESTORABLE', 'GUIDANCE_JOURNEY_NOT_DISMISSED']);
  install({ noEvent: true });
  await assert.rejects(() => guidanceJourneyService.restoreJourney('p1', 'j1', 'u1'), (e) => e.statusCode === 409 && e.code === 'GUIDANCE_JOURNEY_NO_RECORDED_STATE');
  assert.deepEqual(db.created, []);
  await assert.rejects(() => guidanceJourneyService.assessJourneyRestoration('p1', 'nope'), (e) => e.code === 'GUIDANCE_JOURNEY_NOT_FOUND');
});

test('only recently dismissed journeys are listed, newest first, capped', async () => {
  install({ others: [journey({ id: 'old', dismissedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }), journey({ id: 'new', dismissedAt: new Date() })] });
  db.journeys[0].dismissedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const listed = await guidanceJourneyService.listRecentlyDismissedJourneys('p1', { limit: 5 });
  assert.deepEqual(listed.map((row) => row.id).sort(), ['j1', 'new'], 'the journey dismissed 200 days ago is not offered');
});

// ───────────────────────────── Ask ─────────────────────────────

const RESTORE = restore.GUIDANCE_JOURNEY_RESTORE_MESSAGE;
const restoreLaunch = (over = {}) => dismissLaunch(over);
const invoke = (message, launchContext, accessRole = 'CONTRIBUTOR') => capabilityInvoke('GUIDANCE_JOURNEY_DISMISS', { userId: 'u1', propertyId: 'p1', message, launchContext }, { propertyAccess: { role: accessRole, userId: 'u1', propertyId: 'p1' } });

test('restoring is declared-action only, contributor floor, and confirmation-gated; nothing is written by asking', async () => {
  assert.notEqual(resolveAskRoutingCascade(RESTORE, { localRoutingEnabled: true }).operation?.operationId, 'GUIDANCE_JOURNEY_DISMISS');
  assert.equal((await invoke(RESTORE, restoreLaunch({ surface: 'ASK_REFRESH' }))).reasonCode, 'GUIDANCE_JOURNEY_REQUIRED');
  assert.equal((await invoke(RESTORE, restoreLaunch({ operationId: 'GUIDANCE_JOURNEY_CONTINUE' }))).reasonCode, 'GUIDANCE_JOURNEY_REQUIRED');
  assert.equal((await invoke(RESTORE, undefined)).reasonCode, 'GUIDANCE_JOURNEY_REQUIRED');
  role = 'VIEWER';
  assert.equal((await invoke(RESTORE, restoreLaunch(), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  role = 'CONTRIBUTOR';
  const proposal = await invoke(RESTORE, restoreLaunch());
  assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
  assert.equal(proposal.confirmation.confirmLabel, 'Bring it back');
  assert.match(proposal.confirmation.description, /in progress, as it was before it was dismissed/);
  assert.deepEqual(proposal.confirmation.fields.map((f) => f.label), ['Journey', 'You dismissed it because']);
  assert.deepEqual(db.created, []);
  assert.equal(db.journeys[0].status, 'DISMISSED');
});

test('confirming restores through the service; stale, viewer and already-open cases are handled', async () => {
  const proposal = await invoke(RESTORE, restoreLaunch());
  await assert.rejects(() => confirmCapabilityInvoke('GUIDANCE_JOURNEY_DISMISS', ctx(proposal.parameters, 'VIEWER')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
  const out = await confirmCapabilityInvoke('GUIDANCE_JOURNEY_DISMISS', ctx(proposal.parameters));
  assert.equal(out.result.reasonCode, 'GUIDANCE_JOURNEY_RESTORED');
  assert.equal(db.journeys[0].status, 'ACTIVE');
  assert.equal(db.created.length, 1);
  const again = await confirmCapabilityInvoke('GUIDANCE_JOURNEY_DISMISS', ctx(proposal.parameters));
  assert.equal(again.result.reasonCode, 'GUIDANCE_JOURNEY_ALREADY_RESTORED');
  assert.equal(db.created.length, 1, 'a replay writes nothing');
  assert.equal((await invoke(RESTORE, restoreLaunch())).reasonCode, 'GUIDANCE_JOURNEY_ALREADY_RESTORED');

  install();
  const fresh = await invoke(RESTORE, restoreLaunch());
  db.journeys[0].version = 9;
  await assert.rejects(() => confirmCapabilityInvoke('GUIDANCE_JOURNEY_DISMISS', ctx(fresh.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(db.created.length, 0);
});

test('a journey that is no longer valid is explained, offers a new plan, and writes nothing', async () => {
  install({ journey: { inventoryItemId: null, inventoryItem: null } });
  const result = await invoke(RESTORE, restoreLaunch());
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEY_ITEM_REMOVED');
  assert.match(result.blocks[0].body, /no longer in your home record/);
  assert.deepEqual(result.blocks[0].suggestions, ['Start a guided plan', 'Show my guided journeys']);
  assert.equal(result.confirmation, undefined);
  assert.deepEqual(db.created, []);
});

test('the dismissed journey offers Bring back to a contributor, and the guided journeys list shows what was set aside', async () => {
  const ended = handler.guidanceJourneyContinuation(db.journeys[0], 'p1', { requestedJourneyId: 'j1', canContribute: true });
  assert.deepEqual(ended.blocks[0].actions.map((a) => [a.id, a.message, a.operationId]), [['restore-guided-journey', RESTORE, 'GUIDANCE_JOURNEY_DISMISS']]);
  assert.deepEqual(handler.guidanceJourneyContinuation(db.journeys[0], 'p1', { requestedJourneyId: 'j1', canContribute: false }).blocks[0].actions, []);
  assert.match(ended.blocks[0].body, /unless you bring it back/);

  const view = { journeys: [], next: [] };
  const shown = handler.guidanceJourneysFromView(view, new Set(), 'p1', true, [db.journeys[0]]);
  const block = shown.blocks.find((b) => b.id === 'guidance-journeys-set-aside');
  const row = block.sections[0].items[0];
  assert.deepEqual([row.id, row.entityType, row.meta, row.actions.map((a) => [a.id, a.interactionType, a.entityId])], ['j1', 'GUIDANCE_JOURNEY', ['Reason: I already took care of it'], [['restore-guided-journey', 'MUTATE_RECORD', 'j1']]]);
  assert.equal(handler.guidanceJourneysFromView(view, new Set(), 'p1', false, [db.journeys[0]]).blocks.some((b) => b.id === 'guidance-journeys-set-aside'), false, 'a viewer is offered nothing');
});

test('the restore action is allowlisted wherever it appears and refused to a viewer', () => {
  const action = { id: 'restore-guided-journey', label: 'Bring back', interactionType: 'START_WORKFLOW', message: RESTORE, operationId: 'GUIDANCE_JOURNEY_DISMISS', style: 'SECONDARY' };
  for (const operationId of ['GUIDANCE_JOURNEYS_LIST', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEY_DISMISS']) {
    assert.equal(isAskActionApplicable({ action, operationId, propertyId: 'p1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, operationId);
  }
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'CONTRIBUTOR'), true);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'VIEWER'), false);
});
