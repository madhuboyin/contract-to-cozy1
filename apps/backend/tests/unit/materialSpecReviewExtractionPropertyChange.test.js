const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-005) —
// reviewExtraction now emits a PropertyChange whenever a CONFIRM actually
// applies fields to the canonical MaterialSpec. Found missing by an
// independent review of the Phase 5 "complete" claim; this pins the fix.

let specForFind = { id: 'spec-1', propertyId: 'property-1', lifecycleStatus: 'SPECIFIED', projectId: null };
let reviewForFind = { id: 'review-1', materialSpecId: 'spec-1', propertyId: 'property-1', status: 'NEEDS_REVIEW', sourceDocumentId: null };

const txMock = {
  materialSpec: { update: async () => ({}) },
  materialLifecycleEvent: { create: async () => ({}) },
  materialExtractionReview: { update: async (args) => ({ ...reviewForFind, ...args.data }) },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      materialSpec: { findFirst: async () => specForFind },
      materialExtractionReview: { findFirst: async () => reviewForFind },
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

const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');
const service = new MaterialSpecService();

test('confirming an extraction review with applied fields emits a PropertyChange', async () => {
  propertyChangeCalls.length = 0;

  await service.reviewExtraction('property-1', 'spec-1', 'review-1', 'user-1', {
    status: 'CONFIRMED',
    reviewedFields: { manufacturer: 'Sherwin-Williams', colorCode: 'SW 7008' },
    reviewNotes: 'Matches the can label.',
  });

  assert.equal(propertyChangeCalls.length, 1);
  const call = propertyChangeCalls[0];
  assert.equal(call.propertyId, 'property-1');
  assert.equal(call.sourceType, 'DOCUMENT');
  assert.equal(call.sourceEntityId, 'review-1');
  assert.equal(call.changeType, 'SOURCE_LIFECYCLE_CHANGED');
  assert.deepEqual(call.changedFactKeys.sort(), ['materialSpec.colorCode', 'materialSpec.manufacturer']);
  assert.ok(call.canonicalReferences.some((ref) => ref.entityType === 'MATERIAL_SPEC' && ref.entityId === 'spec-1'));
});

test('confirming with no applicable reviewed fields does not emit a PropertyChange', async () => {
  propertyChangeCalls.length = 0;

  await service.reviewExtraction('property-1', 'spec-1', 'review-1', 'user-1', {
    status: 'CONFIRMED',
    reviewedFields: {},
    reviewNotes: 'Nothing usable on the label.',
  });

  assert.equal(propertyChangeCalls.length, 0);
});

test('rejecting an extraction review does not emit a PropertyChange', async () => {
  propertyChangeCalls.length = 0;

  await service.reviewExtraction('property-1', 'spec-1', 'review-1', 'user-1', {
    status: 'REJECTED',
    reviewNotes: 'Extraction was wrong.',
  });

  assert.equal(propertyChangeCalls.length, 0);
});
