const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-013/014, FRD v1.74): Maintenance is the first shelves adopter. The
// unfiltered open view is split by timing, each record carries its shelf facts, and the summary gains answer chips.
// The real MAINTENANCE_STATUS handler runs against a stubbed task service and household lookup.

const prismaModule = require('../../src/lib/prisma.ts');
const {
  maintenanceOpenTimingGroups,
  maintenanceShelfFacts,
} = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');
const { skillContextProviderKey } = require('../../src/services/skills/context/skillContextProviderRegistry.ts');
const { MAINTENANCE_TASK_CONTEXT_PROVIDER } = require('../../src/services/skills/maintenance/skill.manifest.ts');

const DAY = 86_400_000;
const now = new Date('2026-09-24T15:00:00.000Z');
const boundary = new Date(now.getTime() + 30 * DAY);

test('open tasks split into Overdue, Due in the next 30 days, Later and No due date, keeping order and leaving out empty groups', () => {
  const at = (days) => new Date(now.getTime() + days * DAY);
  const tasks = [
    { id: 'late-1', nextDueDate: at(-12) }, { id: 'soon-1', nextDueDate: at(3) }, { id: 'none', nextDueDate: null },
    { id: 'late-2', nextDueDate: at(-1) }, { id: 'later', nextDueDate: at(45) }, { id: 'edge-now', nextDueDate: now }, { id: 'edge-30', nextDueDate: boundary },
  ];
  const groups = maintenanceOpenTimingGroups(tasks, now, boundary);
  assert.deepEqual(groups.map((group) => [group.id, group.title, group.records.map((task) => task.id)]), [
    ['overdue', 'Overdue', ['late-1', 'late-2']],
    ['due-soon', 'Due in the next 30 days', ['soon-1', 'edge-now', 'edge-30']],
    ['later', 'Later', ['later']],
    ['no-due-date', 'No due date', ['none']],
  ]);
  assert.deepEqual(maintenanceOpenTimingGroups([{ id: 'x', nextDueDate: at(90) }], now, boundary).map((group) => group.id), ['later']);
  assert.deepEqual(maintenanceOpenTimingGroups([], now, boundary), [{ id: 'open', title: 'Pending and in progress', records: [] }]);
});

test('shelf facts: overdue is critical, due within 30 days a caution, others plain; labels match the meta wording', () => {
  const facts = (overrides) => maintenanceShelfFacts({
    kind: 'OPEN', nextDueDate: null, lastCompletedDate: null, updatedAt: now, cost: null, now, dueSoonBoundary: boundary,
    formatDate: (value) => value.toISOString().slice(0, 10), ...overrides,
  });
  assert.deepEqual(facts({ nextDueDate: new Date('2026-09-12T12:00:00Z'), cost: '$25' }), { tone: 'CRITICAL', timingLabel: 'Was due 2026-09-12', amountLabel: 'Est. $25' });
  assert.deepEqual(facts({ nextDueDate: new Date('2026-10-03T12:00:00Z') }), { tone: 'CAUTION', timingLabel: 'Due 2026-10-03', amountLabel: null });
  assert.deepEqual(facts({ nextDueDate: new Date('2026-12-01T12:00:00Z') }), { tone: 'DEFAULT', timingLabel: 'Due 2026-12-01', amountLabel: null });
  assert.deepEqual(facts({}), { tone: 'DEFAULT', timingLabel: 'No due date', amountLabel: null });
  assert.deepEqual(facts({ kind: 'COMPLETED', nextDueDate: new Date('2026-01-01T00:00:00Z'), lastCompletedDate: new Date('2026-08-04T12:00:00Z'), cost: '$140' }), { tone: 'DEFAULT', timingLabel: 'Done 2026-08-04', amountLabel: 'Spent $140' });
  assert.deepEqual(facts({ kind: 'CANCELLED', updatedAt: new Date('2026-07-01T12:00:00Z') }), { tone: 'DEFAULT', timingLabel: 'Cancelled 2026-07-01', amountLabel: null });
});

const originals = { prisma: prismaModule.prisma, getTasks: PropertyMaintenanceTaskService.getTasksForProperty };
const task = (id, overrides = {}) => ({
  id, title: `Task ${id}`, description: null, category: 'HVAC', assetType: null, serviceCategory: null, season: null,
  status: 'PENDING', priority: 'MEDIUM', source: 'USER_CREATED', nextDueDate: null, lastCompletedDate: null,
  updatedAt: new Date('2026-09-01T00:00:00Z'), actualCost: null, estimatedCost: null, isRecurring: false, frequency: null,
  inventoryItem: null, room: null, ...overrides,
});
const relative = (days) => new Date(Date.now() + days * DAY);

function install(tasks, role = 'OWNER') {
  prismaModule.prisma = new Proxy({
    householdMember: { findUnique: async () => ({ role, isPrimaryOwner: role === 'OWNER' }) },
  }, {
    get(target, model) {
      if (model === 'then') return undefined;
      if (model in target) return target[model];
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  PropertyMaintenanceTaskService.getTasksForProperty = async () => tasks;
}

test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  PropertyMaintenanceTaskService.getTasksForProperty = originals.getTasks;
});

const invoke = (message, role = 'OWNER') => capabilityInvoke('MAINTENANCE_STATUS', { userId: 'u1', propertyId: 'p1', message }, {
  propertyAccess: { role, userId: 'u1', propertyId: 'p1' },
  composedContext: { entries: [], values: { [skillContextProviderKey(MAINTENANCE_TASK_CONTEXT_PROVIDER)]: { propertyTimezone: 'America/New_York', purchaseDate: null } } },
});

test('the maintenance answer declares shelves, groups open tasks by timing, and leads with answer chips', async () => {
  install([
    task('filter', { title: 'Replace HVAC filter', nextDueDate: relative(-12), estimatedCost: 25, priority: 'HIGH' }),
    task('flush', { title: 'Flush water heater', nextDueDate: relative(5) }),
    task('gutters', { title: 'Clean gutters', nextDueDate: relative(60) }),
    task('caulk', { title: 'Re-caulk tub' }),
    task('done', { title: 'Service furnace', status: 'COMPLETED', lastCompletedDate: relative(-40), actualCost: 140 }),
  ]);
  const result = await invoke('What maintenance is pending?');
  const summary = result.blocks.find((block) => block.id === 'maintenance-summary');
  assert.deepEqual(summary.chips, [
    { label: '1 overdue', tone: 'CRITICAL' },
    { label: '1 due in 30 days', tone: 'CAUTION' },
    { label: '4 open', tone: 'DEFAULT' },
  ]);
  const list = result.blocks.find((block) => block.id === 'maintenance-groups');
  assert.deepEqual(list.presentation, { pattern: 'SHELVES' });
  assert.deepEqual(list.sections.map((section) => [section.id, section.count]), [['overdue', 1], ['due-soon', 1], ['later', 1], ['no-due-date', 1]]);
  const filter = list.sections[0].items[0];
  assert.equal(filter.tone, 'CRITICAL');
  assert.match(filter.timingLabel, /^Was due /);
  assert.equal(filter.amountLabel, 'Est. $25');
  assert.deepEqual(filter.actions.map((action) => action.id), ['why-important', 'complete', 'reschedule']);
  assert.equal(list.sections[1].items[0].tone, 'CAUTION');
  assert.equal(list.sections[3].items[0].timingLabel, 'No due date');
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

test('filtered views keep their single section, and a viewer\'s shelf cards carry no change actions', async () => {
  install([
    task('filter', { nextDueDate: relative(-12) }),
    task('flush', { nextDueDate: relative(5) }),
  ], 'VIEWER');
  const overdue = await invoke('Only show overdue tasks', 'VIEWER');
  const list = overdue.blocks.find((block) => block.id === 'maintenance-groups');
  assert.deepEqual(list.sections.map((section) => [section.id, section.title, section.count]), [['overdue', 'Overdue', 1]]);
  assert.deepEqual(list.sections[0].items[0].actions.map((action) => action.id), ['why-important']);
  const soon = await invoke('What is due soon?', 'VIEWER');
  assert.deepEqual(soon.blocks.find((block) => block.id === 'maintenance-groups').sections.map((section) => section.id), ['due']);
});

test('completed history keeps its own section with done dates, and no chips appear when nothing matches', async () => {
  install([task('done', { status: 'COMPLETED', lastCompletedDate: relative(-40), actualCost: 140 })]);
  const history = await invoke('What maintenance did I complete?');
  const completed = history.blocks.find((block) => block.id === 'maintenance-groups').sections.find((section) => section.id === 'completed');
  assert.match(completed.items[0].timingLabel, /^Done /);
  assert.equal(completed.items[0].amountLabel, 'Spent $140');
  install([]);
  const empty = await invoke('What maintenance is pending?');
  assert.equal('chips' in empty.blocks.find((block) => block.id === 'maintenance-summary'), false);
  assert.deepEqual(empty.blocks.find((block) => block.id === 'maintenance-groups').sections.map((section) => section.id), ['open']);
});

test('the answer checker passes the shelves answer through intact: chips, pattern, timing groups and actions', async () => {
  install([
    task('filter', { title: 'Replace HVAC filter', nextDueDate: relative(-12), estimatedCost: 25 }),
    task('flush', { title: 'Flush water heater', nextDueDate: relative(5) }),
  ]);
  const result = await invoke('What maintenance is pending?');
  // The orchestrator attaches the completed source read before checking; do the same here.
  const checked = validateAskAnswerTrustPipeline({
    question: 'What maintenance is pending?', operationId: 'MAINTENANCE_STATUS', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')]),
  });
  assert.equal(checked.result.status, result.status);
  assert.notEqual(checked.trust.outcome, 'WITHHOLD');
  const summary = checked.result.blocks.find((block) => block.id === 'maintenance-summary');
  assert.deepEqual(summary.chips.map((chip) => chip.label), ['1 overdue', '1 due in 30 days', '2 open']);
  const list = checked.result.blocks.find((block) => block.id === 'maintenance-groups');
  assert.deepEqual(list.presentation, { pattern: 'SHELVES' });
  assert.deepEqual(list.sections.map((section) => section.id), ['overdue', 'due-soon']);
  assert.deepEqual(list.sections[0].items[0].actions.map((action) => action.id), ['why-important', 'complete', 'reschedule']);
});
