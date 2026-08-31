const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// The persisted OperationalWorkItem.title is normalized at one boundary —
// workItemRepository's create + refresh paths — plus a backlog self-heal.
// This keeps a raw "HIGH Risk: WATER_HEATER_TANK" out of the database so no
// read surface (Home feed, /home-operations, Manage drawer) needs its own
// humanize() call.

const rows = new Map();
const prismaMock = {
  operationalWorkItem: {
    create: async ({ data }) => {
      const row = {
        id: crypto.randomUUID(),
        state: 'CANDIDATE',
        acceptanceState: 'PROPOSED',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      rows.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = { ...rows.get(where.id), ...data, updatedAt: new Date() };
      rows.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }) => rows.get(where.id) ?? null,
    findMany: async ({ where, select }) => {
      let out = [...rows.values()].filter((row) => row.propertyId === where.propertyId);
      if (where.state && where.state.not) out = out.filter((row) => row.state !== where.state.not);
      if (select) out = out.map((row) => ({ id: row.id, title: row.title }));
      return out;
    },
  },
  operationalWorkEvent: {
    findUnique: async () => null,
    create: async ({ data }) => ({ id: crypto.randomUUID(), ...data }),
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const {
  createWorkItem,
  refreshWorkItemPresentation,
  normalizeStaleWorkItemTitles,
} = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');

function baseCreateInput(overrides = {}) {
  return {
    propertyId: 'property-1',
    workKey: `wk-${crypto.randomUUID()}`,
    subjectType: 'PROPERTY',
    subjectId: 'property-1',
    obligationType: 'MAINTENANCE_TASK',
    priority: 'SOON',
    safetyTier: 'MATERIAL_FINANCIAL',
    title: 'HIGH Risk: WATER_HEATER_TANK',
    homeownerReason: 'No active warranty is linked to this system.',
    expectedOutcome: 'Coverage decision recorded.',
    ...overrides,
  };
}

test('createWorkItem persists a homeowner-facing title, never a raw enum', async () => {
  rows.clear();
  const item = await createWorkItem(baseCreateInput());
  assert.equal(item.title, 'Review the Water Heater risk');
});

test('createWorkItem leaves an already-clean title untouched', async () => {
  rows.clear();
  const item = await createWorkItem(baseCreateInput({ title: 'Replace AC filters monthly' }));
  assert.equal(item.title, 'Replace AC filters monthly');
});

test('refreshWorkItemPresentation normalizes the title on the CANDIDATE refresh path', async () => {
  rows.clear();
  const created = await createWorkItem(baseCreateInput({ title: 'Replace AC filters monthly' }));
  const refreshed = await refreshWorkItemPresentation(created.id, {
    priority: 'SOON',
    safetyTier: 'MATERIAL_FINANCIAL',
    title: 'Safety Smoke CO Detectors',
    homeownerReason: 'Detectors are past service life.',
    expectedOutcome: 'Detectors verified.',
  });
  assert.equal(refreshed.title, 'Smoke & CO Detector Check');
});

test('normalizeStaleWorkItemTitles heals existing rows and is idempotent', async () => {
  rows.clear();
  // Simulate legacy rows written before the write-path guard existed.
  for (const [title, state] of [
    ['HIGH Risk: HVAC_FURNACE', 'ACCEPTED'],
    ['Safety Smoke CO Detectors', 'ACCEPTED'],
    ['Replace AC filters monthly', 'CANDIDATE'],
    ['HIGH Risk: WATER_HEATER_TANK', 'CLOSED'],
  ]) {
    const id = crypto.randomUUID();
    rows.set(id, { id, propertyId: 'property-1', title, state });
  }

  const healed = await normalizeStaleWorkItemTitles('property-1');
  assert.equal(healed, 2); // the two non-closed raw-enum rows

  const titles = [...rows.values()].map((row) => row.title).sort();
  assert.deepEqual(titles, [
    'HIGH Risk: WATER_HEATER_TANK', // CLOSED row left as historical record
    'Replace AC filters monthly',
    'Review the HVAC Furnace risk',
    'Smoke & CO Detector Check',
  ]);

  // Second pass is a no-op.
  assert.equal(await normalizeStaleWorkItemTitles('property-1'), 0);
});
