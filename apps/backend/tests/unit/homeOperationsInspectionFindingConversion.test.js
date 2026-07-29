const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Slice 5: acceptFindingAsWork is the explicit accept gate
// and policy router (Maintenance/Guidance/Project); resolution propagation
// closes the loop when a routed execution verifies. guidanceJourneyService
// and PropertyMaintenanceTaskService are mocked wholesale (not their
// dependencies) — this test is about inspectionHub.service.ts's own
// orchestration, not their internals, which have their own test suites.

const workItems = new Map();
const workExecutions = new Map();
const workEvents = new Map();
const findings = new Map();

function reset() {
  workItems.clear();
  workExecutions.clear();
  workEvents.clear();
  findings.clear();
}

const prismaMock = {
  inspectionFinding: {
    findUnique: async ({ where }) => {
      const finding = findings.get(where.id);
      if (!finding) return null;
      return { ...finding, report: { status: finding.reportStatus } };
    },
    update: async ({ where, data }) => {
      const row = { ...findings.get(where.id), ...data };
      findings.set(where.id, row);
      return row;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [id, row] of findings.entries()) {
        if (row.id !== where.id) continue;
        if (where.status && row.status !== where.status) continue;
        findings.set(id, { ...row, ...data });
        count += 1;
      }
      return { count };
    },
    count: async ({ where }) => [...findings.values()].filter((row) => {
      if (where.reportId && row.reportId !== where.reportId) return false;
      if (where.status && row.status !== where.status) return false;
      return true;
    }).length,
  },
  inspectionReport: {
    update: async () => ({}),
  },
  operationalWorkItem: {
    findUnique: async ({ where }) => {
      if (where.propertyId_workKey) {
        const { propertyId, workKey } = where.propertyId_workKey;
        return [...workItems.values()].find((w) => w.propertyId === propertyId && w.workKey === workKey) ?? null;
      }
      return workItems.get(where.id) ?? null;
    },
    create: async ({ data }) => {
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
    upsert: async ({ create }) => ({ id: crypto.randomUUID(), ...create }),
  },
  operationalWorkExecution: {
    findMany: async ({ where = {}, include } = {}) => {
      const rows = [...workExecutions.values()].filter((row) => {
        if (where.workItemId && row.workItemId !== where.workItemId) return false;
        if (where.executionType && row.executionType !== where.executionType) return false;
        if (where.executionEntityId && row.executionEntityId !== where.executionEntityId) return false;
        if (where.workItem?.subjectType) {
          const workItem = workItems.get(row.workItemId);
          if (!workItem || workItem.subjectType !== where.workItem.subjectType) return false;
        }
        return true;
      });
      if (!include?.workItem) return rows;
      return rows.map((row) => ({ ...row, workItem: workItems.get(row.workItemId) }));
    },
    upsert: async ({ where, create, update }) => {
      const key = where.workItemId_executionType_executionEntityId;
      const id = `${key.workItemId}:${key.executionType}:${key.executionEntityId}`;
      const row = { id, ...(workExecutions.get(id) ?? create), ...update };
      workExecutions.set(id, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => ({ id: crypto.randomUUID(), createdAt: new Date(), ...data }),
    findUnique: async () => null,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: { logger: { info: () => {}, warn: () => {}, error: () => {} }, auditLog: () => {} },
};

let lastGuidanceIngestInput = null;
const guidanceJourneyServicePath = require.resolve('../../src/services/guidanceEngine/guidanceJourney.service.ts');
require.cache[guidanceJourneyServicePath] = {
  id: guidanceJourneyServicePath,
  filename: guidanceJourneyServicePath,
  loaded: true,
  exports: {
    guidanceJourneyService: {
      ingestSignal: async (input) => {
        lastGuidanceIngestInput = input;
        return { journey: { id: 'journey-fake-1' }, signal: { id: 'signal-fake-1' } };
      },
    },
  },
};

let lastMaintenanceCreateInput = null;
const propertyMaintenanceTaskServicePath = require.resolve('../../src/services/PropertyMaintenanceTask.service.ts');
require.cache[propertyMaintenanceTaskServicePath] = {
  id: propertyMaintenanceTaskServicePath,
  filename: propertyMaintenanceTaskServicePath,
  loaded: true,
  exports: {
    PropertyMaintenanceTaskService: {
      createUserTask: async (userId, propertyId, data) => {
        lastMaintenanceCreateInput = { userId, propertyId, data };
        return { id: 'task-fake-1', ...data };
      },
    },
  },
};

const {
  acceptFindingAsWork,
  resolveFindingWorkPolicy,
  dismissFinding,
} = require('../../src/services/inspectionHub.service.ts');
const {
  propagateFindingResolutionFromExecution,
  resolveInspectionFindingWorkKey,
} = require('../../src/modules/homeOperations/adapters/inspectionFinding.adapter.ts');

function findingFixture(overrides = {}) {
  const row = {
    id: 'finding-1',
    reportId: 'report-1',
    propertyId: 'property-1',
    homeSystem: 'HVAC',
    inspectorDescription: 'The furnace heat exchanger shows visible cracking.',
    inspectorRecommendation: 'Have a licensed HVAC technician evaluate immediately.',
    severity: 'SAFETY',
    status: 'OPEN',
    extractionConfidence: 'HIGH',
    estimatedCostCentsLow: null,
    estimatedCostCentsHigh: null,
    inventoryItemId: null,
    reportStatus: 'CONFIRMED',
    updatedAt: new Date('2026-07-20T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
  findings.set(row.id, row);
  return row;
}

// ---- resolveFindingWorkPolicy (pure) ----

test('resolveFindingWorkPolicy: SAFETY always routes to GUIDANCE', () => {
  assert.equal(resolveFindingWorkPolicy({ severity: 'SAFETY', estimatedCostCentsHigh: null }), 'GUIDANCE');
});

test('resolveFindingWorkPolicy: MAJOR at or above $1,500 routes to PROJECT', () => {
  assert.equal(resolveFindingWorkPolicy({ severity: 'MAJOR', estimatedCostCentsHigh: 150_000 }), 'PROJECT');
  assert.equal(resolveFindingWorkPolicy({ severity: 'MAJOR', estimatedCostCentsHigh: 300_000 }), 'PROJECT');
});

test('resolveFindingWorkPolicy: MAJOR below $1,500, MINOR, and MONITOR all route to MAINTENANCE', () => {
  assert.equal(resolveFindingWorkPolicy({ severity: 'MAJOR', estimatedCostCentsHigh: 50_000 }), 'MAINTENANCE');
  assert.equal(resolveFindingWorkPolicy({ severity: 'MAJOR', estimatedCostCentsHigh: null }), 'MAINTENANCE');
  assert.equal(resolveFindingWorkPolicy({ severity: 'MINOR', estimatedCostCentsHigh: null }), 'MAINTENANCE');
  assert.equal(resolveFindingWorkPolicy({ severity: 'MONITOR', estimatedCostCentsHigh: null }), 'MAINTENANCE');
});

// ---- acceptFindingAsWork ----

test('accepting is blocked before the report is CONFIRMED', async () => {
  reset();
  findingFixture({ reportStatus: 'REVIEW_PENDING' });
  await assert.rejects(
    acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1'),
    /REPORT_NOT_CONFIRMED|Confirm the inspection report/,
  );
});

test('accepting a SAFETY finding creates the work item as ACCEPTED, routes to GUIDANCE, and transitions to IN_GUIDANCE', async () => {
  reset();
  findingFixture({ severity: 'SAFETY' });

  const result = await acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1');

  assert.equal(result.policy, 'GUIDANCE');
  assert.equal(result.workItem.state, 'IN_GUIDANCE');
  assert.equal(result.created, true);
  assert.equal(lastGuidanceIngestInput.sourceEntityId, 'finding-1');
  assert.equal(lastGuidanceIngestInput.severity, 'CRITICAL');

  const links = [...workExecutions.values()].filter((e) => e.workItemId === result.workItem.id);
  assert.equal(links.length, 1);
  assert.equal(links[0].executionType, 'GUIDANCE');
  assert.equal(links[0].executionEntityId, 'journey-fake-1');
});

test('accepting a low-cost MAJOR finding routes to MAINTENANCE and creates a task', async () => {
  reset();
  findingFixture({ severity: 'MAJOR', estimatedCostCentsHigh: 40_000 });

  const result = await acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1');

  assert.equal(result.policy, 'MAINTENANCE');
  assert.equal(result.workItem.state, 'ACCEPTED');
  assert.equal(lastMaintenanceCreateInput.data.priority, 'HIGH');

  const links = [...workExecutions.values()].filter((e) => e.workItemId === result.workItem.id);
  assert.equal(links.length, 1);
  assert.equal(links[0].executionType, 'MAINTENANCE_TASK');
  assert.equal(links[0].executionEntityId, 'task-fake-1');
});

test('accepting a high-cost MAJOR finding routes to PROJECT and does not auto-create anything', async () => {
  reset();
  findingFixture({ severity: 'MAJOR', estimatedCostCentsHigh: 300_000 });

  const result = await acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1');

  assert.equal(result.policy, 'PROJECT');
  assert.equal(result.execution, null);
  assert.equal(result.created, false);
  assert.equal(result.workItem.state, 'ACCEPTED');
  assert.equal(workExecutions.size, 0);
});

test('accepting twice is idempotent — the second call returns the existing link, not a new one', async () => {
  reset();
  findingFixture({ severity: 'MINOR' });

  const first = await acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1');
  const executionCountAfterFirst = workExecutions.size;
  const second = await acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1');

  assert.equal(second.workItem.id, first.workItem.id);
  assert.equal(second.created, false);
  assert.equal(workExecutions.size, executionCountAfterFirst, 'no second execution link should be created');
});

test('a finding that is not OPEN cannot be accepted', async () => {
  reset();
  findingFixture({ status: 'DISMISSED' });
  await assert.rejects(
    acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1'),
    /Only an open finding can be accepted/,
  );
});

test('an INFORMATIONAL finding is not eligible for tracked work', async () => {
  reset();
  findingFixture({ severity: 'INFORMATIONAL' });
  await assert.rejects(
    acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1'),
    /not eligible for tracked work/,
  );
});

// ---- dismissFinding work-item close ----

test('dismissing a finding with an existing work item closes it with disposition NOT_RELEVANT', async () => {
  reset();
  findingFixture({ severity: 'MINOR' });
  const accepted = await acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1');
  // Simulate a fresh dismiss on a still-open finding (accept + dismiss are
  // mutually exclusive in the real flow, but the work-item close path only
  // cares that a work item exists — exercise it directly).
  findings.set('finding-1', { ...findings.get('finding-1'), status: 'OPEN' });

  await dismissFinding('finding-1', 'report-1', 'property-1', 'no longer applicable', 'user-1');

  const workItem = workItems.get(accepted.workItem.id);
  assert.equal(workItem.state, 'CLOSED');
  assert.equal(workItem.disposition, 'NOT_RELEVANT');
});

test('dismissing a finding with no work item is a silent no-op', async () => {
  reset();
  findingFixture({ severity: 'MINOR' });
  await assert.doesNotReject(dismissFinding('finding-1', 'report-1', 'property-1', 'reason', 'user-1'));
});

// ---- resolution propagation ----

test('a verified MAINTENANCE_TASK execution resolves its linked finding', async () => {
  reset();
  findingFixture({ severity: 'MINOR' });
  const accepted = await acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1');
  assert.equal(accepted.policy, 'MAINTENANCE');

  await propagateFindingResolutionFromExecution('MAINTENANCE_TASK', 'task-fake-1');

  const workItem = workItems.get(accepted.workItem.id);
  assert.equal(workItem.state, 'VERIFIED');
  const finding = findings.get('finding-1');
  assert.equal(finding.status, 'RESOLVED');
  assert.equal(finding.resolutionMethod, 'CONTRACTOR_WORK');
});

test('a verified GUIDANCE execution resolves its linked finding', async () => {
  reset();
  findingFixture({ severity: 'SAFETY' });
  const accepted = await acceptFindingAsWork('finding-1', 'report-1', 'property-1', 'user-1');
  assert.equal(accepted.policy, 'GUIDANCE');

  await propagateFindingResolutionFromExecution('GUIDANCE', 'journey-fake-1');

  const workItem = workItems.get(accepted.workItem.id);
  assert.equal(workItem.state, 'VERIFIED');
  assert.equal(findings.get('finding-1').status, 'RESOLVED');
});

test('an execution with no linked FINDING-subject work item is a no-op', async () => {
  reset();
  await assert.doesNotReject(propagateFindingResolutionFromExecution('MAINTENANCE_TASK', 'unrelated-task'));
});

test('propagation does not re-verify or re-resolve an already-verified work item', async () => {
  reset();
  findingFixture({ severity: 'MINOR', status: 'RESOLVED' });
  const workKey = resolveInspectionFindingWorkKey('finding-1', 'property-1');
  const workItem = { id: 'wi-1', propertyId: 'property-1', workKey, subjectType: 'FINDING', subjectId: 'finding-1', state: 'VERIFIED', acceptanceState: 'ACCEPTED', disposition: null };
  workItems.set(workItem.id, workItem);
  workExecutions.set('link-1', { id: 'link-1', workItemId: workItem.id, executionType: 'MAINTENANCE_TASK', executionEntityId: 'task-x', role: 'PRIMARY' });

  await propagateFindingResolutionFromExecution('MAINTENANCE_TASK', 'task-x');

  // No error, and the finding (already RESOLVED by a prior run) is untouched.
  assert.equal(findings.get('finding-1').status, 'RESOLVED');
});
