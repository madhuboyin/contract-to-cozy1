const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.57: HOME_UPGRADE_SCENARIOS (Home Upgrade Planner), the ninth new Ask operation for a
// capability the Appendix D audit found with none. listScenarios is stubbed and the fake prisma answers only the twin
// lookup; one test runs the real listScenarios against a fake prisma to pin the route's own query.

const prismaModule = require('../../src/lib/prisma.ts');
const { homeUpgradeScenariosFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { HomeDigitalTwinScenarioService } = require('../../src/services/homeDigitalTwinScenario.service.ts');

const PAGE = '/dashboard/properties/p1/tools/home-digital-twin';
const NOW = new Date('2026-09-23T12:00:00.000Z');
const ELECTRICAL_NOTE = 'Electrical panel and wiring work should be scoped and performed by a licensed electrician.';
const originals = { prisma: prismaModule.prisma, list: HomeDigitalTwinScenarioService.prototype.listScenarios };
let calls;
let twin;

const impact = (impactType, overrides = {}) => ({ impactType, unit: 'USD', valueNumeric: null, valueLow: null, valueHigh: null, valueText: null, isUserSupplied: false, ...overrides });
const scenario = (id, overrides = {}) => ({
  id, name: `Option ${id}`, scenarioType: 'REPAIR_COMPONENT', status: 'DRAFT', decisionStatus: 'OPEN', isPinned: false, staleAt: null,
  componentId: null, component: null, impacts: [], latestRun: null, safetyBoundary: null,
  updatedAt: '2026-09-10T12:00:00.000Z', description: 'secret assumptions', ...overrides,
});
const waterHeater = { id: 'wh', componentType: 'WATER_HEATER', label: 'Basement water heater' };
const scenarios = () => [
  scenario('repair', { componentId: 'wh', component: waterHeater, status: 'COMPUTED', updatedAt: '2026-09-12T12:00:00.000Z',
    impacts: [impact('UPFRONT_COST', { valueLow: 400, valueHigh: 700, valueNumeric: 550 }), impact('ANNUAL_SAVINGS', { valueNumeric: 999, isUserSupplied: true })] }),
  scenario('heatpump', { componentId: 'wh', component: waterHeater, name: 'Heat pump water heater', scenarioType: 'REPLACE_COMPONENT', status: 'COMPUTED', decisionStatus: 'SELECTED', updatedAt: '2026-09-15T12:00:00.000Z',
    impacts: [impact('UPFRONT_COST', { valueLow: 2800, valueHigh: 4200 }), impact('ANNUAL_SAVINGS', { valueNumeric: 450 }), impact('PAYBACK_PERIOD', { unit: 'YEARS', valueNumeric: 6 })] }),
  scenario('panel', { componentId: 'ep', component: { id: 'ep', componentType: 'ELECTRICAL', label: '' }, name: 'Panel upgrade', scenarioType: 'UPGRADE_COMPONENT', status: 'COMPUTED', staleAt: '2026-09-20T00:00:00.000Z', safetyBoundary: ELECTRICAL_NOTE, updatedAt: '2026-09-20T12:00:00.000Z' }),
  scenario('solar', { name: 'Add solar', scenarioType: 'ADD_FEATURE', status: 'READY', isPinned: true, latestRun: { status: 'RUNNING', startedAt: '2026-09-23T11:58:00.000Z' }, updatedAt: '2026-09-01T12:00:00.000Z' }),
];

function install() {
  calls = [];
  twin = { id: 'twin1' };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (model === 'homeDigitalTwin') return { findUnique: async (query) => { calls.push(['twin', query]); return twin; } };
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  HomeDigitalTwinScenarioService.prototype.listScenarios = async function (...args) { calls.push(['list', ...args]); return scenarios(); };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  HomeDigitalTwinScenarioService.prototype.listScenarios = originals.list;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation finds the twin like the scenarios route, lists its saved options, and never creates a twin', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my upgrade planner options' };
  const viewer = await capabilityInvoke('HOME_UPGRADE_SCENARIOS', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['twin', { where: { propertyId: 'p1' }, select: { id: true } }], ['list', 'twin1', {}]]);
  assert.ok(viewer.blocks.length > 0);
  calls = [];
  twin = null;
  const none = await capabilityInvoke('HOME_UPGRADE_SCENARIOS', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.equal(none.reasonCode, 'HOME_UPGRADE_NOT_STARTED');
  assert.equal(none.blocks[0].title, 'Home Upgrade Planner is not set up yet');
  assert.deepEqual(calls.map((call) => call[0]), ['twin']);
});

test('the real listScenarios query is the route\'s: this twin, archived left out, pinned then newest', async () => {
  HomeDigitalTwinScenarioService.prototype.listScenarios = originals.list;
  const queries = [];
  prismaModule.prisma = { homeTwinScenario: { findMany: async (query) => { queries.push(query); return []; } } };
  await new HomeDigitalTwinScenarioService().listScenarios('twin1', {});
  assert.deepEqual(queries[0].where, { digitalTwinId: 'twin1', isArchived: false });
  assert.deepEqual(queries[0].orderBy, [{ isPinned: 'desc' }, { createdAt: 'desc' }]);
});

test('options are grouped by system in the page\'s order, with the page\'s labels and only computed figures', () => {
  const result = homeUpgradeScenariosFromView(scenarios(), 'p1', NOW);
  assert.equal(result.blocks[0].title, '4 saved upgrade options across 3 systems');
  assert.equal(result.blocks[0].body, '2 with results ready, 1 selected. 1 has results that are out of date because the home\'s records changed; recalculate on the page.');
  assert.equal(result.reasonCode, 'HOME_UPGRADE_RESULTS_STALE');
  // FRD v1.89: the system with two options is a strip; the systems with one option stay in the list, in the page's order.
  const list = result.blocks.find((block) => block.id === 'home-upgrade-options');
  const strip = result.blocks.find((block) => block.id === 'home-upgrade-options-wh');
  assert.deepEqual(result.blocks.map((block) => block.id), ['home-upgrade-summary', 'home-upgrade-options-wh', 'home-upgrade-options', 'home-upgrade-boundary']);
  // Selected first, then a calculation in progress (pinned), then the newest.
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [
    ['Whole-home plans', ['Add solar']],
    ['Electrical Panel', ['Panel upgrade']],
  ]);
  assert.equal(strip.title, 'Basement water heater options');
  assert.deepEqual(strip.options.map((option) => option.label), ['Heat pump water heater', 'Option repair']);
  const attributes = (option) => Object.fromEntries(option.attributes.map((attribute) => [attribute.label, attribute.value]));
  const [heatPump, repair] = strip.options;
  assert.deepEqual(attributes(heatPump), { 'Upfront cost': '$2,800–$4,200', 'Annual savings': '$450', Payback: '6 years', Results: 'Results Ready' });
  assert.deepEqual(heatPump.badges, [{ label: 'Selected', basis: 'You chose this option in the Home Upgrade Planner.', policyCode: 'UPGRADE_SCENARIO_SELECTED' }]);
  assert.equal(heatPump.summary, 'Replace Component');
  assert.deepEqual(attributes(repair), { 'Upfront cost': '$400–$700', 'Annual savings': 'Not calculated yet', Payback: 'Not calculated yet', Results: 'Results Ready' });
  assert.equal(repair.badges, undefined);
  assert.equal(list.sections[0].items[0].status, 'Calculating');
  assert.deepEqual(list.sections[0].items[0].meta, ['Add Feature', 'Pinned']);
  assert.equal(list.sections[1].items[0].status, 'Results out of date');
  assert.equal(JSON.stringify(result).includes('secret assumptions'), false);
  assert.match(result.blocks.at(-1).body, new RegExp(`${ELECTRICAL_NOTE}$`));
});

test('a run older than the page\'s five-minute window is not shown as calculating; no saved options is not an all-clear', () => {
  const old = homeUpgradeScenariosFromView([scenario('solar', { status: 'READY', latestRun: { status: 'RUNNING', startedAt: '2026-09-23T11:50:00.000Z' } })], 'p1', NOW);
  assert.equal(old.blocks.find((block) => block.id === 'home-upgrade-options').sections[0].items[0].status, 'Ready');
  const none = homeUpgradeScenariosFromView([], 'p1', NOW);
  assert.equal(none.reasonCode, 'HOME_UPGRADE_NO_SCENARIOS');
  assert.equal(none.blocks[0].title, 'No saved upgrade options yet');
  assert.equal(none.blocks.at(-1).title, 'Planning estimates, not quotes');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = homeUpgradeScenariosFromView(scenarios(), 'p1', NOW);
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'home-digital-twin.scenarios', operationId: 'HOME_UPGRADE_SCENARIOS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my upgrade planner options', operationId: 'HOME_UPGRADE_SCENARIOS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'HOME_UPGRADE_SCENARIOS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('saved-option phrasing routes here; repair-or-replace advice and creating or running options do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
  for (const message of ['Show my upgrade planner options', 'Open my home digital twin', 'Which saved what-if scenarios have results ready?', 'How do our saved upgrade options compare on cost?']) {
    assert.equal(route(message), 'HOME_UPGRADE_SCENARIOS', message);
  }
  assert.equal(route('Should I repair or replace my aging appliance?'), 'REPLACEMENT_GUIDANCE');
  // Each of these names the planner, so only the exclusion keeps the deterministic pattern from claiming them. (The
  // semantic router may still offer this read, which links to the page where options are created and calculated.)
  for (const message of ['Create a new option in my upgrade planner', 'Run my what-if scenarios again', 'Add a solar option to my digital twin']) {
    const resolution = resolveAskRoutingCascade(message, { localRoutingEnabled: true });
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'HOME_UPGRADE_SCENARIOS', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('HOME_UPGRADE_SCENARIOS').id, 'home-digital-twin');
  assert.equal(ASK_OPERATION_CAPABILITY.HOME_UPGRADE_SCENARIOS, 'home-digital-twin');
  const launch = capabilityCardLaunch('home-digital-twin').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'HOME_UPGRADE_SCENARIOS');
});

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-016, FRD v1.89): each system's two to four options as a comparison strip.
const { homeUpgradeComparison } = require('../../src/services/ask/askOrchestrator.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const noRun = () => false;

test('only the homeowner\'s own Selected decision is badged; other decisions are shown as a fact, and there is no lowest-cost or fastest-payback badge', () => {
  const rows = [
    scenario('a', { decisionStatus: 'SELECTED', impacts: [impact('UPFRONT_COST', { valueNumeric: 500 }), impact('PAYBACK_PERIOD', { unit: 'YEARS', valueNumeric: 2 })] }),
    scenario('b', { decisionStatus: 'DEFERRED', impacts: [impact('UPFRONT_COST', { valueNumeric: 900 }), impact('PAYBACK_PERIOD', { unit: 'YEARS', valueNumeric: 9 })] }),
    scenario('c', { decisionStatus: 'REJECTED', status: 'FAILED' }),
  ];
  const strip = homeUpgradeComparison('wh', 'Water heater', rows, noRun);
  assert.deepEqual(strip.options.map((option) => (option.badges ?? []).map((badge) => badge.label)), [['Selected'], [], []]);
  assert.equal(strip.options[1].attributes.find((attribute) => attribute.label === 'Your decision').value, 'Deferred');
  assert.equal(strip.options[2].attributes.find((attribute) => attribute.label === 'Results').tone, 'CAUTION');
  assert.ok(strip.options.every((option) => option.attributes.every((attribute) => attribute.leading === undefined)));
  AskPresentationBlockSchema.parse(strip);
});

test('the upfront cost is declared as an amount only when it is one recorded dollar figure, never from a range or a user-supplied value', () => {
  const single = homeUpgradeComparison('wh', 'Water heater', [
    scenario('a', { impacts: [impact('UPFRONT_COST', { valueNumeric: 500 })] }),
    scenario('b', { impacts: [impact('UPFRONT_COST', { valueNumeric: 900, valueLow: 900, valueHigh: 900 })] }),
  ], noRun);
  assert.deepEqual(single.options.map((option) => option.amount), [{ value: 500, currency: 'USD' }, { value: 900, currency: 'USD' }]);
  const mixed = homeUpgradeComparison('wh', 'Water heater', [
    scenario('a', { impacts: [impact('UPFRONT_COST', { valueNumeric: 550, valueLow: 400, valueHigh: 700 })] }),
    scenario('b', { impacts: [impact('UPFRONT_COST', { valueNumeric: 900, isUserSupplied: true })] }),
  ], noRun);
  assert.deepEqual(mixed.options.map((option) => option.amount), [undefined, undefined]);
});

test('one option, or five and more, for a system stay in the list', () => {
  assert.equal(homeUpgradeComparison('wh', 'Water heater', [scenario('a')], noRun), null);
  assert.equal(homeUpgradeComparison('wh', 'Water heater', ['a', 'b', 'c', 'd', 'e'].map((id) => scenario(id)), noRun), null);
});

test('several systems each get their own strip in the page\'s order, and a system too big for a strip stays listed', () => {
  const wh = { id: 'wh', componentType: 'WATER_HEATER', label: 'Water heater' };
  const roof = { id: 'roof', componentType: 'ROOF', label: 'Roof' };
  const rows = [
    scenario('w1', { componentId: 'wh', component: wh }), scenario('w2', { componentId: 'wh', component: wh }),
    scenario('r1', { componentId: 'roof', component: roof, updatedAt: '2026-09-20T12:00:00.000Z' }), scenario('r2', { componentId: 'roof', component: roof, updatedAt: '2026-09-20T12:00:00.000Z' }),
    ...['a', 'b', 'c', 'd', 'e'].map((id) => scenario(`h${id}`, { componentId: 'hv', component: { id: 'hv', componentType: 'HVAC', label: 'HVAC' } })),
  ];
  const result = homeUpgradeScenariosFromView(rows, 'p1', NOW);
  assert.deepEqual(result.blocks.map((block) => block.id), ['home-upgrade-summary', 'home-upgrade-options-roof', 'home-upgrade-options-wh', 'home-upgrade-options', 'home-upgrade-boundary']);
  assert.deepEqual(result.blocks.find((block) => block.id === 'home-upgrade-options').sections.map((section) => section.title), ['HVAC']);
});

test('the real handler keeps a strip answer through the answer checker with answer relevance on', async () => {
  const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
  const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  const result = await capabilityInvoke('HOME_UPGRADE_SCENARIOS', { userId: 'u1', propertyId: 'p1', message: 'Show my upgrade planner options' }, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.ok(result.blocks.some((block) => block.type === 'COMPARISON'));
  const checked = validateAskAnswerTrustPipeline({
    question: 'Show my upgrade planner options', operationId: 'HOME_UPGRADE_SCENARIOS', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('HOME_UPGRADE_SCENARIOS')]),
  });
  assert.equal(checked.result.status, 'ANSWERED', JSON.stringify(checked.semantic));
  assert.ok(checked.result.blocks.some((block) => block.type === 'COMPARISON'));
});

test('COMPARISON is allowed for the operation in the registry and the home digital twin skill', () => {
  const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
  assert.ok(ASK_OPERATION_DEFINITIONS.HOME_UPGRADE_SCENARIOS.allowedBlockTypes.includes('COMPARISON'));
  assert.ok(getSkillForOperation('HOME_UPGRADE_SCENARIOS').allowedResultBlocks.includes('COMPARISON'));
});
