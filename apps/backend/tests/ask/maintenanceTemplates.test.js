const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Recommended maintenance tasks inside Ask (FRD v1.249): the desktop Maintenance Setup catalogue as a launch-only list, and the add-a-task form
// opened pre-filled from a template. The real registered handlers run; prisma, the access check, the template list and the task writer are fakes.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { maintenanceTemplatesFromView } = require('../../src/services/ask/handlers/maintenanceTemplates.handler.ts');
const { maintenanceTaskCreateResult } = require('../../src/services/ask/handlers/maintenance.handler.ts');
const { MAINTENANCE_TEMPLATES_BROWSE_ACTION, MAINTENANCE_TEMPLATE_ADD_ACTION } = require('../../src/services/ask/support/maintenanceTemplateConstants.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { MaintenanceService } = require('../../src/services/maintenance.service.ts');
const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = { resolveAccess: propertyAccess.resolvePropertyAccess, templates: MaintenanceService.getMaintenanceTemplates, createUserTask: PropertyMaintenanceTaskService.createUserTask };
let calls;
let accessRole;
let templates;
let existingKeys;
let activeTemplates;

const tpl = (id, title, status = 'APPLICABLE', extra = {}) => ({ id, title, description: `${title} keeps the system healthy.`, defaultFrequency: 'ANNUALLY', serviceCategory: 'PLUMBING', applicability: { status, missingFactKeys: [] }, ...extra });

test.beforeEach(() => {
  calls = { createUserTask: [] };
  accessRole = 'CONTRIBUTOR';
  templates = [tpl('t-flush', 'Water heater flush'), tpl('t-gutter', 'Gutter cleaning', 'APPLICABLE', { defaultFrequency: 'SEMI_ANNUALLY', serviceCategory: 'HANDYMAN' }), tpl('t-smoke', 'Smoke detector testing', 'UNKNOWN', { applicability: { status: 'UNKNOWN', missingFactKeys: ['safety.hasSmokeDetectors'] } }), tpl('t-septic', 'Septic tank pumping', 'NOT_APPLICABLE')];
  existingKeys = ['MAINTENANCE_TEMPLATE:t-gutter'];
  activeTemplates = new Set(['t-flush', 't-gutter', 't-smoke', 't-septic']);
  const models = {
    propertyMaintenanceTask: { findMany: async (args) => (args.where.actionKey ? existingKeys.filter((key) => args.where.actionKey.in.includes(key)).map((actionKey) => ({ actionKey })) : []), findUnique: async () => null },
    property: { findUnique: async () => ({ timezone: 'America/Chicago' }) },
    maintenanceTaskTemplate: { findFirst: async ({ where }) => (activeTemplates.has(where.id) ? { serviceCategory: 'PLUMBING' } : null) },
    askExecution: { findMany: async () => [] },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return new Proxy({}, { get(_t, method) { if (!models[model][method]) throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); return models[model][method]; } });
    },
  });
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
  MaintenanceService.getMaintenanceTemplates = async () => templates;
  PropertyMaintenanceTaskService.createUserTask = async (...args) => {
    calls.createUserTask.push(args);
    return { id: 'task-1', title: args[2].title, status: 'PENDING', priority: 'MEDIUM', isRecurring: Boolean(args[2].isRecurring), frequency: args[2].frequency ?? null, nextDueDate: null, createdAt: new Date('2026-10-10T00:00:00.000Z') };
  };
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
  MaintenanceService.getMaintenanceTemplates = originals.templates;
  PropertyMaintenanceTaskService.createUserTask = originals.createUserTask;
});

const browse = (launchContext = { surface: 'ASK_WORKSPACE', operationId: 'MAINTENANCE_TEMPLATES_BROWSE' }) =>
  capabilityInvoke('MAINTENANCE_TEMPLATES_BROWSE', { userId: 'u1', propertyId: 'p1', message: MAINTENANCE_TEMPLATES_BROWSE_ACTION.message, launchContext });
const section = (result, id) => result.blocks.find((block) => block.id === 'maintenance-templates-list').sections.find((candidate) => candidate.id === id);

test('the list separates what can be added, what is already on the list and what needs a home detail, and leaves out what does not apply', async () => {
  const result = await browse();
  assert.equal(result.reasonCode, 'MAINTENANCE_TEMPLATES_READY');
  assert.deepEqual(section(result, 'maintenance-templates-ready').items.map((item) => item.title), ['Water heater flush']);
  assert.deepEqual(section(result, 'maintenance-templates-on-list').items.map((item) => [item.title, item.status]), [['Gutter cleaning', 'Already on your list']]);
  const needs = section(result, 'maintenance-templates-needs-detail').items[0];
  assert.equal(needs.title, 'Smoke detector testing');
  assert.match(needs.description, /confirm: Has smoke detectors/i);
  assert.ok(!JSON.stringify(result).includes('Septic tank pumping'), 'a template that does not apply is not listed');
  assert.match(result.blocks[0].body, /1 that do not apply to this home is left out|1 that does not apply|1 that do not apply/);
  assert.deepEqual(result.blocks.at(-1).id, 'maintenance-templates-boundary');
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  assert.doesNotMatch(JSON.stringify(result.blocks), /\/dashboard\/|"href"/, 'no desktop link anywhere');
});

test('only an addable row for a contributor or owner carries the add action, which names the template and the add-a-task operation', async () => {
  const result = await browse();
  const ready = section(result, 'maintenance-templates-ready').items[0];
  assert.equal(ready.entityType, 'MAINTENANCE_TEMPLATE');
  assert.equal(ready.id, 't-flush');
  assert.deepEqual(ready.actions.map((action) => [action.id, action.message, action.operationId, action.interactionType]),
    [[MAINTENANCE_TEMPLATE_ADD_ACTION.id, MAINTENANCE_TEMPLATE_ADD_ACTION.message, 'MAINTENANCE_TASK_CREATE', 'MUTATE_RECORD']]);
  assert.equal(section(result, 'maintenance-templates-on-list').items[0].actions, undefined);
  assert.equal(section(result, 'maintenance-templates-needs-detail').items[0].actions, undefined);
  accessRole = 'VIEWER';
  const viewer = await browse();
  assert.equal(section(viewer, 'maintenance-templates-ready').items[0].actions, undefined, 'a viewer reads the list only');
});

test('pure card: nothing that fits is an honest empty state, and everything already added says so', () => {
  const none = maintenanceTemplatesFromView([tpl('a', 'A', 'NOT_APPLICABLE')], new Set(), true);
  assert.equal(none.reasonCode, 'MAINTENANCE_TEMPLATES_EMPTY');
  assert.equal(none.blocks[0].type, 'EMPTY_STATE');
  const all = maintenanceTemplatesFromView([tpl('a', 'A')], new Set(['a']), true);
  assert.match(all.blocks[0].title, /already on your list/i);
});

// ───────────────────────────── add from a template ─────────────────────────────
const addEnvelope = (overrides = {}) => ({
  userId: 'u1', propertyId: 'p1', message: MAINTENANCE_TEMPLATE_ADD_ACTION.message,
  launchContext: { surface: 'ASK_WORKSPACE', operationId: 'MAINTENANCE_TASK_CREATE', entityType: 'MAINTENANCE_TEMPLATE', entityId: 't-flush', sourceExecutionId: 'list-exec-1', ...overrides.launchContext },
  ...(overrides.message ? { message: overrides.message } : {}),
});

test('adding from a template opens the ordinary form pre-filled from it, carries the template, and writes nothing', async () => {
  const result = await capabilityInvoke('MAINTENANCE_TASK_CREATE', addEnvelope());
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.parameters.maintenanceTemplateId, 't-flush');
  assert.equal(result.parameters.sourceExecutionId, 'list-exec-1');
  assert.equal(result.blocks[0].title, 'Review the recommended task');
  const [request] = result.captureRequests;
  assert.deepEqual({ ...request.currentAnswer }, { title: 'Water heater flush', description: 'Water heater flush keeps the system healthy.', priority: 'MEDIUM', isRecurring: true, frequency: 'ANNUALLY' });
  assert.equal(calls.createUserTask.length, 0);
});

test('adding a task without a template, with a refresh, with a wrong message or for an unavailable template never pre-fills or writes', async () => {
  const plain = await capabilityInvoke('MAINTENANCE_TASK_CREATE', { userId: 'u1', propertyId: 'p1', message: 'Create a maintenance task to clean the gutters every year', launchContext: { surface: 'ASK_WORKSPACE', operationId: 'MAINTENANCE_TASK_CREATE' } });
  assert.equal(plain.parameters.maintenanceTemplateId, null, 'an ordinary add carries no template');
  for (const overrides of [{ launchContext: { surface: 'ASK_REFRESH' } }, { message: 'Add some task.' }]) {
    const result = await capabilityInvoke('MAINTENANCE_TASK_CREATE', addEnvelope(overrides));
    assert.equal(result.parameters.maintenanceTemplateId, null, JSON.stringify(overrides));
  }
  for (const entityId of ['t-smoke', 't-septic', 't-missing']) {
    const result = await capabilityInvoke('MAINTENANCE_TASK_CREATE', addEnvelope({ launchContext: { entityId } }));
    assert.equal(result.reasonCode, 'MAINTENANCE_TEMPLATE_UNAVAILABLE', entityId);
    assert.equal(result.captureRequests, undefined);
  }
  assert.equal(calls.createUserTask.length, 0);
});

test('the submitted form becomes a review card that still carries the template, so the write can link it', async () => {
  const card = await maintenanceTaskCreateResult('u1', 'p1', MAINTENANCE_TEMPLATE_ADD_ACTION.message,
    { title: 'Water heater flush', priority: 'MEDIUM', isRecurring: true, frequency: 'ANNUALLY', nextDueDate: '2026-11-01' }, 'list-exec-1', { id: 't-flush' });
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.equal(card.parameters.maintenanceTemplateId, 't-flush');
  assert.equal(card.parameters.maintenanceNextDueDate, '2026-11-01');
});

const execution = { id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'MAINTENANCE_TASK_CREATE', createdAt: new Date('2026-10-10T00:00:00.000Z') };
const confirm = async (extra = {}) => {
  const card = await maintenanceTaskCreateResult('u1', 'p1', MAINTENANCE_TEMPLATE_ADD_ACTION.message, { title: 'Water heater flush', priority: 'MEDIUM', isRecurring: true, frequency: 'ANNUALLY' }, 'list-exec-1', { id: 't-flush' });
  return confirmCapabilityInvoke('MAINTENANCE_TASK_CREATE', {
    userId: 'u1', execution, parameters: { ...card.parameters, ...extra }, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('MAINTENANCE_TASK_CREATE'),
  });
};

test('confirming a template-based task writes it under the template, with the template\'s category and no execution key', async () => {
  const { result } = await confirm();
  assert.equal(calls.createUserTask.length, 1);
  const [userId, propertyId, data] = calls.createUserTask[0];
  assert.deepEqual([userId, propertyId], ['u1', 'p1']);
  assert.equal(data.templateId, 't-flush');
  assert.equal(data.serviceCategory, 'PLUMBING');
  assert.equal(data.actionKey, undefined, 'the service owns the template\'s key');
  assert.equal(result.reasonCode, 'MAINTENANCE_TASK_CREATED');
});

test('a task from an ordinary add keeps its execution key and no template, and a template removed before confirming writes nothing', async () => {
  const plainCard = await maintenanceTaskCreateResult('u1', 'p1', 'Create a maintenance task to clean the gutters', { title: 'Clean the gutters', priority: 'MEDIUM', isRecurring: false }, null, null);
  await confirmCapabilityInvoke('MAINTENANCE_TASK_CREATE', { userId: 'u1', execution, parameters: plainCard.parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('MAINTENANCE_TASK_CREATE') });
  assert.equal(calls.createUserTask[0][2].templateId, undefined);
  assert.equal(calls.createUserTask[0][2].actionKey, 'ask:exec-1:maintenance-task');
  activeTemplates.delete('t-flush');
  await assert.rejects(confirm(), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.createUserTask.length, 1);
});
