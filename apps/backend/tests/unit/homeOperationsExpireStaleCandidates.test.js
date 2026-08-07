const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Bug fix: a forecast-anchored environment insight (e.g. "Heavy rain
// expected Monday, Aug 3") promotes into a durable CANDIDATE
// OperationalWorkItem, but once the insight stops being regenerated (its
// date rolls out of the live forecast window) nothing ever revisits that
// work item again — it sits stuck in Home Operations' Today tab forever.
// expireStaleWorkItemCandidates sweeps and closes exactly that class of
// item (CANDIDATE, MAINTENANCE_TASK, no execution-backed source, due date
// past the grace period) while leaving real homeowner-tracked work alone.

const workItems = new Map();
const workSources = new Map(); // key: `${workItemId}:${sourceType}:${sourceEntityId}:${sourceRole}`
const workEvents = new Map(); // key: `${workItemId}:${idempotencyKey}`

function reset() {
  workItems.clear();
  workSources.clear();
  workEvents.clear();
}

function seedWorkItem(overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const row = {
    id,
    propertyId: 'property-1',
    obligationType: 'MAINTENANCE_TASK',
    state: 'CANDIDATE',
    acceptanceState: 'PROPOSED',
    disposition: null,
    dueAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    id,
  };
  workItems.set(id, row);
  return row;
}

function seedSource(workItemId, overrides = {}) {
  const row = {
    id: crypto.randomUUID(),
    workItemId,
    sourceType: 'MAINTENANCE',
    sourceEntityId: 'heavy-rain-2026-08-03',
    sourceRole: 'TRIGGER',
    active: true,
    lastObservedAt: new Date(),
    ...overrides,
  };
  workSources.set(`${row.workItemId}:${row.sourceType}:${row.sourceEntityId}:${row.sourceRole}`, row);
  return row;
}

// Mirrors the subset of Prisma's filter semantics expireStaleWorkItemCandidates
// actually issues: propertyId/state/obligationType equality, dueAt `lt`, and
// a `sources: { none: { sourceRole, active } } }` relation filter.
function matchesWhere(item, where) {
  if (where.propertyId && item.propertyId !== where.propertyId) return false;
  if (where.state && item.state !== where.state) return false;
  if (where.obligationType && item.obligationType !== where.obligationType) return false;
  if (where.dueAt?.lt) {
    if (!item.dueAt || !(item.dueAt < where.dueAt.lt)) return false;
  }
  if (where.sources?.none) {
    const { sourceRole, active } = where.sources.none;
    const hasExcludedSource = [...workSources.values()].some(
      (s) => s.workItemId === item.id && s.sourceRole === sourceRole && s.active === active,
    );
    if (hasExcludedSource) return false;
  }
  return true;
}

const prismaMock = {
  operationalWorkItem: {
    findMany: async ({ where }) => [...workItems.values()].filter((item) => matchesWhere(item, where)),
    findUnique: async ({ where }) => workItems.get(where.id) ?? null,
    update: async ({ where, data }) => {
      const row = { ...workItems.get(where.id), ...data, updatedAt: new Date() };
      workItems.set(where.id, row);
      return row;
    },
  },
  operationalWorkSource: {
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [key, source] of workSources.entries()) {
        if (source.workItemId === where.workItemId && (where.active === undefined || source.active === where.active)) {
          workSources.set(key, { ...source, ...data });
          count += 1;
        }
      }
      return { count };
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => {
      const key = `${data.workItemId}:${data.idempotencyKey}`;
      if (workEvents.has(key)) { const err = new Error('dup event'); err.code = 'P2002'; throw err; }
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
      workEvents.set(key, row);
      return row;
    },
    findUnique: async ({ where }) => {
      const k = where.workItemId_idempotencyKey;
      return workEvents.get(`${k.workItemId}:${k.idempotencyKey}`) ?? null;
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { expireStaleWorkItemCandidates } = require('../../src/modules/homeOperations/application/expireStaleWorkItemCandidates.usecase.ts');

const FAR_PAST = new Date('2020-01-01T00:00:00.000Z');
const RECENT_PAST = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago — inside the grace period

test('closes a CANDIDATE MAINTENANCE_TASK candidate whose only source is a stale TRIGGER', async () => {
  reset();
  const item = seedWorkItem({ dueAt: FAR_PAST });
  seedSource(item.id, { sourceRole: 'TRIGGER', active: true });

  const result = await expireStaleWorkItemCandidates();

  assert.equal(result.examined, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.failed, 0);
  const updated = workItems.get(item.id);
  assert.equal(updated.state, 'CLOSED');
  assert.equal(updated.disposition, 'EXPIRED');
});

test('leaves a candidate alone whose due date is still within the grace period', async () => {
  reset();
  const item = seedWorkItem({ dueAt: RECENT_PAST });
  seedSource(item.id, { sourceRole: 'TRIGGER', active: true });

  const result = await expireStaleWorkItemCandidates();

  assert.equal(result.examined, 0);
  assert.equal(workItems.get(item.id).state, 'CANDIDATE');
});

test('never touches a real, execution-backed maintenance task even if overdue', async () => {
  reset();
  const item = seedWorkItem({ dueAt: FAR_PAST });
  seedSource(item.id, { sourceRole: 'EXECUTION', sourceEntityId: 'task-1', active: true });

  const result = await expireStaleWorkItemCandidates();

  assert.equal(result.examined, 0);
  assert.equal(workItems.get(item.id).state, 'CANDIDATE');
});

test('never touches an accepted work item', async () => {
  reset();
  const item = seedWorkItem({ dueAt: FAR_PAST, state: 'ACCEPTED', acceptanceState: 'ACCEPTED' });
  seedSource(item.id, { sourceRole: 'TRIGGER', active: true });

  const result = await expireStaleWorkItemCandidates();

  assert.equal(result.examined, 0);
  assert.equal(workItems.get(item.id).state, 'ACCEPTED');
});

test('ignores work items outside the MAINTENANCE_TASK obligation type', async () => {
  reset();
  const item = seedWorkItem({ dueAt: FAR_PAST, obligationType: 'COVERAGE_ACTION' });
  seedSource(item.id, { sourceRole: 'TRIGGER', active: true });

  const result = await expireStaleWorkItemCandidates();

  assert.equal(result.examined, 0);
  assert.equal(workItems.get(item.id).state, 'CANDIDATE');
});

test('dry run reports what would be closed without mutating anything', async () => {
  reset();
  const item = seedWorkItem({ dueAt: FAR_PAST });
  seedSource(item.id, { sourceRole: 'TRIGGER', active: true });

  const result = await expireStaleWorkItemCandidates({ dryRun: true });

  assert.equal(result.examined, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 1);
  assert.equal(workItems.get(item.id).state, 'CANDIDATE');
});

test('scopes to a single property when propertyId is given', async () => {
  reset();
  const a = seedWorkItem({ dueAt: FAR_PAST, propertyId: 'property-1' });
  seedSource(a.id, { sourceRole: 'TRIGGER', active: true });
  const b = seedWorkItem({ dueAt: FAR_PAST, propertyId: 'property-2' });
  seedSource(b.id, { sourceRole: 'TRIGGER', active: true });

  const result = await expireStaleWorkItemCandidates({ propertyId: 'property-1' });

  assert.equal(result.examined, 1);
  assert.equal(workItems.get(a.id).state, 'CLOSED');
  assert.equal(workItems.get(b.id).state, 'CANDIDATE');
});
