// apps/workers/tests/unit/reserveFundReconciliationJob.test.js
//
// W3 (financial) — duplicate suppression: reconciliation suggestions are
// computed live, never persisted, so the same still-open suggestion set
// used to re-notify the homeowner every single weekly run indefinitely
// until manually accepted. reserveFundReconciliationJob now stamps a
// fingerprint of the current suggestion set on HomeReserveFund and only
// notifies again when that set actually changes.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The job file's real (unmocked) imports include NotificationService, which
// transitively opens real BullMQ/Redis connections at module-load time —
// those connections don't self-close, so a bare top-level `require()` of
// the job file before mocks are installed would hang the whole test run.
// Install the same stubs loadJob() uses below *before* the first require,
// so even the pure-function tests load the job file safely.
function installMocks() {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  if (!require.cache[prismaPath]) {
    require.cache[prismaPath] = {
      id: prismaPath,
      filename: prismaPath,
      loaded: true,
      exports: { prisma: { homeReserveFund: { findMany: async () => [], update: async () => ({}) } } },
    };
  }

  const reconciliationServicePath = require.resolve('../../../backend/src/services/homeReserveFundReconciliation.service.ts');
  if (!require.cache[reconciliationServicePath]) {
    require.cache[reconciliationServicePath] = {
      id: reconciliationServicePath,
      filename: reconciliationServicePath,
      loaded: true,
      exports: { homeReserveFundReconciliationService: { findMatchSuggestions: async () => [] } },
    };
  }

  const notificationServicePath = require.resolve('../../../backend/src/services/notification.service.ts');
  if (!require.cache[notificationServicePath]) {
    require.cache[notificationServicePath] = {
      id: notificationServicePath,
      filename: notificationServicePath,
      loaded: true,
      exports: { NotificationService: { create: async () => null } },
    };
  }

  const contextServicePath = require.resolve('../../../backend/src/services/financialContext/reserveFundWorkerContext.service.ts');
  if (!require.cache[contextServicePath]) {
    require.cache[contextServicePath] = {
      id: contextServicePath,
      filename: contextServicePath,
      loaded: true,
      exports: { checkReserveFundWorkerContext: async () => ({ allowed: true }) },
    };
  }
}
installMocks();

const { fingerprintSuggestions } = require('../../src/jobs/reserveFundReconciliation.job.ts');

function suggestion(overrides = {}) {
  return {
    lineItemId: 'line-1',
    timelineItemId: 'timeline-1',
    category: 'ROOF',
    targetCostCents: 100000,
    expenseId: 'expense-1',
    expenseDescription: 'Roof repair',
    expenseAmount: 950,
    expenseDate: new Date('2026-06-01'),
    ...overrides,
  };
}

test('fingerprintSuggestions is stable regardless of input order', () => {
  const a = fingerprintSuggestions([suggestion({ lineItemId: 'line-1' }), suggestion({ lineItemId: 'line-2', expenseId: 'expense-2' })]);
  const b = fingerprintSuggestions([suggestion({ lineItemId: 'line-2', expenseId: 'expense-2' }), suggestion({ lineItemId: 'line-1' })]);
  assert.equal(a, b);
});

test('fingerprintSuggestions changes when the suggestion set changes', () => {
  const before = fingerprintSuggestions([suggestion()]);
  const after = fingerprintSuggestions([suggestion(), suggestion({ lineItemId: 'line-2', expenseId: 'expense-2' })]);
  assert.notEqual(before, after);
});

function loadJob({ funds, suggestionsByProperty = {}, contextAllowed = true }) {
  const createCalls = [];
  const updateCalls = [];

  const prismaMock = {
    homeReserveFund: {
      findMany: async () => funds,
      update: async (args) => {
        updateCalls.push(args);
        return {};
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const reconciliationServicePath = require.resolve('../../../backend/src/services/homeReserveFundReconciliation.service.ts');
  require.cache[reconciliationServicePath] = {
    id: reconciliationServicePath,
    filename: reconciliationServicePath,
    loaded: true,
    exports: {
      homeReserveFundReconciliationService: {
        findMatchSuggestions: async (propertyId) => suggestionsByProperty[propertyId] ?? [],
      },
    },
  };

  const notificationServicePath = require.resolve('../../../backend/src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: {
      NotificationService: {
        create: async (input) => {
          createCalls.push(input);
          return { id: 'notification-1' };
        },
      },
    },
  };

  const contextServicePath = require.resolve('../../../backend/src/services/financialContext/reserveFundWorkerContext.service.ts');
  require.cache[contextServicePath] = {
    id: contextServicePath,
    filename: contextServicePath,
    loaded: true,
    exports: {
      checkReserveFundWorkerContext: async () => (contextAllowed ? { allowed: true } : { allowed: false, reasonCodes: ['TEST'] }),
    },
  };

  const jobPath = require.resolve('../../src/jobs/reserveFundReconciliation.job.ts');
  delete require.cache[jobPath];
  return {
    job: require(jobPath),
    getCreateCalls: () => createCalls,
    getUpdateCalls: () => updateCalls,
  };
}

function fund(overrides = {}) {
  return {
    propertyId: 'property-1',
    reconciliationNotifiedFingerprint: null,
    homeownerProfile: { userId: 'user-1' },
    ...overrides,
  };
}

test('notifies and stamps a fingerprint the first time suggestions appear', async () => {
  const { job, getCreateCalls, getUpdateCalls } = loadJob({
    funds: [fund()],
    suggestionsByProperty: { 'property-1': [suggestion()] },
  });

  await job.reserveFundReconciliationJob();

  assert.equal(getCreateCalls().length, 1);
  assert.equal(getCreateCalls()[0].category, 'GENERAL');
  assert.equal(getCreateCalls()[0].urgency, 'ROUTINE');
  assert.equal(getUpdateCalls().length, 1);
  assert.equal(getUpdateCalls()[0].data.reconciliationNotifiedFingerprint, fingerprintSuggestions([suggestion()]));
});

test('does NOT re-notify when the same suggestion set persists across runs (regression guard)', async () => {
  const existingFingerprint = fingerprintSuggestions([suggestion()]);
  const { job, getCreateCalls, getUpdateCalls } = loadJob({
    funds: [fund({ reconciliationNotifiedFingerprint: existingFingerprint })],
    suggestionsByProperty: { 'property-1': [suggestion()] },
  });

  await job.reserveFundReconciliationJob();

  assert.equal(getCreateCalls().length, 0, 'must not re-notify for the same still-open suggestion set');
  assert.equal(getUpdateCalls().length, 0);
});

test('re-notifies when the suggestion set changes (a new suggestion appears)', async () => {
  const oldFingerprint = fingerprintSuggestions([suggestion()]);
  const { job, getCreateCalls } = loadJob({
    funds: [fund({ reconciliationNotifiedFingerprint: oldFingerprint })],
    suggestionsByProperty: {
      'property-1': [suggestion(), suggestion({ lineItemId: 'line-2', expenseId: 'expense-2' })],
    },
  });

  await job.reserveFundReconciliationJob();

  assert.equal(getCreateCalls().length, 1);
});

test('does not notify when there are no suggestions', async () => {
  const { job, getCreateCalls, getUpdateCalls } = loadJob({
    funds: [fund()],
    suggestionsByProperty: {},
  });

  await job.reserveFundReconciliationJob();

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 0);
});
