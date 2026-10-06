const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Inventory 4d / D-O4: the seasonal home-care read, EXECUTED against an empty home. It is pure, so nothing is stubbed: the only inputs are a
// zip code (a required property column), an optional saved region, a date, and the local catalog. Not registered as an operation yet.

const { buildSeasonalHomeCareResult, deriveSeasonalClimateRegion, seasonalAssetFreeTasks } = require('../../src/services/ask/support/seasonalHomeCare.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const DATES = { SPRING: new Date(2026, 3, 15), SUMMER: new Date(2026, 6, 15), FALL: new Date(2026, 9, 15), WINTER: new Date(2026, 0, 15) };
const REGIONS = ['VERY_COLD', 'COLD', 'MODERATE', 'WARM', 'TROPICAL'];

test('region: saved wins, then the local zip-prefix table, else the national default, and the source is reported', () => {
  assert.deepEqual(deriveSeasonalClimateRegion('78701', 'COLD'), { region: 'COLD', source: 'SAVED' });
  assert.equal(deriveSeasonalClimateRegion('78701').source, 'ZIP_PREFIX');
  assert.deepEqual(deriveSeasonalClimateRegion('00000'), { region: 'MODERATE', source: 'NATIONAL_DEFAULT' });
  assert.deepEqual(deriveSeasonalClimateRegion(null), { region: 'MODERATE', source: 'NATIONAL_DEFAULT' });
  assert.deepEqual(deriveSeasonalClimateRegion('  '), { region: 'MODERATE', source: 'NATIONAL_DEFAULT' });
});

test('EXECUTED: all 20 season x climate-region cells return asset-free CONTENT (D-O16 option a closed FALL x TROPICAL by authoring tropical fall templates)', () => {
  const empties = [];
  for (const season of Object.keys(DATES)) {
    for (const region of REGIONS) {
      const tasks = seasonalAssetFreeTasks(season, region);
      if (tasks.length === 0) empties.push(`${season}/${region}`);
      for (const task of tasks) assert.equal(task.requiredAssetType == null && task.requiredAssetCheck == null, true, 'asset-free only');
    }
  }
  assert.deepEqual(empties, []);
  assert.ok(seasonalAssetFreeTasks('FALL', 'TROPICAL').length >= 2, 'at least two tasks so a list is not a single row');
});

test('a tropical home in fall (and "next season" asked in summer) gets a real answer, not a limited state', () => {
  for (const [now, focus] of [[DATES.FALL, 'THIS_SEASON'], [DATES.SUMMER, 'NEXT_SEASON']]) {
    const result = buildSeasonalHomeCareResult({ zipCode: '33101', savedClimateRegion: 'TROPICAL', now, focus });
    assert.equal(result.status, 'ANSWERED');
    assert.ok(result.blocks[1].sections[0].items.length >= 2);
  }
});

test('the bounded limited state still exists for a hypothetical cell with no task (the builder never errors)', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '33101', savedClimateRegion: 'NOT_A_REGION', now: DATES.FALL, focus: 'THIS_SEASON' });
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(result.reasonCode, 'SEASONAL_HOME_CARE_NO_GENERAL_TASKS');
});

test('EXECUTED: an empty-home answer (zip only) is ANSWERED with a summary, a task list and a boundary, and the blocks satisfy the real block schema', () => {
  for (const focus of ['THIS_SEASON', 'NEXT_SEASON']) {
    for (const date of Object.values(DATES)) {
      const result = buildSeasonalHomeCareResult({ zipCode: '78701', now: date, focus });
      assert.equal(result.status, 'ANSWERED', `${focus} ${date.toISOString()}`);
      assert.deepEqual(result.blocks.map((b) => b.type), ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']);
      for (const block of result.blocks) assert.doesNotThrow(() => AskPresentationBlockSchema.parse(block), block.id);
      const list = result.blocks[1];
      assert.ok(list.sections[0].items.length >= 1 && list.sections[0].items.length <= 8);
    }
  }
});

test('THIS_SEASON and NEXT_SEASON are different answers (distinct starters), and next season follows the current one', () => {
  const now = DATES.FALL;
  const here = buildSeasonalHomeCareResult({ zipCode: '78701', now, focus: 'THIS_SEASON' });
  const next = buildSeasonalHomeCareResult({ zipCode: '78701', now, focus: 'NEXT_SEASON' });
  assert.match(here.blocks[0].title, /fall/);
  assert.match(next.blocks[0].title, /winter/);
  assert.notDeepEqual(here.blocks[1].sections[0].items.map((i) => i.id), next.blocks[1].sections[0].items.map((i) => i.id));
});

test('an unmapped zip is answered with the national default and SAYS so; a mapped zip does not claim a default', () => {
  const unmapped = buildSeasonalHomeCareResult({ zipCode: '00000', now: DATES.SPRING, focus: 'THIS_SEASON' });
  assert.equal(unmapped.status, 'ANSWERED');
  assert.match(unmapped.blocks[0].body, /national default/);
  const mapped = buildSeasonalHomeCareResult({ zipCode: '78701', now: DATES.SPRING, focus: 'THIS_SEASON' });
  assert.doesNotMatch(mapped.blocks[0].body, /national default/);
});

test('the answer never claims to assess the home: the boundary says general guidance and nothing recorded is read', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '78701', now: DATES.SPRING, focus: 'THIS_SEASON' });
  assert.match(result.blocks[2].body, /not an assessment of this home/);
  // The checklist opens inside Ask (the maintenance read over the home's own generated checklist), not the desktop page.
  const action = result.blocks[0].actions[0];
  assert.equal(action.href, undefined);
  assert.equal(action.interactionType, 'START_WORKFLOW');
  assert.equal(action.operationId, 'MAINTENANCE_STATUS');
  assert.match(action.message, /spring checklist/i);
});
