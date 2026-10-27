const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Mortgage Refinance Radar parity (Desktop's rate-history chart, saved scenarios, Loan Estimate summary). No database: the radar service and the
// two snapshot tables are stubbed, and the handler is reached through the registered capability like the Ask runtime does.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const { RefinanceRadarService } = require('../../src/refinanceRadar/refinanceRadar.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const refinance = require('../../src/services/ask/handlers/refinance.handler.ts');
require('../../src/services/ask/askOrchestrator.service.ts');

const dec = (n) => ({ toNumber: () => n });
const weekly = (count) => Array.from({ length: count }, (_, i) => {
  const d = new Date(Date.UTC(2025, 9, 6 + i * 7));
  return { id: `snap-${i}`, date: d.toISOString().slice(0, 10), rate30yr: 6.5 - i * 0.01, rate15yr: 5.8 - i * 0.01, source: 'FREDDIE_MAC', sourceRef: null, createdAt: d.toISOString() };
});
const TREND = { trendLabel: 'Rates are drifting lower', current30yr: 6.0, current15yr: 5.3 };

function stub({ snapshots = weekly(52), transitions = [], scenarios = [], comparisons = [] } = {}) {
  const saved = { history: RefinanceRadarService.prototype.getRateHistory, scenarios: RefinanceRadarService.prototype.getSavedScenarios, snap: prisma.refinanceLoanEstimateComparisonSnapshot, property: prisma.property, monitor: prisma.refinanceRateMonitor };
  RefinanceRadarService.prototype.getRateHistory = async () => ({ snapshots, trendSummary: TREND, transitions, initialRadarState: 'NOT_OPEN' });
  RefinanceRadarService.prototype.getSavedScenarios = async () => scenarios;
  prisma.refinanceLoanEstimateComparisonSnapshot = { findMany: async () => comparisons };
  prisma.property = { findUnique: async () => ({ address: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701' }) };
  prisma.refinanceRateMonitor = { findMany: async () => [] };
  return () => { RefinanceRadarService.prototype.getRateHistory = saved.history; RefinanceRadarService.prototype.getSavedScenarios = saved.scenarios; prisma.refinanceLoanEstimateComparisonSnapshot = saved.snap; prisma.property = saved.property; prisma.refinanceRateMonitor = saved.monitor; };
}

const run = (message, launchContext) => capabilityInvoke('REFINANCE_ANALYSIS', { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role: 'OWNER' } });

test('the intents: rate history, a quarter of it, and saved scenarios', () => {
  assert.equal(refinance.refinanceJourneyIntent('Show the mortgage rate history for the last 13 weeks.'), 'RATE_HISTORY');
  assert.equal(refinance.refinanceHistoryWeeks('Show the mortgage rate history for the last 13 weeks.'), 13);
  assert.equal(refinance.refinanceHistoryWeeks('How have mortgage rates changed over the last 3 months?'), 13);
  assert.equal(refinance.refinanceHistoryWeeks('Show the mortgage rate history.'), 52);
  assert.equal(refinance.refinanceJourneyIntent('Show my saved refinance scenarios.'), 'SAVED_SCENARIOS');
  assert.equal(refinance.refinanceJourneyIntent('What if I refinanced at 5.5% for 15 years with $6,000 closing costs?'), null, 'a what-if is not the saved list');
});

test('rate history draws a percent chart framed to the data, with at most 40 points, a range switch, and the table below', async () => {
  const restore = stub();
  try {
    const result = await run('Show the mortgage rate history.');
    assert.equal(result.reasonCode, 'REFINANCE_RATE_HISTORY');
    const chart = result.blocks.find((b) => b.type === 'TREND_CHART');
    assert.equal(chart.valueFormat, 'PERCENT');
    assert.equal(chart.scale, 'FIT');
    assert.ok(chart.categories.length <= 40 && chart.categories.length >= 2);
    assert.equal(chart.series.length, 2);
    assert.ok(chart.series.every((s) => s.values.length === chart.categories.length));
    assert.equal(chart.series[0].values[chart.series[0].values.length - 1], weekly(52)[51].rate30yr, 'the newest week is always plotted');
    assert.deepEqual(chart.actions.map((a) => a.id), ['refinance-history-13']);
    const table = result.blocks.find((b) => b.id === 'refinance-rate-history');
    assert.equal(table.rows.length, 52);
    assert.equal(table.rows[0].values.date, weekly(52)[51].date, 'newest first');
  } finally { restore(); }
});

test('the quarter view plots every one of 13 weeks and offers the full year back', async () => {
  const restore = stub();
  try {
    const result = await run('Show the mortgage rate history for the last 13 weeks.');
    const chart = result.blocks.find((b) => b.type === 'TREND_CHART');
    assert.equal(chart.categories.length, 13);
    assert.deepEqual(chart.actions.map((a) => a.id), ['refinance-history-52']);
    assert.equal(result.blocks.find((b) => b.id === 'refinance-rate-history').rows.length, 13);
  } finally { restore(); }
});

test('opportunity opens and closes become markers on the plotted weeks and a table of windows', async () => {
  const snaps = weekly(52);
  const transitions = [
    { id: 't1', transitionType: 'OPEN', previousState: null, nextState: 'OPEN', snapshotId: snaps[30].id, opportunityId: 'o1', materialChangeReasons: [], occurredAt: `${snaps[30].date}T10:00:00.000Z` },
    { id: 't2', transitionType: 'CLOSED', previousState: 'OPEN', nextState: 'CLOSED', snapshotId: snaps[40].id, opportunityId: 'o1', materialChangeReasons: [], occurredAt: `${snaps[40].date}T10:00:00.000Z` },
    { id: 't3', transitionType: 'OPEN', previousState: null, nextState: 'OPEN', snapshotId: snaps[48].id, opportunityId: 'o2', materialChangeReasons: [], occurredAt: `${snaps[48].date}T10:00:00.000Z` },
  ];
  const restore = stub({ snapshots: snaps, transitions });
  try {
    const result = await run('Show the mortgage rate history.');
    const chart = result.blocks.find((b) => b.type === 'TREND_CHART');
    assert.equal(chart.markers.length, 3);
    assert.match(chart.markers[0].label, /^Opportunity opened \d\d\/\d\d$/);
    assert.ok(chart.markers.every((m) => m.categoryIndex >= 0 && m.categoryIndex < chart.categories.length));
    const windows = result.blocks.find((b) => b.id === 'refinance-opportunity-windows');
    assert.deepEqual(windows.rows.map((r) => r.values.to), ['Still open', snaps[40].date]);
  } finally { restore(); }
});

test('no chart is drawn from a single week, and the table still answers', async () => {
  const restore = stub({ snapshots: weekly(1) });
  try {
    const result = await run('Show the mortgage rate history.');
    assert.equal(result.blocks.some((b) => b.type === 'TREND_CHART'), false);
    assert.equal(result.blocks.find((b) => b.id === 'refinance-rate-history').rows.length, 1);
  } finally { restore(); }
});

const scenarioRow = (over = {}) => ({ id: 'sc-1', propertyId: 'prop-1', targetRate: 5.5, targetTerm: 'FIFTEEN_YEAR', closingCost: dec(6000), monthlySavings: dec(210), breakEvenMonths: 28, lifetimeSavings: dec(40000), isSaved: true, createdAt: new Date('2026-10-01T00:00:00Z'), metadataJson: null, ...over });
const { mapScenarioToDTO } = require('../../src/refinanceRadar/mappers/refinanceRadar.mapper.ts');

test('saved scenarios list the numbers and offer to test each one again with its own rate, term and closing costs', async () => {
  const restore = stub({ scenarios: [mapScenarioToDTO(scenarioRow()), mapScenarioToDTO(scenarioRow({ id: 'sc-2', targetRate: 6.25, targetTerm: 'THIRTY_YEAR', closingCost: dec(9000), monthlySavings: dec(-40), breakEvenMonths: null }))] });
  try {
    const result = await run('Show my saved refinance scenarios.');
    assert.equal(result.reasonCode, 'REFINANCE_SAVED_SCENARIOS');
    const list = result.blocks.find((b) => b.id === 'refinance-saved-scenarios');
    const [first, second] = list.sections[0].items;
    assert.equal(first.title, '15-year at 5.500%');
    assert.match(first.description, /saves \$210\/mo · break-even 28 months · closing costs \$6,000/);
    assert.match(second.description, /costs \$40\/mo · no break-even/);
    assert.equal(first.actions[0].id, 'refinance-retest-scenario');
    assert.equal(first.actions[0].message, 'What if I refinanced at 5.5% for 15 years with $6000 closing costs?');
    assert.equal(second.actions[0].message, 'What if I refinanced at 6.25% for 30 years with $9000 closing costs?');
    assert.equal(refinance.parseRefinanceScenarioEdit(first.actions[0].message).targetRatePct, 5.5, 'the action’s message is read back as that scenario');
  } finally { restore(); }
});

test('with none saved it says so and offers a first scenario', async () => {
  const restore = stub({ scenarios: [] });
  try {
    const result = await run('Show my saved refinance scenarios.');
    assert.match(result.blocks[0].title, /No refinance scenario is saved yet/);
    assert.equal(result.blocks[0].actions[0].id, 'refinance-test-scenario');
    assert.equal(result.blocks.some((b) => b.id === 'refinance-saved-scenarios'), false);
  } finally { restore(); }
});

const OFFER = (id, lender, rate) => ({ id, lenderName: lender, loanAmountUsd: 320000, loanTermYears: 30, loanType: 'FIXED', noteRatePct: rate, aprPct: rate + 0.2, monthlyPrincipalAndInterestUsd: 1817, loanCostsUsd: 4200, lenderCreditsUsd: 0, cashToCloseUsd: 6000, cashToCloseDirection: 'FROM_BORROWER' });
const comparisonRow = { id: 'cmp-1', propertyId: 'prop-1', label: 'October offers', offersJson: [OFFER('a-1', 'Lender A', 5.5), OFFER('b-1', 'Lender B', 5.625)], createdAt: new Date('2026-10-05T00:00:00Z'), updatedAt: new Date('2026-10-05T00:00:00Z') };

test('a saved Loan Estimate comparison can be read as the shareable summary, in parts that fit a row, without sending anything', async () => {
  const restore = stub({ comparisons: [comparisonRow] });
  try {
    const result = await run('Show the shareable summary for this saved Loan Estimate comparison.', { operationId: 'REFINANCE_ANALYSIS', actionId: 'refinance-share-comparison', entityType: 'REFINANCE_LOAN_ESTIMATE_COMPARISON', entityId: 'cmp-1', surface: 'ASK_PAGE' });
    assert.equal(result.reasonCode, 'REFINANCE_COMPARISON_SUMMARY');
    const list = result.blocks.find((b) => b.id === 'refinance-comparison-summary');
    const parts = list.sections[0].items;
    assert.ok(parts.length >= 1);
    assert.ok(parts.every((p) => p.detail.length <= 1200));
    const text = parts.map((p) => p.detail).join('\n');
    assert.match(text, /Lender A/);
    assert.match(text, /Lender B/);
    assert.match(list.description, /has not sent it to anyone/);
    const gone = await run('Show the shareable summary for this saved Loan Estimate comparison.', { operationId: 'REFINANCE_ANALYSIS', actionId: 'refinance-share-comparison', entityType: 'REFINANCE_LOAN_ESTIMATE_COMPARISON', entityId: 'cmp-other', surface: 'ASK_PAGE' });
    assert.equal(gone.reasonCode, 'REFINANCE_COMPARISON_NOT_FOUND');
  } finally { restore(); }
});

test('every new action id is allowed on the refinance answer', () => {
  const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  for (const id of ['refinance-retest-scenario', 'refinance-saved-scenarios', 'refinance-share-comparison', 'refinance-history-13', 'refinance-history-52']) {
    const action = { id, label: 'x', message: 'y', operationId: 'REFINANCE_ANALYSIS', interactionType: 'CONVERSATION_CONTINUE', style: 'SECONDARY' };
    assert.equal(isAskActionApplicable({ action, operationId: 'REFINANCE_ANALYSIS', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, id);
  }
});

test('every block the history, scenarios and summary answers produce passes the answer schema', async () => {
  const snaps = weekly(52);
  const restore = stub({
    snapshots: snaps,
    transitions: [{ id: 't1', transitionType: 'OPEN', previousState: null, nextState: 'OPEN', snapshotId: snaps[30].id, opportunityId: 'o1', materialChangeReasons: [], occurredAt: `${snaps[30].date}T10:00:00.000Z` }],
    scenarios: [mapScenarioToDTO(scenarioRow())], comparisons: [comparisonRow],
  });
  try {
    const answers = [
      await run('Show the mortgage rate history.'),
      await run('Show the mortgage rate history for the last 13 weeks.'),
      await run('Show my saved refinance scenarios.'),
      await run('Show the shareable summary for this saved Loan Estimate comparison.', { operationId: 'REFINANCE_ANALYSIS', actionId: 'refinance-share-comparison', entityType: 'REFINANCE_LOAN_ESTIMATE_COMPARISON', entityId: 'cmp-1', surface: 'ASK_PAGE' }),
      await run('Help me compare official Loan Estimates for this refinance.'),
    ];
    for (const answer of answers) for (const block of answer.blocks) AskPresentationBlockSchema.parse(block);
  } finally { restore(); }
});
