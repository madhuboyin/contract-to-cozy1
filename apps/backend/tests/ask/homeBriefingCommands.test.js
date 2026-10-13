const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P1 "Home Briefing": read, prepare, settings and item readings (FRD v1.327). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const service = require('../../src/homeBriefing/homeBriefing.service.ts');
const command = require('../../src/services/ask/support/homeBriefingCommand.ts');
const { homeBriefingFromView } = require('../../src/services/ask/handlers/homeBriefing.handler.ts');

const OP = 'HOME_BRIEFING_COMMAND';
const M = command.BRIEFING_COMMAND_MESSAGES;
const ITEM = '11111111-1111-4111-8111-111111111111';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('the preferences form mirrors the route: a place to send it is required', () => {
  const p = command.parseBriefingPreferencesAnswer;
  assert.equal(p({ enabled: 'YES', cadence: 'WEEKLY', topics: [], channels: ['IN_APP'] }).success, true);
  assert.equal(p({ enabled: 'YES', cadence: 'WEEKLY', topics: [], channels: [] }).success, false);
  assert.equal(p({ enabled: 'MAYBE', cadence: 'WEEKLY', channels: ['EMAIL'] }).success, false);
  assert.deepEqual(command.briefingPreferencesInput(p({ enabled: 'NO', cadence: 'MONTHLY', channels: ['EMAIL'] }).data), { enabled: false, cadence: 'MONTHLY', topics: [], channels: ['EMAIL'] });
});

test('briefing phrasing routes to the view; what changed recently does not', () => {
  const route = (m) => resolveAskRoutingCascade(m, { localRoutingEnabled: true }).operation?.operationId;
  for (const m of ['Show my home briefing', 'What is in my briefing?', 'Show my briefing settings']) assert.equal(route(m), 'HOME_BRIEFING_VIEW', m);
  assert.notEqual(route('What changed recently for this home?'), 'HOME_BRIEFING_VIEW');
  for (const m of Object.values(M)) assert.notEqual(route(m), OP, m);
});

const view = (over = {}) => ({
  preference: { enabled: true, cadence: 'WEEKLY', topics: [], channels: ['IN_APP'] },
  current: { generatedAt: new Date('2026-10-01'), items: [{ id: ITEM, title: 'Permit closed nearby', summary: 'A permit on your street closed.', topic: 'LOCAL_CHANGE', materiality: 'MEDIUM', seenAt: null, actedAt: null, dismissedAt: null, notUsefulAt: null }] },
  archive: [], unreadMaterialCount: 1, archiveBoundary: 'Earlier updates.', editorialBoundary: 'Written from verified records.', ...over,
});

test('the answer offers settings and a fresh briefing and per-item readings to a contributor, nothing to a viewer', () => {
  const full = homeBriefingFromView(view(), 'prop-1', true);
  assert.deepEqual(full.blocks[0].actions.map((a) => a.id), ['home-briefing-generate', 'home-briefing-preferences']);
  const row = full.blocks.find((b) => b.id === 'home-briefing-items').sections[0].items[0];
  assert.deepEqual(row.actions.map((a) => a.id), ['home-briefing-seen', 'home-briefing-dismiss', 'home-briefing-not-useful']);
  const seen = homeBriefingFromView(view({ current: { ...view().current, items: [{ ...view().current.items[0], seenAt: new Date() }] } }), 'prop-1', true);
  assert.deepEqual(seen.blocks.find((b) => b.id === 'home-briefing-items').sections[0].items[0].actions, []);
  const viewer = homeBriefingFromView(view(), 'prop-1', false);
  assert.deepEqual(viewer.blocks[0].actions, [], 'the pure view offers nothing without canChange; the handler passes true for a caller-scoped briefing');
  const off = homeBriefingFromView(view({ preference: { enabled: false, cadence: 'WEEKLY', topics: [], channels: ['IN_APP'] }, current: null }), 'prop-1', true);
  assert.deepEqual(off.blocks[0].actions.map((a) => a.id), ['home-briefing-preferences']);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId, style: 'SECONDARY' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.BRIEFING_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'HOME_BRIEFING_VIEW'), true, id);
  assert.equal(applicable('home-briefing-back', OP), true);
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData() {
  const saved = { p: prisma.homeBriefingPreference, d: prisma.homeBriefingDelivery, i: prisma.homeBriefingItem };
  prisma.homeBriefingPreference = { findUnique: async () => null };
  prisma.homeBriefingDelivery = { findFirst: async () => null };
  prisma.homeBriefingItem = { findFirst: async (a) => (a.where.id === ITEM ? { id: ITEM, title: 'Permit closed nearby', updatedAt: UPDATED, seenAt: null } : null) };
  return () => { prisma.homeBriefingPreference = saved.p; prisma.homeBriefingDelivery = saved.d; prisma.homeBriefingItem = saved.i; };
}
const invoke = (message, launchContext) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext });
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.briefingCommandEntityType(kind), ...over });

test('declared-action only; a viewer may change their own briefing; settings open a form seeded with defaults; generate and item readings ask for confirmation', async () => {
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'VIEWER');
  assert.equal(getAskDomainCommandByOperation(OP).authorization, 'CALLER_SCOPED');
  const restore = withData();
  const as = async (role, m, l) => { const r = withRole(role); try { return await invoke(m, l); } finally { r(); } };
  try {
    assert.equal((await as('CONTRIBUTOR', M.GENERATE, launch('GENERATE', 'prop-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_HOME_BRIEFING_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await as('VIEWER', M.GENERATE, launch('GENERATE', 'prop-1'))).status, 'NEEDS_CONFIRMATION', 'a viewer prepares their own briefing');
    const form = await as('CONTRIBUTOR', M.PREFERENCES, launch('PREFERENCES', 'prop-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].currentAnswer.cadence, 'WEEKLY');
    const gen = await as('CONTRIBUTOR', M.GENERATE, launch('GENERATE', 'prop-1'));
    assert.match(gen.confirmation.description, /may notify you/);
    const dismiss = await as('CONTRIBUTOR', M.DISMISS, launch('DISMISS', ITEM));
    assert.equal(dismiss.status, 'NEEDS_CONFIRMATION');
    assert.equal((await as('CONTRIBUTOR', M.DISMISS, launch('DISMISS', 'nope'))).reasonCode, 'HOME_BRIEFING_ITEM_NOT_FOUND');
  } finally { restore(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('confirming calls the canonical functions with the route\'s input; a stale version writes nothing', async () => {
  const restore = withData();
  const names = ['generateHomeBriefing', 'updateHomeBriefingPreference', 'recordHomeBriefingItemOutcome'];
  const saved = Object.fromEntries(names.map((n) => [n, service[n]]));
  const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  const calls = [];
  for (const n of names) service[n] = async (a) => { calls.push([n, a]); return { id: 'x' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const prefVersion = sha('briefing-preferences:none');
    await confirmCapabilityInvoke(OP, ctx({ briefingCommand: { kind: 'PREFERENCES', entityId: 'prop-1' }, briefingContextVersion: prefVersion, briefingForm: { enabled: 'YES', cadence: 'MONTHLY', topics: ['HAZARD'], channels: ['EMAIL'] } }));
    assert.deepEqual(calls[0], ['updateHomeBriefingPreference', { propertyId: 'prop-1', userId: 'user-1', enabled: true, cadence: 'MONTHLY', topics: ['HAZARD'], channels: ['EMAIL'] }]);
    await confirmCapabilityInvoke(OP, ctx({ briefingCommand: { kind: 'NOT_USEFUL', entityId: ITEM }, briefingContextVersion: sha(`briefing-item:NOT_USEFUL:${ITEM}:${UPDATED.toISOString()}`) }));
    assert.deepEqual(calls[1], ['recordHomeBriefingItemOutcome', { propertyId: 'prop-1', userId: 'user-1', itemId: ITEM, outcome: 'NOT_USEFUL' }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ briefingCommand: { kind: 'SEEN', entityId: ITEM }, briefingContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(calls.length, 2);
  } finally { for (const n of names) service[n] = saved[n]; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; restore(); }
});

test('hostile ids: another member\'s item is not found, and the write is always for the session user', async () => {
  const saved = prisma.homeBriefingItem;
  const wheres = [];
  prisma.homeBriefingItem = { findFirst: async (a) => { wheres.push(a.where); return null; } };
  const restoreRole = withRole('VIEWER');
  try {
    const r = await invoke(M.DISMISS, launch('DISMISS', 'someone-elses-item-id'));
    assert.equal(r.reasonCode, 'HOME_BRIEFING_ITEM_NOT_FOUND');
    assert.deepEqual(wheres[0], { id: 'someone-elses-item-id', delivery: { propertyId: 'prop-1', userId: 'user-1' } });
  } finally { prisma.homeBriefingItem = saved; restoreRole(); }
  const names = ['updateHomeBriefingPreference', 'recordHomeBriefingItemOutcome'];
  const savedFns = Object.fromEntries(names.map((n) => [n, service[n]]));
  const calls = [];
  for (const n of names) service[n] = async (a) => { calls.push(a); return {}; };
  const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  const restore = withData();
  try {
    await confirmCapabilityInvoke(OP, { ...ctx({ briefingCommand: { kind: 'PREFERENCES', entityId: 'prop-1', userId: 'victim' }, briefingContextVersion: sha('briefing-preferences:none'), briefingForm: { enabled: 'YES', cadence: 'WEEKLY', channels: ['IN_APP'] } }), userId: 'user-1' });
    assert.equal(calls.length >= 1, true);
    assert.ok(calls.every((c) => c.userId === 'user-1'), 'a hostile userId in the parameters is ignored');
  } finally { for (const n of names) service[n] = savedFns[n]; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; restore(); }
});
