const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Presentation Quality 2C/2D: the pure evaluator accepts the real producers' outputs for their profile and reports each negative
// case from the plan (section 11.1) with a stable code. It is development-time only: it never rewrites a result.

const { evaluatePresentationQuality } = require('../../src/services/ask/presentation/evaluatePresentationQuality.ts');
const { statusBoardFromView, refinanceScenarioComparison } = require('../../src/services/ask/askOrchestrator.service.ts');
const { refinanceScenarioAssumptions } = require('../../src/services/ask/handlers/refinance.handler.ts');
const { buildSeasonalHomeCareResult } = require('../../src/services/ask/support/seasonalHomeCare.ts');

const codes = (input) => evaluatePresentationQuality(input).map((issue) => issue.code);
const summary = (extra = {}) => ({ type: 'SUMMARY', id: 'sum', title: 'Answer', body: 'b', tone: 'DEFAULT', actions: [], ...extra });
const list = (extra = {}, sections) => ({
  type: 'GROUPED_LIST', id: 'l', title: 'L', actions: [], filters: [],
  sections: sections ?? [{ id: 's', title: 'Items', count: 2, items: [{ id: 'a', title: 'A', meta: [], description: 'why' }, { id: 'b', title: 'B', meta: [], description: 'why' }] }],
  ...extra,
});
const action = (id, style) => ({ id, label: id, style, interactionType: 'START_WORKFLOW', message: 'm', operationId: 'OP' });

const row = (id, condition, extra = {}) => ({
  id, displayName: `Item ${id}`, category: 'APPLIANCE', condition, recommendation: 'OK', ageYears: 5,
  computedReasons: [{ code: 'PAST_EOL', detail: 'Past expected life' }], warrantyStatus: 'ACTIVE', pendingMaintenance: 0, room: null, isPinned: false,
  needsInstallDateForPrediction: false, ...extra,
});

test('the real Status Board passes its COLLECTION and ATTENTION profiles', () => {
  const items = [row('a', 'ACTION_NEEDED'), row('m', 'MONITOR'), row('g', 'GOOD'), row('u', 'GOOD', { needsInstallDateForPrediction: true, inventoryItemId: 'inv-u', ageYears: null, computedReasons: [] })];
  const result = statusBoardFromView({ items, summary: {}, pagination: { page: 1, limit: 100, total: 4, totalPages: 1 } }, 'p1', true);
  assert.deepEqual(codes({ profile: 'COLLECTION', result }), []);
  assert.deepEqual(codes({ profile: 'ATTENTION', result }), []);
});

test('the real seasonal plan passes as ATTENTION with exactly one primary action', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '60601', now: new Date('2026-10-14T12:00:00Z'), focus: 'THIS_SEASON', setup: { canSetUp: true, checklist: null } });
  assert.deepEqual(codes({ profile: 'ATTENTION', result }), []);
});

test('a refinance scenario with assumptions, a dated benchmark and a boundary passes COMPARE; without them it is reported', () => {
  const strip = refinanceScenarioComparison({ currentRatePct: 6.875, marketRatePct: 6.125, monthlySavings: 210, lifetimeSavings: 41000, breakEvenMonths: 28 },
    { monthlySavings: 333, lifetimeSavings: 77000, closingCostUsd: 6400, breakEvenMonths: null }, 5.5, '15-year');
  const items = refinanceScenarioAssumptions({ edit: { targetRatePct: 5.5, targetTerm: 'FIFTEEN_YEAR' }, targetRatePct: 5.5, termLabel: '15-year', benchmarkDate: '2026-10-09', mortgageAsOf: null });
  const full = [summary({ actions: [action('adjust', 'PRIMARY'), action('compare', 'SECONDARY')] }), strip,
    { type: 'ASSUMPTIONS', id: 'as', title: 'Assumes', items },
    { type: 'EVIDENCE', id: 'ev', title: 'Sources', items: [{ label: 'Benchmark', source: 'FRED', observedAt: '2026-10-09T00:00:00.000Z' }] },
    { type: 'BOUNDARY', id: 'bd', title: 'Not a quote', body: 'b', severity: 'INFO', suggestions: [] }];
  assert.deepEqual(codes({ profile: 'COMPARE', result: { blocks: full } }), []);
  const bare = codes({ profile: 'COMPARE', result: { blocks: [summary(), strip] } });
  assert.deepEqual(bare.sort(), ['MATERIAL_COMPARISON_WITHOUT_ASSUMPTIONS_OR_LIMITS', 'MATERIAL_COMPARISON_WITHOUT_BASIS']);
  assert.deepEqual(codes({ profile: 'COMPARE', material: false, result: { blocks: [summary(), strip] } }), [], 'a low-risk comparison is not failed for lacking evidence');
});

test('a simple direct answer is never failed for lacking evidence or a list', () => {
  assert.deepEqual(codes({ profile: 'DIRECT_ANSWER', result: { blocks: [summary()] } }), []);
});

test('negative: two visible primary actions in a normal answer, allowed only when the fixture declares the exception', () => {
  const blocks = [summary({ actions: [action('one', 'PRIMARY'), action('two', 'PRIMARY')] })];
  assert.deepEqual(codes({ profile: 'DIRECT_ANSWER', result: { blocks } }), ['MULTIPLE_PRIMARY_ACTIONS']);
  assert.deepEqual(codes({ profile: 'DIRECT_ANSWER', allowMultiplePrimaryActions: true, result: { blocks } }), []);
});

test('negative: primary actions are counted across blocks, not per block', () => {
  const blocks = [summary({ actions: [action('one', 'PRIMARY')] }), list({ actions: [action('two', 'PRIMARY')] })];
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks } }), ['MULTIPLE_PRIMARY_ACTIONS']);
});

test('negative: collection descriptor contradictions, and a next page nothing can serve', () => {
  const contradictory = list({ collection: { sourceTotal: 3, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: false } });
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks: [summary(), contradictory] } }), ['COLLECTION_DESCRIPTOR_CONTRADICTION'], 'delivered 3 but the sections carry 2');
  const noPage = list({ collection: { sourceTotal: 9, fetchedCount: 2, deliveredCount: 2, nextPageAvailable: true, deliveryTruncated: false } });
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks: [summary(), noPage] } }), ['NEXT_PAGE_WITHOUT_CONTINUATION']);
  const withOffset = list({ collection: { sourceTotal: 9, fetchedCount: 2, deliveredCount: 2, nextPageAvailable: true, deliveryTruncated: false } },
    [{ id: 's', title: 'Items', count: 9, offset: 0, items: [{ id: 'a', title: 'A', meta: [] }, { id: 'b', title: 'B', meta: [] }] }]);
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks: [summary(), withOffset] } }), []);
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks: [summary(), noPage], parameters: { nextCursor: 'c1' } } }), [], 'a cursor is a continuation');
});

test('negative: section count below delivered, table total below rows', () => {
  const lowCount = list({}, [{ id: 's', title: 'Items', count: 1, items: [{ id: 'a', title: 'A', meta: [] }, { id: 'b', title: 'B', meta: [] }] }]);
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks: [summary(), lowCount] } }), ['SECTION_COUNT_BELOW_DELIVERED']);
  const table = { type: 'TABLE', id: 't', title: 'T', columns: [{ key: 'k', label: 'K' }], rows: [{ id: 'r1', values: { k: 'v' } }, { id: 'r2', values: { k: 'v' } }], totalCount: 1, actions: [] };
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks: [summary(), table] } }), ['TABLE_TOTAL_BELOW_ROWS']);
});

test('negative: unknown data presented as Good', () => {
  const bad = list({}, [{ id: 'g', title: 'In good shape', count: 1, items: [{ id: 'u', title: 'U', meta: [], description: 'x', needsInfo: true }] }]);
  assert.deepEqual(codes({ profile: 'ATTENTION', result: { blocks: [summary(), bad] } }), ['UNKNOWN_PRESENTED_AS_GOOD']);
});

test('negative: a result that does not lead with an answer, an attention item with no reason, a guide with no progress source, a collection with no list', () => {
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks: [list(), summary()] } }), ['FIRST_BLOCK_NOT_ANSWER']);
  const noReason = list({}, [{ id: 's', title: 'Soon', count: 1, items: [{ id: 'a', title: 'A', meta: [] }] }]);
  assert.deepEqual(codes({ profile: 'ATTENTION', result: { blocks: [summary(), noReason] } }), ['ATTENTION_ITEM_WITHOUT_REASON']);
  assert.deepEqual(codes({ profile: 'GUIDE', result: { blocks: [summary()] } }), ['GUIDE_WITHOUT_PROGRESS_SOURCE']);
  assert.deepEqual(codes({ profile: 'COLLECTION', result: { blocks: [summary()] } }), ['COLLECTION_BLOCK_MISSING']);
});

test('the evaluator does not modify the result it reads', () => {
  const result = { blocks: [summary({ actions: [action('one', 'PRIMARY'), action('two', 'PRIMARY')] })] };
  const before = JSON.stringify(result);
  evaluatePresentationQuality({ profile: 'DIRECT_ANSWER', result });
  assert.equal(JSON.stringify(result), before);
});

test('2C: a contextual continuation always outranks generic discovery, after every ranking adjustment', () => {
  const { TIER_BASE_SCORE, validateSuggestedNextActionRegistry } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
  assert.ok(TIER_BASE_SCORE.CONTINUE > TIER_BASE_SCORE.RECORD_ACTION);
  assert.ok(TIER_BASE_SCORE.RECORD_ACTION > TIER_BASE_SCORE.RELATED);
  assert.ok(TIER_BASE_SCORE.RELATED > TIER_BASE_SCORE.DISCOVERY);
  assert.deepEqual(validateSuggestedNextActionRegistry(), [], 'the registry check rejects any tier that can overlap a higher one');
});
