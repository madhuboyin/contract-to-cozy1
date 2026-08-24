const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// bookingWorkReconciliation.service.ts's functions all take `tx` as an
// explicit first parameter (never default to the global prisma import), so
// this is pure dependency injection against an in-memory fake — no
// require.cache override of lib/prisma.ts needed, unlike
// resolveWorkItem.usecase.ts's tests.

function makeFakeTx() {
  const workItems = new Map();
  const workSources = new Map(); // key: `${workItemId}:${sourceType}:${sourceEntityId}:${sourceRole}`
  const workEvents = new Map(); // key: `${workItemId}:${idempotencyKey}`
  const workExecutions = new Map(); // key: `${workItemId}:${executionType}:${executionEntityId}`
  const guidanceJourneys = new Map();
  const priceFinalizations = new Map();
  const bookings = new Map();

  const tx = {
    __store: { workItems, workSources, workEvents, workExecutions, guidanceJourneys, priceFinalizations, bookings },
    $queryRaw: async () => [],
    operationalWorkItem: {
      findUnique: async ({ where }) => {
        if (where.propertyId_workKey) {
          const { propertyId, workKey } = where.propertyId_workKey;
          return [...workItems.values()].find((w) => w.propertyId === propertyId && w.workKey === workKey) ?? null;
        }
        return workItems.get(where.id) ?? null;
      },
      findMany: async ({ where }) => {
        return [...workItems.values()].filter((w) => {
          if (where.propertyId && w.propertyId !== where.propertyId) return false;
          if (where.workKey && w.workKey !== where.workKey) return false;
          if (where.state?.not && w.state === where.state.not) return false;
          return true;
        });
      },
      create: async ({ data }) => {
        const existing = [...workItems.values()].find((w) => w.propertyId === data.propertyId && w.workKey === data.workKey);
        if (existing) {
          const err = new Error('Unique constraint failed on propertyId_workKey');
          err.code = 'P2002';
          throw err;
        }
        const row = {
          id: crypto.randomUUID(),
          state: 'CANDIDATE',
          acceptanceState: 'PROPOSED',
          disposition: null,
          scheduleOverrideAt: null,
          subjectType: data.subjectType,
          subjectId: data.subjectId,
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
      findUnique: async ({ where }) => {
        const { workItemId, sourceType, sourceEntityId, sourceRole } = where.workItemId_sourceType_sourceEntityId_sourceRole;
        return workSources.get(`${workItemId}:${sourceType}:${sourceEntityId}:${sourceRole}`) ?? null;
      },
      findFirst: async ({ where, include }) => {
        const match = [...workSources.values()].find((s) => {
          if (where.sourceType?.not !== undefined) {
            if (s.sourceType === where.sourceType.not) return false;
          } else if (where.sourceType !== undefined && where.sourceType !== s.sourceType) {
            return false;
          }
          if (where.sourceEntityId && where.sourceEntityId !== s.sourceEntityId) return false;
          if (where.active !== undefined && where.active !== s.active) return false;
          if (where.workItemId && where.workItemId !== s.workItemId) return false;
          return true;
        });
        if (!match) return null;
        if (include?.workItem) return { ...match, workItem: workItems.get(match.workItemId) ?? null };
        return match;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const [key, row] of workSources.entries()) {
          if (row.workItemId === where.workItemId && (where.active === undefined || row.active === where.active)) {
            workSources.set(key, { ...row, ...data });
            count++;
          }
        }
        return { count };
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
    operationalWorkExecution: {
      upsert: async ({ where, create, update }) => {
        const { workItemId, executionType, executionEntityId } = where.workItemId_executionType_executionEntityId;
        const key = `${workItemId}:${executionType}:${executionEntityId}`;
        const existing = workExecutions.get(key);
        const row = existing ? { ...existing, ...update, updatedAt: new Date() } : { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...create };
        workExecutions.set(key, row);
        return row;
      },
      findMany: async ({ where, include }) => {
        const matches = [...workExecutions.values()].filter((e) => {
          if (where.executionType && e.executionType !== where.executionType) return false;
          if (where.executionEntityId && e.executionEntityId !== where.executionEntityId) return false;
          if (where.workItemId && e.workItemId !== where.workItemId) return false;
          return true;
        });
        if (include?.workItem) return matches.map((e) => ({ ...e, workItem: workItems.get(e.workItemId) ?? null }));
        return matches;
      },
    },
    guidanceJourney: {
      findUnique: async ({ where }) => guidanceJourneys.get(where.id) ?? null,
    },
    priceFinalization: {
      findUnique: async ({ where }) => priceFinalizations.get(where.id) ?? null,
    },
    booking: {
      findMany: async ({ where }) => {
        return [...bookings.values()].filter((b) => {
          if (where.id?.in && !where.id.in.includes(b.id)) return false;
          if (where.status?.not && b.status === where.status.not) return false;
          return true;
        });
      },
    },
  };

  return tx;
}

const {
  resolveOriginatingWorkItem,
  reconcileBookingCreated,
  reconcileBookingCancelled,
  reconcileBookingLifecycle,
} = require('../../src/services/bookingWorkReconciliation.service.ts');

function booking(overrides = {}) {
  return {
    id: 'booking-1',
    propertyId: 'property-1',
    inventoryItemId: null,
    updatedAt: new Date('2026-08-23T12:00:00.000Z'),
    ...overrides,
  };
}

function collectEvents() {
  const events = [];
  const onLifecycleEvent = (workItem, event) => { events.push({ workItem, event }); };
  return { events, onLifecycleEvent };
}

// --- resolveOriginatingWorkItem ---

test('resolveOriginatingWorkItem: no hints resolves to STANDALONE', async () => {
  const tx = makeFakeTx();
  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1' });
  assert.equal(resolution.method, 'STANDALONE');
  assert.equal(resolution.workItem, null);
});

test('resolveOriginatingWorkItem: a valid, unbooked originWorkItemId is reused', async () => {
  const tx = makeFakeTx();
  const item = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey: 'k1', subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE' },
  });
  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1', originWorkItemId: item.id });
  assert.equal(resolution.method, 'EXPLICIT_LINEAGE');
  assert.equal(resolution.workItem.id, item.id);
});

test('resolveOriginatingWorkItem: an originWorkItemId for a different property falls through to STANDALONE', async () => {
  const tx = makeFakeTx();
  const item = await tx.operationalWorkItem.create({
    data: { propertyId: 'other-property', workKey: 'k1', subjectType: 'PROPERTY', subjectId: 'other-property', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE' },
  });
  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1', originWorkItemId: item.id });
  assert.equal(resolution.method, 'STANDALONE');
});

test('resolveOriginatingWorkItem: an originWorkItemId already linked to another ACTIVE booking falls through', async () => {
  const tx = makeFakeTx();
  const item = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey: 'k1', subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE' },
  });
  tx.__store.bookings.set('other-booking', { id: 'other-booking', status: 'CONFIRMED' });
  await tx.operationalWorkExecution.upsert({
    where: { workItemId_executionType_executionEntityId: { workItemId: item.id, executionType: 'BOOKING', executionEntityId: 'other-booking' } },
    create: { workItemId: item.id, executionType: 'BOOKING', executionEntityId: 'other-booking', role: 'PRIMARY', responsibleParty: 'UNKNOWN' },
    update: {},
  });
  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1', originWorkItemId: item.id });
  assert.equal(resolution.method, 'STANDALONE');
});

// Finding: explicit lineage previously rejected reuse for ANY existing
// execution row, even one belonging to a CANCELLED booking (retained only
// as history). A replacement booking for the same obligation must be able
// to reuse the work item.
test('resolveOriginatingWorkItem: an originWorkItemId whose only linked booking is CANCELLED is reusable (replacement booking)', async () => {
  const tx = makeFakeTx();
  const item = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey: 'k1', subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE' },
  });
  tx.__store.bookings.set('cancelled-booking', { id: 'cancelled-booking', status: 'CANCELLED' });
  await tx.operationalWorkExecution.upsert({
    where: { workItemId_executionType_executionEntityId: { workItemId: item.id, executionType: 'BOOKING', executionEntityId: 'cancelled-booking' } },
    create: { workItemId: item.id, executionType: 'BOOKING', executionEntityId: 'cancelled-booking', role: 'PRIMARY', responsibleParty: 'UNKNOWN' },
    update: {},
  });
  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1', originWorkItemId: item.id });
  assert.equal(resolution.method, 'EXPLICIT_LINEAGE');
  assert.equal(resolution.workItem.id, item.id);
});

test('resolveOriginatingWorkItem: a matching guidanceJourneyId resolves via GUIDANCE_JOURNEY', async () => {
  const tx = makeFakeTx();
  tx.__store.guidanceJourneys.set('journey-1', { id: 'journey-1', propertyId: 'property-1', journeyTypeKey: 'asset_lifecycle_resolution', inventoryItemId: null, status: 'ACTIVE' });
  const { resolveGuidanceJourneyWorkKey } = require('../../src/modules/homeOperations/adapters/homeActionWorkItem.adapter.ts');
  const workKey = resolveGuidanceJourneyWorkKey({ propertyId: 'property-1', journeyId: 'journey-1', journeyTypeKey: 'asset_lifecycle_resolution', inventoryItemId: null });
  const item = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey, subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE' },
  });

  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1', guidanceJourneyId: 'journey-1' });
  assert.equal(resolution.method, 'GUIDANCE_JOURNEY');
  assert.equal(resolution.workItem.id, item.id);
});

// Finding: guidance-derived resolution previously applied no
// active-booking check at all, unlike explicit lineage — risking silently
// double-linking a work item that already has an active booking.
test('resolveOriginatingWorkItem: a matching guidanceJourneyId with an already-ACTIVE booking execution does not reuse the work item', async () => {
  const tx = makeFakeTx();
  tx.__store.guidanceJourneys.set('journey-1', { id: 'journey-1', propertyId: 'property-1', journeyTypeKey: 'asset_lifecycle_resolution', inventoryItemId: null, status: 'ACTIVE' });
  const { resolveGuidanceJourneyWorkKey } = require('../../src/modules/homeOperations/adapters/homeActionWorkItem.adapter.ts');
  const workKey = resolveGuidanceJourneyWorkKey({ propertyId: 'property-1', journeyId: 'journey-1', journeyTypeKey: 'asset_lifecycle_resolution', inventoryItemId: null });
  const item = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey, subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE' },
  });
  tx.__store.bookings.set('other-booking', { id: 'other-booking', status: 'CONFIRMED' });
  await tx.operationalWorkExecution.upsert({
    where: { workItemId_executionType_executionEntityId: { workItemId: item.id, executionType: 'BOOKING', executionEntityId: 'other-booking' } },
    create: { workItemId: item.id, executionType: 'BOOKING', executionEntityId: 'other-booking', role: 'PRIMARY', responsibleParty: 'UNKNOWN' },
    update: {},
  });

  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1', guidanceJourneyId: 'journey-1' });
  assert.equal(resolution.method, 'STANDALONE');
});

test('resolveOriginatingWorkItem: a maintenancePredictionId never matches anything today (no producer sets that sourceEntityId)', async () => {
  const tx = makeFakeTx();
  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1', maintenancePredictionId: 'prediction-1' });
  assert.equal(resolution.method, 'STANDALONE');
});

test('resolveOriginatingWorkItem: a priceFinalizationId follows its own guidanceJourneyId', async () => {
  const tx = makeFakeTx();
  tx.__store.priceFinalizations.set('finalization-1', { id: 'finalization-1', propertyId: 'property-1', guidanceJourneyId: 'journey-1' });
  tx.__store.guidanceJourneys.set('journey-1', { id: 'journey-1', propertyId: 'property-1', journeyTypeKey: 'asset_lifecycle_resolution', inventoryItemId: null, status: 'ACTIVE' });
  const { resolveGuidanceJourneyWorkKey } = require('../../src/modules/homeOperations/adapters/homeActionWorkItem.adapter.ts');
  const workKey = resolveGuidanceJourneyWorkKey({ propertyId: 'property-1', journeyId: 'journey-1', journeyTypeKey: 'asset_lifecycle_resolution', inventoryItemId: null });
  const item = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey, subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE' },
  });

  const resolution = await resolveOriginatingWorkItem(tx, { propertyId: 'property-1', priceFinalizationId: 'finalization-1' });
  assert.equal(resolution.method, 'GUIDANCE_JOURNEY');
  assert.equal(resolution.workItem.id, item.id);
});

// --- reconcileBookingCreated ---

test('reconcileBookingCreated: standalone case creates an ACCEPTED SERVICE_EXECUTION item with a BOOKING source and links execution', async () => {
  const tx = makeFakeTx();
  const { onLifecycleEvent } = collectEvents();
  const item = await reconcileBookingCreated(tx, booking(), { workItem: null, method: 'STANDALONE' }, onLifecycleEvent);

  assert.equal(item.obligationType, 'SERVICE_EXECUTION');
  assert.equal(item.state, 'ACCEPTED');
  assert.equal(item.subjectType, 'PROPERTY');
  const source = [...tx.__store.workSources.values()].find((s) => s.workItemId === item.id);
  assert.equal(source.sourceType, 'BOOKING');
  assert.equal(source.sourceEntityId, 'booking-1');
  const execution = [...tx.__store.workExecutions.values()].find((e) => e.workItemId === item.id);
  assert.ok(execution, 'expected a BOOKING execution link');
  const linkedEvent = [...tx.__store.workEvents.values()].find((e) => e.eventType === 'EXECUTION_LINKED' && e.workItemId === item.id);
  assert.ok(linkedEvent, 'expected an EXECUTION_LINKED audit event');
  assert.equal(linkedEvent.payload.originResolution, 'STANDALONE');
  assert.equal(linkedEvent.payload.standaloneCreated, true);
});

test('reconcileBookingCreated: standalone with an inventoryItemId uses it as the subject', async () => {
  const tx = makeFakeTx();
  const { onLifecycleEvent } = collectEvents();
  const item = await reconcileBookingCreated(tx, booking({ inventoryItemId: 'item-1' }), { workItem: null, method: 'STANDALONE' }, onLifecycleEvent);
  assert.equal(item.subjectType, 'INVENTORY_ITEM');
  assert.equal(item.subjectId, 'item-1');
});

test('reconcileBookingCreated: reuse case transitions a CANDIDATE item to ACCEPTED and links execution', async () => {
  const tx = makeFakeTx();
  const candidate = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey: 'k1', subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE', acceptanceState: 'PROPOSED' },
  });
  const { onLifecycleEvent } = collectEvents();
  const item = await reconcileBookingCreated(tx, booking(), { workItem: candidate, method: 'GUIDANCE_JOURNEY', matchedSourceType: 'GUIDANCE', matchedSourceEntityId: 'journey-1' }, onLifecycleEvent);

  assert.equal(item.id, candidate.id);
  assert.equal(item.state, 'ACCEPTED');
  const execution = [...tx.__store.workExecutions.values()].find((e) => e.workItemId === item.id);
  assert.ok(execution);
});

test('reconcileBookingCreated: reuse case does not re-transition an already-ACCEPTED item', async () => {
  const tx = makeFakeTx();
  const accepted = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey: 'k1', subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'ACCEPTED', acceptanceState: 'ACCEPTED' },
  });
  const { onLifecycleEvent } = collectEvents();
  const item = await reconcileBookingCreated(tx, booking(), { workItem: accepted, method: 'GUIDANCE_JOURNEY' }, onLifecycleEvent);
  assert.equal(item.state, 'ACCEPTED');
  // No WORK_ACCEPTED event should have been recorded (only EXECUTION_LINKED).
  const acceptedEvents = [...tx.__store.workEvents.values()].filter((e) => e.eventType === 'WORK_ACCEPTED');
  assert.equal(acceptedEvents.length, 0);
});

test('reconcileBookingCreated: linking a booking already linked to a different work item throws', async () => {
  const tx = makeFakeTx();
  const { onLifecycleEvent } = collectEvents();
  await reconcileBookingCreated(tx, booking({ id: 'booking-shared' }), { workItem: null, method: 'STANDALONE' }, onLifecycleEvent);

  // Force the resolution to point at a *different* work item for the same booking id.
  const otherItem = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey: 'unrelated-key', subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'ACCEPTED', acceptanceState: 'ACCEPTED' },
  });
  await assert.rejects(
    () => reconcileBookingCreated(tx, booking({ id: 'booking-shared' }), { workItem: otherItem, method: 'GUIDANCE_JOURNEY' }, onLifecycleEvent),
    /already linked to OperationalWorkItem/,
  );
});

// --- reconcileBookingCancelled ---

test('reconcileBookingCancelled: zero linked work items throws (reconciliation conflict)', async () => {
  const tx = makeFakeTx();
  const { onLifecycleEvent } = collectEvents();
  await assert.rejects(() => reconcileBookingCancelled(tx, { id: 'nonexistent-booking' }, { reason: 'test cancellation', actorUserId: 'user-1' }, onLifecycleEvent), /No OperationalWorkItem is linked/);
});

test('reconcileBookingCancelled: multiple linked work items throws (reconciliation conflict)', async () => {
  const tx = makeFakeTx();
  for (const workKey of ['k1', 'k2']) {
    const item = await tx.operationalWorkItem.create({
      data: { propertyId: 'property-1', workKey, subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'ACCEPTED' },
    });
    await tx.operationalWorkExecution.upsert({
      where: { workItemId_executionType_executionEntityId: { workItemId: item.id, executionType: 'BOOKING', executionEntityId: 'booking-dup' } },
      create: { workItemId: item.id, executionType: 'BOOKING', executionEntityId: 'booking-dup', role: 'PRIMARY', responsibleParty: 'UNKNOWN' },
      update: {},
    });
  }
  const { onLifecycleEvent } = collectEvents();
  await assert.rejects(() => reconcileBookingCancelled(tx, { id: 'booking-dup' }, { reason: 'test cancellation', actorUserId: 'user-1' }, onLifecycleEvent), /expected exactly one/);
});

test('reconcileBookingCancelled: a standalone item with no independent source closes with CANCELLED disposition', async () => {
  const tx = makeFakeTx();
  const { onLifecycleEvent } = collectEvents();
  const created = await reconcileBookingCreated(tx, booking(), { workItem: null, method: 'STANDALONE' }, onLifecycleEvent);

  await reconcileBookingCancelled(tx, { id: 'booking-1' }, { reason: 'test cancellation', actorUserId: 'user-1' }, onLifecycleEvent);
  const closed = tx.__store.workItems.get(created.id);
  assert.equal(closed.state, 'CLOSED');
  assert.equal(closed.disposition, 'CANCELLED');
  const cancelEvent = [...tx.__store.workEvents.values()].find((e) => e.eventType === 'EXECUTION_CANCELLED' && e.workItemId === created.id);
  assert.ok(cancelEvent);
  assert.equal(cancelEvent.payload.bookingId, 'booking-1');
  assert.equal(cancelEvent.payload.priorState, 'ACCEPTED');
  assert.equal(cancelEvent.payload.originResolution, 'STANDALONE');
  assert.equal(cancelEvent.payload.cancellationReason, 'test cancellation');
  assert.equal(cancelEvent.payload.cancellationActorUserId, 'user-1');
  assert.equal(cancelEvent.payload.independentObligationRemained, false);
});

test('reconcileBookingCancelled: a reused SCHEDULED item with an active independent source reverts to ACCEPTED and clears scheduleOverrideAt', async () => {
  const tx = makeFakeTx();
  const candidate = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey: 'k1', subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE', acceptanceState: 'PROPOSED' },
  });
  await tx.operationalWorkSource.upsert({
    where: { workItemId_sourceType_sourceEntityId_sourceRole: { workItemId: candidate.id, sourceType: 'GUIDANCE', sourceEntityId: 'journey-1', sourceRole: 'TRIGGER' } },
    create: { workItemId: candidate.id, sourceType: 'GUIDANCE', sourceEntityId: 'journey-1', sourceRole: 'TRIGGER', sourceVersion: 'v1', active: true },
    update: {},
  });
  const { onLifecycleEvent } = collectEvents();
  const item = await reconcileBookingCreated(tx, booking(), { workItem: candidate, method: 'GUIDANCE_JOURNEY' }, onLifecycleEvent);
  // Move it forward to SCHEDULED and set a homeowner schedule override, as a
  // real confirmBooking() call would before this cancellation.
  tx.__store.workItems.set(item.id, { ...tx.__store.workItems.get(item.id), state: 'SCHEDULED', scheduleOverrideAt: new Date() });

  await reconcileBookingCancelled(tx, { id: 'booking-1' }, { reason: 'test cancellation', actorUserId: 'user-1' }, onLifecycleEvent);
  const rolledBack = tx.__store.workItems.get(item.id);
  assert.equal(rolledBack.state, 'ACCEPTED');
  assert.equal(rolledBack.scheduleOverrideAt, null);
  const bookingExecution = [...tx.__store.workExecutions.values()].find((e) => e.workItemId === item.id);
  assert.ok(bookingExecution, 'the BOOKING execution row must remain as history, not be deleted');
  const cancelEvent = [...tx.__store.workEvents.values()].find((e) => e.eventType === 'EXECUTION_CANCELLED' && e.workItemId === item.id);
  assert.ok(cancelEvent);
  assert.equal(cancelEvent.payload.bookingId, 'booking-1');
  assert.equal(cancelEvent.payload.priorState, 'SCHEDULED');
  assert.equal(cancelEvent.payload.originResolution, 'GUIDANCE_JOURNEY');
  assert.equal(cancelEvent.payload.cancellationReason, 'test cancellation');
  assert.equal(cancelEvent.payload.cancellationActorUserId, 'user-1');
  assert.equal(cancelEvent.payload.independentObligationRemained, true);
});

// Finding: a reused work item that survives cancellation but was still
// ACCEPTED (never SCHEDULED/IN_PROGRESS) previously got no
// EXECUTION_CANCELLED event at all — only transitionWorkItem's own
// transition writes one, and ACCEPTED -> ACCEPTED isn't a transition.
test('reconcileBookingCancelled: a reused ACCEPTED item with an active independent source stays ACCEPTED but still records EXECUTION_CANCELLED', async () => {
  const tx = makeFakeTx();
  const candidate = await tx.operationalWorkItem.create({
    data: { propertyId: 'property-1', workKey: 'k1', subjectType: 'PROPERTY', subjectId: 'property-1', obligationType: 'DECISION', priority: 'PLAN', safetyTier: 'LOW_CONSEQUENCE', title: 't', homeownerReason: 'r', expectedOutcome: 'o', state: 'CANDIDATE', acceptanceState: 'PROPOSED' },
  });
  await tx.operationalWorkSource.upsert({
    where: { workItemId_sourceType_sourceEntityId_sourceRole: { workItemId: candidate.id, sourceType: 'GUIDANCE', sourceEntityId: 'journey-1', sourceRole: 'TRIGGER' } },
    create: { workItemId: candidate.id, sourceType: 'GUIDANCE', sourceEntityId: 'journey-1', sourceRole: 'TRIGGER', sourceVersion: 'v1', active: true },
    update: {},
  });
  const { onLifecycleEvent } = collectEvents();
  const item = await reconcileBookingCreated(tx, booking(), { workItem: candidate, method: 'GUIDANCE_JOURNEY' }, onLifecycleEvent);
  // Still ACCEPTED — never confirmed/scheduled before this cancellation.
  assert.equal(item.state, 'ACCEPTED');

  await reconcileBookingCancelled(tx, { id: 'booking-1' }, { reason: 'test cancellation', actorUserId: 'user-1' }, onLifecycleEvent);
  const afterCancel = tx.__store.workItems.get(item.id);
  assert.equal(afterCancel.state, 'ACCEPTED', 'no transition to make — state does not change');
  const cancelEvent = [...tx.__store.workEvents.values()].find((e) => e.eventType === 'EXECUTION_CANCELLED' && e.workItemId === item.id);
  assert.ok(cancelEvent, 'EXECUTION_CANCELLED must still be recorded even with no state transition');
  assert.equal(cancelEvent.payload.priorState, 'ACCEPTED');
  assert.equal(cancelEvent.payload.independentObligationRemained, true);
});

// --- reconcileBookingLifecycle ---

test('reconcileBookingLifecycle: CONFIRMED -> SCHEDULED, STARTED -> IN_PROGRESS, COMPLETED -> VERIFIED', async () => {
  const tx = makeFakeTx();
  const { onLifecycleEvent } = collectEvents();
  const created = await reconcileBookingCreated(tx, booking(), { workItem: null, method: 'STANDALONE' }, onLifecycleEvent);

  await reconcileBookingLifecycle(tx, { id: 'booking-1' }, 'CONFIRMED', onLifecycleEvent);
  assert.equal(tx.__store.workItems.get(created.id).state, 'SCHEDULED');

  await reconcileBookingLifecycle(tx, { id: 'booking-1' }, 'STARTED', onLifecycleEvent);
  assert.equal(tx.__store.workItems.get(created.id).state, 'IN_PROGRESS');

  await reconcileBookingLifecycle(tx, { id: 'booking-1' }, 'COMPLETED', onLifecycleEvent);
  assert.equal(tx.__store.workItems.get(created.id).state, 'VERIFIED');
});
