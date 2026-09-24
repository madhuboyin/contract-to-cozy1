const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.59: PROJECT_TRACKER_PROJECTS (Project Tracker), the eleventh new Ask operation for a
// capability the Appendix D audit found with none. projectTracker.service listProjects is stubbed for the answer tests;
// one test runs it against a fake prisma to pin the page's own query.

const prismaModule = require('../../src/lib/prisma.ts');
const { trackedProjectsFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const projectTrackerModule = require('../../src/services/projectTracker.service.ts');

const PAGE = '/dashboard/properties/p1/projects';
const originals = { prisma: prismaModule.prisma, list: projectTrackerModule.listProjects };
let calls;

const project = (id, overrides = {}) => ({
  id, name: `Project ${id}`, projectType: 'KITCHEN_REMODEL', status: 'IN_PROGRESS', contractorName: 'Apex Builders', fulfillmentMode: 'PROFESSIONAL',
  currentContractAmountCents: 4_000_000, paidToDateCents: 2_800_000, expectedEndDate: new Date('2026-11-15T12:00:00.000Z'), warrantyExpiresAt: null,
  createdAt: new Date('2026-09-01T12:00:00.000Z'), ...overrides,
});
const projects = () => [
  project('kitchen', { name: 'Kitchen remodel' }),
  project('roof', { name: 'Roof replacement', projectType: 'ROOF_REPLACEMENT', status: 'PLANNING', contractorName: null, fulfillmentMode: 'DIY', currentContractAmountCents: 0, paidToDateCents: 0, expectedEndDate: null }),
  project('fence', { name: 'Fence dispute', projectType: 'CUSTOM', status: 'DISPUTED', contractorName: null, currentContractAmountCents: 500_000, paidToDateCents: 250_000, expectedEndDate: null }),
  project('hvac', { name: 'HVAC replacement', projectType: 'HVAC_REPLACEMENT', status: 'COMPLETED', currentContractAmountCents: 1_200_000, paidToDateCents: 1_150_000, warrantyExpiresAt: new Date('2031-06-01T12:00:00.000Z') }),
  project('deck', { name: 'Deck', projectType: 'DECK_PATIO', status: 'CANCELLED', paidToDateCents: 0, expectedEndDate: null }),
];

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  projectTrackerModule.listProjects = async (...args) => { calls.push(args); return projects(); };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  projectTrackerModule.listProjects = originals.list;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads the Project Tracker list behind the page\'s viewer floor', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my project tracker' };
  const viewer = await capabilityInvoke('PROJECT_TRACKER_PROJECTS', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1']]);
  assert.equal(viewer.reasonCode, 'PROJECT_TRACKER_PROJECTS_READY');
});

test('the real list query is the page\'s: this property, newest first', async () => {
  const queries = [];
  prismaModule.prisma = { projectRecord: { findMany: async (query) => { queries.push(query); return []; } } };
  await originals.list('p1');
  assert.deepEqual(queries[0].where, { propertyId: 'p1' });
  assert.deepEqual(queries[0].orderBy, { createdAt: 'desc' });
});

test('projects are grouped active, completed, cancelled with the page\'s labels, amounts and dates', () => {
  const result = trackedProjectsFromView(projects(), 'p1');
  assert.equal(result.blocks[0].title, '3 active projects, 1 completed');
  assert.equal(result.blocks[0].body, 'Lifetime spend on completed projects: $11,500. 1 is marked disputed. 1 cancelled.');
  assert.equal(result.blocks[0].tone, 'CAUTION');
  const list = result.blocks.find((block) => block.id === 'project-tracker-projects');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [
    ['Active projects', ['Kitchen remodel', 'Roof replacement', 'Fence dispute']],
    ['Completed', ['HVAC replacement']],
    ['Cancelled', ['Deck']],
  ]);
  const [kitchen, roof, fence] = list.sections[0].items;
  assert.deepEqual(kitchen.meta, ['Kitchen Remodel · Apex Builders', 'Contract $40,000', 'Paid $28,000', 'Remaining $12,000', 'Due Nov 15, 2026']);
  assert.equal(kitchen.status, 'In Progress');
  assert.equal(roof.meta[0], 'Roof Replacement · DIY / household');
  assert.equal(fence.meta[0], 'Custom Project · Provider not recorded');
  assert.equal(fence.status, 'Disputed');
  assert.deepEqual(list.sections[1].items[0].meta, ['HVAC Replacement · Apex Builders', 'Contract $12,000', 'Paid $11,500', 'Warranty expires Jun 1, 2031']);
  assert.equal(kitchen.href, `${PAGE}/kitchen`);
});

test('no projects is not an all-clear; nothing completed says no spend yet', () => {
  const none = trackedProjectsFromView([], 'p1');
  assert.equal(none.reasonCode, 'PROJECT_TRACKER_NO_PROJECTS');
  assert.equal(none.blocks[0].title, 'No projects yet');
  assert.equal(none.blocks.at(-1).title, 'Your records, not a contract review');
  const activeOnly = trackedProjectsFromView([project('kitchen')], 'p1');
  assert.equal(activeOnly.blocks[0].body, 'No spend recorded on completed projects yet.');
  assert.equal(activeOnly.blocks[0].tone, 'DEFAULT');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = trackedProjectsFromView(projects(), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'project-tracker.projects', operationId: 'PROJECT_TRACKER_PROJECTS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my project tracker', operationId: 'PROJECT_TRACKER_PROJECTS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'PROJECT_TRACKER_PROJECTS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('project phrasing routes here; DIY projects and renovation permit readiness do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my project tracker', 'Show my projects', 'Which contractor projects are still in progress?', 'Which of our contractor projects are still open?', 'What projects am I tracking?']) {
    assert.equal(route(message).operation?.operationId, 'PROJECT_TRACKER_PROJECTS', message);
  }
  assert.equal(route('Show my DIY projects').operation?.operationId, 'DIY_PROJECTS');
  assert.equal(route('What is the permit status of my renovation projects?').operation?.operationId, 'RENOVATION_PERMIT_READINESS');
  // Each of these matches the project pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Start a new one of my contractor projects', 'Are my renovation projects ready to begin?', 'Which of my projects need permits?']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'PROJECT_TRACKER_PROJECTS', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('PROJECT_TRACKER_PROJECTS').id, 'project-tracker');
  assert.equal(ASK_OPERATION_CAPABILITY.PROJECT_TRACKER_PROJECTS, 'project-tracker');
  const launch = capabilityCardLaunch('project-tracker').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'PROJECT_TRACKER_PROJECTS');
});
