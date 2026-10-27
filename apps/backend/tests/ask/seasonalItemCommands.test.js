const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Seasonal Home Care": add to maintenance, snooze, set aside, bring back (FRD v1.343). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { SeasonalChecklistService } = require('../../src/services/seasonalChecklist.service.ts');
const integration = require('../../src/services/seasonalChecklistIntegration.service.ts');
const command = require('../../src/services/ask/support/seasonalItemCommand.ts');
const { buildSeasonalMaintenanceResult } = require('../../src/services/ask/askSeasonalMaintenance.ts');

const OP = 'SEASONAL_ITEM_COMMAND';
const M = command.SEASONAL_ITEM_MESSAGES;
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const row = (over = {}) => ({ id: 'i1', title: 'Clean gutters', status: 'RECOMMENDED', priority: 'RECOMMENDED', snoozedUntil: null, updatedAt: T, maintenanceTask: null, ...over });
const version = (kind, i) => sha(`seasonal-item:${kind}:${i.id}:${i.status}:${i.priority}:${i.snoozedUntil?.toISOString() ?? ''}:${i.maintenanceTask?.id ?? ''}:${i.maintenanceTask?.status ?? ''}:${i.updatedAt.toISOString()}`);

function install(role, { item = row(), primary = true } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, i: prisma.seasonalChecklistItem, p: prisma.property, add: integration.addSeasonalTaskToMaintenance, sn: SeasonalChecklistService.snoozeTask, di: SeasonalChecklistService.dismissTask, re: SeasonalChecklistService.restoreTask, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.seasonalChecklistItem = { findFirst: async () => item };
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  integration.addSeasonalTaskToMaintenance = async (...a) => { calls.push(['add', ...a]); return { success: true, message: 'ok', task: {} }; };
  SeasonalChecklistService.snoozeTask = async (...a) => { calls.push(['snooze', ...a]); return {}; };
  SeasonalChecklistService.dismissTask = async (...a) => { calls.push(['dismiss', ...a]); return {}; };
  SeasonalChecklistService.restoreTask = async (...a) => { calls.push(['restore', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.seasonalChecklistItem = saved.i; prisma.property = saved.p; integration.addSeasonalTaskToMaintenance = saved.add; SeasonalChecklistService.snoozeTask = saved.sn; SeasonalChecklistService.dismissTask = saved.di; SeasonalChecklistService.restoreTask = saved.re; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: 'SEASONAL_ITEM', entityId: 'i1', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('which controls an item allows: add when not in maintenance, snooze and set aside for the primary holder, critical never set aside, restore only when dismissed', () => {
  const k = command.seasonalItemKinds;
  const me = { canManage: true, isPrimaryHolder: true };
  assert.deepEqual(k({ status: 'RECOMMENDED', priority: 'RECOMMENDED', maintenanceTaskId: null, completed: false }, me), ['ADD', 'SNOOZE', 'DISMISS']);
  assert.deepEqual(k({ status: 'ADDED', priority: 'CRITICAL', maintenanceTaskId: 't1', completed: false }, me), ['REMOVE', 'SNOOZE']);
  assert.deepEqual(k({ status: 'ADDED', priority: 'RECOMMENDED', maintenanceTaskId: 't1', completed: false }, { canManage: true, isPrimaryHolder: false }), ['REMOVE'], 'a contributor can unlink it; the service asks only for contributor');
  assert.deepEqual(k({ status: 'COMPLETED', priority: 'RECOMMENDED', maintenanceTaskId: 't1', completed: true }, me), [], 'a completed task cannot be removed');
  assert.deepEqual(k({ status: 'DISMISSED', priority: 'OPTIONAL', maintenanceTaskId: null, completed: false }, me), ['RESTORE']);
  assert.deepEqual(k({ status: 'COMPLETED', priority: 'OPTIONAL', maintenanceTaskId: 't1', completed: true }, me), []);
  assert.deepEqual(k({ status: 'RECOMMENDED', priority: 'RECOMMENDED', maintenanceTaskId: null, completed: false }, { canManage: true, isPrimaryHolder: false }), ['ADD']);
  assert.deepEqual(k({ status: 'RECOMMENDED', priority: 'RECOMMENDED', maintenanceTaskId: null, completed: false }, { canManage: false, isPrimaryHolder: true }), []);
});

test('the seasonal answer rows carry the controls for the right person only', () => {
  const context = {
    checklists: [{
      id: 'c1', season: 'FALL', year: 2026, status: 'ACTIVE', seasonStartDate: new Date('2026-09-01'), seasonEndDate: new Date('2026-12-01'), updatedAt: T,
      items: [{ id: 'i1', title: 'Clean gutters', description: null, taskKey: 'x', priority: 'RECOMMENDED', status: 'RECOMMENDED', recommendedDate: null, snoozedUntil: null, maintenanceTask: null, updatedAt: T }],
    }],
  };
  const build = (who) => buildSeasonalMaintenanceResult({ message: 'What fall tasks are pending?', propertyId: 'prop-1', propertyTimezone: 'UTC', context, contextAvailable: true, now: new Date('2026-10-01'), ...who });
  const actions = (who) => build(who).blocks.find((b) => b.id === 'seasonal-maintenance-items').sections.flatMap((s) => s.items).flatMap((i) => i.actions.map((a) => a.id));
  assert.deepEqual(actions({ canManage: true, isPrimaryHolder: true }), ['seasonal-item-add', 'seasonal-item-snooze', 'seasonal-item-dismiss']);
  assert.deepEqual(actions({ canManage: true, isPrimaryHolder: false }), ['seasonal-item-add']);
  assert.deepEqual(actions({}), []);
});

test('declared-action only, contributor floor; viewers refused; non-primary holders refused for snooze, set aside and bring back; critical not set aside', async () => {
  assert.notEqual(resolveAskRoutingCascade(M.ADD, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke('ADD', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { primary: false });
  try {
    assert.equal((await invoke('ADD', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_SEASONAL_ITEM_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('SNOOZE', launch())).reasonCode, 'SEASONAL_ITEM_PRIMARY_HOLDER_ONLY');
    assert.equal((await invoke('ADD', launch())).status, 'NEEDS_CONFIRMATION');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', { item: row({ priority: 'CRITICAL' }) });
  try { assert.equal((await invoke('DISMISS', launch())).reasonCode, 'SEASONAL_ITEM_STEP_NOT_AVAILABLE'); } finally { w.restore(); }
});

test('snooze opens a form then reviews the date; add, set aside and bring back review the effect; nothing is written at review', async () => {
  const { seasonalItemResult } = require('../../src/services/ask/handlers/seasonalItemCommands.handler.ts');
  let w = install('OWNER');
  try {
    assert.equal((await invoke('SNOOZE', launch())).status, 'NEEDS_CONTEXT');
    const snooze = await seasonalItemResult('u1', 'prop-1', { kind: 'SNOOZE', entityId: 'i1', sourceExecutionId: null }, { days: '14' });
    assert.equal(snooze.status, 'NEEDS_CONFIRMATION');
    assert.equal(snooze.parameters.seasonalItemDays, 14);
    assert.equal((await seasonalItemResult('u1', 'prop-1', { kind: 'SNOOZE', entityId: 'i1', sourceExecutionId: null }, { days: '3' })).reasonCode, 'SEASONAL_ITEM_INPUT_INVALID');
    assert.match((await invoke('ADD', launch())).confirmation.description, /does not schedule anyone/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('OWNER', { item: row({ status: 'DISMISSED', maintenanceTask: { id: 't1', status: 'CANCELLED' } }) });
  try { assert.match((await invoke('RESTORE', launch())).confirmation.description, /cancelled maintenance task is reactivated/); } finally { w.restore(); }
});

test('confirming calls the routes\' own services; stale, wrong-state and invalid snooze write nothing', async () => {
  let w = install('OWNER');
  try {
    const p = (kind, extra = {}, v = version(kind, row())) => ({ seasonalItemCommand: { kind, entityId: 'i1' }, seasonalItemContextVersion: v, ...extra });
    await confirmCapabilityInvoke(OP, ctx(p('ADD')));
    assert.deepEqual(w.calls[0], ['add', 'u1', 'i1']);
    await confirmCapabilityInvoke(OP, ctx(p('SNOOZE', { seasonalItemDays: 14 })));
    assert.deepEqual(w.calls[1], ['snooze', 'i1', 'u1', 14]);
    await confirmCapabilityInvoke(OP, ctx(p('DISMISS')));
    assert.deepEqual(w.calls[2], ['dismiss', 'i1', 'u1']);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('SNOOZE', { seasonalItemDays: 3 }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('ADD', {}, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('RESTORE'))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
});

test('the action ids are allowlisted on the maintenance answer and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.SEASONAL_ITEM_ACTION_IDS)) assert.equal(applicable(id, 'MAINTENANCE_STATUS'), true, id);
  assert.equal(applicable('seasonal-item-back', OP), true);
});

// ───────────────────────────── remove from maintenance; whole-checklist controls ─────────────────────────────

const checklistRow = (over = {}) => ({ id: 'c1', season: 'FALL', year: 2026, status: 'ACTIVE', updatedAt: T, items: [
  { id: 'i1', title: 'Clean gutters', status: 'RECOMMENDED', priority: 'CRITICAL' },
  { id: 'i2', title: 'Test smoke alarms', status: 'RECOMMENDED', priority: 'CRITICAL' },
  { id: 'i3', title: 'Seal windows', status: 'RECOMMENDED', priority: 'OPTIONAL' },
  { id: 'i4', title: 'Flush water heater', status: 'ADDED', priority: 'CRITICAL' },
], ...over });
const checklistVersion = (kind, c) => sha(`seasonal-checklist:${kind}:${c.id}:${c.status}:${c.updatedAt.toISOString()}:${[...c.items].map((i) => `${i.id}.${i.status}.${i.priority}`).sort().join(',')}`);

function installChecklist(role, { checklist = checklistRow(), primary = true, item = row({ status: 'ADDED', maintenanceTask: { id: 't1', status: 'PENDING' } }) } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, c: prisma.seasonalChecklist, i: prisma.seasonalChecklistItem, p: prisma.property, all: SeasonalChecklistService.addAllCriticalTasks, dis: SeasonalChecklistService.dismissChecklist, rm: integration.removeSeasonalTaskFromMaintenance, rec: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.seasonalChecklist = { findFirst: async () => checklist };
  prisma.seasonalChecklistItem = { findFirst: async () => item };
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  SeasonalChecklistService.addAllCriticalTasks = async (...a) => { calls.push(['addAll', ...a]); return { success: true, tasksAdded: checklist.items.filter((i) => i.priority === 'CRITICAL' && i.status === 'RECOMMENDED').length }; };
  SeasonalChecklistService.dismissChecklist = async (...a) => { calls.push(['dismissChecklist', ...a]); return { success: true }; };
  integration.removeSeasonalTaskFromMaintenance = async (...a) => { calls.push(['remove', ...a]); return { success: true, message: 'Task removed from maintenance checklist' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.seasonalChecklist = saved.c; prisma.seasonalChecklistItem = saved.i; prisma.property = saved.p; SeasonalChecklistService.addAllCriticalTasks = saved.all; SeasonalChecklistService.dismissChecklist = saved.dis; integration.removeSeasonalTaskFromMaintenance = saved.rm; executeOperation.reconcileAskExecutionSideEffects = saved.rec; } };
}
const CM = command.SEASONAL_CHECKLIST_MESSAGES;
const clLaunch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: 'SEASONAL_CHECKLIST', entityId: 'c1', ...over });
const clInvoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: CM[kind], launchContext });

test('remove from maintenance: reviewed honestly (the maintenance task is kept), contributor allowed, applied only at confirm', async () => {
  const w = installChecklist('CONTRIBUTOR', { primary: false });
  try {
    const review = await invoke('REMOVE', launch());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /not deleted/);
    assert.match(review.confirmation.description, /will not be added to maintenance again on its own/);
    assert.equal(w.calls.length, 0, 'nothing written at review');
    const item = row({ status: 'ADDED', maintenanceTask: { id: 't1', status: 'PENDING' } });
    const done = await confirmCapabilityInvoke(OP, ctx({ ...review.parameters, seasonalItemContextVersion: version('REMOVE', item) }));
    assert.equal(done.result.status, 'COMPLETED');
    assert.deepEqual(w.calls, [['remove', 'u1', 'i1']]);
    assert.match(JSON.stringify(done.result.blocks), /kept and is no longer linked/);
    const stale = await confirmCapabilityInvoke(OP, ctx({ ...review.parameters, seasonalItemContextVersion: 'old' })).catch((e) => e);
    assert.equal(stale.code, 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { w.restore(); }
  const notLinked = installChecklist('OWNER', { item: row() });
  try { assert.equal((await invoke('REMOVE', launch())).reasonCode, 'SEASONAL_ITEM_STEP_NOT_AVAILABLE'); } finally { notLinked.restore(); }
});

test('which whole-checklist controls apply: both for the primary holder, add-all only while a critical task waits, nothing once dismissed', () => {
  const k = command.seasonalChecklistKinds;
  const me = { canManage: true, isPrimaryHolder: true };
  assert.deepEqual(k(checklistRow(), me), ['ADD_ALL_CRITICAL', 'DISMISS_CHECKLIST']);
  assert.deepEqual(k(checklistRow({ items: checklistRow().items.map((i) => ({ ...i, status: i.priority === 'CRITICAL' ? 'ADDED' : i.status })) }), me), ['DISMISS_CHECKLIST']);
  assert.deepEqual(k(checklistRow({ status: 'DISMISSED' }), me), []);
  assert.deepEqual(k(checklistRow(), { canManage: true, isPrimaryHolder: false }), []);
  assert.deepEqual(k(checklistRow(), { canManage: false, isPrimaryHolder: true }), []);
});

test('the seasonal answer offers the checklist controls only for one checklist and only to the primary holder', () => {
  const items = [{ id: 'i1', title: 'Clean gutters', description: null, taskKey: 'x', priority: 'CRITICAL', status: 'RECOMMENDED', recommendedDate: null, snoozedUntil: null, maintenanceTask: null, updatedAt: T }];
  const list = (id) => ({ id, season: 'FALL', year: 2026, status: 'ACTIVE', seasonStartDate: new Date('2026-09-01'), seasonEndDate: new Date('2026-12-01'), updatedAt: T, items });
  const build = (checklists, who) => buildSeasonalMaintenanceResult({ message: 'What fall tasks are pending?', propertyId: 'prop-1', propertyTimezone: 'UTC', context: { checklists }, contextAvailable: true, now: new Date('2026-10-01'), ...who });
  const summaryActions = (checklists, who) => build(checklists, who).blocks.find((b) => b.id === 'seasonal-maintenance-summary').actions;
  const mine = summaryActions([list('c1')], { canManage: true, isPrimaryHolder: true });
  assert.deepEqual(mine.map((a) => a.id), ['seasonal-checklist-add-critical', 'seasonal-checklist-dismiss']);
  assert.deepEqual(mine.map((a) => [a.entityType, a.entityId, a.operationId]), [['SEASONAL_CHECKLIST', 'c1', OP], ['SEASONAL_CHECKLIST', 'c1', OP]]);
  assert.deepEqual(summaryActions([list('c1')], { canManage: true, isPrimaryHolder: false }), []);
  assert.deepEqual(summaryActions([list('c1'), list('c2')], { canManage: true, isPrimaryHolder: true }), [], 'not ambiguous: several checklists in view');
  for (const a of mine) assert.equal(isAskActionApplicable({ action: a, operationId: 'MAINTENANCE_STATUS', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, a.id);
  assert.equal(isAskActionApplicable({ action: { ...mine[0], id: 'seasonal-checklist-unlisted' }, operationId: 'MAINTENANCE_STATUS', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), false, 'an id outside the allowlist is stripped');
});

test('add all critical: names the tasks, applies the canonical call at confirm, and reports a partial result honestly', async () => {
  const w = installChecklist('OWNER');
  try {
    assert.equal((await clInvoke('ADD_ALL_CRITICAL', clLaunch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_SEASONAL_ITEM_NOT_DIRECTLY_ROUTABLE');
    const review = await clInvoke('ADD_ALL_CRITICAL', clLaunch());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.title, /Add all 2 critical Fall 2026 tasks/);
    const tasks = review.confirmation.fields.find((f) => f.label === 'Tasks to add').value;
    assert.match(tasks, /Clean gutters/); assert.match(tasks, /Test smoke alarms/);
    assert.doesNotMatch(tasks, /Seal windows|Flush water heater/, 'only the waiting critical tasks');
    assert.equal(w.calls.length, 0);
    const params = { ...review.parameters };
    assert.equal(params.seasonalChecklistContextVersion, checklistVersion('ADD_ALL_CRITICAL', checklistRow()));
    const done = await confirmCapabilityInvoke(OP, ctx(params));
    assert.deepEqual(w.calls, [['addAll', 'c1', 'u1']]);
    assert.match(JSON.stringify(done.result.blocks), /Added 2 critical tasks/);
    SeasonalChecklistService.addAllCriticalTasks = async () => ({ success: true, tasksAdded: 1 });
    const partial = await confirmCapabilityInvoke(OP, ctx(params));
    assert.match(JSON.stringify(partial.result.blocks), /Added 1 of 2 critical tasks/);
    assert.match(JSON.stringify(partial.result.blocks), /skipped/);
    const stale = await confirmCapabilityInvoke(OP, ctx({ ...params, seasonalChecklistContextVersion: 'old' })).catch((e) => e);
    assert.equal(stale.code, 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { w.restore(); }
});

test('dismiss this season: says exactly what is set aside, including high-priority tasks, and leaves added tasks alone', async () => {
  const w = installChecklist('OWNER');
  try {
    const review = await clInvoke('DISMISS_CHECKLIST', clLaunch());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /including high-priority ones/);
    assert.match(review.confirmation.description, /already added to maintenance are not changed/);
    const aside = review.confirmation.fields.find((f) => f.label === 'Tasks set aside').value;
    assert.match(aside, /^3:/); assert.doesNotMatch(aside, /Flush water heater/);
    assert.equal(w.calls.length, 0);
    const done = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.deepEqual(w.calls, [['dismissChecklist', 'c1', 'u1']]);
    assert.match(JSON.stringify(done.result.blocks), /checklist dismissed/);
  } finally { w.restore(); }
});

test('whole-checklist controls: viewers refused, non-primary holders refused, an already dismissed checklist not offered, wrong entity type not routable', async () => {
  let w = installChecklist('VIEWER');
  try { assert.equal((await clInvoke('DISMISS_CHECKLIST', clLaunch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = installChecklist('CONTRIBUTOR', { primary: false });
  try {
    const refused = await clInvoke('ADD_ALL_CRITICAL', clLaunch());
    assert.equal(refused.reasonCode, 'SEASONAL_CHECKLIST_PRIMARY_HOLDER_ONLY');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = installChecklist('OWNER', { checklist: checklistRow({ status: 'DISMISSED' }) });
  try { assert.equal((await clInvoke('DISMISS_CHECKLIST', clLaunch())).reasonCode, 'SEASONAL_CHECKLIST_STEP_NOT_AVAILABLE'); } finally { w.restore(); }
  w = installChecklist('OWNER');
  try { assert.equal((await clInvoke('DISMISS_CHECKLIST', clLaunch({ entityType: 'SEASONAL_ITEM' }))).reasonCode, 'ASK_SEASONAL_ITEM_NOT_DIRECTLY_ROUTABLE'); } finally { w.restore(); }
  for (const kind of Object.keys(CM)) assert.notEqual(resolveAskRoutingCascade(CM[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
});
