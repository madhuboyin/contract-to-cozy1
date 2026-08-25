const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-005) —
// applyWriteBacks now emits a PropertyChange (and, by extension, requests
// recomputation) when it confirms a report — the transition that makes
// every finding homeowner-trusted (loadInspectionFindingActions and the
// rest of inspectionHub.service.ts gate on report.status === 'CONFIRMED').
// Found missing by an independent review of the Phase 5 "complete" claim;
// this pins the fix.
//
// Findings use homeSystem 'INTERIOR' deliberately: it's absent from both
// SYSTEM_TO_TWIN_TYPE and PERMIT_WORK_TYPES_BY_SYSTEM, so updateDigitalTwin
// and createPermitFlag both early-return before touching prisma — letting
// this test exercise the specific transaction this fix added without
// needing to mock the pre-existing, already-untested digital-twin/permit
// write-back machinery this fix does not change.

let reportForFind = null;

const txMock = {
  inspectionReport: { update: async () => ({}) },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      inspectionReport: { findUnique: async () => reportForFind },
      inspectionWriteBack: { createMany: async () => ({ count: 0 }), create: async () => ({}) },
      $transaction: async (fn) => fn(txMock),
    },
  },
};

const propertyChangeCalls = [];
const propertyChangePath = require.resolve('../../src/propertyChanges/propertyChange.service.ts');
require.cache[propertyChangePath] = {
  id: propertyChangePath,
  filename: propertyChangePath,
  loaded: true,
  exports: {
    emitPropertyChangeWithTransaction: async (_tx, input) => {
      propertyChangeCalls.push(input);
      return { change: { id: `change-${propertyChangeCalls.length}`, ...input }, deduped: false };
    },
  },
};

const adapterPath = require.resolve('../../src/modules/homeOperations/adapters/inspectionFinding.adapter.ts');
require.cache[adapterPath] = {
  id: adapterPath,
  filename: adapterPath,
  loaded: true,
  exports: {
    // null: no candidate work proposed, so resolveAndUpsertWorkItem is
    // never reached — out of scope for this fix.
    inspectionFindingSourceAdapter: { propose: () => null },
  },
};

const { applyWriteBacks } = require('../../src/services/inspectionWriteBack.service.ts');

function report(overrides = {}) {
  return {
    id: 'report-1',
    propertyId: 'property-1',
    status: 'REVIEW_PENDING',
    findings: [],
    ...overrides,
  };
}

test('confirming a report with no findings still emits a PropertyChange referencing the report', async () => {
  reportForFind = report();
  propertyChangeCalls.length = 0;

  await applyWriteBacks('report-1', 'property-1', 'user-1');

  assert.equal(propertyChangeCalls.length, 1);
  const call = propertyChangeCalls[0];
  assert.equal(call.propertyId, 'property-1');
  assert.equal(call.sourceType, 'DOCUMENT');
  assert.equal(call.sourceEntityId, 'report-1');
  assert.equal(call.changeType, 'SOURCE_LIFECYCLE_CHANGED');
  assert.deepEqual(call.canonicalReferences, [{ entityType: 'INSPECTION_REPORT', entityId: 'report-1' }]);
  assert.equal(call.signals.urgentSafetyCondition, false);
});

test('confirming a report with a SAFETY finding marks the change urgentSafetyCondition', async () => {
  reportForFind = report({
    findings: [{ id: 'finding-1', homeSystem: 'INTERIOR', severity: 'SAFETY', status: 'OPEN' }],
  });
  propertyChangeCalls.length = 0;

  await applyWriteBacks('report-1', 'property-1', 'user-1');

  assert.equal(propertyChangeCalls.length, 1);
  assert.equal(propertyChangeCalls[0].signals.urgentSafetyCondition, true);
  assert.deepEqual(propertyChangeCalls[0].changedFactKeys, ['inspection.interior']);
  assert.ok(propertyChangeCalls[0].canonicalReferences.some((ref) => ref.entityType === 'INSPECTION_FINDING' && ref.entityId === 'finding-1'));
});

test('a report already CONFIRMED refuses to re-confirm, so no second PropertyChange is emitted', async () => {
  reportForFind = report({ status: 'CONFIRMED' });
  propertyChangeCalls.length = 0;

  await assert.rejects(
    applyWriteBacks('report-1', 'property-1', 'user-1'),
    (err) => err.code === 'ALREADY_CONFIRMED',
  );
  assert.equal(propertyChangeCalls.length, 0);
});
