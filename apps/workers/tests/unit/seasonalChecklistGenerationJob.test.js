// apps/workers/tests/unit/seasonalChecklistGenerationJob.test.js
//
// W4 item 4: generateSeasonalChecklists (registry key
// seasonal-checklist-generation) had no dedicated test. This is the
// largest remaining untested job — covers the highest-value branches
// rather than every line: climate-setting auto-creation with fallback
// region detection, the auto-generate-disabled skip, upcoming-vs-current
// season generation branching, already-exists dedup, per-property
// isolation (already present), template exclusion/applicability
// filtering, and per-item promotion isolation (already present, W3
// seasonal slice).
//
// seasonWindow's date functions are mocked for determinism rather than
// computed from the real system clock.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { generateSeasonalChecklists } = require('../../src/jobs/seasonalChecklistGeneration.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function propertyFixture(overrides = {}) {
  return {
    id: 'property-1',
    zipCode: '10001',
    state: 'NY',
    roofType: 'UNKNOWN',
    coolingType: null,
    hasSmokeDetectors: null,
    hasCoDetectors: null,
    homeownerProfile: {},
    inventoryItems: [],
    exteriorProfile: null,
    responsibilities: [],
    maintenanceTasks: [],
    ...overrides,
  };
}

function fakeDeps({
  properties,
  climateSetting = undefined, // undefined = "not found", triggers auto-create
  existingChecklistForUpcoming = null,
  existingChecklistForCurrent = null,
  templates = [],
  applicabilityResult = () => ({ status: 'APPLICABLE' }),
  promotionShouldFailFor = new Set(),
  daysUntilNextSeason = 5,
  checklistCreateShouldFailFor = new Set(),
} = {}) {
  const calls = {
    checklistCreates: [],
    itemCreates: [],
    promotions: [],
    checklistUpdates: [],
    climateSettingCreates: [],
  };

  let checklistCreateCallCount = 0;

  const prisma = {
    property: {
      findMany: async () => properties,
      findUnique: async ({ where }) => properties.find((p) => p.id === where.id) ?? null,
    },
    propertyClimateSetting: {
      findUnique: async () => climateSetting,
      create: async (args) => {
        calls.climateSettingCreates.push(args);
        return { id: 'climate-1', ...args.data };
      },
    },
    seasonalChecklist: {
      findFirst: async () => {
        // Distinguish "upcoming season" vs "current season" lookups by which
        // fixture the caller configured — both use the same shape, so tests
        // only ever configure one non-null result at a time.
        return existingChecklistForUpcoming ?? existingChecklistForCurrent ?? null;
      },
      create: async (args) => {
        checklistCreateCallCount++;
        if (checklistCreateShouldFailFor.has(checklistCreateCallCount)) {
          throw new Error('transient db error');
        }
        calls.checklistCreates.push(args);
        return { id: 'checklist-1', ...args.data };
      },
      update: async (args) => {
        calls.checklistUpdates.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
    seasonalTaskTemplate: {
      findMany: async () => templates,
    },
    seasonalChecklistItem: {
      create: async (args) => {
        calls.itemCreates.push(args);
        return { id: `item-${calls.itemCreates.length}`, ...args.data };
      },
    },
  };

  const deps = {
    prisma,
    logger: noopLogger,
    evaluateSeasonalTemplateApplicability: (_ctx, template) => applicabilityResult(template),
    propertyMaintenanceTaskService: {
      createFromSeasonalItemInternal: async (propertyId, seasonalItemId) => {
        calls.promotions.push(seasonalItemId);
        if (promotionShouldFailFor.has(seasonalItemId)) throw new Error(`promotion failed for ${seasonalItemId}`);
      },
    },
    getSeasonStartDate: () => new Date('2026-09-01'),
    getSeasonEndDate: () => new Date('2026-11-30'),
    resolveCurrentSeasonWindow: () => ({ season: 'SUMMER', year: 2026, daysUntilStart: -60 }),
    resolveUpcomingSeasonWindow: () => ({ season: 'FALL', year: 2026, daysUntilStart: daysUntilNextSeason }),
  };

  return { deps, calls };
}

// ── generateSeasonalChecklists (top-level orchestration) ──────────────

test('creates a default climate setting with fallback region detection when none exists', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture({ state: 'FL' })],
    climateSetting: null,
    existingChecklistForUpcoming: { id: 'existing' }, // short-circuits generation, isolates this test to the create-setting behavior
  });

  await generateSeasonalChecklists(deps);

  assert.equal(calls.climateSettingCreates.length, 1);
  assert.equal(calls.climateSettingCreates[0].data.climateRegion, 'TROPICAL');
  assert.equal(calls.climateSettingCreates[0].data.climateRegionSource, 'AUTO_DETECTED');
});

test('skips a property with autoGenerateChecklists=false without generating anything', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: false, excludedTaskKeys: [] },
  });

  await generateSeasonalChecklists(deps);

  assert.equal(calls.checklistCreates.length, 0);
});

test('generates the upcoming-season checklist when within the notification offset window', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5, // within STANDARD's 14-day offset
    templates: [{ id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' }],
  });

  await generateSeasonalChecklists(deps);

  assert.equal(calls.checklistCreates.length, 1);
  assert.equal(calls.checklistCreates[0].data.season, 'FALL');
});

test('does not regenerate an upcoming-season checklist that already exists', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    existingChecklistForUpcoming: { id: 'existing-checklist' },
  });

  await generateSeasonalChecklists(deps);

  assert.equal(calls.checklistCreates.length, 0);
});

test('falls back to generating the current-season checklist when outside the upcoming-season window and none exists yet', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 90, // far outside any offset window
    existingChecklistForCurrent: null,
    templates: [{ id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' }],
  });

  await generateSeasonalChecklists(deps);

  assert.equal(calls.checklistCreates.length, 1);
  assert.equal(calls.checklistCreates[0].data.season, 'SUMMER', 'must generate for the CURRENT season window, not upcoming');
});

test('one property failing does not abort checklist generation for the rest of the batch', async () => {
  const badProperty = propertyFixture({ id: 'property-bad' });
  const goodProperty = propertyFixture({ id: 'property-good' });
  const { deps, calls } = fakeDeps({
    properties: [badProperty, goodProperty],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    templates: [{ id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' }],
    // The checklist create throws once (simulating a transient DB error for
    // the first property only) — the second property must still succeed.
    checklistCreateShouldFailFor: new Set([1]),
  });

  await assert.doesNotReject(() => generateSeasonalChecklists(deps));

  assert.equal(calls.checklistCreates.length, 1, 'the second (good) property must still succeed');
});

// ── generateChecklistForProperty (via generateSeasonalChecklists) ─────

test('excludes templates listed in excludedTaskKeys', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: ['clean-gutters'] },
    daysUntilNextSeason: 5,
    templates: [
      { id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' },
      { id: 'template-2', taskKey: 'check-furnace', title: 'Check furnace', description: null, priority: 'HIGH' },
    ],
  });

  await generateSeasonalChecklists(deps);

  assert.equal(calls.itemCreates.length, 1);
  assert.equal(calls.itemCreates[0].data.taskKey, 'check-furnace');
});

test('excludes templates the applicability policy marks NOT_APPLICABLE', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    templates: [{ id: 'template-1', taskKey: 'check-ac', title: 'Check AC', description: null, priority: 'MEDIUM' }],
    applicabilityResult: () => ({ status: 'NOT_APPLICABLE', reasonCodes: ['NO_AC'] }),
  });

  await generateSeasonalChecklists(deps);

  assert.equal(calls.itemCreates.length, 0);
  assert.equal(calls.checklistCreates.length, 0, 'unknown or inapplicable context must not create an empty checklist');
});

test('promotes each checklist item to a canonical maintenance task and records tasksAdded', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    templates: [
      { id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' },
      { id: 'template-2', taskKey: 'check-furnace', title: 'Check furnace', description: null, priority: 'HIGH' },
    ],
  });

  await generateSeasonalChecklists(deps);

  assert.equal(calls.promotions.length, 2);
  const tasksAddedUpdate = calls.checklistUpdates.find((u) => u.data.tasksAdded !== undefined);
  assert.equal(tasksAddedUpdate.data.tasksAdded, 2);
});

test('one item failing promotion does not block the others, and tasksAdded only counts successes', async () => {
  const { deps, calls } = fakeDeps({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    templates: [
      { id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' },
      { id: 'template-2', taskKey: 'check-furnace', title: 'Check furnace', description: null, priority: 'HIGH' },
    ],
    promotionShouldFailFor: new Set(['item-1']),
  });

  await assert.doesNotReject(() => generateSeasonalChecklists(deps));

  assert.equal(calls.promotions.length, 2, 'both must still be attempted');
  const tasksAddedUpdate = calls.checklistUpdates.find((u) => u.data.tasksAdded !== undefined);
  assert.equal(tasksAddedUpdate.data.tasksAdded, 1, 'only the successful promotion counts');
});
