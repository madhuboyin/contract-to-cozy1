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

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

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

function loadJob({
  properties,
  climateSetting = undefined, // undefined = "not found", triggers auto-create
  existingChecklistForUpcoming = null,
  existingChecklistForCurrent = null,
  templates = [],
  applicabilityResult = () => ({ status: 'APPLICABLE' }),
  promotionShouldFailFor = new Set(),
  daysUntilNextSeason = 5,
  offsetForTiming = 14,
} = {}) {
  const calls = {
    checklistCreates: [],
    itemCreates: [],
    promotions: [],
    checklistUpdates: [],
    climateSettingCreates: [],
  };

  const prismaMock = {
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
      findFirst: async ({ where }) => {
        // Distinguish "upcoming season" vs "current season" lookups by which
        // fixture the caller configured — both use the same shape, so tests
        // only ever configure one non-null result at a time.
        return existingChecklistForUpcoming ?? existingChecklistForCurrent ?? null;
      },
      create: async (args) => {
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
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const applicabilityPath = require.resolve('../../../backend/src/services/seasonal/applicabilityPolicy.ts');
  require.cache[applicabilityPath] = {
    id: applicabilityPath,
    filename: applicabilityPath,
    loaded: true,
    exports: { evaluateSeasonalTemplateApplicability: (_ctx, template) => applicabilityResult(template) },
  };

  const taskServicePath = require.resolve('../../../backend/src/services/PropertyMaintenanceTask.service.ts');
  require.cache[taskServicePath] = {
    id: taskServicePath,
    filename: taskServicePath,
    loaded: true,
    exports: {
      PropertyMaintenanceTaskService: {
        createFromSeasonalItemInternal: async (propertyId, seasonalItemId) => {
          calls.promotions.push(seasonalItemId);
          if (promotionShouldFailFor.has(seasonalItemId)) throw new Error(`promotion failed for ${seasonalItemId}`);
        },
      },
    },
  };

  const seasonWindowPath = require.resolve('../../../backend/src/services/seasonal/seasonWindow.ts');
  require.cache[seasonWindowPath] = {
    id: seasonWindowPath,
    filename: seasonWindowPath,
    loaded: true,
    exports: {
      getSeasonStartDate: () => new Date('2026-09-01'),
      getSeasonEndDate: () => new Date('2026-11-30'),
      resolveCurrentSeasonWindow: () => ({ season: 'SUMMER', year: 2026, daysUntilStart: -60 }),
      resolveUpcomingSeasonWindow: () => ({ season: 'FALL', year: 2026, daysUntilStart: daysUntilNextSeason }),
    },
  };

  const jobPath = require.resolve('../../src/jobs/seasonalChecklistGeneration.job.ts');
  delete require.cache[jobPath];
  const mod = require(jobPath);
  // getNotificationOffsetDays isn't exported, but its effect is observable
  // via daysUntilNextSeason vs. offsetForTiming — climateSetting fixtures
  // below set notificationTiming to control which branch fires.
  void offsetForTiming;
  return { ...mod, calls };
}

// ── generateSeasonalChecklists (top-level orchestration) ──────────────

test('creates a default climate setting with fallback region detection when none exists', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture({ state: 'FL' })],
    climateSetting: null,
    existingChecklistForUpcoming: { id: 'existing' }, // short-circuits generation, isolates this test to the create-setting behavior
  });

  await generateSeasonalChecklists();

  assert.equal(calls.climateSettingCreates.length, 1);
  assert.equal(calls.climateSettingCreates[0].data.climateRegion, 'TROPICAL');
  assert.equal(calls.climateSettingCreates[0].data.climateRegionSource, 'AUTO_DETECTED');
});

test('skips a property with autoGenerateChecklists=false without generating anything', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: false, excludedTaskKeys: [] },
  });

  await generateSeasonalChecklists();

  assert.equal(calls.checklistCreates.length, 0);
});

test('generates the upcoming-season checklist when within the notification offset window', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5, // within STANDARD's 14-day offset
    templates: [{ id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' }],
  });

  await generateSeasonalChecklists();

  assert.equal(calls.checklistCreates.length, 1);
  assert.equal(calls.checklistCreates[0].data.season, 'FALL');
});

test('does not regenerate an upcoming-season checklist that already exists', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    existingChecklistForUpcoming: { id: 'existing-checklist' },
  });

  await generateSeasonalChecklists();

  assert.equal(calls.checklistCreates.length, 0);
});

test('falls back to generating the current-season checklist when outside the upcoming-season window and none exists yet', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 90, // far outside any offset window
    existingChecklistForCurrent: null,
    templates: [{ id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' }],
  });

  await generateSeasonalChecklists();

  assert.equal(calls.checklistCreates.length, 1);
  assert.equal(calls.checklistCreates[0].data.season, 'SUMMER', 'must generate for the CURRENT season window, not upcoming');
});

test('one property failing does not abort checklist generation for the rest of the batch', async () => {
  const badProperty = propertyFixture({ id: 'property-bad' });
  const goodProperty = propertyFixture({ id: 'property-good' });
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [badProperty, goodProperty],
    // climateSetting undefined triggers auto-create; force the create to
    // throw only for the bad property via a per-property override isn't
    // directly supported by this mock shape, so instead simulate failure
    // via an already-existing checklist causing an error path is avoided —
    // use existingChecklistForUpcoming with a thrown getter instead.
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    templates: [{ id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' }],
  });

  // Force the checklist create to throw once (simulating a transient DB
  // error for the first property only), by wrapping after load.
  let callCount = 0;
  const originalCreate = require.cache[require.resolve('../../src/lib/prisma.ts')].exports.prisma.seasonalChecklist.create;
  require.cache[require.resolve('../../src/lib/prisma.ts')].exports.prisma.seasonalChecklist.create = async (args) => {
    callCount++;
    if (callCount === 1) throw new Error('transient db error');
    return originalCreate(args);
  };

  await assert.doesNotReject(() => generateSeasonalChecklists());

  assert.equal(calls.checklistCreates.length, 1, 'the second (good) property must still succeed');
});

// ── generateChecklistForProperty (via generateSeasonalChecklists) ─────

test('excludes templates listed in excludedTaskKeys', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: ['clean-gutters'] },
    daysUntilNextSeason: 5,
    templates: [
      { id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' },
      { id: 'template-2', taskKey: 'check-furnace', title: 'Check furnace', description: null, priority: 'HIGH' },
    ],
  });

  await generateSeasonalChecklists();

  assert.equal(calls.itemCreates.length, 1);
  assert.equal(calls.itemCreates[0].data.taskKey, 'check-furnace');
});

test('excludes templates the applicability policy marks NOT_APPLICABLE', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    templates: [{ id: 'template-1', taskKey: 'check-ac', title: 'Check AC', description: null, priority: 'MEDIUM' }],
    applicabilityResult: () => ({ status: 'NOT_APPLICABLE', reasonCodes: ['NO_AC'] }),
  });

  await generateSeasonalChecklists();

  assert.equal(calls.itemCreates.length, 0);
});

test('promotes each checklist item to a canonical maintenance task and records tasksAdded', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    templates: [
      { id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' },
      { id: 'template-2', taskKey: 'check-furnace', title: 'Check furnace', description: null, priority: 'HIGH' },
    ],
  });

  await generateSeasonalChecklists();

  assert.equal(calls.promotions.length, 2);
  const tasksAddedUpdate = calls.checklistUpdates.find((u) => u.data.tasksAdded !== undefined);
  assert.equal(tasksAddedUpdate.data.tasksAdded, 2);
});

test('one item failing promotion does not block the others, and tasksAdded only counts successes', async () => {
  const { generateSeasonalChecklists, calls } = loadJob({
    properties: [propertyFixture()],
    climateSetting: { climateRegion: 'MODERATE', notificationTiming: 'STANDARD', autoGenerateChecklists: true, excludedTaskKeys: [] },
    daysUntilNextSeason: 5,
    templates: [
      { id: 'template-1', taskKey: 'clean-gutters', title: 'Clean gutters', description: null, priority: 'MEDIUM' },
      { id: 'template-2', taskKey: 'check-furnace', title: 'Check furnace', description: null, priority: 'HIGH' },
    ],
    promotionShouldFailFor: new Set(['item-1']),
  });

  await assert.doesNotReject(() => generateSeasonalChecklists());

  assert.equal(calls.promotions.length, 2, 'both must still be attempted');
  const tasksAddedUpdate = calls.checklistUpdates.find((u) => u.data.tasksAdded !== undefined);
  assert.equal(tasksAddedUpdate.data.tasksAdded, 1, 'only the successful promotion counts');
});
