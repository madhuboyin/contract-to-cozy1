const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.68: DO_NOTHING_SIMULATION (Do-Nothing Simulator), the nineteenth new Ask operation for a
// capability the Appendix D audit found with none. The real getLatestRun and listScenarios run against fake prisma
// models, including the primary-owner check and the coverage-conflict gate.

const prismaModule = require('../../src/lib/prisma.ts');
const { doNothingSimulationFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');

const PAGE = '/dashboard/properties/p1/tools/do-nothing';
const original = prismaModule.prisma;
let queries;

const scenario = (id, overrides = {}) => ({
  id, propertyId: 'p1', homeownerProfileId: 'hp1', name: `Scenario ${id}`, horizonMonths: 12, inputOverrides: {},
  createdAt: new Date('2026-09-01T12:00:00.000Z'), updatedAt: new Date('2026-09-01T12:00:00.000Z'), ...overrides,
});
const run = (overrides = {}) => ({
  id: 'run1', propertyId: 'p1', homeownerProfileId: 'hp1', scenarioId: 's1', status: 'READY', confidence: 'MEDIUM', horizonMonths: 12,
  summary: 'Deferred upkeep raises risk.', riskScoreDelta: 14, expectedCostDeltaCentsMin: 320000, expectedCostDeltaCentsMax: 780000, incidentLikelihood: 'HIGH',
  // Stored as outputsSnapshot on the run row; the service's mapper turns it into the DTO's outputs.
  outputsSnapshot: {
    topRiskDrivers: [{ code: 'ROOF', title: 'Aging roof', detail: 'Past typical life', severity: 'HIGH' }],
    topCostDrivers: [{ code: 'WH', title: 'Water heater failure', detail: 'Tank age 14 years', severity: 'MEDIUM' }],
    biggestAvoidableLosses: [{ title: 'Leak damage', detail: 'From a failed tank', estCostCentsMin: 150000, estCostCentsMax: 400000 }],
  },
  nextSteps: [{ title: 'Schedule a roof inspection', detail: 'Before winter', priority: 'HIGH' }],
  decisionTrace: [], computedAt: new Date('2026-09-15T12:00:00.000Z'), createdAt: new Date('2026-09-15T12:00:00.000Z'), ...overrides,
});

// The DTO shape the service returns, for the view-only tests.
const dto = () => { const { outputsSnapshot, ...rest } = run(); return { ...rest, outputs: outputsSnapshot }; };

function install({ owner = true, conflict = false, latest = run(), scenarios = [scenario('s1', { name: 'Skip a year', inputOverrides: { skipMaintenance: true, riskTolerance: 'LOW' } })] } = {}) {
  queries = [];
  prismaModule.prisma = {
    property: { findFirst: async (query) => { queries.push(['property', query]); return owner ? { id: 'p1', homeownerProfileId: 'hp1' } : null; } },
    doNothingScenario: { findMany: async (query) => { queries.push(['scenarios', query]); return scenarios; } },
    doNothingSimulationRun: { findFirst: async (query) => { queries.push(['run', query]); return latest; } },
    // assertCoverageConflictFree reads pending policy terms first; the conflict case stands in for its refusal.
    insurancePolicyTerm: { findMany: async () => {
      if (conflict) throw Object.assign(new Error('Resolve conflicting coverage records before using them for this decision.'), { statusCode: 409, code: 'COVERAGE_CONFLICT_REVIEW_REQUIRED' });
      return [];
    } },
    insurancePolicyFact: { findMany: async () => [] },
  };
}

test.beforeEach(() => install());
test.afterEach(() => { prismaModule.prisma = original; });

const invoke = () => capabilityInvoke('DO_NOTHING_SIMULATION', { userId: 'u1', propertyId: 'p1', message: 'Show my do-nothing simulation' }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });

test('the operation runs the page\'s load: primary owner only, this owner\'s scenarios, the latest run with no filter', async () => {
  const result = await invoke();
  assert.equal(result.reasonCode, 'DO_NOTHING_READY');
  assert.deepEqual(queries.find(([name]) => name === 'property')[1].where, { id: 'p1', homeownerProfile: { userId: 'u1' } });
  assert.deepEqual(queries.find(([name]) => name === 'scenarios')[1].where, { propertyId: 'p1', homeownerProfileId: 'hp1' });
  assert.deepEqual(queries.find(([name]) => name === 'run')[1].where, { propertyId: 'p1' });
});

test('a household member who is not the primary owner is told so, not shown an error', async () => {
  install({ owner: false });
  const result = await invoke();
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasonCode, 'DO_NOTHING_PRIMARY_OWNER_ONLY');
});

test('the latest run is summarized with cost range, risk change, likelihood, confidence and its scenario; drivers and scenarios listed', async () => {
  const result = await invoke();
  const [summary, list] = result.blocks;
  assert.equal(summary.title, 'If upkeep is put off for 12 months');
  assert.equal(summary.body, 'Estimated extra cost: $3,200 to $7,800. Risk score rises by 14. Incident likelihood: High. Confidence: Medium. Run Sep 15, 2026 for "Skip a year".');
  assert.equal(summary.tone, 'CAUTION');
  assert.equal(summary.actions[0].href, PAGE);
  assert.equal(result.blocks.some((block) => block.id === 'do-nothing-status'), false);
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((item) => item.title)]), [
    ['Biggest avoidable losses', ['Leak damage']],
    ['Top risk drivers', ['Aging roof']],
    ['Top cost drivers', ['Water heater failure']],
    ['Suggested next steps', ['Schedule a roof inspection']],
    ['Saved scenarios', ['Skip a year']],
  ]);
  assert.deepEqual(list.sections[0].items[0].meta, ['$1,500 to $4,000']);
  assert.equal(list.sections[1].items[0].status, 'High severity');
  assert.deepEqual(list.sections[4].items[0].meta, ['Skips maintenance', 'Low risk tolerance']);
});

test('a stale, failed or low-data run is disclosed; no run is not an all-clear', () => {
  const view = (overrides) => doNothingSimulationFromView({ run: { ...dto(), ...overrides }, scenarios: [] }, 'p1');
  assert.equal(view({ status: 'STALE' }).blocks.find((block) => block.id === 'do-nothing-status').title, 'This run is out of date');
  assert.equal(view({ status: 'ERROR' }).blocks.find((block) => block.id === 'do-nothing-status').title, 'This run did not finish cleanly');
  assert.equal(view({ confidence: 'LOW' }).blocks.find((block) => block.id === 'do-nothing-status').title, 'Low-data run');
  const none = doNothingSimulationFromView({ run: null, scenarios: [scenario('s2')] }, 'p1');
  assert.equal(none.reasonCode, 'DO_NOTHING_NO_RUN');
  assert.equal(none.blocks[0].body, 'The Do-Nothing Simulator estimates what putting off home upkeep could cost over 6 to 36 months. 1 saved scenario is ready to run. Open it to run one.');
  assert.equal(none.blocks.at(-1).title, 'An estimate, not a prediction');
});

test('conflicting coverage records block the run the same way the page does, with a plain explanation', async () => {
  install({ conflict: true });
  const result = await invoke();
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasonCode, 'DO_NOTHING_COVERAGE_CONFLICT');
  assert.equal(result.blocks[0].title, 'Resolve conflicting coverage records first');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', async () => {
  const raw = doNothingSimulationFromView({ run: { ...dto(), status: 'STALE' }, scenarios: [scenario('s1')] }, 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'do-nothing-simulator.latest', operationId: 'DO_NOTHING_SIMULATION', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my do-nothing simulation', operationId: 'DO_NOTHING_SIMULATION', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'DO_NOTHING_SIMULATION', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
});

test('cost-of-waiting questions route here; running or editing a simulation and one item\'s decision are not claimed', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my do-nothing simulation', 'What is the cost of doing nothing on this house?', 'What happens if we keep putting things off?', 'What would the cost of waiting a year be for our house?']) {
    assert.equal(route(message).operation?.operationId, 'DO_NOTHING_SIMULATION', message);
  }
  // Each of these matches the pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Run a new do-nothing simulation', 'Rename my do-nothing scenario', 'Delete the do-nothing scenario']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'DO_NOTHING_SIMULATION', false, message);
  }
});

test('the operation is fully registered: its own skill, the owner floor, the bridge, and the card launch', () => {
  const skill = getSkillForOperation('DO_NOTHING_SIMULATION');
  assert.equal(skill.id, 'do-nothing-simulator');
  assert.equal(skill.authorizationFloor, 'OWNER');
  assert.equal(ASK_OPERATION_CAPABILITY.DO_NOTHING_SIMULATION, 'do-nothing-simulator');
  const launch = capabilityCardLaunch('do-nothing-simulator').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'DO_NOTHING_SIMULATION');
});
