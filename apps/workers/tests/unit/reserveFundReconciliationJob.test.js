// apps/workers/tests/unit/reserveFundReconciliationJob.test.js
//
// W3 (financial) — duplicate suppression: reconciliation suggestions are
// computed live, never persisted, so the same still-open suggestion set
// used to re-notify the homeowner every single weekly run indefinitely
// until manually accepted. reserveFundReconciliationJob now stamps a
// fingerprint of the current suggestion set on HomeReserveFund and only
// notifies again when that set actually changes.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { fingerprintSuggestions, reserveFundReconciliationJob } = require('../../src/jobs/reserveFundReconciliation.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

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

function fakeDeps({ funds, suggestionsByProperty = {}, contextAllowed = true }) {
  const createCalls = [];
  const updateCalls = [];

  const deps = {
    prisma: {
      homeReserveFund: {
        findMany: async () => funds,
        update: async (args) => {
          updateCalls.push(args);
          return {};
        },
      },
    },
    homeReserveFundReconciliationService: {
      findMatchSuggestions: async (propertyId) => suggestionsByProperty[propertyId] ?? [],
    },
    notificationService: {
      create: async (input) => {
        createCalls.push(input);
        return { id: 'notification-1' };
      },
    },
    logger: noopLogger,
    checkReserveFundWorkerContext: async () => (contextAllowed ? { allowed: true } : { allowed: false, reasonCodes: ['TEST'] }),
  };
  return { deps, getCreateCalls: () => createCalls, getUpdateCalls: () => updateCalls };
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
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({
    funds: [fund()],
    suggestionsByProperty: { 'property-1': [suggestion()] },
  });

  await reserveFundReconciliationJob(deps);

  assert.equal(getCreateCalls().length, 1);
  assert.equal(getCreateCalls()[0].category, 'GENERAL');
  assert.equal(getCreateCalls()[0].urgency, 'ROUTINE');
  assert.equal(getUpdateCalls().length, 1);
  assert.equal(getUpdateCalls()[0].data.reconciliationNotifiedFingerprint, fingerprintSuggestions([suggestion()]));
});

test('does NOT re-notify when the same suggestion set persists across runs (regression guard)', async () => {
  const existingFingerprint = fingerprintSuggestions([suggestion()]);
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({
    funds: [fund({ reconciliationNotifiedFingerprint: existingFingerprint })],
    suggestionsByProperty: { 'property-1': [suggestion()] },
  });

  await reserveFundReconciliationJob(deps);

  assert.equal(getCreateCalls().length, 0, 'must not re-notify for the same still-open suggestion set');
  assert.equal(getUpdateCalls().length, 0);
});

test('re-notifies when the suggestion set changes (a new suggestion appears)', async () => {
  const oldFingerprint = fingerprintSuggestions([suggestion()]);
  const { deps, getCreateCalls } = fakeDeps({
    funds: [fund({ reconciliationNotifiedFingerprint: oldFingerprint })],
    suggestionsByProperty: {
      'property-1': [suggestion(), suggestion({ lineItemId: 'line-2', expenseId: 'expense-2' })],
    },
  });

  await reserveFundReconciliationJob(deps);

  assert.equal(getCreateCalls().length, 1);
});

test('does not notify when there are no suggestions', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({
    funds: [fund()],
    suggestionsByProperty: {},
  });

  await reserveFundReconciliationJob(deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 0);
});
