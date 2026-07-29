const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Slice 1: resolveAndUpsertWorkItem is the identity resolver. This exercises
// it against an in-memory fake Prisma client that enforces the same unique
// constraints as schema.prisma (propertyId+workKey on OperationalWorkItem,
// workItemId+sourceType+sourceEntityId+sourceRole on OperationalWorkSource,
// workItemId+idempotencyKey on OperationalWorkEvent) so a bug that would
// violate those constraints in production surfaces here too.

const workItems = new Map();
const workSources = new Map(); // key: `${workItemId}:${sourceType}:${sourceEntityId}:${sourceRole}`
const workEvents = new Map(); // key: `${workItemId}:${idempotencyKey}`

function reset() {
  workItems.clear();
  workSources.clear();
  workEvents.clear();
}

const prismaMock = {
  operationalWorkItem: {
    findUnique: async ({ where }) => {
      if (where.propertyId_workKey) {
        const { propertyId, workKey } = where.propertyId_workKey;
        return [...workItems.values()].find((w) => w.propertyId === propertyId && w.workKey === workKey) ?? null;
      }
      return workItems.get(where.id) ?? null;
    },
    create: async ({ data }) => {
      const existing = [...workItems.values()].find((w) => w.propertyId === data.propertyId && w.workKey === data.workKey);
      if (existing) {
        const err = new Error('Unique constraint failed on propertyId_workKey');
        err.code = 'P2002';
        throw err;
      }
      // Mirror schema.prisma's column defaults, since this in-memory fake
      // has no DB layer to apply them.
      const row = {
        id: crypto.randomUUID(),
        state: 'CANDIDATE',
        acceptanceState: 'PROPOSED',
        disposition: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      workItems.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = workItems.get(where.id);
      const updated = { ...row, ...data, updatedAt: new Date() };
      workItems.set(where.id, updated);
      return updated;
    },
  },
  operationalWorkSource: {
    upsert: async ({ where, create, update }) => {
      const { workItemId, sourceType, sourceEntityId, sourceRole } = where.workItemId_sourceType_sourceEntityId_sourceRole;
      const key = `${workItemId}:${sourceType}:${sourceEntityId}:${sourceRole}`;
      const existing = workSources.get(key);
      const row = existing ? { ...existing, ...update, updatedAt: new Date() } : { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...create };
      workSources.set(key, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => {
      const key = `${data.workItemId}:${data.idempotencyKey}`;
      if (workEvents.has(key)) {
        const err = new Error('Unique constraint failed on workItemId_idempotencyKey');
        err.code = 'P2002';
        throw err;
      }
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
      workEvents.set(key, row);
      return row;
    },
    findUnique: async ({ where }) => {
      const { workItemId, idempotencyKey } = where.workItemId_idempotencyKey;
      return workEvents.get(`${workItemId}:${idempotencyKey}`) ?? null;
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { resolveAndUpsertWorkItem } = require('../../src/modules/homeOperations/application/resolveWorkItem.usecase.ts');

function proposal(overrides = {}) {
  return {
    propertyId: 'property-1',
    subject: { type: 'INVENTORY_ITEM', id: 'hvac-1' },
    obligationType: 'MAINTENANCE_TASK',
    occurrence: { obligationSlug: 'filter-replacement', occurrenceKey: '2026-08' },
    title: 'Replace HVAC filter',
    homeownerReason: 'Filter is overdue.',
    expectedOutcome: 'Filter replaced.',
    priority: 'SOON',
    safetyTier: 'LOW_CONSEQUENCE',
    confidence: 0.8,
    missingContext: [],
    source: { sourceType: 'MAINTENANCE', sourceEntityId: 'task-1', sourceVersion: 'v1', sourceRole: 'TRIGGER' },
    ...overrides,
  };
}

test('the first resolve creates exactly one work item and one source row', async () => {
  reset();
  const item = await resolveAndUpsertWorkItem(proposal());
  assert.equal(workItems.size, 1);
  assert.equal(workSources.size, 1);
  assert.equal(item.state, 'CANDIDATE');
  assert.equal(item.acceptanceState, 'PROPOSED');
  assert.ok(workEvents.has(`${item.id}:created:${item.workKey}`));
});

test('re-resolving the same obligation with different copy/version updates the same rows, not new ones', async () => {
  reset();
  const first = await resolveAndUpsertWorkItem(proposal());
  const second = await resolveAndUpsertWorkItem(proposal({
    title: 'Replace the HVAC air filter',
    homeownerReason: 'Updated copy.',
    source: { sourceType: 'MAINTENANCE', sourceEntityId: 'task-1', sourceVersion: 'v2', sourceRole: 'TRIGGER' },
  }));

  assert.equal(workItems.size, 1);
  assert.equal(workSources.size, 1);
  assert.equal(second.id, first.id);
  assert.equal(second.title, 'Replace the HVAC air filter');
  assert.equal(second.sourceVersion, 'v2');
});

test('once accepted, further resolves stop rewriting presentation fields', async () => {
  reset();
  const created = await resolveAndUpsertWorkItem(proposal());
  // Simulate acceptance directly on the store (transitionWorkItem is tested separately).
  workItems.set(created.id, { ...created, state: 'ACCEPTED', acceptanceState: 'ACCEPTED' });

  const resolved = await resolveAndUpsertWorkItem(proposal({
    title: 'A completely different title',
    source: { sourceType: 'MAINTENANCE', sourceEntityId: 'task-1', sourceVersion: 'v3', sourceRole: 'TRIGGER' },
  }));

  assert.equal(resolved.id, created.id);
  assert.equal(resolved.title, 'Replace HVAC filter', 'title must not be silently rewritten once accepted');
  assert.equal(resolved.state, 'ACCEPTED');
  // The source link itself still reconciles to the new version even though
  // the item's presentation copy does not.
  const sourceRow = [...workSources.values()].find((s) => s.sourceEntityId === 'task-1');
  assert.equal(sourceRow.sourceVersion, 'v3');
});

test('different property, subject, or obligation never merge into one work item', async () => {
  reset();
  await resolveAndUpsertWorkItem(proposal());
  await resolveAndUpsertWorkItem(proposal({ propertyId: 'property-2' }));
  await resolveAndUpsertWorkItem(proposal({ subject: { type: 'INVENTORY_ITEM', id: 'hvac-2' } }));
  await resolveAndUpsertWorkItem(proposal({ obligationType: 'DECISION', occurrence: { obligationSlug: 'replacement-decision' } }));

  assert.equal(workItems.size, 4);
});
