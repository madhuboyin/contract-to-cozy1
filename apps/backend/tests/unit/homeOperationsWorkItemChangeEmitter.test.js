const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Item #20 (Slice 8: "digest limited to changed or due work"). This exercises
// workItemChangeEmitter.ts against a fake Prisma client that implements just
// enough of propertyChange.service.ts's real upsert/supersession contract
// (operationalWorkItem.findUnique, propertyChange.findUnique/upsert/
// updateMany, propertyChangeSourceCursor.upsert/update, $transaction) to
// prove real emissions happen — plus a deliberately *minimal* mock (no
// $transaction at all) to prove the emitter is best-effort and never lets a
// PropertyChange failure escape into the caller, matching every other
// existing Home Operations test's minimal prisma mock shape.

const workItems = new Map(); // id -> {propertyId}
const propertyChanges = new Map(); // `${propertyId}:${sourceType}:${sourceEntityId}:${sourceRevision}` -> row
const sourceCursors = new Map(); // `${propertyId}:${sourceType}:${sourceEntityId}` -> row

function reset() {
  workItems.clear();
  propertyChanges.clear();
  sourceCursors.clear();
}

function seedWorkItem(id, propertyId) {
  workItems.set(id, { propertyId });
}

function fullPrismaMock() {
  const domainEvents = new Map();
  return {
    operationalWorkItem: {
      findUnique: async ({ where }) => {
        const row = workItems.get(where.id);
        return row ? { propertyId: row.propertyId } : null;
      },
      findMany: async () => [],
    },
    propertyChange: {
      findUnique: async ({ where }) => {
        const k = where.propertyId_sourceType_sourceEntityId_sourceRevision;
        return propertyChanges.get(`${k.propertyId}:${k.sourceType}:${k.sourceEntityId}:${k.sourceRevision}`) ?? null;
      },
      upsert: async ({ where, create }) => {
        const k = where.propertyId_sourceType_sourceEntityId_sourceRevision;
        const key = `${k.propertyId}:${k.sourceType}:${k.sourceEntityId}:${k.sourceRevision}`;
        const row = { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...create };
        propertyChanges.set(key, row);
        return row;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const [key, row] of propertyChanges.entries()) {
          if (row.propertyId === where.propertyId && row.sourceType === where.sourceType
            && row.sourceEntityId === where.sourceEntityId && row.id !== where.id.not && row.supersededAt == null) {
            propertyChanges.set(key, { ...row, ...data });
            count += 1;
          }
        }
        return { count };
      },
    },
    propertyChangeSourceCursor: {
      upsert: async ({ where, create }) => {
        const k = where.propertyId_sourceType_sourceEntityId;
        const key = `${k.propertyId}:${k.sourceType}:${k.sourceEntityId}`;
        const existing = sourceCursors.get(key);
        const row = existing ?? { id: crypto.randomUUID(), latestChangeId: null, ...create };
        sourceCursors.set(key, row);
        return row;
      },
      update: async ({ where, data }) => {
        for (const [key, row] of sourceCursors.entries()) {
          if (row.id === where.id) {
            const updated = { ...row, ...data };
            sourceCursors.set(key, updated);
            return updated;
          }
        }
        throw new Error('cursor not found');
      },
    },
    domainEvent: {
      findUnique: async ({ where }) => domainEvents.get(where.idempotencyKey) ?? null,
      create: async ({ data }) => {
        const row = { id: crypto.randomUUID(), ...data };
        if (data.idempotencyKey) domainEvents.set(data.idempotencyKey, row);
        return row;
      },
    },
    $transaction: async (fn) => fn(fullPrismaMockInstance),
  };
}

// $transaction needs to hand the callback the *same* mock instance (acting
// as its own "tx"), so build it once and self-reference.
let fullPrismaMockInstance = fullPrismaMock();

function installPrisma(mock) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: mock } };
}

function reloadEmitter() {
  const emitterPath = require.resolve('../../src/modules/homeOperations/infrastructure/workItemChangeEmitter.ts');
  const propertyChangeServicePath = require.resolve('../../src/propertyChanges/propertyChange.service.ts');
  delete require.cache[emitterPath];
  delete require.cache[propertyChangeServicePath];
  return require('../../src/modules/homeOperations/infrastructure/workItemChangeEmitter.ts');
}

// ── Material-event lookup table (no prisma mock needed) ────────────────────

test('emitWorkItemLifecycleChange no-ops for a non-material event type without touching prisma', async () => {
  reset();
  installPrisma({}); // no methods at all — a call here would throw synchronously.
  const { emitWorkItemLifecycleChange } = reloadEmitter();

  await assert.doesNotReject(() => emitWorkItemLifecycleChange(
    { id: 'wi-1', propertyId: 'property-1', priority: 'SOON', safetyTier: 'LOW_CONSEQUENCE' },
    { id: 'ev-1', eventType: 'WORK_SNOOZED', occurredAt: new Date() },
  ));
});

test('emitWorkItemLifecycleChange is best-effort: a prisma failure never throws into the caller', async () => {
  reset();
  installPrisma({}); // missing $transaction entirely -> emitPropertyChange throws synchronously inside.
  const { emitWorkItemLifecycleChange } = reloadEmitter();

  await assert.doesNotReject(() => emitWorkItemLifecycleChange(
    { id: 'wi-1', propertyId: 'property-1', priority: 'NOW', safetyTier: 'SAFETY_EMERGENCY' },
    { id: 'ev-1', eventType: 'WORK_ACCEPTED', occurredAt: new Date() },
  ));
});

// ── Real emission, end to end ───────────────────────────────────────────────

test('emitWorkItemLifecycleChange creates a canonicalActionId-linked PropertyChange for a material event', async () => {
  reset();
  fullPrismaMockInstance = fullPrismaMock();
  installPrisma(fullPrismaMockInstance);
  const { emitWorkItemLifecycleChange } = reloadEmitter();
  seedWorkItem('wi-1', 'property-1');

  const occurredAt = new Date('2026-08-01T00:00:00.000Z');
  await emitWorkItemLifecycleChange(
    { id: 'wi-1', propertyId: 'property-1', priority: 'SOON', safetyTier: 'LOW_CONSEQUENCE' },
    { id: 'ev-1', eventType: 'WORK_ACCEPTED', occurredAt },
  );

  assert.equal(propertyChanges.size, 1);
  const [change] = [...propertyChanges.values()];
  assert.equal(change.sourceType, 'OPERATIONAL_WORK_EVENT');
  assert.equal(change.sourceEntityId, 'wi-1');
  assert.equal(change.canonicalActionId, 'wi-1');
  assert.equal(change.changeType, 'ACTION_STATE_CHANGED');
});

test('emitWorkItemLifecycleChange marks urgentSafetyCondition for a SAFETY_EMERGENCY work item', async () => {
  reset();
  fullPrismaMockInstance = fullPrismaMock();
  installPrisma(fullPrismaMockInstance);
  const { emitWorkItemLifecycleChange } = reloadEmitter();
  seedWorkItem('wi-1', 'property-1');

  await emitWorkItemLifecycleChange(
    { id: 'wi-1', propertyId: 'property-1', priority: 'NOW', safetyTier: 'SAFETY_EMERGENCY' },
    { id: 'ev-1', eventType: 'EXECUTION_BLOCKED', occurredAt: new Date() },
  );

  const [change] = [...propertyChanges.values()];
  assert.equal(change.materiality, 'URGENT');
});

test('OUTCOME_VERIFIED emits OUTCOME_CONFIRMED with propertyEffectConfirmed', async () => {
  reset();
  fullPrismaMockInstance = fullPrismaMock();
  installPrisma(fullPrismaMockInstance);
  const { emitWorkItemLifecycleChange } = reloadEmitter();
  seedWorkItem('wi-1', 'property-1');

  await emitWorkItemLifecycleChange(
    { id: 'wi-1', propertyId: 'property-1', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE' },
    { id: 'ev-1', eventType: 'OUTCOME_VERIFIED', occurredAt: new Date() },
  );

  const [change] = [...propertyChanges.values()];
  assert.equal(change.changeType, 'OUTCOME_CONFIRMED');
  assert.equal(change.materiality, 'IMPORTANT');
});

test('a second lifecycle event for the same work item supersedes the first (one digest entry per item)', async () => {
  reset();
  fullPrismaMockInstance = fullPrismaMock();
  installPrisma(fullPrismaMockInstance);
  const { emitWorkItemLifecycleChange } = reloadEmitter();
  seedWorkItem('wi-1', 'property-1');

  await emitWorkItemLifecycleChange(
    { id: 'wi-1', propertyId: 'property-1', priority: 'SOON', safetyTier: 'LOW_CONSEQUENCE' },
    { id: 'ev-1', eventType: 'WORK_ACCEPTED', occurredAt: new Date('2026-08-01T00:00:00.000Z') },
  );
  await emitWorkItemLifecycleChange(
    { id: 'wi-1', propertyId: 'property-1', priority: 'SOON', safetyTier: 'LOW_CONSEQUENCE' },
    { id: 'ev-2', eventType: 'WORK_SCHEDULED', occurredAt: new Date('2026-08-02T00:00:00.000Z') },
  );

  assert.equal(propertyChanges.size, 2, 'both rows persist for history, but only one should stay eligible');
  const eligible = [...propertyChanges.values()].filter((c) => c.supersededAt == null);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].sourceRevision, 'ev-2', 'the latest event must be the one left eligible');
});

// ── Due-soon batch (emitDueSoonWorkItemChanges) ────────────────────────────

test('emitDueSoonWorkItemChanges skips a work item outside its own reminder-policy horizon', async () => {
  reset();
  fullPrismaMockInstance = fullPrismaMock();
  const now = new Date('2026-08-01T00:00:00.000Z');
  fullPrismaMockInstance.operationalWorkItem.findMany = async () => ([
    // default policy horizon is 7 days from `now` (2026-08-01), i.e. up to
    // 2026-08-08; 9 days out must be excluded by the in-memory per-row
    // refinement even though the mock hands back both rows regardless of
    // the conservative SQL bound (the mock doesn't implement real date
    // filtering, matching the test comment on the SAFETY_EMERGENCY case
    // below).
    { id: 'wi-far', propertyId: 'property-1', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', obligationType: 'MAINTENANCE_TASK', dueAt: new Date('2026-08-10T00:00:00.000Z') },
    { id: 'wi-near', propertyId: 'property-1', priority: 'SOON', safetyTier: 'LOW_CONSEQUENCE', obligationType: 'MAINTENANCE_TASK', dueAt: new Date('2026-08-02T00:00:00.000Z') },
  ]);
  installPrisma(fullPrismaMockInstance);
  seedWorkItem('wi-far', 'property-1');
  seedWorkItem('wi-near', 'property-1');
  const { emitDueSoonWorkItemChanges } = reloadEmitter();

  const result = await emitDueSoonWorkItemChanges(now);

  assert.equal(result.examined, 2);
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 1);
  const [change] = [...propertyChanges.values()];
  assert.equal(change.sourceEntityId, 'wi-near');
  assert.equal(change.sourceType, 'OPERATIONAL_WORK_DUE');
});

test('emitDueSoonWorkItemChanges uses a tighter horizon for a SAFETY_EMERGENCY item', async () => {
  reset();
  fullPrismaMockInstance = fullPrismaMock();
  const now = new Date('2026-08-01T00:00:00.000Z');
  fullPrismaMockInstance.operationalWorkItem.findMany = async () => ([
    // SAFETY_EMERGENCY horizon is 2 days — 5 days out must be excluded even
    // though a routine item at the same distance would be included.
    { id: 'wi-emergency', propertyId: 'property-1', priority: 'NOW', safetyTier: 'SAFETY_EMERGENCY', obligationType: 'MAINTENANCE_TASK', dueAt: new Date('2026-08-06T00:00:00.000Z') },
  ]);
  installPrisma(fullPrismaMockInstance);
  seedWorkItem('wi-emergency', 'property-1');
  const { emitDueSoonWorkItemChanges } = reloadEmitter();

  const result = await emitDueSoonWorkItemChanges(now);

  assert.equal(result.created, 0);
  assert.equal(result.skipped, 1);
});

test('emitDueSoonWorkItemChanges is idempotent: re-running against an unchanged dueAt only skips', async () => {
  reset();
  fullPrismaMockInstance = fullPrismaMock();
  const now = new Date('2026-08-01T00:00:00.000Z');
  fullPrismaMockInstance.operationalWorkItem.findMany = async () => ([
    { id: 'wi-1', propertyId: 'property-1', priority: 'SOON', safetyTier: 'LOW_CONSEQUENCE', obligationType: 'MAINTENANCE_TASK', dueAt: new Date('2026-08-02T00:00:00.000Z') },
  ]);
  installPrisma(fullPrismaMockInstance);
  seedWorkItem('wi-1', 'property-1');
  const { emitDueSoonWorkItemChanges } = reloadEmitter();

  const first = await emitDueSoonWorkItemChanges(now);
  const second = await emitDueSoonWorkItemChanges(now);

  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal(second.skipped, 1);
  assert.equal(propertyChanges.size, 1, 're-running must not create a second row for the same dueAt');
});
