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
  assert.deepEqual(k({ status: 'ADDED', priority: 'CRITICAL', maintenanceTaskId: 't1', completed: false }, me), ['SNOOZE']);
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
