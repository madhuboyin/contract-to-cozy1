const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.49: NEIGHBORHOOD_CHANGE_FEED (Around Your Home), the second new Ask operation for
// a capability the Appendix D audit found with none. The service is stubbed; the fake prisma throws on any model.

const prismaModule = require('../../src/lib/prisma.ts');
const { neighborhoodChangeFeedFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { CAPABILITY_SKILL_GUIDANCE_BRIDGE, ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const aroundYourHome = require('../../src/propertyIntelligence/aroundYourHome.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, get: aroundYourHome.getAroundYourHome, resolveAccess: propertyAccess.resolvePropertyAccess };
let calls;

const item = (id, overrides = {}) => ({
  propertyMatchId: id,
  observation: { observationType: 'PLANNING_APPLICATION', lifecycleStatus: 'ACTIVE', observedAt: new Date('2026-09-10'), revision: 1, facts: { title: `Record ${id}`, summary: 'A four-story mixed-use building was proposed.' } },
  geography: { precision: 'EXACT_POINT', distanceMiles: 0.42 },
  source: { key: 'city-planning', family: 'PLANNING', provider: 'City Planning Department', lastCheckedAt: new Date('2026-09-20') },
  possibleRelevance: { relevance: 'POSSIBLE', materiality: 'INFORMATIONAL' },
  interaction: { disposition: 'DEFAULT', hasMaterialUpdate: false },
  ...overrides,
});
const view = (overrides = {}) => ({
  property: { id: 'p1' },
  coverage: {
    state: 'CURRENT', comprehensive: false,
    sources: [{ source: { key: 'city-planning', family: 'PLANNING', provider: 'City Planning Department' }, state: 'CURRENT', checkedThrough: new Date('2026-09-20T00:00:00.000Z') }],
    limitations: ['Coverage is limited to the listed reviewed sources, record types, and geographies.'],
  },
  items: [item('m1'), item('m2', { source: { key: 'school-district', family: 'SCHOOL', provider: 'School District', lastCheckedAt: new Date('2026-09-20') }, interaction: { disposition: 'FOLLOWING', hasMaterialUpdate: true } }), item('m3', { interaction: { disposition: 'DISMISSED', hasMaterialUpdate: false } })],
  interpretationBoundary: 'Around Your Home reports reviewed source facts and bounded geographic relevance.',
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
  aroundYourHome.getAroundYourHome = async (...args) => { calls.push(args); return view(); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  aroundYourHome.getAroundYourHome = originals.get;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads getAroundYourHome for this user and property in the server environment, as the page route does', async () => {
  await capabilityInvoke('NEIGHBORHOOD_CHANGE_FEED', { userId: 'u1', propertyId: 'p1', message: "What's changing around my home?" });
  assert.deepEqual(calls[0].slice(0, 2), ['p1', 'u1']);
  assert.equal(calls[0][2], process.env.NODE_ENV ?? 'development');
});

test('changes are grouped by source with relevance, distance, provider and interaction state; dismissed items are counted, not listed', () => {
  const result = neighborhoodChangeFeedFromView(view(), 'p1');
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.blocks[0].title, '2 reviewed local changes matched this home');
  assert.match(result.blocks[0].body, /1 item you dismissed or marked not relevant is not listed/);
  const list = result.blocks.find((block) => block.id === 'neighborhood-changes');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.id)]), [['Planning and development', ['m1']], ['Schools', ['m2']]]);
  assert.deepEqual(list.sections[0].items[0].meta.slice(0, 3), ['Possible relevance: possible', '0.4 mi away', 'City Planning Department']);
  assert.ok(list.sections[1].items[0].meta.includes('Updated since you last looked'));
  assert.ok(list.sections[1].items[0].meta.includes('Following'));
  assert.equal(list.sections[0].items[0].href, '/dashboard/properties/p1/tools/neighborhood-change-radar');
});

test('coverage that is not current, or not configured, is disclosed rather than reported as an all-clear', () => {
  const degraded = neighborhoodChangeFeedFromView(view({ coverage: { ...view().coverage, state: 'STALE' } }), 'p1');
  assert.equal(degraded.status, 'READY_WITH_LIMITATIONS');
  assert.ok(degraded.blocks.some((block) => block.type === 'LIMITATION'));
  const none = neighborhoodChangeFeedFromView(view({ items: [], coverage: { state: 'NOT_CONFIGURED', comprehensive: false, sources: [], limitations: ['No reviewed local-change source coverage is configured for this property.'] } }), 'p1');
  assert.equal(none.reasonCode, 'NEIGHBORHOOD_COVERAGE_NOT_CONFIGURED');
  assert.equal(none.blocks[0].title, 'Local-change coverage is not set up for this home yet');
  assert.equal(none.blocks.some((block) => block.type === 'GROUPED_LIST' || block.type === 'EVIDENCE'), false);
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = neighborhoodChangeFeedFromView(view({ coverage: { ...view().coverage, state: 'DEGRADED' } }), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'neighborhood-change.feed', operationId: 'NEIGHBORHOOD_CHANGE_FEED', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: "What's changing around my home?", operationId: 'NEIGHBORHOOD_CHANGE_FEED', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'NEIGHBORHOOD_CHANGE_FEED', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('local-change phrasing routes here; weather near the home, changes inside it and own-project permits do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
  for (const message of ['Show my Around Your Home feed', 'Are there zoning changes near my home?', "What's changing around my home?", 'Any permits filed near my house?', 'Anny new construction near my house?']) {
    assert.equal(route(message), 'NEIGHBORHOOD_CHANGE_FEED', message);
  }
  assert.equal(route('What is happening near my home?'), 'HOME_EVENT_RADAR_FEED');
  assert.equal(route('What changed in my home recently?'), 'HOME_CHANGE_SUMMARY');
  assert.notEqual(route('Do I need a permit for my deck?'), 'NEIGHBORHOOD_CHANGE_FEED');
});

test('the operation is fully registered: viewer read, its own skill, the bridge, and the card launch', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.NEIGHBORHOOD_CHANGE_FEED.propertyRoleFloor, 'VIEWER');
  assert.equal(getSkillForOperation('NEIGHBORHOOD_CHANGE_FEED').id, 'neighborhood-change-radar');
  assert.deepEqual(CAPABILITY_SKILL_GUIDANCE_BRIDGE.find((entry) => entry.capabilityId === 'neighborhood-change-radar').operationIds, ['NEIGHBORHOOD_CHANGE_FEED']);
  assert.equal(ASK_OPERATION_CAPABILITY.NEIGHBORHOOD_CHANGE_FEED, 'neighborhood-change-radar');
  const launch = capabilityCardLaunch('neighborhood-change-radar').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'NEIGHBORHOOD_CHANGE_FEED');
});
