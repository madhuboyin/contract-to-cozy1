const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence FRD §15 Phase 5 remediation item (d) — pins the
// hardening of InventoryDraftService's confirmDraftToInventoryItem/
// bulkConfirm into the registered HI-DOC-003 promotion adapter: both are
// now transactional, carry durable OCR provenance (sourceOcrSessionId), and
// emit a PropertyChange (HI-DOC-005). Also pins the createDraftFromOcr fix:
// the OCR session id must land in the `sessionId` FK (-> InventoryOcrSession),
// not `scanSessionId` (a real, unrelated FK -> InventoryRoomScanSession).
// This service had zero prior test coverage.

let draftForFind = null;
let draftsForFindMany = [];
const itemCreateCalls = [];
const draftUpdateCalls = [];
const propertyChangeCalls = [];
const lifespanRecalcCalls = [];

const txMock = {
  inventoryItem: {
    create: async (args) => {
      itemCreateCalls.push(args.data);
      return { id: `item-${itemCreateCalls.length}`, ...args.data };
    },
  },
  inventoryDraftItem: {
    update: async (args) => { draftUpdateCalls.push(args); return { id: args.where.id, ...args.data }; },
    findMany: async () => draftsForFindMany,
  },
};

const prismaMock = {
  inventoryDraftItem: {
    findFirst: async () => draftForFind,
  },
  $transaction: async (fn) => fn(txMock),
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

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

const oraclePath = require.resolve('../../src/services/applianceOracle.service.ts');
require.cache[oraclePath] = {
  id: oraclePath,
  filename: oraclePath,
  loaded: true,
  exports: {
    applianceOracleService: {
      recalculateLifespan: async (itemId) => { lifespanRecalcCalls.push(itemId); },
    },
  },
};

const { InventoryDraftService } = require('../../src/services/inventoryDraft.service.ts');
const service = new InventoryDraftService();

function draft(overrides = {}) {
  return {
    id: 'draft-1',
    propertyId: 'property-1',
    userId: 'user-1',
    sessionId: 'ocr-session-1',
    status: 'DRAFT',
    name: null,
    category: null,
    condition: null,
    brand: null,
    model: null,
    serialNo: null,
    manufacturer: 'Rheem',
    modelNumber: 'RH-100',
    serialNumber: 'SN-123',
    upc: null,
    sku: null,
    roomId: null,
    ...overrides,
  };
}

test('confirmDraftToInventoryItem creates the item, marks the draft CONFIRMED, and emits a PropertyChange in one transaction', async () => {
  draftForFind = draft();
  itemCreateCalls.length = 0;
  draftUpdateCalls.length = 0;
  propertyChangeCalls.length = 0;
  lifespanRecalcCalls.length = 0;

  const item = await service.confirmDraftToInventoryItem('property-1', 'user-1', 'draft-1');

  assert.equal(itemCreateCalls.length, 1);
  assert.equal(itemCreateCalls[0].sourceOcrSessionId, 'ocr-session-1', 'durable OCR provenance must be set on the created item');
  assert.equal(itemCreateCalls[0].verificationSource, 'OCR_LABEL');
  assert.equal(draftUpdateCalls.length, 1);
  assert.equal(draftUpdateCalls[0].data.status, 'CONFIRMED');

  assert.equal(propertyChangeCalls.length, 1);
  const call = propertyChangeCalls[0];
  assert.equal(call.propertyId, 'property-1');
  assert.equal(call.sourceType, 'DOCUMENT');
  assert.equal(call.sourceEntityId, 'draft-1');
  assert.equal(call.changeType, 'SOURCE_LIFECYCLE_CHANGED');
  assert.deepEqual(call.changedFactKeys, ['inventory.items']);
  assert.ok(call.canonicalReferences.some((ref) => ref.entityType === 'INVENTORY_ITEM' && ref.entityId === item.id));

  assert.deepEqual(lifespanRecalcCalls, [item.id]);
});

test('confirmDraftToInventoryItem rejects a draft that is not in DRAFT state, with no side effects', async () => {
  draftForFind = draft({ status: 'CONFIRMED' });
  itemCreateCalls.length = 0;
  propertyChangeCalls.length = 0;

  await assert.rejects(
    service.confirmDraftToInventoryItem('property-1', 'user-1', 'draft-1'),
    (err) => err.code === 'DRAFT_NOT_CONFIRMABLE',
  );
  assert.equal(itemCreateCalls.length, 0);
  assert.equal(propertyChangeCalls.length, 0);
});

test('bulkConfirm brings every confirmed draft to the same provenance/PropertyChange parity as the single-confirm path', async () => {
  draftsForFindMany = [
    draft({ id: 'draft-a', sessionId: 'ocr-session-a', manufacturer: 'GE' }),
    draft({ id: 'draft-b', sessionId: 'ocr-session-b', manufacturer: 'LG' }),
  ];
  itemCreateCalls.length = 0;
  draftUpdateCalls.length = 0;
  propertyChangeCalls.length = 0;

  const result = await service.bulkConfirm('property-1', 'user-1', ['draft-a', 'draft-b']);

  assert.equal(result.created, 2);
  assert.equal(itemCreateCalls.length, 2);
  assert.deepEqual(itemCreateCalls.map((data) => data.sourceOcrSessionId), ['ocr-session-a', 'ocr-session-b']);
  assert.ok(itemCreateCalls.every((data) => data.verificationSource === 'OCR_LABEL' && data.isVerified === true));
  assert.equal(propertyChangeCalls.length, 2);
  assert.deepEqual(propertyChangeCalls.map((call) => call.sourceEntityId), ['draft-a', 'draft-b']);
});

// Pins the createDraftFromOcr fix directly: the OCR session id must be
// written to `sessionId` (FK -> InventoryOcrSession), never `scanSessionId`
// (FK -> the unrelated InventoryRoomScanSession) — the previous code wrote
// it to the wrong column, which a real Postgres FK constraint would reject.
test('createDraftFromOcr writes the OCR session id to sessionId, not scanSessionId', async () => {
  const createCalls = [];
  const draftPrismaPath = require.resolve('../../src/lib/prisma.ts');
  const originalExports = require.cache[draftPrismaPath].exports;
  require.cache[draftPrismaPath] = {
    id: draftPrismaPath,
    filename: draftPrismaPath,
    loaded: true,
    exports: {
      prisma: {
        ...originalExports.prisma,
        inventoryDraftItem: {
          ...originalExports.prisma.inventoryDraftItem,
          create: async (args) => { createCalls.push(args.data); return { id: 'draft-new', ...args.data }; },
        },
      },
    },
  };
  delete require.cache[require.resolve('../../src/services/inventoryDraft.service.ts')];
  const { InventoryDraftService: FreshService } = require('../../src/services/inventoryDraft.service.ts');
  const freshService = new FreshService();

  await freshService.createDraftFromOcr({
    propertyId: 'property-1',
    userId: 'user-1',
    ocrSessionId: 'ocr-session-xyz',
    manufacturer: 'Rheem',
  });

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].sessionId, 'ocr-session-xyz');
  assert.equal(createCalls[0].scanSessionId, undefined, 'must not write the OCR session id into the unrelated scanSessionId FK');

  require.cache[draftPrismaPath] = { id: draftPrismaPath, filename: draftPrismaPath, loaded: true, exports: originalExports };
  delete require.cache[require.resolve('../../src/services/inventoryDraft.service.ts')];
});
