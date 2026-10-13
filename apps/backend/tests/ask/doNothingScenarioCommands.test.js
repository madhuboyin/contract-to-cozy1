const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Do-Nothing Simulator": save, change and delete scenarios (FRD v1.336). No database, browser or native module.

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
const { DoNothingSimulatorService } = require('../../src/services/doNothingSimulator.service.ts');
const command = require('../../src/services/ask/support/doNothingScenarioCommand.ts');
const { doNothingSimulationFromView } = require('../../src/services/ask/handlers/doNothingSimulator.handler.ts');

const OP = 'DO_NOTHING_SCENARIO_COMMAND';
const M = command.DO_NOTHING_SCENARIO_MESSAGES;
const SCN = '11111111-1111-4111-8111-111111111111';
const scenario = (over = {}) => ({ id: SCN, name: 'Skip it all', horizonMonths: 12, inputOverrides: { skipMaintenance: true, riskTolerance: 'HIGH' }, updatedAt: '2026-09-01T00:00:00.000Z', ...over });
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const versionOf = (s) => sha(`do-nothing-scenario:${s.id}:${s.updatedAt}:${JSON.stringify(s.inputOverrides)}:${s.name}:${s.horizonMonths}`);

test('the form mirrors the route; an edit merges with the current overrides because the service replaces them wholesale', () => {
  const p = command.parseDoNothingScenarioAnswer;
  assert.equal(p('CREATE', { name: '', horizonMonths: 12 }).success, false);
  assert.equal(p('CREATE', { name: 'Skip it', horizonMonths: 7 }).success, false, 'only the page\'s four horizons');
  assert.deepEqual(p('CREATE', { name: 'Skip it', horizonMonths: '24', skipMaintenance: 'YES', cashBuffer: 5000, deductibleStrategy: 'RAISE' }).data,
    { name: 'Skip it', horizonMonths: 24, inputOverrides: { skipMaintenance: true, cashBufferCents: 500000, deductibleStrategy: 'RAISE' } });
  const edit = p('EDIT', { skipWarranty: 'YES' }, { skipMaintenance: true, riskTolerance: 'HIGH' });
  assert.deepEqual(edit.data.inputOverrides, { skipMaintenance: true, riskTolerance: 'HIGH', skipWarranty: true });
  assert.equal(edit.data.name, undefined);
  assert.equal(p('EDIT', {}).reason, 'NOTHING');
  assert.equal(p('EDIT', { userId: 'x' }).success, false);
});

function install(role, scenarios = [scenario()]) {
  const proto = DoNothingSimulatorService.prototype;
  const saved = { a: propertyAccess.resolvePropertyAccess, l: proto.listScenarios, c: proto.createScenario, u: proto.updateScenario, d: proto.deleteScenario, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  proto.listScenarios = async () => ({ scenarios });
  proto.createScenario = async (...a) => { calls.push(['create', ...a]); return { scenario: { id: 'new-1' } }; };
  proto.updateScenario = async (...a) => { calls.push(['update', ...a]); return {}; };
  proto.deleteScenario = async (...a) => { calls.push(['delete', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; proto.listScenarios = saved.l; proto.createScenario = saved.c; proto.updateScenario = saved.u; proto.deleteScenario = saved.d; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.doNothingScenarioEntityType(kind), ...over });
const invoke = (message, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message, launchContext });

test('declared-action only, a contributor command; viewers refused; the edit form is seeded; a gone scenario is said', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke(M.CREATE, launch('CREATE', 'prop-1'))).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke(M.CREATE, launch('CREATE', 'prop-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_DO_NOTHING_SCENARIO_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke(M.EDIT, launch('EDIT', SCN));
    assert.equal(form.captureRequests[0].currentAnswer.skipMaintenance, 'YES');
    assert.equal(form.captureRequests[0].currentAnswer.riskTolerance, 'HIGH');
    assert.equal((await invoke(M.EDIT, launch('EDIT', 'nope'))).reasonCode, 'DO_NOTHING_SCENARIO_NOT_FOUND');
  } finally { w.restore(); }
});

test('the review lists the assumptions and says it runs nothing; delete confirms; nothing is written at review', async () => {
  const w = install('CONTRIBUTOR');
  const { doNothingScenarioResult } = require('../../src/services/ask/handlers/doNothingScenarioCommands.handler.ts');
  try {
    const review = await doNothingScenarioResult('u1', 'prop-1', { kind: 'CREATE', entityId: 'prop-1', sourceExecutionId: null }, { name: 'Skip warranty', horizonMonths: '24', skipWarranty: 'YES', cashBuffer: 2000 });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /runs no simulation/);
    assert.deepEqual(review.confirmation.fields.map((f) => f.value), ['Skip warranty', '24 months', 'Skips warranty: yes', 'Cash buffer: $2,000']);
    const del = await doNothingScenarioResult('u1', 'prop-1', { kind: 'DELETE', entityId: SCN, sourceExecutionId: null });
    assert.equal(del.status, 'NEEDS_CONFIRMATION');
    assert.match(del.confirmation.description, /cannot be undone/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('confirming calls the service with the merged overrides; stale and invalid write nothing', async () => {
  const w = install('CONTRIBUTOR');
  try {
    await confirmCapabilityInvoke(OP, ctx({ doNothingCommand: { kind: 'CREATE', entityId: 'prop-1' }, doNothingContextVersion: sha('do-nothing-scenario:prop-1::::'), doNothingForm: { name: 'Skip warranty', horizonMonths: 24, skipWarranty: 'YES' } }));
    assert.deepEqual(w.calls[0], ['create', 'prop-1', 'u1', { name: 'Skip warranty', horizonMonths: 24, inputOverrides: { skipWarranty: true } }]);
    await confirmCapabilityInvoke(OP, ctx({ doNothingCommand: { kind: 'EDIT', entityId: SCN }, doNothingContextVersion: versionOf(scenario()), doNothingForm: { skipWarranty: 'YES' } }));
    assert.deepEqual(w.calls[1], ['update', 'prop-1', SCN, 'u1', { inputOverrides: { skipMaintenance: true, riskTolerance: 'HIGH', skipWarranty: true } }]);
    await confirmCapabilityInvoke(OP, ctx({ doNothingCommand: { kind: 'DELETE', entityId: SCN }, doNothingContextVersion: versionOf(scenario()) }));
    assert.deepEqual(w.calls[2], ['delete', 'prop-1', SCN, 'u1']);
    const before = w.calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ doNothingCommand: { kind: 'EDIT', entityId: SCN }, doNothingContextVersion: 'old', doNothingForm: { skipWarranty: 'YES' } })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ doNothingCommand: { kind: 'EDIT', entityId: SCN }, doNothingContextVersion: versionOf(scenario()), doNothingForm: { riskTolerance: 'EXTREME' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, before);
  } finally { w.restore(); }
});

test('the answer offers scenario steps to a contributor only; ids allowlisted; the three writing routes are floored', () => {
  const view = { run: null, scenarios: [{ id: SCN, name: 'Skip it all', horizonMonths: 12, inputOverrides: { skipMaintenance: true } }] };
  const rows = (r) => r.blocks.find((b) => b.id === 'do-nothing-items').sections[0].items;
  const contributor = doNothingSimulationFromView(view, 'prop-1', true);
  assert.deepEqual(contributor.blocks[0].actions.map((a) => a.id), ['run-do-nothing', 'do-nothing-scenario-create']);
  assert.ok(contributor.blocks[0].actions.some((a) => a.id === 'do-nothing-scenario-create'));
  assert.deepEqual(rows(contributor)[0].actions.map((a) => a.id), ['do-nothing-scenario-edit', 'do-nothing-scenario-delete']);
  const viewer = doNothingSimulationFromView(view, 'prop-1', false);
  assert.ok(!viewer.blocks[0].actions.some((a) => a.id === 'do-nothing-scenario-create'));
  assert.deepEqual(rows(viewer)[0].actions, []);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId, style: 'SECONDARY' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.DO_NOTHING_SCENARIO_ACTION_IDS)) assert.equal(applicable(id, 'DO_NOTHING_SIMULATION'), true, id);
  assert.equal(applicable('do-nothing-back', OP), true);
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/routes/doNothingSimulator.routes.ts'), 'utf8');
  const writing = source.split(/\nrouter\./).slice(1).filter((s) => /^(post|patch|delete)\(\s*'\/properties\/:propertyId\/do-nothing\/scenarios/.test(s));
  assert.equal(writing.length, 3);
  assert.deepEqual(writing.filter((s) => !s.includes("requireHouseholdRole('CONTRIBUTOR')")), []);
});
