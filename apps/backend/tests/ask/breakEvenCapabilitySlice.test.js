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
      // The one read the home-value check makes before an analysis runs (compute itself is stubbed): a home with a purchase price on record.
      if (model === 'property') return { findUnique: async () => ({ lastAppraisedValue: null, financingProfile: { purchasePriceCents: 45_000_000 } }) };
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

test('a projected break-even names the year and the range, offers the other horizon, and links to no page', () => {
  const result = breakEvenAnalysisFromDto(dto(), 'p1');
  const summary = result.blocks[0];
  assert.equal(result.status, 'ANSWERED');
  assert.equal(summary.title, 'Projected to break even in 2032 (year 6 of 10)');
  assert.deepEqual(summary.actions, []);
  const chart = result.blocks.find((block) => block.type === 'TREND_CHART');
  assert.deepEqual(chart.actions.map((action) => [action.id, action.href ?? action.message]), [
    ['rerun-break-even-5', 'Show my home break-even analysis for a 5-year horizon.'],
  ]);
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
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
  assert.equal(result.blocks[3], limitation, 'the limitation comes right after the summary, key figures and chart');
});

test('every block type and the boundary survive the answer-trust validator, and every action the whitelist', () => {
  const raw = breakEvenAnalysisFromDto(dto({ meta: { ...dto().meta, notes: ['A note.'] } }), 'p1');
  // The pipeline attaches the adapter's source evidence before validation; without it every answer is withheld.
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'break-even.analysis', operationId: 'BREAK_EVEN_ANALYSIS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'When will my home break even?', operationId: 'BREAK_EVEN_ANALYSIS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  for (const action of result.blocks.flatMap((block) => block.actions ?? [])) {
    assert.equal(isAskActionApplicable({ action, operationId: 'BREAK_EVEN_ANALYSIS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), !action.href, action.id);
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

test('a what-if computes the standard and the changed projection, the changed one for this answer only, and shows them side by side (FRD v1.320)', async () => {
  BreakEvenService.prototype.compute = async (...args) => {
    computeCalls.push(args);
    const changed = args[1].ephemeral === true;
    return dto({
      input: { ...dto().input, years: args[1].years },
      breakEven: changed ? { status: 'PROJECTED', reached: true, breakEvenYearIndex: 3, breakEvenCalendarYear: 2029, netAtBreakEven: 500 } : dto().breakEven,
      rollup: changed ? { netAtHorizon: 99000, cumulativeExpensesAtHorizon: 140000, cumulativeAppreciationAtHorizon: 239000 } : dto().rollup,
    });
  };
  const result = await capabilityInvoke('BREAK_EVEN_ANALYSIS', { userId: 'u1', propertyId: 'p1', message: 'What if appreciation is 6% for my break-even over 10 years?' });
  assert.equal(computeCalls.length, 2);
  assert.deepEqual(computeCalls[0], ['p1', { years: 10 }, 'u1']);
  assert.deepEqual(computeCalls[1], ['p1', { years: 10, appreciationRate: 0.06, ephemeral: true }, 'u1']);
  assert.equal(result.reasonCode, 'BREAK_EVEN_WHAT_IF_PROJECTED');
  assert.match(result.blocks[0].title, /^What if: Projected to break even in 2029/);
  const comparison = result.blocks.find((block) => block.id === 'break-even-what-if-comparison');
  assert.equal(comparison.rows[0].values.standard, 'Year 6 (2032)');
  assert.equal(comparison.rows[0].values.whatIf, 'Year 3 (2029)');
  assert.deepEqual(result.blocks.find((block) => block.id === 'break-even-what-if-assumptions').rows[0].values, { assumption: 'Home value growth per year', value: '6%' });
  const ids = result.blocks.map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length, 'block ids are unique');
  // The pipeline attaches the adapter's source evidence before validation.
  const evidenced = { ...result, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'break-even.analysis', operationId: 'BREAK_EVEN_ANALYSIS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'What if appreciation is 6% for my break-even?', operationId: 'BREAK_EVEN_ANALYSIS', result: evidenced, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id), 'the what-if answer survives the answer-trust validator');
});

test('no hypothetical, no override: the plain request does not ask for an ephemeral projection', async () => {
  await capabilityInvoke('BREAK_EVEN_ANALYSIS', { userId: 'u1', propertyId: 'p1', message: 'When will my home break even?' });
  assert.equal(computeCalls.length, 1);
  assert.equal(computeCalls[0][1].ephemeral, undefined);
});

test('the service applies ephemeral overrides without saving an assumption set', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const service = fs.readFileSync(path.resolve(__dirname, '../../src/services/breakEven.service.ts'), 'utf8');
  const assumption = fs.readFileSync(path.resolve(__dirname, '../../src/services/financialAssumption.service.ts'), 'utf8');
  assert.match(service, /persistOverrides: !input\.ephemeral/);
  assert.match(assumption, /input\.persistOverrides !== false && hasAssumptionOverrides\(requestOverrides\)/);
});

test('the answer carries key figures, a cost-vs-appreciation chart with the break-even marker, what matters most, assumptions and an in-Ask next action (FRD v1.386)', () => {
  const full = dto({
    current: { homeValueNow: 725000, appreciationRate: 0.035, annualExpensesNow: 4700, debtMode: 'ON', mortgageBalanceNow: 300000, mortgageAnnualRate: 0.026 },
    nextAction: { toolKey: 'capital-timeline', label: 'Plan capital events after break-even', href: '/dashboard/properties/p1/tools/capital-timeline', reason: 'Break-even is projected; capital sequencing is the next decision.' },
  });
  const result = breakEvenAnalysisFromDto(full, 'p1');
  const byId = (id) => result.blocks.find((block) => block.id === id);
  assert.deepEqual(byId('break-even-metrics').metrics.map((metric) => metric.label), ['Break-even', 'Net at year 10', 'Home value', 'Annual expenses', 'Costs, 10 years', 'Appreciation, 10 years']);
  assert.deepEqual(byId('break-even-summary').chips.map((chip) => chip.label), ['medium confidence', 'Mortgage included', '10-year horizon']);
  const chart = byId('break-even-chart');
  assert.deepEqual(chart.categories, ['2027', '2028']);
  assert.deepEqual(chart.series.map((series) => [series.id, series.style]), [['costs', 'SOLID'], ['appreciation', 'DASHED']]);
  assert.deepEqual(chart.markers, [], 'a marker only where the break-even year falls inside the plotted years');
  assert.equal(byId('break-even-sensitivity').description, '2 of 3 scenarios reach break-even within 10 years.');
  assert.equal(byId('break-even-drivers').sections[0].items[0].status, 'HIGH impact');
  assert.equal(byId('break-even-assumptions').rows.find((row) => row.id === 'mortgage').values.value, '$300,000 balance at 2.6%');
  const next = byId('break-even-next-action');
  assert.deepEqual(next.actions.map((action) => [action.id, action.operationId, action.href]), [['break-even-next-capital-timeline', 'CAPITAL_RESERVE_PLAN', undefined]]);
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
  const ids = result.blocks.map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length);
  const evidenced = { ...result, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'break-even.analysis', operationId: 'BREAK_EVEN_ANALYSIS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my home break-even analysis', operationId: 'BREAK_EVEN_ANALYSIS', result: evidenced, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), ids, 'every new block and action survives the answer-trust validator');
});

test('a break-even inside the plotted years gets a marker; without a mortgage the next step is the in-Ask mortgage update for an owner only', () => {
  const missingDebt = dto({
    nextAction: { toolKey: 'sell-hold-rent', label: 'Add mortgage details for debt-aware modeling', href: '/dashboard/x', reason: 'Debt context is missing, so break-even is currently directional.' },
    projection: Array.from({ length: 10 }, (_, i) => ({ year: 2027 + i, annualExpenses: 1, annualAppreciationGain: 2, cumulativeExpenses: i + 1, cumulativeAppreciationGain: 2 * (i + 1), netCumulative: i + 1 })),
  });
  const owner = breakEvenAnalysisFromDto(missingDebt, 'p1', { canEditFinancing: true });
  assert.deepEqual(owner.blocks.find((block) => block.type === 'TREND_CHART').markers, [{ id: 'break-even', label: 'Break-even, year 6', categoryIndex: 5 }]);
  const ownerAction = owner.blocks.find((block) => block.id === 'break-even-next-action').actions[0];
  assert.deepEqual([ownerAction.id, ownerAction.operationId], ['financing-profile-update', 'FINANCING_PROFILE_COMMAND']);
  assert.deepEqual(breakEvenAnalysisFromDto(missingDebt, 'p1').blocks.find((block) => block.id === 'break-even-next-action').actions, []);
});
