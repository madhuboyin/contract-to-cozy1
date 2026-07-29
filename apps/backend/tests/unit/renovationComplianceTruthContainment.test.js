'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ContractorLicenseRequirementStatus,
  PermitRequirementStatus,
} = require('@prisma/client');
const {
  getComplianceTaskRequirements,
} = require('../../dist/homeRenovationAdvisor/integrations/complianceTaskPolicy');

test('advisor compliance policy exhaustively maps every persisted permit status', () => {
  const expected = {
    REQUIRED: true,
    LIKELY_REQUIRED: true,
    NOT_REQUIRED: false,
    LIKELY_NOT_REQUIRED: false,
    UNKNOWN: false,
    DATA_UNAVAILABLE: false,
  };

  assert.deepEqual(
    Object.fromEntries(
      Object.values(PermitRequirementStatus).map((permitStatus) => [
        permitStatus,
        getComplianceTaskRequirements(
          permitStatus,
          ContractorLicenseRequirementStatus.NOT_REQUIRED,
        ).needsPermitTask,
      ]),
    ),
    expected,
  );
});

test('advisor compliance policy exhaustively maps every persisted licensing status', () => {
  const expected = {
    REQUIRED: true,
    MAY_BE_REQUIRED: true,
    NOT_REQUIRED: false,
    UNKNOWN: false,
    DATA_UNAVAILABLE: false,
  };

  assert.deepEqual(
    Object.fromEntries(
      Object.values(ContractorLicenseRequirementStatus).map((licensingStatus) => [
        licensingStatus,
        getComplianceTaskRequirements(
          PermitRequirementStatus.NOT_REQUIRED,
          licensingStatus,
        ).needsLicensingTask,
      ]),
    ),
    expected,
  );
});

test('advisor integration creates follow-up tasks from persisted enum values', async () => {
  require('ts-node/register');

  const createdTasks = [];
  const taskServicePath = require.resolve('../../src/services/PropertyMaintenanceTask.service.ts');
  require.cache[taskServicePath] = {
    id: taskServicePath,
    filename: taskServicePath,
    loaded: true,
    exports: {
      PropertyMaintenanceTaskService: {
        createFromActionCenter: async (...args) => {
          createdTasks.push(args);
        },
      },
    },
  };

  const integrationPath = require.resolve(
    '../../src/homeRenovationAdvisor/integrations/advisorIntegration.service.ts',
  );
  delete require.cache[integrationPath];
  const { runPostEvaluationIntegrations } = require(integrationPath);

  const session = {
    id: 'advisor-session-1',
    propertyId: 'property-1',
    createdByUserId: 'user-1',
    renovationType: 'BATHROOM_FULL_REMODEL',
  };
  const output = {
    permit: { requirementStatus: PermitRequirementStatus.LIKELY_REQUIRED },
    licensing: { requirementStatus: ContractorLicenseRequirementStatus.NOT_REQUIRED },
    overallRiskLevel: 'LOW',
    overallSummary: 'Verify local requirements before work starts.',
  };

  await runPostEvaluationIntegrations(session, output);
  assert.equal(createdTasks.length, 1);
  assert.match(createdTasks[0][2].description, /building permit/i);

  output.permit.requirementStatus = PermitRequirementStatus.NOT_REQUIRED;
  output.licensing.requirementStatus = ContractorLicenseRequirementStatus.MAY_BE_REQUIRED;
  await runPostEvaluationIntegrations(session, output);
  assert.equal(createdTasks.length, 2);
  assert.match(createdTasks[1][2].description, /contractor licensing/i);

  output.licensing.requirementStatus = ContractorLicenseRequirementStatus.NOT_REQUIRED;
  await runPostEvaluationIntegrations(session, output);
  assert.equal(createdTasks.length, 2, 'non-actionable low-risk results create no task');
});

test('local permit milestones never auto-final official permit status', async () => {
  require('ts-node/register');

  const calls = {
    permitUpdates: [],
    homeEvents: [],
  };
  const prismaMock = {
    permitInspectionMilestone: {
      findFirst: async () => ({
        id: 'milestone-1',
        status: 'SCHEDULED',
      }),
      update: async ({ data }) => ({
        id: 'milestone-1',
        ...data,
        scheduledDate: null,
        inspectedDate: new Date('2026-07-29T12:00:00.000Z'),
      }),
      count: async () => 0,
    },
    propertyPermitRecord: {
      update: async (args) => {
        calls.permitUpdates.push(args);
      },
      findUnique: async () => ({ permitNumber: 'P-100' }),
    },
    homeEvent: {
      create: async (args) => {
        calls.homeEvents.push(args);
        return { id: 'event-1' };
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

  const queuePath = require.resolve('../../src/services/JobQueue.service.ts');
  require.cache[queuePath] = {
    id: queuePath,
    filename: queuePath,
    loaded: true,
    exports: { getGeneratePermitDisclosureQueue: () => ({}) },
  };

  const presignPath = require.resolve('../../src/services/storage/presign.ts');
  require.cache[presignPath] = {
    id: presignPath,
    filename: presignPath,
    loaded: true,
    exports: { presignGetObject: async () => '' },
  };

  const servicePath = require.resolve('../../src/services/permitTracker.service.ts');
  delete require.cache[servicePath];
  const { permitTrackerService } = require(servicePath);

  await permitTrackerService.updateInspectionMilestone(
    'milestone-1',
    'permit-1',
    'property-1',
    { status: 'PASSED' },
  );

  assert.equal(calls.permitUpdates.length, 0, 'official permit state must remain unchanged');
  assert.equal(calls.homeEvents.length, 1);
  assert.equal(
    calls.homeEvents[0].data.meta.officialStatusChanged,
    false,
  );
  assert.match(calls.homeEvents[0].data.summary, /official status has not changed/i);
  assert.doesNotMatch(calls.homeEvents[0].data.summary, /permit closed out/i);
});
