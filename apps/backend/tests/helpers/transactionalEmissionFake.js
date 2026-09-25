const crypto = require('node:crypto');

// Home Operations writes now emit a PropertyChange and request an intelligence recompute inside the same database
// transaction as the work item (Home Intelligence Phase 0/1, August 2026). Tests that hand the service a minimal prisma
// mock therefore also need `$transaction` and the emission tables. This adds an in-memory version of exactly those to
// an existing mock, in place, so a test keeps its own work-item fakes and only gains the transactional plumbing.
//
//   addTransactionalEmission(prismaMock);            // prismaMock.$transaction(fn) now calls fn(prismaMock)
//
// It never overwrites a member the mock already defines, so a test can still supply its own `operationalWorkItem`
// (assertCanonicalLinks reads `operationalWorkItem.findUnique({ where: { id } })`).
function addTransactionalEmission(mock) {
  const changes = new Map();
  const cursors = new Map();
  const domainEvents = new Map();
  const changeKey = (k) => `${k.propertyId}:${k.sourceType}:${k.sourceEntityId}:${k.sourceRevision}`;
  const cursorKey = (k) => `${k.propertyId}:${k.sourceType}:${k.sourceEntityId}`;

  const defaults = {
    propertyChange: {
      findUnique: async ({ where }) => {
        if (where.id) return [...changes.values()].find((row) => row.id === where.id) ?? null;
        return changes.get(changeKey(where.propertyId_sourceType_sourceEntityId_sourceRevision)) ?? null;
      },
      findMany: async () => [...changes.values()],
      upsert: async ({ where, create }) => {
        const key = changeKey(where.propertyId_sourceType_sourceEntityId_sourceRevision);
        const existing = changes.get(key);
        if (existing) return existing;
        const row = { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...create };
        changes.set(key, row);
        return row;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const [key, row] of changes.entries()) {
          if (row.propertyId === where.propertyId && row.sourceType === where.sourceType
            && row.sourceEntityId === where.sourceEntityId && row.id !== where.id?.not && row.supersededAt == null) {
            changes.set(key, { ...row, ...data });
            count += 1;
          }
        }
        return { count };
      },
    },
    propertyChangeSourceCursor: {
      upsert: async ({ where, create }) => {
        const key = cursorKey(where.propertyId_sourceType_sourceEntityId);
        const row = cursors.get(key) ?? { id: crypto.randomUUID(), latestChangeId: null, ...create };
        cursors.set(key, row);
        return row;
      },
      update: async ({ where, data }) => {
        for (const [key, row] of cursors.entries()) {
          if (row.id === where.id) { const updated = { ...row, ...data }; cursors.set(key, updated); return updated; }
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
  };
  for (const [name, value] of Object.entries(defaults)) if (!(name in mock)) mock[name] = value;
  // Accepting a work item also checks its decision lineage, which lists the item's sources. A mock that stores sources
  // without listing support gets an empty list (no decision family), which is what these tests' items have.
  mock.operationalWorkSource = mock.operationalWorkSource ?? {};
  if (!mock.operationalWorkSource.findMany) mock.operationalWorkSource.findMany = async () => [];
  // Verifying or closing an item deactivates its sources, records a decision-platform outcome, and (best-effort) records a
  // reconciliation failure. Harmless defaults for tests that do not look at any of those.
  if (!mock.operationalWorkSource.updateMany) mock.operationalWorkSource.updateMany = async () => ({ count: 0 });
  if (!('outcomeObservation' in mock)) {
    const outcomes = [];
    mock.outcomeObservation = {
      findFirst: async () => null,
      create: async ({ data }) => { const row = { id: crypto.randomUUID(), ...data }; outcomes.push(row); return row; },
      update: async ({ data }) => ({ id: 'outcome', ...data }),
    };
  }
  mock.operationalWorkReconciliation = mock.operationalWorkReconciliation ?? {};
  if (!mock.operationalWorkReconciliation.upsert) mock.operationalWorkReconciliation.upsert = async ({ create }) => ({ id: crypto.randomUUID(), ...create });
  if (!mock.operationalWorkReconciliation.updateMany) mock.operationalWorkReconciliation.updateMany = async () => ({ count: 0 });
  if (!mock.operationalWorkSource.findUnique) mock.operationalWorkSource.findUnique = async () => null;
  if (!('$transaction' in mock)) mock.$transaction = async (fn) => fn(mock);
  mock.__emission = { changes, cursors, domainEvents };
  return mock;
}

module.exports = { addTransactionalEmission };
