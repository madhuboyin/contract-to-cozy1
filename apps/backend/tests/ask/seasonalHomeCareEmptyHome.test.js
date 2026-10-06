const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Inventory 4d / D-O4: the seasonal home-care read, EXECUTED against an empty home. It is pure, so nothing is stubbed: the only inputs are a
// zip code (a required property column), an optional saved region, a date, and the local catalog. Not registered as an operation yet.

const { buildSeasonalHomeCareResult, buildSeasonalTaskWalkthrough, deriveSeasonalClimateRegion, seasonalAssetFreeTasks } = require('../../src/services/ask/support/seasonalHomeCare.ts');
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
    assert.ok(result.blocks[1].sections.flatMap((section) => section.items).length >= 2);
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
      assert.deepEqual(result.blocks.map((b) => b.type), ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY', 'SUMMARY']);
      for (const block of result.blocks) assert.doesNotThrow(() => AskPresentationBlockSchema.parse(block), block.id);
      const list = result.blocks[1];
      const shown = list.sections.flatMap((section) => section.items);
      assert.ok(shown.length >= 1 && shown.length <= 8);
    }
  }
});

test('THIS_SEASON and NEXT_SEASON are different answers (distinct starters), and next season follows the current one', () => {
  const now = DATES.FALL;
  const here = buildSeasonalHomeCareResult({ zipCode: '78701', now, focus: 'THIS_SEASON' });
  const next = buildSeasonalHomeCareResult({ zipCode: '78701', now, focus: 'NEXT_SEASON' });
  assert.match(here.blocks[0].title, /fall/);
  assert.match(next.blocks[0].title, /winter/);
  const ids = (result) => result.blocks[1].sections.flatMap((section) => section.items).map((i) => i.id);
  assert.notDeepEqual(ids(here), ids(next));
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
  assert.equal(result.blocks[2].title, 'About this recommendation');
});

test('the next steps stay in Ask: no link anywhere, at most three actions, and Update home details goes to the home-record check', () => {
  const result = buildSeasonalHomeCareResult({ zipCode: '78701', now: DATES.SPRING, focus: 'THIS_SEASON' });
  const next = result.blocks[3];
  assert.equal(next.title, 'What would you like to do next?');
  assert.ok(next.actions.length >= 1 && next.actions.length <= 3);
  assert.deepEqual(next.actions.map((action) => action.id), ['seasonal-walkthrough', 'seasonal-update-home-details'], 'with no setup context there is no write and no checklist claim');
  for (const block of result.blocks) for (const action of block.actions ?? []) assert.equal(action.href, undefined, action.id);
  const update = next.actions.find((action) => action.id === 'seasonal-update-home-details');
  assert.deepEqual([update.operationId, update.message], ['PROPERTY_SUMMARY', 'How complete is my home record?']);
  assert.equal(JSON.stringify(result).includes('/dashboard/seasonal'), false);
});

test('a task walkthrough is one guide card built only from the template\'s own facts: chips, what to do, when, and no invented steps', () => {
  const input = { zipCode: '08536', now: new Date(2026, 9, 5), focus: 'NEXT_SEASON', setup: { canSetUp: true, checklist: null } };
  const guide = buildSeasonalTaskWalkthrough({ ...input, taskKey: 'WINTER_FURNACE_FILTER_CHANGE' }).blocks[0];
  assert.equal(guide.type, 'TASK_GUIDE');
  assert.equal(guide.title, 'Replace furnace filters monthly');
  assert.deepEqual(guide.eyebrow, ['Winter prep', 'Task 1 of 4']);
  assert.equal(guide.icon, 'HVAC');
  assert.deepEqual(guide.chips.map((chip) => [chip.kind, chip.label]), [['PRIORITY_HIGH', 'High priority'], ['TIME', '~15 minutes'], ['COST', '$15\u2013$40'], ['DIY', 'DIY']]);
  assert.equal(guide.summary, 'Dirty filters reduce efficiency and can cause furnace failure in extreme cold.');
  assert.deepEqual(guide.main, { title: 'What to do', body: 'Check and replace HVAC filters every month during peak heating season', facts: [{ label: 'When', value: 'Best done about 2 weeks before winter starts' }] });
  assert.equal(guide.tip ?? null, null, 'a template records no tip, so none is shown');
  assert.deepEqual(guide.notes.map((note) => note.id), ['why', 'personalized']);
  assert.equal(guide.notes[1].actionId, 'seasonal-update-home-details');
  assert.deepEqual(guide.actions.map((action) => action.id), ['seasonal-next-task', 'seasonal-add-tasks', 'seasonal-back-to-plan', 'seasonal-update-home-details']);
  assert.equal(guide.actions[0].label, 'Next winter task');
  AskPresentationBlockSchema.parse(guide);
  const last = buildSeasonalTaskWalkthrough({ ...input, taskKey: seasonalAssetFreeTasks('WINTER', 'MODERATE').at(-1).taskKey }).blocks[0];
  assert.equal(last.actions.some((action) => action.id === 'seasonal-next-task'), false, 'the last task has no next');
  assert.equal(buildSeasonalTaskWalkthrough({ ...input, taskKey: 'NOT_A_TASK' }), null);
});
