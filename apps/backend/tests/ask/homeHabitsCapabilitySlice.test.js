const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.53: HOME_HABITS (Home Habit Coach), the fifth new Ask operation for a capability the
// Appendix D audit found with none. The service is stubbed; the fake prisma throws on any model.

const prismaModule = require('../../src/lib/prisma.ts');
const { homeHabitsFromView, HOME_HABITS_ASK_LIMIT } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { HomeHabitCoachService } = require('../../src/services/homeHabitCoach/homeHabitCoachService.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const NOW = new Date('2026-09-23T12:00:00.000Z');
const PAGE = '/dashboard/properties/p1/tools/home-habit-coach';
const originals = { prisma: prismaModule.prisma, list: HomeHabitCoachService.prototype.listActiveHabits, generate: HomeHabitCoachService.prototype.generateHabits, resolveAccess: propertyAccess.resolvePropertyAccess };
let calls;

const habit = (id, overrides = {}) => ({
  id, status: 'ACTIVE', titleOverride: null, descriptionOverride: null, reasonSummary: `Why ${id}`,
  dueAt: null, snoozedUntil: null, linkedMaintenanceTaskId: null, routineAdherence: null,
  reminderSchedule: { channel: 'IN_APP', nextReminderAt: null, cadenceLabel: 'Monthly' },
  habitTemplate: { title: `Habit ${id}`, shortDescription: `Short ${id}`, category: 'HVAC', cadence: 'MONTHLY', difficulty: 'EASY', estimatedMinutes: 10 },
  ...overrides,
});
const view = (overrides = {}) => ({
  habits: [
    habit('due', { dueAt: new Date('2026-09-20T00:00:00.000Z') }),
    habit('next'),
    habit('routine', { linkedMaintenanceTaskId: 't1', routineAdherence: { linkedTaskId: 't1', linkedTaskStatus: 'PENDING', lastCompletedDate: '2026-09-01T00:00:00.000Z', nextDueDate: '2026-10-01T00:00:00.000Z' } }),
    habit('snoozed', { status: 'SNOOZED', snoozedUntil: new Date('2026-10-05T00:00:00.000Z') }),
    habit('woke', { status: 'SNOOZED', snoozedUntil: new Date('2026-09-01T00:00:00.000Z') }),
  ],
  hasMore: false, nextCursor: null,
  ...overrides,
});

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  HomeHabitCoachService.prototype.listActiveHabits = async function (...args) { calls.push(args); return view(); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  HomeHabitCoachService.prototype.listActiveHabits = originals.list;
  HomeHabitCoachService.prototype.generateHabits = originals.generate;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads listActiveHabits with the page\'s own options and never generates habits', async () => {
  let generated = false;
  HomeHabitCoachService.prototype.generateHabits = async () => { generated = true; };
  await capabilityInvoke('HOME_HABITS', { userId: 'u1', propertyId: 'p1', message: 'Show my home habits' });
  assert.deepEqual(calls, [['p1', { includeSnoozed: true, limit: HOME_HABITS_ASK_LIMIT }]]);
  assert.equal(HOME_HABITS_ASK_LIMIT, 50);
  assert.equal(generated, false);
});

test('habits keep the coach\'s ranked order, split into up next, in your routine and snoozed', () => {
  const result = homeHabitsFromView(view(), 'p1', NOW);
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.reasonCode, 'HOME_HABITS_OVERDUE');
  assert.equal(result.blocks[0].title, '3 habits to work on, 1 overdue');
  assert.match(result.blocks[0].body, /1 already in your maintenance routine; 1 snoozed/);
  const list = result.blocks.find((block) => block.id === 'home-habits-items');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.id)]), [
    ['Up next', ['due', 'next', 'woke']],
    ['In your maintenance routine', ['routine']],
    ['Snoozed', ['snoozed']],
  ]);
  const [due] = list.sections[0].items;
  assert.equal(due.title, 'Habit due');
  assert.equal(due.description, 'Why due');
  assert.deepEqual(due.meta, ['Monthly', 'hvac', 'About 10 min', 'easy', 'Overdue since Sep 20, 2026']);
  assert.equal(due.href, PAGE);
  const [routine] = list.sections[1].items;
  assert.equal(routine.status, 'IN_ROUTINE');
  assert.ok(routine.meta.includes('Next due Oct 1, 2026'), routine.meta.join('|'));
  assert.ok(routine.meta.some((entry) => entry.startsWith('Last done ')), routine.meta.join('|'));
  assert.ok(list.sections[2].items[0].meta.includes('Snoozed until Oct 5, 2026'));
});

test('more habits than shown are disclosed; an empty coach is not an all-clear', () => {
  const big = homeHabitsFromView(view({ hasMore: true }), 'p1', NOW);
  assert.equal(big.status, 'READY_WITH_LIMITATIONS');
  assert.match(big.blocks.find((block) => block.type === 'LIMITATION').body, /first 5 habits/);
  const empty = homeHabitsFromView(view({ habits: [] }), 'p1', NOW);
  assert.equal(empty.reasonCode, 'HOME_HABITS_EMPTY');
  assert.equal(empty.blocks[0].title, 'No home habits are suggested yet');
  assert.match(empty.blocks[0].body, /does not mean nothing needs care/);
  assert.equal(empty.blocks.some((block) => block.type === 'GROUPED_LIST'), false);
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = homeHabitsFromView(view({ hasMore: true }), 'p1', NOW);
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'home-habits.read', operationId: 'HOME_HABITS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my home habits', operationId: 'HOME_HABITS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'HOME_HABITS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('habit phrasing routes here; maintenance due, next actions and the status board do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
  for (const message of ['Show my home habits', 'What habits should I build for my home?', 'Open my habit coach', 'Which home care habits should I pick up?']) {
    assert.equal(route(message), 'HOME_HABITS', message);
  }
  assert.equal(route('What maintenance is due?'), 'MAINTENANCE_STATUS');
  assert.equal(route('What should I do next for my home?'), 'HOME_ACTIONS');
  assert.equal(route('Show my status board'), 'HOME_STATUS_BOARD');
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('HOME_HABITS').id, 'home-habit-coach');
  assert.equal(ASK_OPERATION_CAPABILITY.HOME_HABITS, 'home-habit-coach');
  const launch = capabilityCardLaunch('home-habit-coach').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'HOME_HABITS');
});
