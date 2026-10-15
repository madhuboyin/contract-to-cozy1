const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_CONVERSATIONAL_PRESENTATION_QUALITY_IMPLEMENTATION_PLAN.md Phase 1C: deterministic baseline of three
// representative slices, from the real pure builders (no database, no services). Each "BASELINE" assertion pins what
// the producer does today so Phase 2/3 changes are deliberate and visible; where one is a known gap, the comment names
// the plan item that will change it.

const { statusBoardFromView, refinanceScenarioComparison } = require('../../src/services/ask/askOrchestrator.service.ts');
const { buildSeasonalHomeCareResult } = require('../../src/services/ask/support/seasonalHomeCare.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const row = (id, condition, overrides = {}) => ({
  id, displayName: `Item ${id}`, category: 'APPLIANCE', condition, recommendation: 'OK', ageYears: 5,
  computedReasons: [], warrantyStatus: 'ACTIVE', pendingMaintenance: 0, room: null, isPinned: false, needsInstallDateForPrediction: false,
  ...overrides,
});
const board = (n, total = n, make = (i) => row(`i${i}`, ['ACTION_NEEDED', 'MONITOR', 'GOOD'][i % 3])) => (
  statusBoardFromView({ items: Array.from({ length: n }, (_, i) => make(i)), summary: {}, pagination: { page: 1, limit: 100, total, totalPages: 1 } }, 'p1')
);
const listOf = (result) => result.blocks.find((block) => block.id === 'status-board-items');

test('Status Board baseline: every size parses, and section counts equal the rows in the source (never more than shown beyond the 25-row cap)', () => {
  for (const n of [1, 5, 20, 50, 100]) {
    const result = board(n);
    const list = listOf(result);
    AskPresentationBlockSchema.parse(list);
    const counted = list.sections.reduce((sum, section) => sum + section.count, 0);
    assert.equal(counted, n, `${n} items: section counts add up to the items read`);
    for (const section of list.sections) assert.ok(section.items.length <= 25, 'a section delivers at most 25 rows');
  }
});

test('Status Board baseline: past 25 rows a section reports its true count but delivers 25, with no per-section signal of that (Phase 2A)', () => {
  const list = listOf(board(100, 100, (i) => row(`m${i}`, 'MONITOR')));
  const monitor = list.sections.find((section) => section.id === 'status-board-monitor');
  assert.equal(monitor.count, 100);
  assert.equal(monitor.items.length, 25);
  // BASELINE: no sourceTotal/deliveredCount/nextPage fields exist on a section yet. Phase 2A adds them.
  assert.deepEqual(Object.keys(monitor).sort(), ['count', 'id', 'items', 'title']);
});

test('Status Board baseline: more than the route page says so in a limitation and in the summary body', () => {
  const result = board(100, 140);
  const limitation = result.blocks.find((block) => block.id === 'status-board-limits');
  assert.match(limitation.body, /first 100 of 140/);
  assert.match(result.blocks[0].body, /counts cover the 100 shown/);
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
});

test('Status Board baseline: empty board answers plainly with no collection and no all-clear', () => {
  const result = board(0);
  assert.equal(result.reasonCode, 'STATUS_BOARD_EMPTY');
  assert.equal(listOf(result), undefined);
  assert.match(result.blocks[0].title, /Nothing is on the Status Board yet/);
});

test('Status Board baseline: unknown items are partial data, not Good (Phase 1A)', () => {
  const result = board(3, 3, (i) => row(`u${i}`, 'GOOD', { needsInstallDateForPrediction: true, ageYears: null, inventoryItemId: `inv-${i}` }));
  const list = listOf(result);
  assert.equal(list.sections.find((section) => section.id === 'status-board-good').count, 0);
  assert.equal(list.sections.find((section) => section.id === 'status-board-needs-info').count, 3);
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
});

test('Seasonal baseline: the plan leads with the judgment, groups by producer priority, and keeps setup a proposal', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '60601', now: new Date('2026-10-14T12:00:00Z'), focus: 'CURRENT_SEASON', setup: { canSetUp: true, checklist: null } });
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.blocks[0].id, 'seasonal-home-care-summary');
  assert.match(result.blocks[0].body, /matter most|None of the/);
  const list = result.blocks.find((block) => block.id === 'seasonal-home-care-tasks');
  AskPresentationBlockSchema.parse(list);
  assert.deepEqual(list.sections.map((section) => section.id).filter((id) => ['seasonal-soon', 'seasonal-wait'].includes(id)), list.sections.map((section) => section.id));
  const next = result.blocks.find((block) => block.id === 'seasonal-home-care-next');
  assert.equal(next.actions.filter((action) => action.style === 'PRIMARY').length, 1, 'one primary action');
  assert.match(next.body, /review exactly what it adds before anything changes/);
});

test('Seasonal baseline: general guidance is labelled general by the boundary block', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: null, now: new Date('2026-01-10T12:00:00Z'), focus: 'CURRENT_SEASON' });
  assert.ok(result.blocks.some((block) => block.type === 'BOUNDARY'));
});

test('Refinance scenario strip baseline: two options with no recommendation, assumptions, basis date or freshness (Phase 2B/3C)', () => {
  const block = refinanceScenarioComparison(
    { currentRatePct: 6.875, marketRatePct: 6.125, monthlySavings: 210, lifetimeSavings: 41000, breakEvenMonths: 28 },
    { monthlySavings: 333, lifetimeSavings: 77000, closingCostUsd: 6400, breakEvenMonths: null }, 5.5, '15-year');
  AskPresentationBlockSchema.parse(block);
  assert.equal(block.options.length, 2);
  // BASELINE gaps the plan targets: the strip itself carries no basis/as-of date, no assumptions list and no rationale.
  const labels = block.options.flatMap((option) => option.attributes.map((attribute) => attribute.label));
  assert.ok(!labels.some((label) => /as of|assum|basis|fresh/i.test(label)));
  assert.equal(block.options.every((option) => option.badge === undefined), true);
});
