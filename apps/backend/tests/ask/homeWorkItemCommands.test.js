const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Maintenance and Home Operations": the work-items list, snooze, reschedule and routine bulk-accept (FRD v1.342). No database, browser or native module.

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
const getUse = require('../../src/modules/homeOperations/application/getWorkItem.usecase.ts');
const listUse = require('../../src/modules/homeOperations/application/listWorkItems.usecase.ts');
const snoozeUse = require('../../src/modules/homeOperations/application/snoozeWorkItem.usecase.ts');
const reschedUse = require('../../src/modules/homeOperations/application/rescheduleWorkItem.usecase.ts');
const batchUse = require('../../src/modules/homeOperations/application/batchTransitionWorkItems.usecase.ts');
const command = require('../../src/services/ask/support/homeWorkItemCommand.ts');
const { homeWorkItemsFromRows } = require('../../src/services/ask/handlers/homeWorkItems.handler.ts');

const OP = 'HOME_WORK_ITEM_COMMAND';
const M = command.WORK_ITEM_MESSAGES;
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const iso = (v) => (v ? v.toISOString() : '');
const item = (over = {}) => ({ id: 'w1', propertyId: 'prop-1', title: 'Flush water heater', state: 'ACCEPTED', safetyTier: 'LOW_CONSEQUENCE', obligationType: 'MAINTENANCE', dueAt: new Date('2026-10-01T12:00:00Z'), dueWindowStart: null, dueWindowEnd: null, snoozedUntil: null, supersededByWorkItemId: null, ownerUserId: null, isRoutine: false, ...over });
const version = (kind, i) => sha(`work-item:${kind}:${i.id}:${i.state}:${iso(i.dueAt)}:${iso(i.dueWindowStart)}:${iso(i.dueWindowEnd)}:${iso(i.snoozedUntil)}:${i.supersededByWorkItemId ?? ''}`);
const batchVersion = (items) => sha(`work-batch:${items.map((i) => `${i.id}:${i.state}`).sort().join('|')}`);

function install(role, items = [item()]) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: getUse.getWorkItem, l: listUse.listWorkItems, s: snoozeUse.snoozeWorkItem, r: reschedUse.rescheduleWorkItem, b: batchUse.batchTransitionWorkItems, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  getUse.getWorkItem = async (id) => items.find((i) => i.id === id) ?? null;
  listUse.listWorkItems = async () => items;
  snoozeUse.snoozeWorkItem = async (a) => { calls.push(['snooze', a]); return {}; };
  reschedUse.rescheduleWorkItem = async (a) => { calls.push(['reschedule', a]); return {}; };
  batchUse.batchTransitionWorkItems = async (a) => { calls.push(['batch', a]); return a.workItemIds.map((id) => ({ workItemId: id, success: true })); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; getUse.getWorkItem = saved.g; listUse.listWorkItems = saved.l; snoozeUse.snoozeWorkItem = saved.s; reschedUse.rescheduleWorkItem = saved.r; batchUse.batchTransitionWorkItems = saved.b; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: command.WORK_ITEM_ENTITY_TYPE, entityId: 'w1', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('routing: the list is typed; the commands are declared-action only; contributor floor', () => {
  assert.equal(resolveAskRoutingCascade('Show my home operations work items', { localRoutingEnabled: true }).operation?.operationId, 'HOME_WORK_ITEMS');
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
});

test('the list drops finished or replaced work, sorts by due date, and offers controls and the batch only to contributors', () => {
  const rows = [
    item({ id: 'late', title: 'Late', dueAt: new Date('2026-12-01T12:00:00Z') }), item({ id: 'soon', title: 'Soon', dueAt: new Date('2026-10-01T12:00:00Z') }),
    item({ id: 'done', state: 'CLOSED' }), item({ id: 'dup', supersededByWorkItemId: 'soon' }),
    item({ id: 'cand', title: 'Routine', state: 'CANDIDATE', dueAt: null }),
  ];
  const view = (canChange) => homeWorkItemsFromRows(rows, canChange, new Date('2026-09-15T00:00:00Z'));
  const contributor = view(true);
  assert.deepEqual(contributor.blocks[1].sections[0].items.map((i) => i.id), ['soon', 'late', 'cand']);
  assert.deepEqual(contributor.blocks[1].sections[0].items[0].actions.map((a) => a.id), ['work-item-snooze', 'work-item-reschedule']);
  assert.deepEqual(contributor.blocks[0].actions.map((a) => a.id), ['work-items-accept-routine']);
  const viewer = view(false);
  assert.ok(viewer.blocks[1].sections[0].items.every((i) => i.actions.length === 0));
  assert.deepEqual(viewer.blocks[0].actions, []);
  assert.equal(homeWorkItemsFromRows([item({ state: 'CLOSED' })], true, new Date()).reasonCode, 'NO_OPEN_WORK_ITEMS');
});

test('snooze and reschedule: form, then a review with before and after; nothing is written; viewers, refresh, finished work refused', async () => {
  let w = install('VIEWER');
  try { assert.equal((await invoke('SNOOZE', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('SNOOZE', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_HOME_WORK_ITEM_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke('SNOOZE', launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.contextVersion, version('SNOOZE', item()));
    const { workItemCommandResult } = require('../../src/services/ask/handlers/homeWorkItemCommands.handler.ts');
    const snooze = await workItemCommandResult('u1', 'prop-1', { kind: 'SNOOZE', entityId: 'w1', sourceExecutionId: null }, { snooze: 'ONE_WEEK' });
    assert.equal(snooze.status, 'NEEDS_CONFIRMATION');
    assert.match(snooze.confirmation.fields[1].value, /Not snoozed → Snoozed until/);
    const resched = await workItemCommandResult('u1', 'prop-1', { kind: 'RESCHEDULE', entityId: 'w1', sourceExecutionId: null }, { dueAt: '2026-11-15' });
    assert.match(resched.confirmation.fields[1].value, /→ /);
    const bad = await workItemCommandResult('u1', 'prop-1', { kind: 'SNOOZE', entityId: 'w1', sourceExecutionId: null }, { snooze: 'FOREVER' });
    assert.equal(bad.reasonCode, 'HOME_WORK_ITEM_INPUT_INVALID');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', [item({ state: 'CLOSED' })]);
  try { assert.equal((await invoke('SNOOZE', launch())).reasonCode, 'HOME_WORK_ITEM_FINISHED'); } finally { w.restore(); }
});

test('confirming calls the usecases the routes call; a changed item or finished work writes nothing', async () => {
  const w = install('CONTRIBUTOR');
  try {
    const v = version('SNOOZE', item());
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'SNOOZE', entityId: 'w1' }, workItemChange: { snoozedUntil: '2026-10-01T00:00:00.000Z' }, workItemContextVersion: v }));
    assert.equal(w.calls[0][0], 'snooze');
    assert.equal(w.calls[0][1].workItemId, 'w1');
    assert.equal(w.calls[0][1].snoozedUntil.toISOString(), '2026-10-01T00:00:00.000Z');
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'SNOOZE', entityId: 'w1' }, workItemChange: { snoozedUntil: null }, workItemContextVersion: v }));
    assert.equal(w.calls[1][1].snoozedUntil, null);
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'RESCHEDULE', entityId: 'w1' }, workItemChange: { dueAt: '2026-11-15T12:00:00.000Z' }, workItemContextVersion: version('RESCHEDULE', item()) }));
    assert.equal(w.calls[2][0], 'reschedule');
    assert.equal(w.calls[2][1].dueAt.toISOString(), '2026-11-15T12:00:00.000Z');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'SNOOZE', entityId: 'w1' }, workItemChange: { snoozedUntil: null }, workItemContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'SNOOZE', entityId: 'w1' }, workItemChange: {}, workItemContextVersion: v })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
});

test('accept routine: lists exactly the low-consequence candidates, binds to that set, and accepts only that set', async () => {
  const items = [
    item({ id: 'c1', state: 'CANDIDATE', title: 'Check detectors' }), item({ id: 'c2', state: 'CANDIDATE', title: 'Clean gutters' }),
    item({ id: 'hi', state: 'CANDIDATE', safetyTier: 'SAFETY_CRITICAL', title: 'Gas smell' }), item({ id: 'acc', state: 'ACCEPTED' }),
  ];
  let w = install('CONTRIBUTOR', items);
  try {
    const review = await invoke('ACCEPT_ROUTINE', { operationId: OP, surface: 'ASK_PAGE' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.parameters.workItemBatchIds, ['c1', 'c2']);
    assert.equal(review.contextVersion, batchVersion([{ id: 'c1', state: 'CANDIDATE' }, { id: 'c2', state: 'CANDIDATE' }]));
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'ACCEPT_ROUTINE', entityId: null }, workItemBatchIds: ['c1', 'c2'], workItemContextVersion: review.contextVersion }));
    assert.deepEqual(w.calls[0], ['batch', { propertyId: 'prop-1', workItemIds: ['c1', 'c2'], actorUserId: 'u1' }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'ACCEPT_ROUTINE', entityId: null }, workItemBatchIds: ['c1'], workItemContextVersion: review.contextVersion })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', [item()]);
  try { assert.equal((await invoke('ACCEPT_ROUTINE', { operationId: OP, surface: 'ASK_PAGE' })).reasonCode, 'HOME_WORK_ITEMS_NO_ROUTINE_CANDIDATES'); } finally { w.restore(); }
});

test('the action ids are allowlisted on the list and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.WORK_ITEM_ACTION_IDS)) assert.equal(applicable(id, 'HOME_WORK_ITEMS'), true, id);
  assert.equal(applicable('home-work-items-back', OP), true);
});
