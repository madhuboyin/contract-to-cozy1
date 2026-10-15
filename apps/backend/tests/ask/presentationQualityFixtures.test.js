const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Presentation Quality 3A/3E: one deterministic behavioral fixture for each of the nine presentation patterns, built by real pure
// builders (no database, no services). Each slice-specific behavior test follows the pattern fixtures.

const { runFixture, PATTERNS } = require('../helpers/presentationQualityHarness.js');
const { statusBoardFromView, refinanceScenarioComparison, homeTimelineFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { refinanceScenarioAnswer } = require('../../src/services/ask/handlers/refinance.handler.ts');
const { materialSpecsFromView } = require('../../src/services/ask/handlers/materialSpecs.handler.ts');
const { inspectionComparisonResult } = require('../../src/services/ask/handlers/inspectionReports.handler.ts');
const { refinanceMonitorBlock } = require('../../src/services/ask/handlers/refinance.handler.ts');
const { buildSeasonalHomeCareResult, buildSeasonalTaskWalkthrough } = require('../../src/services/ask/support/seasonalHomeCare.ts');
const { buildMaintenanceImportanceResult } = require('../../src/services/ask/support/maintenanceImportance.ts');
const { askFailureBlocks } = require('../../src/services/ask/support/answerGuards.ts');

const NOW = new Date('2026-10-14T12:00:00.000Z');
const row = (id, condition, extra = {}) => ({
  id, displayName: `Item ${id}`, category: 'APPLIANCE', condition, recommendation: 'OK', ageYears: 12, computedReasons: [{ code: 'PAST_EOL', detail: 'Past expected life' }],
  warrantyStatus: 'EXPIRED', pendingMaintenance: 0, room: null, isPinned: false, needsInstallDateForPrediction: false, ...extra,
});
const board = (items, total = items.length) => statusBoardFromView({ items, summary: {}, pagination: { page: 1, limit: 100, total, totalPages: 1 } }, 'p1', true);

const scenarioInput = (overrides = {}) => ({
  current: { currentRatePct: 6.875, marketRatePct: 6.125, monthlySavings: 210, lifetimeSavings: 41000, breakEvenMonths: 28 },
  scenario: {
    newMonthlyPayment: 1750, currentMonthlyPayment: 2083, monthlySavings: 333, lifetimeSavings: 77000, closingCostUsd: 6400, breakEvenMonths: 19,
    estimatedAprPct: 5.62, cashToCloseUsd: 6400, totalInterestNewLoan: 120000, totalInterestRemainingCurrent: 197000, payoffDeltaMonths: -36,
    recommendationExplanation: 'The 15-year term saves the most interest while keeping the payment within your stated objective.', objective: 'LOWER_PAYMENT', recommendedTerm: 'FIFTEEN_YEAR',
    ...(overrides.scenario ?? {}),
  },
  scenarioEdit: { targetRatePct: 5.5, targetTerm: 'FIFTEEN_YEAR', closingCostAmount: 6400 },
  targetRatePct: 5.5, termLabel: '15-year',
  benchmark: { date: '2026-10-09', source: 'FRED', sourceRef: 'MORTGAGE30US' },
  mortgageObservedAt: '2026-09-01T00:00:00.000Z', mortgageUpdatedAt: '2026-09-02T00:00:00.000Z', contextVersion: 'ctx-1',
});

const FIXTURES = [
  {
    id: 'direct-answer-maintenance-importance', pattern: 'DIRECT_ANSWER', profile: 'DIRECT_ANSWER', message: 'Why does this task matter?',
    build: () => buildMaintenanceImportanceResult({
      title: 'Chimney cleaning and inspection', description: 'Professional chimney sweep and safety inspection', source: 'SEASONAL', priority: 'URGENT', riskLevel: null,
      status: 'PENDING', nextDueDate: new Date('2026-09-23T00:00:00.000Z'), isRecurring: false, frequency: null, estimatedCost: null, assetType: null, isSeasonal: true, updatedAt: NOW,
    }, NOW, 'UTC'),
    expect: { directAnswer: /Chimney cleaning/, maxBlocks: 3, requiredBlockTypes: ['EVIDENCE'] },
  },
  {
    id: 'prioritized-list-status-board', pattern: 'PRIORITIZED_LIST', profile: 'ATTENTION', message: 'How is everything around my home?', operationId: 'HOME_STATUS_BOARD',
    build: () => board([row('a', 'ACTION_NEEDED'), row('m', 'MONITOR'), row('g', 'GOOD', { ageYears: 3, computedReasons: [] })]),
    expect: { directAnswer: /1 need action, 1 to monitor, 1 in good shape/, requiredBlockTypes: ['GROUPED_LIST', 'BOUNDARY'], issues: [] },
  },
  {
    id: 'prioritized-list-seasonal-plan', pattern: 'PRIORITIZED_LIST', profile: 'ATTENTION', message: 'What do I need to do this fall?', operationId: 'SEASONAL_HOME_CARE',
    build: () => buildSeasonalHomeCareResult({ zipCode: '60601', now: NOW, focus: 'THIS_SEASON', setup: { canSetUp: true, checklist: null } }),
    expect: { directAnswer: /matter most|None of the/, requiredBlockTypes: ['GROUPED_LIST', 'BOUNDARY'] },
  },
  {
    id: 'record-explorer-material-specs', pattern: 'RECORD_EXPLORER', profile: 'COLLECTION', message: 'What paint colors did I use?', operationId: 'MATERIAL_SPECS_LIST',
    build: () => materialSpecsFromView({
      specs: [{ id: 'dining', propertyId: 'p1', category: 'PAINT', scopeLevel: 'ROOM', label: 'Dining room walls', manufacturer: 'Sherwin-Williams', productName: 'Alabaster', colorCode: 'SW 7008',
        finish: 'Eggshell', supplier: null, supplierDiscontinued: false, isActive: true, lifecycleStatus: 'AS_BUILT', notes: null, room: { id: 'r1', name: 'Dining room' } }],
      nextCursor: null, hasMore: false,
    }, 'p1'),
    expect: { directAnswer: /./, requiredBlockTypes: ['GROUPED_LIST'] },
  },
  {
    id: 'comparison-refinance-scenario', pattern: 'COMPARISON', profile: 'COMPARE', message: 'What if I refinanced at 5.5% for 15 years?', operationId: 'REFINANCE_ANALYSIS',
    build: () => refinanceScenarioAnswer(scenarioInput()),
    expect: {
      directAnswer: /At 5\.500% for 15-year, this scenario lowers your modeled payment by \$333 a month/,
      requiredBlockTypes: ['COMPARISON', 'ASSUMPTIONS', 'EVIDENCE', 'BOUNDARY'],
      check: (result) => {
        assert.match(result.blocks[0].body, /recovers them in about 19 months/);
        assert.match(result.blocks[0].body, /The 15-year term saves the most interest/, 'the engine\'s own reason is in the answer, not only a table cell');
        assert.match(result.blocks[0].body, /nothing was saved/);
      },
    },
  },
  {
    id: 'timeline-home-timeline', pattern: 'TIMELINE', profile: 'COLLECTION', message: 'Show my home timeline', operationId: 'HOME_TIMELINE_EVENTS',
    build: () => homeTimelineFromView([{
      id: 'kitchen', title: 'Kitchen remodel', summary: 'New cabinets.', type: 'IMPROVEMENT', subtype: null, importance: 'HIGHLIGHT', visibility: 'HOUSEHOLD', createdById: 'u2',
      occurredAt: new Date('2024-06-15T12:00:00.000Z'), datePrecision: 'EXACT_DATE', dateRangeStart: null, dateRangeEnd: null, verificationStatus: 'EVIDENCE_VERIFIED', meta: null,
    }], 'p1', 'u1'),
    expect: { directAnswer: /./, requiredBlockTypes: ['TIMELINE'] },
  },
  {
    id: 'guide-seasonal-task-walkthrough', pattern: 'GUIDE', profile: 'GUIDE', message: 'Walk me through the first task', operationId: 'SEASONAL_HOME_CARE',
    build: () => buildSeasonalTaskWalkthrough({ zipCode: '08536', now: new Date(2026, 9, 5), focus: 'NEXT_SEASON', setup: { canSetUp: true, checklist: null }, taskKey: 'WINTER_FURNACE_FILTER_CHANGE' }),
    expect: { directAnswer: /furnace filters/i, requiredBlockTypes: ['TASK_GUIDE'] },
  },
  {
    id: 'document-evidence-inspection-comparison', pattern: 'DOCUMENT_EVIDENCE', profile: 'COLLECTION', message: 'What changed between the two reports?',
    build: () => inspectionComparisonResult({
      reportA: { reportType: 'GENERAL', inspectionDate: new Date('2024-05-01T00:00:00.000Z') }, reportB: { reportType: 'GENERAL', inspectionDate: new Date('2026-05-01T00:00:00.000Z') },
      resolved: [{ id: 'f1', homeSystem: 'Roof', subsystem: 'Flashing', severity: 'MAJOR', inspectorDescription: 'Flashing replaced.' }],
      persisted: [{ id: 'f2', homeSystem: 'HVAC', subsystem: null, severity: 'MINOR', inspectorDescription: 'Filter housing worn.' }],
      newFindings: [], worsened: [],
    }),
    expect: { directAnswer: /1 resolved, 1 still open/, requiredBlockTypes: ['GROUPED_LIST'] },
  },
  {
    id: 'monitor-refinance-rate', pattern: 'MONITOR', profile: 'DIRECT_ANSWER', message: 'Tell me when rates reach 5.5%',
    build: () => ({
      status: 'ANSWERED', blocks: [
        { type: 'SUMMARY', id: 'rate-monitor-summary', title: 'Rate alert is on', body: 'You will be told when the 30-year benchmark reaches 5.500% or lower.', tone: 'POSITIVE', actions: [] },
        refinanceMonitorBlock({ id: 'm1', propertyId: 'p1', product: 'FIXED_30_YEAR', thresholdPct: 5.5, cadence: 'IMMEDIATE', quietStart: null, quietEnd: null, timezone: 'UTC', status: 'ACTIVE' }, 'Mortgage-rate monitor is active'),
      ], suggestions: [],
    }),
    expect: { directAnswer: /Rate alert is on/, requiredBlockTypes: ['MONITOR'], maxBlocks: 3 },
  },
  {
    id: 'empty-status-board', pattern: 'EMPTY_ERROR_RECOVERY', profile: 'DIRECT_ANSWER', message: 'How is everything around my home?', operationId: 'HOME_STATUS_BOARD',
    build: () => board([]),
    expect: { directAnswer: /Nothing is on the Status Board yet/, degradation: 'EMPTY', check: (result) => assert.ok(!result.blocks.some((block) => block.type === 'GROUPED_LIST')) },
  },
  {
    id: 'error-recovery-retryable', pattern: 'EMPTY_ERROR_RECOVERY', profile: 'DIRECT_ANSWER', message: 'anything',
    build: () => ({ status: 'FAILED_RETRYABLE', blocks: askFailureBlocks(new Error('boom'), true), suggestions: [] }),
    expect: { directAnswer: /could not complete/, degradation: 'ERROR', check: (result) => assert.equal(result.blocks[0].retryable, true) },
  },
];

test('every one of the nine presentation patterns has at least one behavioral fixture', () => {
  assert.deepEqual([...new Set(FIXTURES.map((fixture) => fixture.pattern))].sort(), [...PATTERNS].sort());
});

for (const fixture of FIXTURES) {
  test(`fixture ${fixture.id} (${fixture.pattern}) answers first, keeps trust and passes the quality contract`, () => { runFixture(fixture); });
}

test('simple questions stay simple: a direct answer carries no collection and no more than three blocks', () => {
  const result = FIXTURES[0].build();
  assert.ok(result.blocks.length <= 3);
  assert.ok(!result.blocks.some((block) => block.type === 'GROUPED_LIST' || block.type === 'TABLE'));
});

test('large results stay honest: 100 board rows are all delivered behind local disclosure and the source total is declared', () => {
  const items = Array.from({ length: 100 }, (_, index) => row(`m${index}`, 'MONITOR'));
  const result = board(items, 140);
  const list = result.blocks.find((block) => block.id === 'status-board-items');
  assert.equal(list.collection.sourceTotal, 140);
  assert.equal(list.collection.deliveredCount, 100);
  assert.equal(list.sections.find((section) => section.id === 'status-board-monitor').initialVisibleCount, 6);
  assert.match(result.blocks.find((block) => block.id === 'status-board-limits').body, /first 100 of 140/);
});

test('refinance tradeoff wording is honest for a payment increase, a no-recovery case and a balanced case', () => {
  const increase = refinanceScenarioAnswer(scenarioInput({ scenario: { monthlySavings: -120, lifetimeSavings: -4000, breakEvenMonths: null } }));
  assert.match(increase.blocks[0].title, /raises your modeled payment by \$120 a month/);
  assert.match(increase.blocks[0].body, /does not recover them within the modeled period/);
  assert.match(increase.blocks[0].body, /\$4,000 more in interest/);
  const balanced = refinanceScenarioAnswer(scenarioInput({ scenario: { monthlySavings: 0 } }));
  assert.match(balanced.blocks[0].title, /leaves your modeled payment about the same/);
  assert.equal(balanced.blocks.filter((block) => block.type === 'SUMMARY')[0].actions.filter((action) => action.style === 'PRIMARY').length, 1);
});

test('the real scenario answer is accepted by the typed scenario contract', () => {
  const { matchesRefinanceScenarioAnswerContract } = require('../../src/services/ask/askRefinanceScenarioIntent.ts');
  assert.equal(matchesRefinanceScenarioAnswerContract(refinanceScenarioAnswer(scenarioInput())), true);
});

// ---- 3B: Status Board experience -----------------------------------------------------------------------------------------------

const { statusBoardLead } = require('../../src/services/ask/handlers/statusBoard.handler.ts');

test('3B: the Status Board leads with the most urgent item and its recorded reason, with the estimation basis beside the claim', () => {
  const result = board([row('a', 'ACTION_NEEDED', { displayName: 'Water heater', computedReasons: [{ code: 'PAST_EOL', detail: 'Past expected life (10yr).' }] }), row('g', 'GOOD')]);
  const body = result.blocks[0].body;
  assert.match(body, /^Start with Water heater: Past expected life \(10yr\)\./);
  assert.match(body, /Condition is estimated from recorded age, expected life, warranty and maintenance, across 2 recorded items\./);
});

test('3B: an internal-key-like item name is never quoted, and unknown items are said plainly, never as an all-clear', () => {
  const keyed = board([row('a', 'ACTION_NEEDED', { displayName: 'HVAC_FURNACE' })]).blocks[0].body;
  assert.match(keyed, /^1 item needs action first\./);
  const unknownOnly = board([row('u1', 'GOOD', { needsInstallDateForPrediction: true, ageYears: null, computedReasons: [] })]).blocks[0].body;
  assert.match(unknownOnly, /^None of these items has enough recorded dates to be rated yet\./);
  assert.doesNotMatch(unknownOnly, /good shape|all clear|nothing needs/i);
  const mixed = board([row('g', 'GOOD'), row('u1', 'GOOD', { needsInstallDateForPrediction: true, ageYears: null, computedReasons: [] })]).blocks[0].body;
  assert.match(mixed, /^Nothing needs action among the 1 item with a recorded age\. 1 is not rated yet because its install or purchase date is missing\./);
});

test('3B: with nothing to act on the lead says so without claiming the unknown items are fine', () => {
  assert.match(statusBoardLead({ items: [], actionNeeded: 0, monitor: 2, good: 1, unknown: 0, total: 3, truncated: false }), /^Nothing needs action right now; 2 items are worth keeping an eye on\./);
  assert.match(statusBoardLead({ items: [], actionNeeded: 0, monitor: 0, good: 4, unknown: 0, total: 4, truncated: true }), /^Nothing needs action or monitoring right now\..*counts cover the 0 shown/);
});

test('3B: correction, refresh and local expansion stay three different things', () => {
  const result = board([row('a', 'ACTION_NEEDED')]);
  const refresh = result.blocks[0].actions[0];
  assert.deepEqual([refresh.operationId, refresh.style], ['STATUS_BOARD_COMMAND', 'SECONDARY']);
  const list = result.blocks.find((block) => block.id === 'status-board-items');
  const correct = list.sections[0].items[0].actions[0];
  assert.deepEqual([correct.operationId, correct.interactionType], ['STATUS_BOARD_COMMAND', 'MUTATE_RECORD']);
  assert.equal(list.sections[0].initialVisibleCount, 6, 'local expansion is a view choice with no action');
});

// ---- 3D: maintenance and seasonal care -----------------------------------------------------------------------------------------

test('3D: the seasonal plan is compact, declares what it left out, and keeps setup a proposal until confirmed', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '60601', now: NOW, focus: 'THIS_SEASON', setup: { canSetUp: true, checklist: null } });
  const list = result.blocks.find((block) => block.id === 'seasonal-home-care-tasks');
  const shown = list.sections.reduce((sum, section) => sum + section.items.length, 0);
  assert.ok(shown <= 8, 'at most eight tasks are shown');
  assert.equal(list.collection.deliveredCount, shown);
  assert.equal(list.collection.nextPageAvailable, false);
  const next = result.blocks.find((block) => block.id === 'seasonal-home-care-next');
  const add = next.actions.find((action) => action.id === 'seasonal-add-tasks');
  assert.deepEqual([add.operationId, add.style], ['SEASONAL_CHECKLIST_SETUP', 'PRIMARY']);
  assert.match(next.body, /review exactly what it adds before anything changes/);
});

test('3D: a home that already has its checklist is told so, and is not offered setup again', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '60601', now: NOW, focus: 'THIS_SEASON', setup: { canSetUp: true, checklist: { totalTasks: 9, tasksAdded: 6 } } });
  const next = result.blocks.find((block) => block.id === 'seasonal-home-care-next');
  assert.match(next.body, /already set up with 9 tasks, 6 in Maintenance/);
  assert.equal(next.actions.some((action) => action.id === 'seasonal-add-tasks'), false);
  assert.equal(next.actions.filter((action) => action.style === 'PRIMARY').length, 1);
});

test('3D: missing location context is said, not guessed: the national default is named and the page to change it is pointed at', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '00000', now: NOW, focus: 'THIS_SEASON' });
  assert.match(result.blocks[0].body, /could not map this zip code to a climate region, so this uses the national default/);
  assert.equal(result.blocks.find((block) => block.id === 'seasonal-home-care-next').actions.some((action) => action.id === 'seasonal-add-tasks'), false, 'no write is offered without setup context');
});

test('3D: general guidance is labelled general and the walkthrough invents no progress', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '60601', now: NOW, focus: 'THIS_SEASON' });
  const boundary = result.blocks.find((block) => block.type === 'BOUNDARY');
  assert.match(boundary.body, /general guidance for your climate, not an assessment of this home/);
  const guide = buildSeasonalTaskWalkthrough({ zipCode: '08536', now: new Date(2026, 9, 5), focus: 'NEXT_SEASON', taskKey: 'WINTER_FURNACE_FILTER_CHANGE' }).blocks[0];
  assert.deepEqual(guide.history, [], 'a walkthrough of a general task has no completion history');
  assert.ok(!('progress' in guide) && !('status' in guide), 'and no progress or status field');
});

// ---- Phase 5: adoption audit of Wave A builders -----------------------------------------------------------------------------------

const { breakEvenAnalysisFromDto } = require('../../src/services/ask/askOrchestrator.service.ts');
const { coverageReviewFromView } = require('../../src/services/ask/handlers/coverageReview.handler.ts');

const breakEvenDto = (overrides = {}) => ({
  ownershipCostContext: { calculationFingerprint: 'fp-1' },
  input: { propertyId: 'p1', years: 10, addressLabel: '1 Main St', state: 'MA', zipCode: '02108', overrides: {} },
  current: { homeValueNow: 500000, appreciationRate: 0.035, annualExpensesNow: 12000, debtMode: 'OFF' },
  projection: [{ year: 2027, annualExpenses: 12000, annualAppreciationGain: 17500, cumulativeExpenses: 12000, cumulativeAppreciationGain: 17500, netCumulative: 5500 }],
  breakEven: { status: 'PROJECTED', reached: true, breakEvenYearIndex: 6, breakEvenCalendarYear: 2032, netAtBreakEven: 1000 },
  sensitivity: { conservative: { breakEvenYearIndex: null, netAtHorizon: -8000 }, base: { breakEvenYearIndex: 6, netAtHorizon: 42000 }, optimistic: { breakEvenYearIndex: 4, netAtHorizon: 90000 } },
  events: [], rollup: { netAtHorizon: 42000, cumulativeExpensesAtHorizon: 140000, cumulativeAppreciationAtHorizon: 182000 },
  drivers: [{ factor: 'Appreciation', impact: 'HIGH', explanation: 'Local appreciation outpaces cost growth.' }],
  meta: { generatedAt: '2026-09-23T00:00:00.000Z', dataSources: ['Internal property profile'], notes: [], confidence: 'MEDIUM' },
  ...overrides,
});

test('5 audit: break-even already leads with its conclusion and carries dated evidence, so it passes COMPARE unchanged', () => {
  runFixture({
    id: 'audit-break-even', pattern: 'COMPARISON', profile: 'COMPARE', message: 'When does my home break even?', operationId: 'BREAK_EVEN_ANALYSIS',
    build: () => breakEvenAnalysisFromDto(breakEvenDto(), 'p1'),
    expect: { directAnswer: /Projected to break even in 2032/, requiredBlockTypes: ['TABLE', 'EVIDENCE', 'BOUNDARY'] },
  });
});

test('5 audit: break-even with the engine\u2019s own disclosed gaps is READY_WITH_LIMITATIONS and says what is missing', () => {
  const result = breakEvenAnalysisFromDto(breakEvenDto({ meta: { generatedAt: '2026-09-23T00:00:00.000Z', dataSources: ['Internal property profile'], notes: ['No purchase price is recorded, so $350,000 is assumed.'], confidence: 'LOW' } }), 'p1');
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  assert.ok(result.blocks.some((block) => block.type === 'LIMITATION' && /\$350,000 is assumed/.test(block.body)));
});

test('5 audit: coverage review is a prioritized list with a reason for each question and one primary action; none-yet and out-of-date say so', () => {
  const review = {
    overallState: 'QUESTIONS', scopeStatus: 'PARTIAL', generatedAt: new Date('2026-09-01'),
    policyTerm: { insurancePolicy: { carrierName: 'Acme', policyNumber: 'P-1' }, sourceDocument: { title: 'Declarations' } },
    questions: [{ id: 'q-1', plainLanguageQuestion: 'Is your wind or hail deductible different?', whyItMatters: 'It can be a percentage.', priority: 1, questionType: 'FACT',
      missingEvidenceJson: [{ factKey: 'WIND_HAIL_DEDUCTIBLE' }], professionalBoundary: 'Ask your insurer or agent to confirm.' }],
  };
  runFixture({
    id: 'audit-coverage-review', pattern: 'PRIORITIZED_LIST', profile: 'ATTENTION', message: 'Show my coverage review',
    build: () => coverageReviewFromView({ review, isCurrent: true }, true, 'p1'),
    expect: { directAnswer: /1 question to review/, requiredBlockTypes: ['GROUPED_LIST', 'BOUNDARY'] },
  });
  const none = coverageReviewFromView({ review: null, isCurrent: false }, true, 'p1');
  assert.equal(none.reasonCode, 'COVERAGE_REVIEW_NOT_GENERATED');
  const stale = coverageReviewFromView({ review, isCurrent: false }, false, 'p1');
  assert.equal(stale.reasonCode, 'COVERAGE_REVIEW_OUT_OF_DATE');
});

test('5 measurement guard: a 100-row Status Board payload stays well under the response budget (measured about 57 KB)', () => {
  const items = Array.from({ length: 100 }, (_, index) => row(`m${index}`, ['ACTION_NEEDED', 'MONITOR', 'GOOD'][index % 3]));
  const bytes = Buffer.byteLength(JSON.stringify(board(items)));
  assert.ok(bytes < 150 * 1024, `${bytes} bytes`);
});
