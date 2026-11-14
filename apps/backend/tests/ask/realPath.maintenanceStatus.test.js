// FR-GATE-2 real-path evidence for MAINTENANCE_STATUS: the real handler, run through capabilityInvoke for each variant it can answer with, against a stubbed task service and household lookup (the boundary the existing shelves
// tests use). Nothing here reads handler source text.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const prismaModule = require('../../src/lib/prisma.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/maintenance.handler.ts');
const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');
const { skillContextProviderKey } = require('../../src/services/skills/context/skillContextProviderRegistry.ts');
const { MAINTENANCE_TASK_CONTEXT_PROVIDER } = require('../../src/services/skills/maintenance/skill.manifest.ts');
const { matchesOperationAnswerContract } = require('../../src/services/ask/answerContract/operationAnswerContract.ts');
const { matchesMaintenanceStatusAnswerContract } = require('../../src/services/ask/askMaintenanceIntent.ts');
const { conformRealPath } = require('./support/realPathContract');

const DAY = 86_400_000; const relative = (days) => new Date(Date.now() + days * DAY);
const originals = { prisma: prismaModule.prisma, getTasks: PropertyMaintenanceTaskService.getTasksForProperty };
const task = (id, overrides = {}) => ({ id, title: `Task ${id}`, description: null, category: 'HVAC', assetType: null, serviceCategory: null, season: null, status: 'PENDING', priority: 'MEDIUM', source: 'USER_CREATED', nextDueDate: null, lastCompletedDate: null, updatedAt: new Date('2026-09-01T00:00:00Z'), actualCost: null, estimatedCost: null, isRecurring: false, frequency: null, inventoryItem: null, room: null, ...overrides });
function install(tasks, role = 'OWNER') {
  prismaModule.prisma = new Proxy({ householdMember: { findUnique: async () => ({ role, isPrimaryOwner: role === 'OWNER' }) } }, { get(target, model) { if (model === 'then') return undefined; if (model in target) return target[model]; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  PropertyMaintenanceTaskService.getTasksForProperty = async () => tasks;
}
test.afterEach(() => { prismaModule.prisma = originals.prisma; PropertyMaintenanceTaskService.getTasksForProperty = originals.getTasks; });
const invoke = (message, role = 'OWNER') => capabilityInvoke('MAINTENANCE_STATUS', { userId: 'u1', propertyId: 'p1', message }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' }, composedContext: { entries: [], values: { [skillContextProviderKey(MAINTENANCE_TASK_CONTEXT_PROVIDER)]: { propertyTimezone: 'America/New_York', purchaseDate: null } } } });
const MIXED = () => [task('filter', { title: 'Replace HVAC filter', nextDueDate: relative(-12), estimatedCost: 25, priority: 'HIGH' }), task('flush', { title: 'Flush water heater', nextDueDate: relative(5) }), task('gutters', { title: 'Clean gutters', nextDueDate: relative(60) }), task('caulk', { title: 'Re-caulk tub' }), task('done', { title: 'Service furnace', status: 'COMPLETED', lastCompletedDate: relative(-40), actualCost: 140 })];

test('MAINTENANCE_STATUS: every variant the real handler answers with conforms, and the typed contract accepts each one', async () => {
  const variants = {};
  install(MIXED()); variants.openByTiming = await invoke('What maintenance is pending?');
  install(MIXED(), 'VIEWER'); variants.overdueViewer = await invoke('Only show overdue tasks', 'VIEWER'); variants.dueSoonViewer = await invoke('What is due soon?', 'VIEWER');
  install(MIXED()); variants.completedHistory = await invoke('What maintenance did I complete?');
  install([]); variants.noTasks = await invoke('What maintenance is pending?');
  for (const [name, result] of Object.entries(variants)) {
    assert.ok(['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status), `${name}: ${result.status}`);
    assert.equal(matchesMaintenanceStatusAnswerContract(result), true, `${name}: the typed contract rejects the handler's own answer`);
    if (process.env.ASK_REAL_PATH_UPDATE !== '1') assert.equal(matchesOperationAnswerContract('MAINTENANCE_STATUS', result), true, `${name}: the runtime variant contract rejects the handler's own answer`);
  }
  conformRealPath('MAINTENANCE_STATUS', variants, __filename);
});
