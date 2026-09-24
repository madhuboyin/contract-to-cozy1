const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.58: DIY_PROJECTS (DIY Project Center), the tenth new Ask operation for a capability
// the Appendix D audit found with none. diyService.listProjects is stubbed for the answer tests; one test runs it
// against a fake prisma to pin the page's own query.

const prismaModule = require('../../src/lib/prisma.ts');
const { diyProjectsFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { diyService } = require('../../src/services/diy.service.ts');

const PAGE = '/dashboard/properties/p1/tools/diy';
const originals = { prisma: prismaModule.prisma, list: diyService.listProjects };
let calls;

const project = (id, overrides = {}) => ({
  id, title: `Project ${id}`, category: 'PAINTING', status: 'IN_PROGRESS', decisionVerdict: null,
  requiredStepCount: 5, completedStepCount: 3, templateId: null, startedAt: null, completedAt: null, createdAt: '2026-09-10T12:00:00.000Z', ...overrides,
});
const view = (overrides = {}) => ({
  items: [
    project('hall', { title: 'Repaint the hallway' }),
    project('tub', { title: 'Re-caulk the tub', category: 'PLUMBING', status: 'PLANNING', completedStepCount: 0, requiredStepCount: 4, decisionVerdict: 'DIY_RECOMMENDED' }),
    project('fan', { title: 'Swap the bathroom fan', category: 'ELECTRICAL', status: 'PLANNING', decisionVerdict: 'HIRE_RECOMMENDED', completedStepCount: 0, requiredStepCount: 6 }),
  ],
  nextCursor: undefined,
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
  diyService.listProjects = async (...args) => { calls.push(args); return view(); };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  diyService.listProjects = originals.list;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads the page\'s active-project list (planning and in progress) behind the page\'s viewer floor', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my DIY projects' };
  const viewer = await capabilityInvoke('DIY_PROJECTS', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1', { status: ['PLANNING', 'IN_PROGRESS'] }]]);
  assert.equal(viewer.reasonCode, 'DIY_PROJECTS_READY');
});

test('the real list query is the page\'s: this property, those statuses, newest first, a page of 20', async () => {
  diyService.listProjects = originals.list;
  const queries = [];
  prismaModule.prisma = { diyProject: { findMany: async (query) => { queries.push(query); return []; } } };
  await diyService.listProjects('p1', { status: ['PLANNING', 'IN_PROGRESS'] });
  assert.deepEqual(queries[0].where, { propertyId: 'p1', status: { in: ['PLANNING', 'IN_PROGRESS'] } });
  assert.deepEqual(queries[0].orderBy, { createdAt: 'desc' });
  assert.equal(queries[0].take, 21);
});

test('projects are summarized and listed with the page\'s labels, step progress and project links', () => {
  const result = diyProjectsFromView(view(), 'p1');
  assert.equal(result.blocks[0].title, '3 active DIY projects');
  assert.equal(result.blocks[0].body, '1 in progress, 2 in planning. 1 was assessed as better hired out.');
  assert.equal(result.blocks[0].tone, 'CAUTION');
  const list = result.blocks.find((block) => block.id === 'diy-projects');
  assert.deepEqual(list.sections[0].items.map((row) => [row.title, row.status, row.meta]), [
    ['Repaint the hallway', 'In Progress', ['Painting', '3/5 steps']],
    ['Re-caulk the tub', 'Planning', ['Plumbing', '0/4 steps', 'DIY Recommended']],
    ['Swap the bathroom fan', 'Planning', ['Electrical', '0/6 steps', 'Hire Recommended']],
  ]);
  assert.equal(list.sections[0].items[0].href, '/dashboard/diy/projects/hall?propertyId=p1');
  assert.equal(result.blocks.some((block) => block.id === 'diy-limit'), false);
  assert.equal(result.blocks[0].actions[0].href, PAGE);
});

test('a second page is disclosed; no active projects is not an all-clear', () => {
  const more = diyProjectsFromView(view({ nextCursor: 'fan' }), 'p1');
  assert.equal(more.blocks[0].title, '3+ active DIY projects');
  assert.equal(more.blocks.find((block) => block.id === 'diy-limit').body, 'You have more active DIY projects than this. The rest are in the DIY Project Center.');
  const none = diyProjectsFromView({ items: [] }, 'p1');
  assert.equal(none.reasonCode, 'DIY_NO_ACTIVE_PROJECTS');
  assert.equal(none.blocks[0].title, 'No DIY projects in progress');
  assert.match(none.blocks.at(-1).body, /Electrical panel or wiring work, gas lines, structural work, active leaks or flooding, and hazardous materials/);
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = diyProjectsFromView(view({ nextCursor: 'fan' }), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'diy.projects', operationId: 'DIY_PROJECTS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my DIY projects', operationId: 'DIY_PROJECTS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'DIY_PROJECTS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('DIY-project phrasing routes here; the DIY-or-hire question and starting a project are not claimed by the pattern', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my DIY projects', 'Open the DIY project center', 'Which DIY projects am I in the middle of?', 'Which of our DIY projects still have steps left?']) {
    assert.equal(route(message).operation?.operationId, 'DIY_PROJECTS', message);
  }
  // Each of these names DIY projects, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Start a new DIY project for painting the fence', 'Should I start a DIY project or hire someone?', 'Complete my DIY project for the tub']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'DIY_PROJECTS', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('DIY_PROJECTS').id, 'diy');
  assert.equal(ASK_OPERATION_CAPABILITY.DIY_PROJECTS, 'diy');
  const launch = capabilityCardLaunch('diy').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'DIY_PROJECTS');
});
