const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Material Specs evidence → PropertyRecordLink migration (Slice 5), the
// item explicitly flagged earlier this session as too risky for a single
// pass — full replacement of the legacy *DocumentIds fields would mean
// deciding whether Material Specs evidence uploads stop creating legacy
// Document rows entirely, which needs live DB testing this environment
// doesn't have. Instead: additive. The legacy Document-id array fields on
// MaterialSpec are completely untouched — every existing gate still
// honors them first, so a spec that only ever used them behaves exactly
// as before. What's new: a real Home Record linked via
// PropertyRecordLink (entityType: MATERIAL_SPEC) with a purpose matching
// the evidence category (SOURCE/APPROVAL/EVIDENCE/RECEIPT) can now ALSO
// satisfy the same requirement — these tests lock down both the
// regression-safety and the new capability.

let specForBelongs = null;
let documentCountResult = 0;
let linkedLinksForSpec = [];
const materialSpecUpdateCalls = [];
const lifecycleEventCreateCalls = [];
const homeEventCreateCalls = [];

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      materialSpec: {
        findFirst: async () => specForBelongs,
      },
      document: {
        count: async () => documentCountResult,
      },
      propertyRecordLink: {
        findMany: async () => linkedLinksForSpec,
      },
      $transaction: async (fn) => fn({
        materialSpec: {
          update: async (args) => {
            materialSpecUpdateCalls.push(args);
            return { id: 'spec-1', ...specForBelongs, ...args.data };
          },
        },
        materialLifecycleEvent: {
          create: async (args) => { lifecycleEventCreateCalls.push(args); return { id: 'lifecycle-event-1', ...args.data }; },
        },
        homeEvent: {
          create: async (args) => { homeEventCreateCalls.push(args); return { id: 'home-event-1', ...args.data }; },
        },
      }),
    },
  },
};

const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');
const service = new MaterialSpecService();

function baseSpec(overrides = {}) {
  return {
    id: 'spec-1',
    propertyId: 'property-1',
    lifecycleStatus: 'PROPOSED',
    submittalDocumentIds: [],
    approvalDocumentIds: [],
    receiptDocumentId: null,
    warrantyDocumentId: null,
    manualDocumentId: null,
    manufacturer: 'Sherwin-Williams',
    productName: 'Emerald',
    sku: 'SW-7008',
    colorCode: null,
    lotBatch: null,
    permitAttributeCheck: 'NOT_CONFIGURED',
    hoaAttributeCheck: 'NOT_CONFIGURED',
    complianceRelevance: null,
    projectId: null,
    label: 'Kitchen wall paint',
    ...overrides,
  };
}

function resetCalls() {
  materialSpecUpdateCalls.length = 0;
  lifecycleEventCreateCalls.length = 0;
  homeEventCreateCalls.length = 0;
}

test('APPROVED: legacy document arrays alone still satisfy the gate (regression safety)', async () => {
  specForBelongs = baseSpec({ submittalDocumentIds: ['doc-1'] });
  linkedLinksForSpec = [];
  documentCountResult = 1;
  resetCalls();

  await service.transitionLifecycle('property-1', 'spec-1', 'user-1', {
    toStatus: 'APPROVED',
    evidenceDocumentIds: [],
    approvalDocumentIds: ['doc-2'],
    notes: 'Approved by HOA.',
  });

  assert.equal(materialSpecUpdateCalls.length, 1);
});

test('APPROVED: a linked Home Record (SOURCE + APPROVAL purpose) satisfies the gate with zero legacy document IDs', async () => {
  specForBelongs = baseSpec({ submittalDocumentIds: [] });
  linkedLinksForSpec = [{ purpose: 'SOURCE' }, { purpose: 'APPROVAL' }];
  documentCountResult = 0;
  resetCalls();

  await service.transitionLifecycle('property-1', 'spec-1', 'user-1', {
    toStatus: 'APPROVED',
    evidenceDocumentIds: [],
    approvalDocumentIds: [],
    notes: 'Approved — evidence linked from Home Records.',
  });

  assert.equal(materialSpecUpdateCalls.length, 1);
});

test('APPROVED: neither legacy documents nor a linked Home Record — still blocked', async () => {
  specForBelongs = baseSpec({ submittalDocumentIds: [] });
  linkedLinksForSpec = [];
  documentCountResult = 0;

  await assert.rejects(
    service.transitionLifecycle('property-1', 'spec-1', 'user-1', {
      toStatus: 'APPROVED',
      evidenceDocumentIds: [],
      approvalDocumentIds: [],
      notes: 'Nothing attached.',
    }),
    (error) => error.code === 'MATERIAL_APPROVAL_EVIDENCE_REQUIRED',
  );
});

test('APPROVED: a SOURCE-purpose link alone (no APPROVAL link, no legacy approval docs) is still blocked', async () => {
  specForBelongs = baseSpec({ submittalDocumentIds: [] });
  linkedLinksForSpec = [{ purpose: 'SOURCE' }];
  documentCountResult = 0;

  await assert.rejects(
    service.transitionLifecycle('property-1', 'spec-1', 'user-1', {
      toStatus: 'APPROVED',
      evidenceDocumentIds: [],
      approvalDocumentIds: [],
      notes: 'Only submittal linked, no approval.',
    }),
    (error) => error.code === 'MATERIAL_APPROVAL_EVIDENCE_REQUIRED',
  );
});

test('INSTALLED: a linked Home Record (EVIDENCE purpose) satisfies the gate with zero legacy document IDs', async () => {
  specForBelongs = baseSpec({ lifecycleStatus: 'APPROVED' });
  linkedLinksForSpec = [{ purpose: 'EVIDENCE' }];
  documentCountResult = 0;
  resetCalls();

  await service.transitionLifecycle('property-1', 'spec-1', 'user-1', {
    toStatus: 'INSTALLED',
    evidenceDocumentIds: [],
    quantityInstalled: '12 gallons',
    notes: 'Installed, evidence linked from Home Records.',
  });

  assert.equal(materialSpecUpdateCalls.length, 1);
});

test('INSTALLED: no evidence at all (legacy or linked) is still blocked even with a quantity given', async () => {
  specForBelongs = baseSpec({ lifecycleStatus: 'APPROVED' });
  linkedLinksForSpec = [];
  documentCountResult = 0;

  await assert.rejects(
    service.transitionLifecycle('property-1', 'spec-1', 'user-1', {
      toStatus: 'INSTALLED',
      evidenceDocumentIds: [],
      quantityInstalled: '12 gallons',
      notes: 'No evidence anywhere.',
    }),
    (error) => error.code === 'MATERIAL_INSTALLATION_EVIDENCE_REQUIRED',
  );
});

test('AS_BUILT: linked EVIDENCE + RECEIPT purposes satisfy the gate with zero legacy document IDs, and still creates the real Timeline HomeEvent', async () => {
  specForBelongs = baseSpec({ lifecycleStatus: 'INSTALLED', installedAt: new Date('2026-06-01T00:00:00.000Z') });
  linkedLinksForSpec = [{ purpose: 'EVIDENCE' }, { purpose: 'RECEIPT' }];
  documentCountResult = 0;
  resetCalls();

  await service.transitionLifecycle('property-1', 'spec-1', 'user-1', {
    toStatus: 'AS_BUILT',
    evidenceDocumentIds: [],
    receiptDocumentId: undefined,
    quantityRemaining: '0',
    notes: 'Verified as-built — evidence and receipt both linked from Home Records.',
  });

  assert.equal(materialSpecUpdateCalls.length, 1);
  assert.equal(homeEventCreateCalls.length, 1);
  assert.equal(homeEventCreateCalls[0].data.sourceEntityType, 'MATERIAL_SPEC');
});

test('AS_BUILT: a linked EVIDENCE purpose alone, with no RECEIPT link and no legacy receiptDocumentId, is still blocked', async () => {
  specForBelongs = baseSpec({ lifecycleStatus: 'INSTALLED' });
  linkedLinksForSpec = [{ purpose: 'EVIDENCE' }];
  documentCountResult = 0;

  await assert.rejects(
    service.transitionLifecycle('property-1', 'spec-1', 'user-1', {
      toStatus: 'AS_BUILT',
      evidenceDocumentIds: [],
      receiptDocumentId: undefined,
      quantityRemaining: '0',
      notes: 'No receipt anywhere.',
    }),
    (error) => error.code === 'MATERIAL_AS_BUILT_EVIDENCE_REQUIRED',
  );
});
