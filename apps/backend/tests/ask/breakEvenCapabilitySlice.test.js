const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.48: BREAK_EVEN_ANALYSIS, the first new Ask operation for a capability the Appendix D
// audit found with none. The service is stubbed; the fake prisma throws on any model it was not given.

const prismaModule = require('../../src/lib/prisma.ts');
const { breakEvenAnalysisFromDto, breakEvenHorizonYears } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { CAPABILITY_SKILL_GUIDANCE_BRIDGE, ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { BreakEvenService } = require('../../src/services/breakEven.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, compute: BreakEvenService.prototype.compute, resolveAccess: propertyAccess.resolvePropertyAccess };
let computeCalls;

const dto = (overrides = {}) => ({
  ownershipCostContext: { calculationFingerprint: 'fp-1' },
  input: { propertyId: 'p1', years: 10, addressLabel: '1 Main St', state: 'MA', zipCode: '02108', overrides: {} },
  current: { homeValueNow: 500000, appreciationRate: 0.035, annualExpensesNow: 12000, debtMode: 'OFF' },
  projection: [
    { year: 2027, annualExpenses: 12000, annualAppreciationGain: 17500, cumulativeExpenses: 12000, cumulativeAppreciationGain: 17500, netCumulative: 5500 },
    { year: 2028, annualExpenses: 12400, annualAppreciationGain: 18100, cumulativeExpenses: 24400, cumulativeAppreciationGain: 35600, netCumulative: 11200 },
  ],
  breakEven: { status: 'PROJECTED', reached: true, breakEvenYearIndex: 6, breakEvenCalendarYear: 2032, netAtBreakEven: 1000 },
  sensitivity: { conservative: { breakEvenYearIndex: null, netAtHorizon: -8000 }, base: { breakEvenYearIndex: 6, netAtHorizon: 42000 }, optimistic: { breakEvenYearIndex: 4, netAtHorizon: 90000 }, rangeLabel: 'Year 4 to not within 10 years' },
  events: [],
  rollup: { netAtHorizon: 42000, cumulativeExpensesAtHorizon: 140000, cumulativeAppreciationAtHorizon: 182000 },
  drivers: [{ factor: 'Appreciation', impact: 'HIGH', explanation: 'Local appreciation outpaces cost growth.' }],
  meta: { generatedAt: '2026-09-23T00:00:00.000Z', dataSources: ['Internal property profile (address/state/zip)'], notes: [], confidence: 'MEDIUM' },
  ...overrides,
});

function install() {
  computeCalls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  BreakEvenService.prototype.compute = async (...args) => { computeCalls.push(args); return dto({ input: { ...dto().input, years: args[1].years } }); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  BreakEvenService.prototype.compute = originals.compute;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads BreakEvenService.compute for the horizon asked, defaulting to 10 years like the page', async () => {
  const result = await capabilityInvoke('BREAK_EVEN_ANALYSIS', { userId: 'u1', propertyId: 'p1', message: 'Show my home break-even analysis for a 5-year horizon.' });
  assert.deepEqual(computeCalls[0], ['p1', { years: 5 }, 'u1']);
  assert.equal(result.contextVersion, 'fp-1');
  assert.equal(breakEvenHorizonYears('When will my home break even?'), 10);
  assert.equal(breakEvenHorizonYears('over five years'), 5);
});

test('a projected break-even names the year, the range and the page, and offers the other horizon', () => {
  const result = breakEvenAnalysisFromDto(dto(), 'p1');
  const summary = result.blocks[0];
  assert.equal(result.status, 'ANSWERED');
  assert.equal(summary.title, 'Projected to break even in 2032 (year 6 of 10)');
  assert.match(summary.body, /Year 4 to not within 10 years/);
  assert.deepEqual(summary.actions.map((action) => [action.id, action.href ?? action.message]), [
    ['open-break-even', '/dashboard/properties/p1/tools/break-even'],
    ['rerun-break-even-5', 'Show my home break-even analysis for a 5-year horizon.'],
  ]);
  const range = result.blocks.find((block) => block.id === 'break-even-sensitivity');
  assert.deepEqual(range.rows.map((row) => row.values.breakEven), ['Not within 10 years', 'Year 6', 'Year 4']);
});

test('not reaching break-even is stated plainly, with costs against appreciation', () => {
  const result = breakEvenAnalysisFromDto(dto({ breakEven: { status: 'NOT_REACHED', reached: false, breakEvenYearIndex: null, breakEvenCalendarYear: null, netAtBreakEven: null }, rollup: { netAtHorizon: -20000, cumulativeExpensesAtHorizon: 160000, cumulativeAppreciationAtHorizon: 140000 } }), 'p1');
  assert.equal(result.blocks[0].title, 'Not projected to break even within 10 years');
  assert.equal(result.blocks[0].tone, 'CAUTION');
  assert.match(result.blocks[0].body, /\$160,000.*\$140,000/);
});

test('the service\'s own disclosures (such as the $350,000 fallback home value) surface as a limitation', () => {
  const note = 'Current home value is unavailable; the disposition model uses a clearly labeled $350,000 fallback.';
  const result = breakEvenAnalysisFromDto(dto({ meta: { ...dto().meta, notes: [note] } }), 'p1');
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  const limitation = result.blocks.find((block) => block.type === 'LIMITATION');
  assert.equal(limitation.body, note);
  assert.equal(result.blocks[1], limitation, 'the limitation comes right after the summary');
});

test('every block type and the boundary survive the answer-trust validator, and every action the whitelist', () => {
  const raw = breakEvenAnalysisFromDto(dto({ meta: { ...dto().meta, notes: ['A note.'] } }), 'p1');
  // The pipeline attaches the adapter's source evidence before validation; without it every answer is withheld.
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'break-even.analysis', operationId: 'BREAK_EVEN_ANALYSIS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'When will my home break even?', operationId: 'BREAK_EVEN_ANALYSIS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  for (const action of result.blocks[0].actions) {
    assert.equal(isAskActionApplicable({ action, operationId: 'BREAK_EVEN_ANALYSIS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true, action.id);
  }
});

test('ownership break-even phrasing routes here; refinance, upgrade and mortgage-payoff phrasing does not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
  for (const message of ['When will my home break even?', 'Show my home break-even analysis', 'Has this house paid for itself yet or is it still costing me?', 'Shwo my home break-even analysis']) {
    assert.equal(route(message), 'BREAK_EVEN_ANALYSIS', message);
  }
  for (const message of ['When would refinancing my mortgage break even?', 'When will my solar panels break even?', 'When will my house be paid off?', 'Should I sell, hold, or rent this home?']) {
    assert.notEqual(route(message), 'BREAK_EVEN_ANALYSIS', message);
  }
});

test('the operation is fully registered: read-only viewer definition, its own skill, the bridge, and the card launch', () => {
  const definition = ASK_OPERATION_DEFINITIONS.BREAK_EVEN_ANALYSIS;
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.adapterKey, 'break-even.analysis');
  assert.equal(getSkillForOperation('BREAK_EVEN_ANALYSIS').id, 'break-even');
  assert.deepEqual(CAPABILITY_SKILL_GUIDANCE_BRIDGE.find((entry) => entry.capabilityId === 'break-even').operationIds, ['BREAK_EVEN_ANALYSIS']);
  assert.equal(ASK_OPERATION_CAPABILITY.BREAK_EVEN_ANALYSIS, 'break-even');
  const launch = capabilityCardLaunch('break-even').inlineLaunch;
  assert.equal(launch.operationId, 'BREAK_EVEN_ANALYSIS');
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'BREAK_EVEN_ANALYSIS');
});
