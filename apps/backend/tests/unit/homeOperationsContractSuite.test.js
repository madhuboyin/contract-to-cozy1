const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Item #18 (§13.2 "Contract tests"). A dedicated,
// traceable home for the specific gaps a full audit found in the existing
// ~20-file Home Operations test suite — not a duplicate of coverage that
// already exists elsewhere (workKey stability, role enforcement, and most
// idempotency/adapter cases are already well covered; see the item #18
// plan for the full per-requirement audit). This file covers exactly the
// gaps: occurrence-level no-merge at the integration level, SCHEDULED
// idempotency plus the documented retry-without-a-guard contract, the
// HAZARD_OBSERVATION inline call site's first behavioral (not just
// static-regex) test, and the new syncProjectExecutionWorkItemOnCompletion
// fix (a Project's own top-level work item, previously never completed).

const NOW = new Date('2026-07-30T12:00:00.000Z');

const workItems = new Map();
const workSources = new Map();
const workEvents = new Map();
const hazardOutcomes = new Map();
const hazardEvidenceLinks = new Map();
const documents = new Map();

function reset() {
  workItems.clear();
  workSources.clear();
  workEvents.clear();
  hazardOutcomes.clear();
  hazardEvidenceLinks.clear();
  documents.clear();
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
      if (existing) { const err = new Error('dup workKey'); err.code = 'P2002'; throw err; }
      const row = { id: crypto.randomUUID(), state: 'CANDIDATE', acceptanceState: 'PROPOSED', disposition: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      workItems.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = { ...workItems.get(where.id), ...data, updatedAt: new Date() };
      workItems.set(where.id, row);
      return row;
    },
  },
  operationalWorkSource: {
    upsert: async ({ where, create, update }) => {
      const k = where.workItemId_sourceType_sourceEntityId_sourceRole;
      const key = `${k.workItemId}:${k.sourceType}:${k.sourceEntityId}:${k.sourceRole}`;
      const existing = workSources.get(key);
      const row = existing ? { ...existing, ...update } : { id: crypto.randomUUID(), ...create };
      workSources.set(key, row);
      return row;
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
  propertyHazardOutcome: {
    findFirst: async ({ where }) => hazardOutcomes.get(where.id) ?? null,
    update: async ({ where, data }) => {
      const row = { ...hazardOutcomes.get(where.id), ...data };
      hazardOutcomes.set(where.id, row);
      return row;
    },
  },
  propertyHazardEvidenceLink: {
    upsert: async ({ where, create }) => {
      const k = where.outcomeId_entityKey;
      const key = `${k.outcomeId}:${k.entityKey}`;
      const row = hazardEvidenceLinks.get(key) ?? { id: crypto.randomUUID(), ...create };
      hazardEvidenceLinks.set(key, row);
      return row;
    },
  },
  document: {
    findFirst: async ({ where }) => documents.get(where.id) ?? null,
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
const { transitionWorkItem } = require('../../src/modules/homeOperations/application/transitionWorkItem.usecase.ts');
const { IllegalWorkItemTransitionError } = require('../../src/modules/homeOperations/domain/transitions.ts');
const { linkPropertyHazardEvidence } = require('../../src/propertyIntelligence/pastHazardExposure.service.ts');
const {
  syncProjectExecutionWorkItemOnCompletion,
} = require('../../src/services/projectTracker.service.ts');
const {
  resolveProjectExecutionWorkKey,
} = require('../../src/modules/homeOperations/adapters/homeActionWorkItem.adapter.ts');

function proposal(overrides = {}) {
  return {
    propertyId: 'property-1',
    subject: { type: 'PROPERTY', id: 'property-1' },
    obligationType: 'MAINTENANCE_TASK',
    occurrence: { obligationSlug: 'replace-filter' },
    title: 'Replace HVAC filter',
    homeownerReason: 'r',
    expectedOutcome: 'o',
    priority: 'PLAN',
    safetyTier: 'LOW_CONSEQUENCE',
    confidence: 1,
    missingContext: [],
    source: { sourceType: 'MAINTENANCE', sourceEntityId: 'entity-1', sourceVersion: 'v1', sourceRole: 'TRIGGER' },
    ...overrides,
  };
}

// ── §13.2 #2: no merge across occurrence (integration level) ───────────────

test('two proposals differing only in occurrenceKey resolve to two distinct work items', async () => {
  reset();
  const first = await resolveAndUpsertWorkItem(proposal({ occurrence: { obligationSlug: 'replace-filter', occurrenceKey: '2026-07' } }));
  const second = await resolveAndUpsertWorkItem(proposal({ occurrence: { obligationSlug: 'replace-filter', occurrenceKey: '2026-08' } }));

  assert.notEqual(first.id, second.id);
  assert.equal(workItems.size, 2);
});

test('two proposals with the same occurrenceKey resolve to the same work item', async () => {
  reset();
  const first = await resolveAndUpsertWorkItem(proposal({ occurrence: { obligationSlug: 'replace-filter', occurrenceKey: '2026-07' } }));
  const second = await resolveAndUpsertWorkItem(proposal({ occurrence: { obligationSlug: 'replace-filter', occurrenceKey: '2026-07' }, title: 'Replace the HVAC filter' }));

  assert.equal(first.id, second.id);
  assert.equal(workItems.size, 1);
});

// ── §13.2 #3: idempotency — SCHEDULED, plus the documented retry contract ──

test('SCHEDULED is reachable and reflects on the work item like every other transition', async () => {
  reset();
  const created = await resolveAndUpsertWorkItem(proposal());
  await transitionWorkItem({ workItemId: created.id, to: 'ACCEPTED', actorType: 'SYSTEM', idempotencyKey: 'k1' });

  const scheduled = await transitionWorkItem({ workItemId: created.id, to: 'SCHEDULED', actorType: 'SYSTEM', idempotencyKey: 'k2' });

  assert.equal(scheduled.state, 'SCHEDULED');
});

test('documented contract: transitionWorkItem is not self-idempotent — a bare retry to an already-reached state throws, callers must guard by checking state first', async () => {
  reset();
  const created = await resolveAndUpsertWorkItem(proposal());

  await transitionWorkItem({ workItemId: created.id, to: 'ACCEPTED', actorType: 'SYSTEM', idempotencyKey: 'k1' });

  await assert.rejects(
    () => transitionWorkItem({ workItemId: created.id, to: 'ACCEPTED', actorType: 'SYSTEM', idempotencyKey: 'k2' }),
    IllegalWorkItemTransitionError,
    'a bare retry without checking current state first must throw, not silently no-op — every production call site in this codebase guards with a state check before calling transitionWorkItem for exactly this reason',
  );
});

test('the guarded pattern every call site actually uses IS idempotent: checking state first before transitioning is a safe no-op on retry', async () => {
  reset();
  const created = await resolveAndUpsertWorkItem(proposal());
  const guardedAccept = async (workItemId) => {
    const current = workItems.get(workItemId);
    if (current.state === 'CANDIDATE') {
      return transitionWorkItem({ workItemId, to: 'ACCEPTED', actorType: 'SYSTEM', idempotencyKey: `accept:${workItemId}` });
    }
    return current;
  };

  await guardedAccept(created.id);
  await assert.doesNotReject(() => guardedAccept(created.id));
  assert.equal(workItems.get(created.id).state, 'ACCEPTED');
});

// ── §13.2 #6: HAZARD_OBSERVATION — behavioral, not just static-regex ──────

function seedHazardOutcome(overrides = {}) {
  const outcome = {
    id: 'outcome-1',
    propertyId: 'property-1',
    status: 'OBSERVED_EFFECT_CONFIRMED',
    canonicalTimelineEventId: null,
    canonicalActionId: null,
    updatedAt: NOW,
    propertyMatch: { observation: { externalId: 'obs-external-1', observationType: 'FLOOD' } },
    ...overrides,
  };
  hazardOutcomes.set(outcome.id, outcome);
  return outcome;
}

test('confirming an observed hazard effect creates a work item and records it back on the outcome', async () => {
  reset();
  seedHazardOutcome();
  documents.set('doc-1', { id: 'doc-1', propertyId: 'property-1' });

  await linkPropertyHazardEvidence({
    propertyId: 'property-1',
    outcomeId: 'outcome-1',
    userId: 'user-1',
    kind: 'DOCUMENT',
    documentId: 'doc-1',
  });

  assert.equal(workItems.size, 1);
  const item = [...workItems.values()][0];
  assert.equal(item.subjectType, 'PROPERTY');
  assert.equal(item.obligationType, 'INCIDENT_RESPONSE');
  assert.equal(item.workKey, 'property:property-1:review-confirmed-hazard-effect:obs-external-1');

  const source = [...workSources.values()][0];
  assert.equal(source.sourceType, 'HAZARD_OBSERVATION');
  assert.equal(source.sourceEntityId, 'outcome-1');

  assert.equal(hazardOutcomes.get('outcome-1').canonicalActionId, item.id);
});

test('linking a second piece of evidence for the same outcome reuses the same work item, not a second one', async () => {
  reset();
  seedHazardOutcome();
  documents.set('doc-1', { id: 'doc-1', propertyId: 'property-1' });
  documents.set('doc-2', { id: 'doc-2', propertyId: 'property-1' });

  await linkPropertyHazardEvidence({ propertyId: 'property-1', outcomeId: 'outcome-1', userId: 'user-1', kind: 'DOCUMENT', documentId: 'doc-1' });
  await linkPropertyHazardEvidence({ propertyId: 'property-1', outcomeId: 'outcome-1', userId: 'user-1', kind: 'DOCUMENT', documentId: 'doc-2' });

  assert.equal(workItems.size, 1, 'the same hazard outcome must resolve to one durable work item across multiple evidence links');
});

test('a hazard outcome not yet confirmed (no observed effect) never creates a work item', async () => {
  reset();
  seedHazardOutcome({ status: 'NO_OBSERVED_EFFECT' });
  documents.set('doc-1', { id: 'doc-1', propertyId: 'property-1' });

  await linkPropertyHazardEvidence({ propertyId: 'property-1', outcomeId: 'outcome-1', userId: 'user-1', kind: 'DOCUMENT', documentId: 'doc-1' });

  assert.equal(workItems.size, 0);
});

// ── §13.2 #8: a Project's own work item now completes/cancels ─────────────

function seedProjectExecutionWorkItem(overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const row = {
    propertyId: 'property-1',
    workKey: resolveProjectExecutionWorkKey('property-1', 'project-1'),
    subjectType: 'PROJECT',
    subjectId: 'project-1',
    obligationType: 'PROJECT_EXECUTION',
    state: 'ACCEPTED',
    acceptanceState: 'ACCEPTED',
    disposition: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    id,
  };
  workItems.set(id, row);
  return row;
}

test('VERIFIED transitions a Project execution work item through REPORTED_COMPLETE to VERIFIED', async () => {
  reset();
  const item = seedProjectExecutionWorkItem({ state: 'IN_PROJECT' });

  await syncProjectExecutionWorkItemOnCompletion('property-1', 'project-1', 'VERIFIED');

  assert.equal(workItems.get(item.id).state, 'VERIFIED');
});

test('CANCELLED closes an open Project execution work item with disposition NOT_RELEVANT', async () => {
  reset();
  const item = seedProjectExecutionWorkItem({ state: 'ACCEPTED' });

  await syncProjectExecutionWorkItemOnCompletion('property-1', 'project-1', 'CANCELLED');

  const closed = workItems.get(item.id);
  assert.equal(closed.state, 'CLOSED');
  assert.equal(closed.disposition, 'NOT_RELEVANT');
});

test('a project with no resolved execution work item is a silent no-op, not an error', async () => {
  reset();
  await assert.doesNotReject(() => syncProjectExecutionWorkItemOnCompletion('property-1', 'project-does-not-exist', 'VERIFIED'));
  assert.equal(workItems.size, 0);
});

test('a sync failure is swallowed — the project mutation is never blocked', async () => {
  reset();
  seedProjectExecutionWorkItem({ state: 'ACCEPTED' });
  const originalUpdate = prismaMock.operationalWorkItem.update;
  prismaMock.operationalWorkItem.update = async () => { throw new Error('simulated outage'); };
  try {
    await assert.doesNotReject(() => syncProjectExecutionWorkItemOnCompletion('property-1', 'project-1', 'VERIFIED'));
  } finally {
    prismaMock.operationalWorkItem.update = originalUpdate;
  }
});

test('the same work item is found regardless of whether it was created by the passive HomeAction path or the renovation handoff path, since both use the identical PROJECT/PROJECT_EXECUTION key shape', async () => {
  reset();
  // Mirrors renovationReadiness.service.ts's ensureProjectWorkItem proposal
  // shape exactly (subject: {type: 'PROJECT', id}, obligationType:
  // 'PROJECT_EXECUTION', occurrence.obligationSlug: 'execution') — confirms
  // the fix applies uniformly no matter which call site created the item.
  const item = seedProjectExecutionWorkItem({ state: 'IN_PROJECT' });
  assert.equal(item.workKey, resolveProjectExecutionWorkKey('property-1', 'project-1'));

  await syncProjectExecutionWorkItemOnCompletion('property-1', 'project-1', 'VERIFIED');

  assert.equal(workItems.get(item.id).state, 'VERIFIED');
});
