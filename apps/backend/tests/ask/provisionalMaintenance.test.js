// FR-FAST-10 / FR-GATE-8, slice 2: MAINTENANCE_STATUS may be tried provisionally because it has a grounded delivery check. The real handler runs (through capabilityInvoke, stubbed task service) and its answer goes through the delivery gate
// with `provisionalRead`: no canonical bypass, the answer must be a verified variant, about maintenance, and the view the homeowner named must be the view applied.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const prismaModule = require('../../src/lib/prisma.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/maintenance.handler.ts');
const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');
const { skillContextProviderKey } = require('../../src/services/skills/context/skillContextProviderRegistry.ts');
const { MAINTENANCE_TASK_CONTEXT_PROVIDER } = require('../../src/services/skills/maintenance/skill.manifest.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedMaintenanceVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const { PROVISIONAL_READ_OPERATIONS, isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const DAY = 86_400_000; const relative = (days) => new Date(Date.now() + days * DAY);
const originals = { prisma: prismaModule.prisma, getTasks: PropertyMaintenanceTaskService.getTasksForProperty };
const task = (id, overrides = {}) => ({ id, title: `Task ${id}`, description: null, category: 'HVAC', assetType: null, serviceCategory: null, season: null, status: 'PENDING', priority: 'MEDIUM', source: 'USER_CREATED', nextDueDate: null, lastCompletedDate: null, updatedAt: new Date('2026-09-01T00:00:00Z'), actualCost: null, estimatedCost: null, isRecurring: false, frequency: null, inventoryItem: null, room: null, ...overrides });
const MIXED = () => [task('filter', { title: 'Replace HVAC filter', nextDueDate: relative(-12) }), task('flush', { title: 'Flush water heater', nextDueDate: relative(5) }), task('gutters', { title: 'Clean gutters', nextDueDate: relative(60) }), task('caulk', { title: 'Re-caulk tub' }), task('done', { title: 'Service furnace', status: 'COMPLETED', lastCompletedDate: relative(-40), actualCost: 140 })];
function install(tasks) { prismaModule.prisma = new Proxy({ householdMember: { findUnique: async () => ({ role: 'OWNER', isPrimaryOwner: true }) } }, { get(t, m) { if (m === 'then') return undefined; if (m in t) return t[m]; throw new Error(`Unexpected prisma.${String(m)} access`); } }); PropertyMaintenanceTaskService.getTasksForProperty = async () => tasks; }
test.afterEach(() => { prismaModule.prisma = originals.prisma; PropertyMaintenanceTaskService.getTasksForProperty = originals.getTasks; });
const invoke = (message) => capabilityInvoke('MAINTENANCE_STATUS', { userId: 'u1', propertyId: 'p1', message }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' }, composedContext: { entries: [], values: { [skillContextProviderKey(MAINTENANCE_TASK_CONTEXT_PROVIDER)]: { propertyTimezone: 'America/New_York', purchaseDate: null } } } });
const gate = (question, result) => validateAskAnswerTrustPipeline({ question, operationId: 'MAINTENANCE_STATUS', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')]) });

test('the allowlist is exactly the operations that have a grounded check, and each is a harmless read', () => {
  assert.deepEqual([...PROVISIONAL_READ_OPERATIONS].sort(), Object.keys(GROUNDED_READ_CHECKS).sort()); assert.deepEqual([...PROVISIONAL_READ_OPERATIONS].sort(), ['DATA_POINT_READ', 'HOME_BASICS_GUIDE', 'HOME_STATUS_BOARD', 'MAINTENANCE_STATUS', 'PROPERTY_SUMMARY', 'WARRANTY_LOOKUP']);
  for (const op of PROVISIONAL_READ_OPERATIONS) assert.equal(isProvisionalReadOperation(op), true, op);
  for (const message of ['Show my maintenance tasks', 'What maintenance is overdue?']) { const d = resolveAskRoutingCascade(message, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', message); assert.equal(d.operation.operationId, 'MAINTENANCE_STATUS', message); }
  // a rule that matched a command, a cost or forecast question or a snoozed-items question is not asking for the list: the read is never started
  for (const message of ['Add a maintenance task to clean the gutters', 'Mark my HVAC filter task as done', 'Reschedule my gutter cleaning', 'snooze that task for a week', 'yearly maintenance cost estimate', 'which tasks are snoozed']) { const d = resolveAskRoutingCascade(message, { localRoutingEnabled: true }); assert.ok(!(d.stage === 'PROVISIONAL' && d.operation.operationId === 'MAINTENANCE_STATUS'), message); }
});
test('the real maintenance answers are delivered for the questions that reach them, each in the view that was asked for', async () => {
  for (const [question, expected] of [['Show my maintenance tasks', ['overdue', 'due-soon', 'later', 'no-due-date', 'completed']], ['What maintenance is overdue?', ['overdue']], ['What is due soon?', ['due']], ['What maintenance did I complete?', ['overdue', 'due-soon', 'later', 'no-due-date', 'completed']]]) {
    install(MIXED()); const answer = await invoke(question); const sections = answer.blocks.find((b) => b.id === 'maintenance-groups').sections.map((s) => s.id);
    assert.deepEqual(sections, expected, question);
    const checked = gate(question, answer);
    assert.equal(checked.semantic.outcome, 'PASS', `${question}: ${JSON.stringify(checked.semantic)}`); assert.deepEqual(checked.semantic.reasonCodes, ['PROVISIONAL_READ_GROUNDED']); assert.notEqual(checked.trust.outcome, 'CLARIFY', question);
  }
  install([]); const empty = await invoke('Show my maintenance tasks'); assert.equal(gate('Show my maintenance tasks', empty).semantic.outcome, 'PASS', 'no tasks recorded is an honest, grounded answer');
});
test('an answer that does not match the question is withheld: the wrong view, the wrong topic, an unverified shape', async () => {
  install(MIXED());
  const overdueAnswer = await invoke('What maintenance is overdue?'); const completedAnswer = await invoke('What maintenance did I complete?'); const openAnswer = await invoke('Show my maintenance tasks');
  const reasons = (q, a) => groundedMaintenanceVerdict(q, a).reasonCodes[1];
  assert.equal(reasons('What maintenance is overdue?', completedAnswer), 'VIEW_DOES_NOT_MATCH_OVERDUE_QUESTION'); assert.equal(reasons('What maintenance is overdue?', openAnswer), 'VIEW_DOES_NOT_MATCH_OVERDUE_QUESTION');
  assert.equal(reasons('What maintenance did I complete?', overdueAnswer), 'VIEW_DOES_NOT_MATCH_COMPLETED_QUESTION'); assert.equal(reasons('What is due soon?', overdueAnswer), 'VIEW_DOES_NOT_MATCH_DUE_SOON_QUESTION');
  assert.equal(reasons('Show my maintenance tasks', overdueAnswer), 'FILTERED_VIEW_FOR_AN_UNFILTERED_QUESTION');
  assert.equal(reasons('When does my warranty expire?', openAnswer), 'QUESTION_NOT_ABOUT_MAINTENANCE'); assert.equal(reasons('Which maintenance tasks are covered by my warranty?', openAnswer), 'ANOTHER_OPERATION_OWNS_THE_QUESTION'); assert.equal(reasons('What is the weather like?', openAnswer), 'QUESTION_NOT_ABOUT_MAINTENANCE');
  const unverified = { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'maintenance-summary-NEW', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], suggestions: [], parameters: {} };
  assert.equal(reasons('Show my maintenance tasks', unverified), 'ANSWER_IS_NOT_A_VERIFIED_VARIANT');
  const checked = gate('What maintenance is overdue?', completedAnswer); assert.equal(checked.semantic.outcome, 'FAIL'); assert.equal(checked.trust.outcome, 'CLARIFY');
});
