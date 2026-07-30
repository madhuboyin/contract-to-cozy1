const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Slice 4: a guidance journey and the Project it hands off
// to must never compete as separate Home actions, and the handoff/verified
// completion/cancellation lifecycle must reconcile against the SAME shared
// OperationalWorkItem rather than minting a second one.

const NOW = new Date('2026-07-29T12:00:00.000Z');
const LATER = new Date('2026-09-01T12:00:00.000Z');

// ---- Mocked prisma, installed BEFORE anything requires projectTracker /
// workItemRepository, since those modules capture the `prisma` export
// reference at their own require-time (same require.cache idiom as
// homeHabitCoachAdoptRoutine.test.js). ----

const workItems = new Map();
const workExecutions = new Map();
const workEvents = new Map();
// Home Operations Item #14 (Gap 3): resolveJourneyWorkKey now looks this up
// directly (it used to be a pure function of {propertyId, journeyId} only).
// Keyed by journey id; defaults to a non-coverage journey unless a test
// seeds otherwise via seedGuidanceJourney.
const guidanceJourneys = new Map([
  ['journey-1', { journeyTypeKey: 'asset_lifecycle_resolution', inventoryItemId: 'item-1' }],
]);

function resetWorkItemState() {
  workItems.clear();
  workExecutions.clear();
  workEvents.clear();
}

function seedGuidanceJourney(journeyId, fields) {
  guidanceJourneys.set(journeyId, fields);
}

const prismaMock = {
  guidanceJourney: {
    findUnique: async ({ where }) => guidanceJourneys.get(where.id) ?? null,
  },
  operationalWorkItem: {
    findUnique: async ({ where }) => {
      if (where.propertyId_workKey) {
        const { propertyId, workKey } = where.propertyId_workKey;
        return [...workItems.values()].find((w) => w.propertyId === propertyId && w.workKey === workKey) ?? null;
      }
      return workItems.get(where.id) ?? null;
    },
    update: async ({ where, data }) => {
      const row = { ...workItems.get(where.id), ...data, updatedAt: new Date() };
      workItems.set(where.id, row);
      return row;
    },
  },
  operationalWorkExecution: {
    upsert: async ({ where, create, update }) => {
      const key = where.workItemId_executionType_executionEntityId;
      const id = `${key.workItemId}:${key.executionType}:${key.executionEntityId}`;
      const existing = workExecutions.get(id);
      const row = existing ? { ...existing, ...update } : { id, ...create };
      workExecutions.set(id, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => {
      const id = crypto.randomUUID();
      const row = { id, createdAt: new Date(), ...data };
      workEvents.set(id, row);
      return row;
    },
    findUnique: async () => null,
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
  getPromotedHomeActions,
} = require('../../src/services/homeActionSourcePromotion.service.ts');
const {
  proposeWorkItemFromHomeAction,
} = require('../../src/modules/homeOperations/adapters/homeActionWorkItem.adapter.ts');
const { resolveWorkKey } = require('../../src/modules/homeOperations/domain/workKey.ts');
const {
  resolveJourneyWorkKey,
  syncJourneyWorkItemForProjectEvent,
} = require('../../src/services/projectTracker.service.ts');

// ---- Part 1: feed-level suppression + unified identity (pure aggregation) ----

function baseJourney(overrides = {}) {
  return {
    id: 'journey-1', propertyId: 'property-1', inventoryItemId: 'item-1', primarySignalId: 'signal-1',
    journeyTypeKey: 'asset_lifecycle_resolution', issueDomain: 'MAINTENANCE', issueType: 'Repair or replace HVAC', templateVersion: '2.1.0',
    status: 'ACTIVE', startedAt: NOW, createdAt: NOW, updatedAt: NOW, missingContextKeys: [],
    primarySignal: { id: 'signal-1', severity: 'HIGH', confidenceScore: 0.85, lastObservedAt: NOW },
    steps: [{ label: 'Compare repair and replacement', description: 'Review durable options.', status: 'PENDING', routePath: '/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair' }],
    ...overrides,
  };
}

function baseProject(overrides = {}) {
  return {
    id: 'project-1', propertyId: 'property-1', name: 'HVAC replacement', description: 'Replace failing HVAC unit',
    status: 'IN_PROGRESS', guidanceJourneyId: 'journey-1',
    startDate: NOW, expectedEndDate: LATER, createdAt: NOW, updatedAt: NOW,
    safetyCheckResult: 'NOT_REQUIRED', fundingMode: 'SELF_PAID', contractAmountCents: null, paidToDateCents: null,
    milestones: [{ id: 'm1', name: 'Install complete', status: 'IN_PROGRESS', position: 0 }],
    issues: [],
    ...overrides,
  };
}

function fixtureDb({ journeys = [baseJourney()], projects = [baseProject()] } = {}) {
  return {
    guidanceJourney: { findMany: async () => journeys },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    // Mimics real Prisma's server-side status filtering — loadGuidanceActions
    // and loadProjectActions each query projectRecord.findMany with their own
    // `where.status.in`, and the CANCELLED-reappearance test below depends on
    // that filter actually excluding a cancelled project from both queries.
    projectRecord: { findMany: async (args) => {
      const allowedStatuses = args?.where?.status?.in;
      return allowedStatuses ? projects.filter((p) => allowedStatuses.includes(p.status)) : projects;
    } },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
  };
}

test('a journey with an active linked Project is suppressed from Home; the Project action carries relatedJourneyId', async () => {
  const { actions } = await getPromotedHomeActions('property-1', fixtureDb(), { includePersonalization: false });
  assert.equal(actions.some((a) => a.source.kind === 'GUIDANCE'), false, 'journey should not appear as a competing action');
  const projectAction = actions.find((a) => a.source.kind === 'PROJECT');
  assert.ok(projectAction, 'expected the project action to be present');
  assert.equal(projectAction.relatedJourneyId, 'journey-1');
});

test('a journey whose Project was CANCELLED is un-suppressed again', async () => {
  const db = fixtureDb({ projects: [baseProject({ status: 'CANCELLED' })] });
  const { actions } = await getPromotedHomeActions('property-1', db, { includePersonalization: false });
  assert.equal(actions.some((a) => a.source.kind === 'GUIDANCE'), true, 'journey should reappear once its project is cancelled');
  assert.equal(actions.some((a) => a.source.kind === 'PROJECT'), false, 'a cancelled project should not itself appear');
});

test('a journey with no linked Project is unaffected', async () => {
  const db = fixtureDb({ projects: [] });
  const { actions } = await getPromotedHomeActions('property-1', db, { includePersonalization: false });
  assert.equal(actions.some((a) => a.source.kind === 'GUIDANCE'), true);
});

test('the PROJECT action with relatedJourneyId resolves to the SAME work-item identity as the journey itself', async () => {
  const { actions } = await getPromotedHomeActions('property-1', fixtureDb(), { includePersonalization: false });
  const projectAction = actions.find((a) => a.source.kind === 'PROJECT');
  const proposal = proposeWorkItemFromHomeAction(projectAction, 'property-1');
  assert.ok(proposal, 'PROJECT actions must remain work-item eligible');
  assert.equal(proposal.subject.type, 'PROPERTY');
  assert.equal(proposal.occurrence.obligationSlug, 'guidance-journey-1');

  const projectWorkKey = resolveWorkKey({
    propertyId: 'property-1',
    subject: proposal.subject,
    obligationType: proposal.obligationType,
    occurrence: proposal.occurrence,
  });
  assert.equal(projectWorkKey, await resolveJourneyWorkKey('property-1', 'journey-1'));
});

test('a PROJECT action with no relatedJourneyId keeps its own independent execution identity', async () => {
  const db = fixtureDb({
    journeys: [],
    projects: [baseProject({ guidanceJourneyId: null })],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { includePersonalization: false });
  const projectAction = actions.find((a) => a.source.kind === 'PROJECT');
  const proposal = proposeWorkItemFromHomeAction(projectAction, 'property-1');
  assert.equal(proposal.subject.type, 'PROJECT');
  assert.equal(proposal.occurrence.obligationSlug, 'execution');
});

// ---- Part 2: project-lifecycle work-item reconciliation (mocked prisma) ----

async function seedWorkItem(overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const journeyId = overrides.journeyId ?? 'journey-1';
  const row = {
    propertyId: 'property-1',
    workKey: await resolveJourneyWorkKey('property-1', journeyId),
    state: 'ACCEPTED',
    acceptanceState: 'ACCEPTED',
    disposition: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    id,
  };
  delete row.journeyId;
  workItems.set(id, row);
  return row;
}

test('HANDOFF transitions an ACCEPTED journey work item to IN_PROJECT and links the project execution', async () => {
  resetWorkItemState();
  const item = await seedWorkItem({ state: 'ACCEPTED', acceptanceState: 'ACCEPTED' });

  await syncJourneyWorkItemForProjectEvent('property-1', 'journey-1', 'project-1', 'HANDOFF', null);

  assert.equal(workItems.get(item.id).state, 'IN_PROJECT');
  const execution = [...workExecutions.values()].find((e) => e.workItemId === item.id);
  assert.ok(execution, 'expected a PROJECT execution link');
  assert.equal(execution.executionType, 'PROJECT');
  assert.equal(execution.executionEntityId, 'project-1');
});

test('VERIFIED transitions an IN_PROJECT work item through REPORTED_COMPLETE to VERIFIED', async () => {
  resetWorkItemState();
  const item = await seedWorkItem({ state: 'IN_PROJECT', acceptanceState: 'ACCEPTED' });

  await syncJourneyWorkItemForProjectEvent('property-1', 'journey-1', 'project-1', 'VERIFIED', 'user-1');

  assert.equal(workItems.get(item.id).state, 'VERIFIED');
});

// ── Home Operations Item #15: contractor/household responsibility state ──

test('HANDOFF records the passed responsibleParty on the new execution link', async () => {
  resetWorkItemState();
  const item = await seedWorkItem({ state: 'ACCEPTED', acceptanceState: 'ACCEPTED' });

  await syncJourneyWorkItemForProjectEvent('property-1', 'journey-1', 'project-1', 'HANDOFF', null, 'HOUSEHOLD');

  const execution = [...workExecutions.values()].find((e) => e.workItemId === item.id);
  assert.equal(execution.responsibleParty, 'HOUSEHOLD');
});

test('a later VERIFIED event that omits responsibleParty preserves the value HANDOFF already set', async () => {
  resetWorkItemState();
  const item = await seedWorkItem({ state: 'ACCEPTED', acceptanceState: 'ACCEPTED' });

  await syncJourneyWorkItemForProjectEvent('property-1', 'journey-1', 'project-1', 'HANDOFF', null, 'CONTRACTOR');
  await syncJourneyWorkItemForProjectEvent('property-1', 'journey-1', 'project-1', 'VERIFIED', 'user-1');

  const execution = [...workExecutions.values()].find((e) => e.workItemId === item.id);
  assert.equal(execution.responsibleParty, 'CONTRACTOR', 'VERIFIED must not clobber the value HANDOFF already recorded');
});

test('CANCELLED reconciles an IN_PROJECT work item back to ACCEPTED', async () => {
  resetWorkItemState();
  const item = await seedWorkItem({ state: 'IN_PROJECT', acceptanceState: 'ACCEPTED' });

  await syncJourneyWorkItemForProjectEvent('property-1', 'journey-1', 'project-1', 'CANCELLED', null);

  assert.equal(workItems.get(item.id).state, 'ACCEPTED');
});

test('a null guidanceJourneyId is a no-op (project not spawned from a journey)', async () => {
  resetWorkItemState();
  await syncJourneyWorkItemForProjectEvent('property-1', null, 'project-1', 'HANDOFF', null);
  assert.equal(workItems.size, 0);
});

test('a missing work item (no prior journey resolution) is a silent no-op, not an error', async () => {
  resetWorkItemState();
  await syncJourneyWorkItemForProjectEvent('property-1', 'journey-does-not-exist', 'project-1', 'HANDOFF', null);
  assert.equal(workItems.size, 0);
});

test('an illegal transition (e.g. already CLOSED) is swallowed — the project mutation is never blocked', async () => {
  resetWorkItemState();
  await seedWorkItem({ state: 'CLOSED', acceptanceState: 'DECLINED', disposition: 'NOT_RELEVANT' });

  await assert.doesNotReject(
    syncJourneyWorkItemForProjectEvent('property-1', 'journey-1', 'project-1', 'VERIFIED', 'user-1'),
  );
});

// ---- Item #14 (Gap 3): coverage-shaped journey key-shape agreement ----

test('a coverage_gap_resolution journey resolves to the INVENTORY_ITEM/COVERAGE_ACTION key shape, and the handoff finds it', async () => {
  resetWorkItemState();
  seedGuidanceJourney('journey-coverage', { journeyTypeKey: 'coverage_gap_resolution', inventoryItemId: 'item-9' });

  const key = await resolveJourneyWorkKey('property-1', 'journey-coverage');
  assert.equal(key, resolveWorkKey({
    propertyId: 'property-1',
    subject: { type: 'INVENTORY_ITEM', id: 'item-9' },
    obligationType: 'COVERAGE_ACTION',
    occurrence: { obligationSlug: 'coverage-gap' },
  }));

  const item = await seedWorkItem({ journeyId: 'journey-coverage', state: 'ACCEPTED', acceptanceState: 'ACCEPTED' });
  await syncJourneyWorkItemForProjectEvent('property-1', 'journey-coverage', 'project-1', 'HANDOFF', null);

  assert.equal(workItems.get(item.id).state, 'IN_PROJECT', 'the coverage-shaped work item must be found and handed off, not orphaned');
});

test('a REGULATED_COVERAGE journey type other than coverage_gap_resolution still uses journey.id as the (fake) inventory-item subject', async () => {
  resetWorkItemState();
  // warranty_purchase_journey is REGULATED_COVERAGE, so isCoverageShaped
  // (the broad check in homeActionWorkItem.adapter.ts) takes the
  // INVENTORY_ITEM/COVERAGE_ACTION branch at recommendation time — but
  // homeActionSourcePromotion.service.ts's narrower isCoverageJourney check
  // only special-cases coverage_gap_resolution, so sourceEntityId falls back
  // to journey.id (not a real inventory item id) for every other
  // REGULATED_COVERAGE type. This is a separate, pre-existing
  // recommendation-stage inconsistency (out of scope to fix here) — the
  // handoff's job is only to agree with whatever key that stage actually
  // produced, bug included, not to correct it.
  seedGuidanceJourney('journey-warranty', { journeyTypeKey: 'warranty_purchase_journey', inventoryItemId: 'item-9' });

  const key = await resolveJourneyWorkKey('property-1', 'journey-warranty');
  assert.equal(key, resolveWorkKey({
    propertyId: 'property-1',
    subject: { type: 'INVENTORY_ITEM', id: 'journey-warranty' },
    obligationType: 'COVERAGE_ACTION',
    occurrence: { obligationSlug: 'coverage-gap' },
  }));
});
