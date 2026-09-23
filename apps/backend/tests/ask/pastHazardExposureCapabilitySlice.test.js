const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.50: PAST_HAZARD_EXPOSURE (Home Risk Replay), the third new Ask operation for a
// capability the Appendix D audit found with none. The service is stubbed; the fake prisma throws on any model.

const prismaModule = require('../../src/lib/prisma.ts');
const { pastHazardExposureFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const pastHazards = require('../../src/propertyIntelligence/pastHazardExposure.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, get: pastHazards.getPastHazardExposure, resolveAccess: propertyAccess.resolvePropertyAccess, nodeEnv: process.env.NODE_ENV, flag: process.env.HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED };
let calls;

const hazard = (id, overrides = {}) => ({
  propertyMatchId: id, hazardType: 'FLOOD_EVENT', hazardLabel: 'Flood', category: 'PAST_EVENT', title: `Record ${id}`, factualSummary: 'River flooding was reported in the county.',
  observedAt: new Date('2024-04-02'), effectiveFrom: null,
  geography: { precision: 'COUNTY', distanceMiles: null },
  source: { key: 'noaa-storm-events', provider: 'NOAA' },
  propertyEffect: { status: 'UNKNOWN' },
  ...overrides,
});
const view = (overrides = {}) => ({
  propertyId: 'p1', generatedAt: new Date(),
  coverage: {
    state: 'CURRENT', comprehensive: false, checkedThrough: new Date('2026-09-20'),
    sources: [{ source: { key: 'noaa-storm-events', family: 'HAZARD', provider: 'NOAA' }, state: 'CURRENT', checkedThrough: new Date('2026-09-20T00:00:00.000Z') }],
    limitations: ['Source coverage is bounded by provider, geography, and checked-through date.', 'No nearby or matched observation is proof that this home was damaged.'],
  },
  pastEvents: [hazard('m1'), hazard('m2', { hazardType: 'HURRICANE_EVENT', hazardLabel: 'Hurricane', propertyEffect: { status: 'OBSERVED_EFFECT_CONFIRMED' }, geography: { precision: 'EXACT_POINT', distanceMiles: 2.34 } })],
  longTermContext: [hazard('m3', { hazardType: 'FLOOD_ZONE', hazardLabel: 'Flood', category: 'LONG_TERM_CONTEXT', title: 'FEMA flood zone AE' })],
  emptyState: null,
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
  pastHazards.getPastHazardExposure = async (...args) => { calls.push(args); return view(); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  pastHazards.getPastHazardExposure = originals.get;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
  if (originals.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originals.nodeEnv;
  if (originals.flag === undefined) delete process.env.HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED; else process.env.HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED = originals.flag;
}

test.beforeEach(install);
test.afterEach(restore);

const invoke = () => capabilityInvoke('PAST_HAZARD_EXPOSURE', { userId: 'u1', propertyId: 'p1', message: 'Show my home risk replay' });

test('in production without reviewed coverage, Ask answers unavailable (as the page route does) and never reads the data', async () => {
  process.env.NODE_ENV = 'production';
  process.env.HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED = 'false';
  const result = await invoke();
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCode, 'REVIEWED_SOURCE_COVERAGE_REQUIRED');
  assert.equal(calls.length, 0);
  process.env.HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED = 'true';
  assert.equal((await invoke()).reasonCode, 'PAST_HAZARDS_FOUND');
  assert.deepEqual(calls[0], ['p1']);
});

test('past events and long-term context are listed with the household-recorded effect and a hazard-focused link', () => {
  const result = pastHazardExposureFromView(view(), 'p1');
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.blocks[0].title, '2 past hazard events and 1 long-term hazard record matched this home');
  assert.match(result.blocks[0].body, /recorded an effect on the home for 1 of them/);
  const list = result.blocks.find((block) => block.id === 'past-hazard-exposure');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.id)]), [['Past events', ['m1', 'm2']], ['Long-term context', ['m3']]]);
  const [county, exact] = list.sections[0].items;
  assert.ok(county.meta.includes('Matched by county'));
  assert.ok(county.meta.includes('No effect on the home confirmed'));
  assert.ok(exact.meta.includes('2.3 mi away'));
  assert.ok(exact.meta.includes('Household reported an observed effect'));
  assert.equal(exact.href, '/dashboard/properties/p1/tools/home-risk-replay?focus=HURRICANE_EVENT');
});

test('the service\'s bounds are always shown, and nothing matched is never an all-clear', () => {
  const empty = pastHazardExposureFromView(view({ pastEvents: [], longTermContext: [], emptyState: 'No matching records were returned within the reviewed source scope and selected dates. This is not confirmation that no hazard occurred.' }), 'p1');
  assert.equal(empty.reasonCode, 'PAST_HAZARDS_NONE_MATCHED');
  assert.match(empty.blocks[0].body, /not confirmation that no hazard occurred/);
  assert.equal(empty.blocks[1].type, 'LIMITATION');
  assert.equal(empty.blocks.some((block) => block.type === 'GROUPED_LIST'), false);
  const stale = pastHazardExposureFromView(view({ coverage: { ...view().coverage, state: 'STALE' } }), 'p1');
  assert.equal(stale.status, 'READY_WITH_LIMITATIONS');
  assert.equal(stale.blocks[1].severity, 'CAUTION');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = pastHazardExposureFromView(view(), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'home-risk-replay.exposure', operationId: 'PAST_HAZARD_EXPOSURE', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my home risk replay', operationId: 'PAST_HAZARD_EXPOSURE', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'PAST_HAZARD_EXPOSURE', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('hazard-history phrasing routes here; current weather, claims and local changes do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
  for (const message of ['Show my home risk replay', 'Has my house ever been hit by a hurricane or a flood?', 'What past hazards has this home been exposed to?', 'Past floods near my house', 'Is my home in a flood zone?']) {
    assert.equal(route(message), 'PAST_HAZARD_EXPOSURE', message);
  }
  assert.equal(route('Storm near my home'), 'HOME_EVENT_RADAR_FEED');
  assert.equal(route('My basement flooded, help me file a claim'), 'CLAIM_FILE');
  assert.equal(route('Are there zoning changes near my home?'), 'NEIGHBORHOOD_CHANGE_FEED');
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('PAST_HAZARD_EXPOSURE').id, 'home-risk-replay');
  assert.equal(ASK_OPERATION_CAPABILITY.PAST_HAZARD_EXPOSURE, 'home-risk-replay');
  const launch = capabilityCardLaunch('home-risk-replay').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'PAST_HAZARD_EXPOSURE');
});
