const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P0 "Home Digital Twin / Upgrade Planner": manage saved options from Ask (FRD v1.316). No database, browser or native module.

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
const { HomeDigitalTwinScenarioService } = require('../../src/services/homeDigitalTwinScenario.service.ts');
const JobQueueService = require('../../src/services/JobQueue.service.ts').default;
const command = require('../../src/services/ask/support/homeUpgradeCommand.ts');
const handler = require('../../src/services/ask/handlers/homeUpgradeCommands.handler.ts');
const { homeUpgradeScenariosFromView } = require('../../src/services/ask/handlers/homeUpgradePlanner.handler.ts');

const OP = 'HOME_UPGRADE_COMMAND';
const M = command.UPGRADE_COMMAND_MESSAGES;
const SCENARIO = { id: 's-1', name: 'Heat pump', description: null, status: 'COMPUTED', decisionStatus: 'OPEN', decisionReason: null, isArchived: false, updatedAt: new Date('2026-10-01T00:00:00Z'), digitalTwinId: 'tw-1' };

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withScenario(scenario) {
  const saved = prisma.homeTwinScenario;
  prisma.homeTwinScenario = { findFirst: async (args) => (scenario && args.where.id === scenario.id && args.where.digitalTwin.propertyId === 'prop-1' ? scenario : null) };
  return () => { prisma.homeTwinScenario = saved; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launchFor = (id = 's-1', over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: command.UPGRADE_SCENARIO_ENTITY_TYPE, entityId: id, ...over });

test('a decision needs a reason to defer or reject; a rename needs a name; unknown fields are refused', () => {
  assert.deepEqual(command.parseUpgradeFormAnswer('DECIDE', { decisionStatus: 'DEFERRED' }), { success: false, reason: 'REASON_REQUIRED' });
  assert.equal(command.parseUpgradeFormAnswer('DECIDE', { decisionStatus: 'REJECTED', decisionReason: 'Too costly' }).success, true);
  assert.equal(command.parseUpgradeFormAnswer('DECIDE', { decisionStatus: 'SELECTED' }).success, true);
  assert.equal(command.parseUpgradeFormAnswer('DECIDE', { decisionStatus: 'MAYBE' }).success, false);
  assert.equal(command.parseUpgradeFormAnswer('DECIDE', { decisionStatus: 'SELECTED', status: 'COMPUTED' }).success, false);
  assert.equal(command.parseUpgradeFormAnswer('RENAME', { name: '' }).success, false);
  assert.deepEqual(command.parseUpgradeFormAnswer('RENAME', { name: ' Heat pump v2 ', description: '' }).data, { name: 'Heat pump v2', description: null });
});

test('declared-action only and a registered contributor command', () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation(OP).adapterKey, 'home-digital-twin.command');
});

test('each command is refused for a viewer, a refresh, a wrong entity, a typed message and a missing option; forms open for decide and rename', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withScenario(SCENARIO);
  try {
    const decide = await invoke(M.DECIDE, launchFor());
    assert.equal(decide.status, 'NEEDS_CONTEXT');
    assert.equal(decide.captureRequests[0].captureKey, command.UPGRADE_FORM_CAPTURE_KEYS.DECIDE);
    assert.equal((await invoke(M.RENAME, launchFor())).captureRequests[0].captureKey, command.UPGRADE_FORM_CAPTURE_KEYS.RENAME);
    assert.equal((await invoke(M.DECIDE, launchFor('s-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_HOME_UPGRADE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.DECIDE, launchFor('s-1', { entityType: 'OTHER' }))).reasonCode, 'ASK_HOME_UPGRADE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('archive it', launchFor())).reasonCode, 'ASK_HOME_UPGRADE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.DECIDE, launchFor('missing'))).reasonCode, 'HOME_UPGRADE_NOT_FOUND');
    assert.equal((await invoke(M.DECIDE, launchFor(), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restore(); restoreRole(); }
});

test('a decision is reviewed with before -> after and says it starts no work; archived options cannot be decided on, archived-only delete is enforced', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withScenario(SCENARIO);
  try {
    const parsed = command.parseUpgradeFormAnswer('DECIDE', { decisionStatus: 'SELECTED' });
    const review = await handler.upgradeCommandResult('user-1', 'prop-1', { kind: 'DECIDE', entityId: 's-1', sourceExecutionId: null }, parsed.data);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => [f.label, f.value]), [['Option', 'Heat pump'], ['Decision', 'Still deciding → Selected']]);
    assert.match(review.confirmation.description, /does not start any work/);
    assert.equal((await invoke(M.DELETE, launchFor())).reasonCode, 'HOME_UPGRADE_NOT_ARCHIVED');
    assert.equal((await invoke(M.RESTORE, launchFor())).reasonCode, 'HOME_UPGRADE_NOT_ARCHIVED');
    restore();
    restore = withScenario({ ...SCENARIO, isArchived: true });
    assert.equal((await invoke(M.DECIDE, launchFor())).reasonCode, 'HOME_UPGRADE_ARCHIVED');
    assert.equal((await invoke(M.COMPUTE, launchFor())).reasonCode, 'HOME_UPGRADE_ARCHIVED');
    const del = await invoke(M.DELETE, launchFor());
    assert.equal(del.status, 'NEEDS_CONFIRMATION');
    assert.equal(del.blocks[0].tone, 'CAUTION');
    restore();
  } finally { restore(); restoreRole(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
function installWrites() {
  const proto = HomeDigitalTwinScenarioService.prototype;
  const saved = { d: proto.recordDecision, u: proto.updateScenario, x: proto.deleteScenario, g: proto.getScenario, q: JobQueueService.enqueueHomeDigitalTwinScenarioCompute, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  proto.recordDecision = async (...a) => { calls.push(['decision', ...a]); return {}; };
  proto.updateScenario = async (...a) => { calls.push(['update', ...a]); return {}; };
  proto.deleteScenario = async (...a) => { calls.push(['delete', ...a]); };
  proto.getScenario = async () => ({});
  JobQueueService.enqueueHomeDigitalTwinScenarioCompute = async (...a) => { calls.push(['compute', ...a]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { Object.assign(proto, { recordDecision: saved.d, updateScenario: saved.u, deleteScenario: saved.x, getScenario: saved.g }); JobQueueService.enqueueHomeDigitalTwinScenarioCompute = saved.q; executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}
const version = (s) => handler.upgradeCommandContextVersion(s);

test('confirming each command calls the matching planner service method with the twin and the option', async () => {
  const archived = { ...SCENARIO, isArchived: true }; const w = installWrites();
  try {
    let restore = withScenario(SCENARIO);
    const p = (kind, extra = {}) => ctx({ homeUpgradeCommand: { kind, entityId: 's-1' }, homeUpgradeContextVersion: version(SCENARIO), ...extra });
    await confirmCapabilityInvoke(OP, p('DECIDE', { homeUpgradeDecision: { decisionStatus: 'DEFERRED', decisionReason: 'After the roof' } }));
    await confirmCapabilityInvoke(OP, p('RENAME', { homeUpgradeRename: { name: 'Heat pump v2', description: null } }));
    await confirmCapabilityInvoke(OP, p('ARCHIVE'));
    await confirmCapabilityInvoke(OP, p('COMPUTE'));
    restore();
    restore = withScenario(archived);
    const a = (kind) => ctx({ homeUpgradeCommand: { kind, entityId: 's-1' }, homeUpgradeContextVersion: version(archived) });
    await confirmCapabilityInvoke(OP, a('RESTORE'));
    await confirmCapabilityInvoke(OP, a('DELETE'));
    restore();
    assert.deepEqual(w.calls, [
      ['decision', 's-1', 'tw-1', { decisionStatus: 'DEFERRED', decisionReason: 'After the roof', userId: 'user-1' }],
      ['update', 's-1', 'tw-1', { name: 'Heat pump v2', description: null }],
      ['update', 's-1', 'tw-1', { isArchived: true }],
      ['compute', 'prop-1', 'tw-1', 's-1'],
      ['update', 's-1', 'tw-1', { isArchived: false }],
      ['delete', 's-1', 'tw-1', 'prop-1'],
    ]);
  } finally { w.restore(); }
});

test('a confirmation is refused, with nothing written, when the option changed, vanished or the stored decision is invalid', async () => {
  const w = installWrites();
  try {
    let restore = withScenario(SCENARIO);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ homeUpgradeCommand: { kind: 'ARCHIVE', entityId: 's-1' }, homeUpgradeContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ homeUpgradeCommand: { kind: 'DECIDE', entityId: 's-1' }, homeUpgradeContextVersion: version(SCENARIO), homeUpgradeDecision: { decisionStatus: 'REJECTED' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ homeUpgradeCommand: { kind: 'WIPE', entityId: 's-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restore();
    restore = withScenario(null);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ homeUpgradeCommand: { kind: 'ARCHIVE', entityId: 's-1' }, homeUpgradeContextVersion: 'x' })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restore();
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

const view = (over = {}) => ({
  id: 's-1', name: 'Heat pump', scenarioType: 'UPGRADE_COMPONENT', status: 'COMPUTED', staleAt: null, decisionStatus: 'OPEN', isPinned: false, componentId: 'c-1',
  component: { label: 'HVAC', componentType: 'HVAC' }, impacts: [], latestRun: null, updatedAt: new Date('2026-10-01'), safetyBoundary: null, ...over,
});

test('the upgrade answer offers a contributor Manage options (decide, calculate, rename, archive; restore and delete for archived) and a viewer nothing; ids are allowlisted', () => {
  const owner = homeUpgradeScenariosFromView([view()], 'prop-1', new Date(), { canChange: true, archived: [view({ id: 's-2', name: 'Old plan', isArchived: true })] });
  const manage = owner.blocks.find((b) => b.id === 'home-upgrade-manage');
  assert.equal(manage.listDensity, 'DENSE');
  const items = Object.fromEntries(manage.sections.flatMap((s) => s.items).map((i) => [i.id, i]));
  assert.deepEqual(items['s-1'].actions.map((a) => a.id), ['home-upgrade-decide', 'home-upgrade-compute', 'home-upgrade-rename', 'home-upgrade-archive']);
  assert.equal(items['s-1'].entityType, command.UPGRADE_SCENARIO_ENTITY_TYPE);
  assert.deepEqual(items['s-2'].actions.map((a) => a.id), ['home-upgrade-restore', 'home-upgrade-delete']);
  const viewer = homeUpgradeScenariosFromView([view()], 'prop-1');
  assert.equal(viewer.blocks.some((b) => b.id === 'home-upgrade-manage'), false);
  const stale = homeUpgradeScenariosFromView([view({ staleAt: new Date() })], 'prop-1', new Date(), { canChange: true, archived: [] });
  assert.match(stale.blocks[0].body, /use Recalculate on an option to refresh it/);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.UPGRADE_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'HOME_UPGRADE_SCENARIOS'), true, id);
  assert.equal(applicable('home-upgrade-back', OP), true);
});
