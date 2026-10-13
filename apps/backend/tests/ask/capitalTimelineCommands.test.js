const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P1 "Capital Timeline": adjust what the timeline assumes for an item, and remove an adjustment (FRD v1.318). No database, browser or native module.

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
const { HomeCapitalTimelineService } = require('../../src/services/homeCapitalTimeline.service.ts');
const financialContext = require('../../src/services/financialContext/context.ts');
const command = require('../../src/services/ask/support/capitalTimelineCommand.ts');
const handler = require('../../src/services/ask/handlers/capitalTimelineCommands.handler.ts');

const OP = 'CAPITAL_TIMELINE_COMMAND';
const M = command.CAPITAL_COMMAND_MESSAGES;
const ITEM = '11111111-1111-4111-8111-111111111111';
const ITEMS = [{ id: ITEM, name: 'Water heater', category: 'WATER_HEATER' }];

test('each adjustment type needs its own fields and builds the canonical payload; an item is needed except for a note', () => {
  const p = command.parseCapitalAdjustAnswer;
  assert.deepEqual(p({ type: 'PLANNED_DATE' }), { success: false, reason: 'ITEM_REQUIRED' });
  assert.deepEqual(p({ inventoryItemId: ITEM, type: 'PLANNED_DATE' }), { success: false, reason: 'FIELDS_REQUIRED' });
  assert.deepEqual(p({ inventoryItemId: ITEM, type: 'PLANNED_DATE', plannedDate: { precision: 'EXACT_DATE', value: '2027-04-01' } }).data,
    { inventoryItemId: ITEM, type: 'PLANNED_DATE', payload: { date: '2027-04-01' }, note: null });
  assert.deepEqual(p({ inventoryItemId: ITEM, type: 'PLANNED_WINDOW', windowStart: '2027-03-01', windowEnd: '2027-05-01' }).data.payload, { start: '2027-03-01', end: '2027-05-01' });
  assert.deepEqual(p({ inventoryItemId: ITEM, type: 'PLANNED_WINDOW', windowStart: '2027-06-01', windowEnd: '2027-05-01' }), { success: false, reason: 'ORDER' });
  assert.deepEqual(p({ inventoryItemId: ITEM, type: 'COST_OVERRIDE', minCost: '4500.50', maxCost: 6000 }).data.payload, { minCents: 450050, maxCents: 600000 });
  assert.deepEqual(p({ inventoryItemId: ITEM, type: 'COST_OVERRIDE', minCost: 7000, maxCost: 6000 }), { success: false, reason: 'ORDER' });
  assert.deepEqual(p({ inventoryItemId: ITEM, type: 'ADJUST_REMAINING_LIFE', remainingYears: 3 }).data.payload, { remainingYears: 3 });
  assert.deepEqual(p({ inventoryItemId: ITEM, type: 'DISABLE_ITEM' }).data.payload, {});
  assert.equal(p({ type: 'NOTE', note: 'Replace with the roof job' }).success, true);
  assert.deepEqual(p({ type: 'NOTE' }), { success: false, reason: 'FIELDS_REQUIRED' });
  assert.equal(p({ inventoryItemId: ITEM, type: 'DISABLE_ITEM', payload: { x: 1 } }).success, false, 'a raw payload is not a form field');
  assert.equal(p({ inventoryItemId: ITEM, type: 'REWRITE_HISTORY' }).success, false);
});

test('a stored adjustment re-validates through the form schema (round trip)', () => {
  const parsed = command.parseCapitalAdjustAnswer({ inventoryItemId: ITEM, type: 'COST_OVERRIDE', minCost: 4500, maxCost: 6000, note: 'Quote in hand' });
  assert.equal(command.parseCapitalAdjustAnswer(command.capitalAdjustFormAnswer(parsed.data)).success, true);
  assert.deepEqual(command.parseCapitalAdjustAnswer(command.capitalAdjustFormAnswer(parsed.data)).data, parsed.data);
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ overrides = [], override = null } = {}) {
  const saved = { inv: prisma.inventoryItem, ov: prisma.homeCapitalTimelineOverride };
  prisma.inventoryItem = { findMany: async () => ITEMS };
  prisma.homeCapitalTimelineOverride = {
    findMany: async () => overrides,
    findFirst: async (args) => (override && args.where.id === override.id && args.where.propertyId === 'prop-1' ? override : null),
  };
  return () => { prisma.inventoryItem = saved.inv; prisma.homeCapitalTimelineOverride = saved.ov; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: kind === 'ADD' ? command.CAPITAL_PROPERTY_ENTITY_TYPE : command.CAPITAL_OVERRIDE_ENTITY_TYPE, ...over });

test('declared-action only and a registered contributor command; the form lists the household\'s items; viewers and refreshes are refused', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  try {
    const form = await invoke(M.ADD, launch('ADD', 'prop-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options, [{ label: 'Water heater', value: ITEM }]);
    assert.equal(form.captureRequests[0].inputSchema.fields[1].inputSchema.options.length, 6);
    assert.equal((await invoke(M.ADD, launch('ADD', 'prop-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_CAPITAL_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.ADD, launch('ADD', 'prop-1', { entityType: command.CAPITAL_OVERRIDE_ENTITY_TYPE }))).reasonCode, 'ASK_CAPITAL_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.ADD, launch('ADD', 'prop-1'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restore(); restoreRole(); }
});

test('a submitted adjustment is reviewed in full with what it will do, an unknown item is refused, and nothing is written yet', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  const saved = HomeCapitalTimelineService.prototype.createOverride; let created = 0;
  HomeCapitalTimelineService.prototype.createOverride = async () => { created += 1; return {}; };
  try {
    const parsed = command.parseCapitalAdjustAnswer({ inventoryItemId: ITEM, type: 'PLANNED_WINDOW', windowStart: '2027-03-01', windowEnd: '2027-05-01', note: 'After the roof' });
    const result = await handler.capitalCommandResult('user-1', 'prop-1', { kind: 'ADD', entityId: 'prop-1', sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.deepEqual([fields.Item, fields.Adjustment, fields.Window, fields.Note], ['Water heater', 'Planned window', 'Mar 1, 2027 to May 1, 2027', 'After the roof']);
    assert.match(result.confirmation.description, /marks itself out of date and uses it the next time it is run/);
    assert.equal(command.parseCapitalAdjustAnswer(result.parameters.capitalAdjust).success, true);
    const unknown = command.parseCapitalAdjustAnswer({ inventoryItemId: '22222222-2222-4222-8222-222222222222', type: 'DISABLE_ITEM' });
    assert.equal((await handler.capitalCommandResult('user-1', 'prop-1', { kind: 'ADD', entityId: 'prop-1', sourceExecutionId: null }, unknown.data)).reasonCode, 'CAPITAL_ITEM_NOT_FOUND');
    assert.equal(created, 0);
  } finally { HomeCapitalTimelineService.prototype.createOverride = saved; restore(); restoreRole(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
function installWrites() {
  const proto = HomeCapitalTimelineService.prototype;
  const saved = { c: proto.createOverride, d: proto.deleteOverride, l: proto.listOverrides, g: financialContext.assertFinancialContextApplicable, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  proto.createOverride = async (...a) => { calls.push(['create', ...a]); return { id: 'ov-new' }; };
  proto.deleteOverride = async (...a) => { calls.push(['delete', ...a]); };
  financialContext.assertFinancialContextApplicable = async (...a) => { calls.push(['gate', ...a.slice(2)]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { Object.assign(proto, { createOverride: saved.c, deleteOverride: saved.d }); financialContext.assertFinancialContextApplicable = saved.g; executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}

test('confirming an add runs the applicability gate then creates the override; remove deletes; a stale or tampered confirmation writes nothing', async () => {
  const w = installWrites(); const restore = withData({ override: { id: 'ov-1', type: 'NOTE', inventoryItemId: null, note: null, createdAt: new Date() } });
  try {
    const parsed = command.parseCapitalAdjustAnswer({ inventoryItemId: ITEM, type: 'COST_OVERRIDE', minCost: 4500, maxCost: 6000 });
    const version = await (async () => {
      const crypto = require('node:crypto');
      return crypto.createHash('sha256').update(`capital-adjust:prop-1:${ITEM}:`).digest('hex');
    })();
    const out = await confirmCapabilityInvoke(OP, ctx({ capitalAdjust: command.capitalAdjustFormAnswer(parsed.data), capitalCommand: { kind: 'ADD', entityId: 'prop-1' }, capitalContextVersion: version }));
    assert.deepEqual(w.calls[0], ['gate', 'CAPITAL_TIMELINE', 'capitalPlanning']);
    assert.deepEqual(w.calls[1], ['create', 'prop-1', { inventoryItemId: ITEM, type: 'COST_OVERRIDE', payload: { minCents: 450000, maxCents: 600000 }, note: null }]);
    assert.equal(out.artifactId, 'ov-new');
    await confirmCapabilityInvoke(OP, ctx({ capitalCommand: { kind: 'REMOVE', entityId: 'ov-1' } }));
    assert.deepEqual(w.calls.at(-1), ['delete', 'prop-1', 'ov-1']);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ capitalAdjust: command.capitalAdjustFormAnswer(parsed.data), capitalCommand: { kind: 'ADD', entityId: 'prop-1' }, capitalContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ capitalAdjust: { type: 'COST_OVERRIDE' }, capitalCommand: { kind: 'ADD', entityId: 'prop-1' }, capitalContextVersion: version })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ capitalCommand: { kind: 'REMOVE', entityId: 'gone' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.filter((c) => c[0] === 'create').length, 1);
    assert.equal(w.calls.filter((c) => c[0] === 'delete').length, 1);
  } finally { w.restore(); restore(); }
});

test('the ids are allowlisted for the answer that emits them', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of ['capital-timeline-adjust', 'capital-timeline-remove-adjustment']) assert.equal(applicable(id, 'CAPITAL_RESERVE_PLAN'), true, id);
  assert.equal(applicable('capital-timeline-back', OP), true);
});
