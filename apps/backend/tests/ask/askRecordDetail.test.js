const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const support = require('../../src/services/ask/support/propertyContext.ts');
const context = require('../../src/services/ask/askRecordContext.ts');
const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
const documentInventory = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const { visibleInventoryItemWhere } = require('../../src/services/riskAssetApplicability.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');
const {
  ASK_RECORD_DETAIL_READERS, getAskRecordDetail, AskRecordNotFoundError, ASK_RECORD_DETAIL_CONTRACT_VERSION,
} = require('../../src/services/ask/askRecordDetail.service.ts');
const { getAskRecordCollectionPage, AskRecordSectionUnavailableError } = require('../../src/services/ask/askRecordCollections.service.ts');

const NOW = new Date('2026-10-19T12:00:00Z');
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000);
const ctx = (role, overrides = {}) => ({ propertyId: 'p1', userId: 'u1', role, now: NOW, ...overrides });
const sectionReader = (id) => ASK_RECORD_DETAIL_READERS[id];

// ---- registry capability -------------------------------------------------------------------------------------------------------

test('detail is CONNECTED exactly where a reader exists, and every other section states UNAVAILABLE with a reason', () => {
  for (const entry of ASK_RECORD_SECTION_REGISTRY) {
    const hasReader = Boolean(ASK_RECORD_DETAIL_READERS[entry.id]);
    assert.equal(entry.recordDetail.state, hasReader ? 'CONNECTED' : 'UNAVAILABLE', entry.id);
    if (!hasReader) assert.ok(entry.recordDetail.reason.length > 20, entry.id);
  }
  assert.deepEqual(ASK_RECORD_SECTION_REGISTRY.filter((entry) => entry.recordDetail.state === 'UNAVAILABLE').map((entry) => entry.id), ['property-facts']);
  assert.match(ASK_RECORD_SECTION_REGISTRY.find((entry) => entry.id === 'property-facts').recordDetail.reason, /completeness view/);
  assert.equal(Object.keys(ASK_RECORD_DETAIL_READERS).length, 15);
});

// ---- authorization -------------------------------------------------------------------------------------------------------------

function stubAccess(role, mode = 'OWNING') {
  const saved = [support.ensurePropertyAccess, context.loadOperatingMode];
  support.ensurePropertyAccess = async () => ({ role });
  context.loadOperatingMode = async () => mode;
  return () => { [support.ensurePropertyAccess, context.loadOperatingMode] = saved; };
}

test('opening detail for a section with no detail reader reports it unavailable, before anything is read', async () => {
  const restore = stubAccess('OWNER');
  try {
    await assert.rejects(() => getAskRecordDetail('u1', 'p1', 'property-facts', 'x', 'HOMEOWNER'), (error) => error instanceof AskRecordSectionUnavailableError && error.reason === 'NO_DETAIL');
    await assert.rejects(() => getAskRecordDetail('u1', 'p1', 'nope', 'x', 'HOMEOWNER'), (error) => error instanceof AskRecordSectionUnavailableError && error.reason === 'UNKNOWN_SECTION');
  } finally { restore(); }
});

test('the collection page carries the section detail capability so the UI never has to guess', async () => {
  const restore = stubAccess('VIEWER');
  const saved = prisma.inventoryRoom;
  prisma.inventoryRoom = { findMany: async () => [], count: async () => 0, groupBy: async () => [] };
  try {
    const page = await getAskRecordCollectionPage('u1', 'p1', 'rooms', {}, 'HOMEOWNER');
    assert.deepEqual(page.recordDetail, { state: 'CONNECTED' });
  } finally { restore(); prisma.inventoryRoom = saved; }
});

test('detail reauthorizes through the section: a record that does not exist is a not-found, never an empty detail', async () => {
  const restore = stubAccess('VIEWER');
  const saved = prisma.inventoryRoom;
  prisma.inventoryRoom = { findFirst: async () => null };
  try {
    await assert.rejects(() => getAskRecordDetail('u1', 'p1', 'rooms', 'missing', 'HOMEOWNER', NOW), AskRecordNotFoundError);
  } finally { restore(); prisma.inventoryRoom = saved; }
});

// ---- rooms ---------------------------------------------------------------------------------------------------------------------

function stubRoom(room) {
  const saved = [prisma.inventoryRoom, prisma.inventoryItem];
  const calls = { items: [] };
  prisma.inventoryRoom = { findFirst: async (args) => (args.where.propertyId === 'p1' && args.where.id === 'r1' ? room : null) };
  prisma.inventoryItem = { count: async (args) => { calls.items.push(args); return 3; } };
  return { calls, restore: () => { [prisma.inventoryRoom, prisma.inventoryItem] = saved; } };
}
const ROOM = { name: 'Kitchen', type: 'KITCHEN', floorLevel: 0, createdAt: day(-90), updatedAt: day(-2), _count: { maintenanceTasks: 1 } };

test('room detail reports facts, an honest provenance (no source, no verification, no history), and counts only visible items', async () => {
  const { calls, restore } = stubRoom(ROOM);
  try {
    const detail = await sectionReader('rooms')(ctx('CONTRIBUTOR'), 'r1');
    assert.equal(detail.title, 'Kitchen');
    assert.deepEqual(detail.facts.map((f) => [f.label, f.value]), [['Type', 'Kitchen'], ['Floor level', '0'], ['Items', '3 items'], ['Open maintenance', '1 open task']]);
    assert.deepEqual(calls.items[0].where.AND[1], visibleInventoryItemWhere());
    const { provenance } = detail;
    assert.equal(provenance.source.state, 'UNAVAILABLE');
    assert.equal(provenance.verification.state, 'UNAVAILABLE');
    assert.equal(provenance.history.state, 'UNAVAILABLE');
    assert.deepEqual(provenance.history.entries, []);
    assert.equal(provenance.observed.state, 'AVAILABLE');
    assert.equal(provenance.observed.at, day(-2).toISOString());
    assert.equal(provenance.visibility.state, 'AVAILABLE');
    for (const facet of [provenance.source, provenance.verification]) assert.ok(facet.reason && facet.value === null);
  } finally { restore(); }
});

test('an unrecorded room type or floor reads as Not recorded, never as a guess', async () => {
  const { restore } = stubRoom({ ...ROOM, type: null, floorLevel: null });
  try {
    const detail = await sectionReader('rooms')(ctx('OWNER'), 'r1');
    assert.equal(detail.facts[0].value, 'Not recorded');
    assert.equal(detail.facts[1].value, 'Not recorded');
  } finally { restore(); }
});

test('room correction routes use ROOM_RENAME and its registered floor: a viewer is told the role needed, a contributor gets the launch question', async () => {
  const floor = ASK_OPERATION_DEFINITIONS.ROOM_RENAME.propertyRoleFloor;
  assert.equal(floor, 'CONTRIBUTOR');
  const { restore } = stubRoom(ROOM);
  try {
    const viewer = await sectionReader('rooms')(ctx('VIEWER'), 'r1');
    for (const entry of viewer.corrections) {
      assert.equal(entry.operationId, 'ROOM_RENAME');
      assert.deepEqual([entry.state, entry.requiredRole, entry.launch], ['ROLE_REQUIRED', floor, null]);
      assert.match(entry.reason, /contributor access/);
    }
    for (const role of ['CONTRIBUTOR', 'OWNER']) {
      const detail = await sectionReader('rooms')(ctx(role), 'r1');
      assert.deepEqual(detail.corrections.map((entry) => entry.state), ['AVAILABLE', 'AVAILABLE', 'AVAILABLE']);
      assert.deepEqual(detail.corrections.map((entry) => entry.launch), [
        { message: 'Rename this room.', operationId: 'ROOM_RENAME', entityType: 'INVENTORY_ROOM', entityId: 'r1', actionId: null },
        { message: 'Change the type of this room.', operationId: 'ROOM_RENAME', entityType: 'INVENTORY_ROOM', entityId: 'r1', actionId: null },
        { message: 'Change the floor level of this room.', operationId: 'ROOM_RENAME', entityType: 'INVENTORY_ROOM', entityId: 'r1', actionId: null },
      ]);
      assert.ok(detail.corrections.every((entry) => entry.reason === null));
    }
  } finally { restore(); }
});

// ---- inventory -----------------------------------------------------------------------------------------------------------------

const ITEM = {
  name: 'Water heater', category: 'APPLIANCE', condition: 'GOOD', brand: 'Rheem', manufacturer: null, model: 'XR90', modelNumber: null, serialNo: 'SN-SECRET-123', serialNumber: null,
  installedOn: new Date('2019-03-01T00:00:00Z'), installedOnPrecision: 'MONTH', purchasedOn: null, purchasedOnPrecision: null, lastServicedOn: null, expectedExpiryDate: day(900),
  purchaseCostCents: 123456, replacementCostCents: null, isVerified: true, verificationSource: 'OCR_LABEL', sourceType: 'MOBILE_SCAN', sourceFileName: null, importedAt: null,
  sourceOcrSessionId: 'ocr-1', updatedAt: day(-5), createdAt: day(-400), room: { name: 'Garage' }, warranty: { providerName: 'Rheem Care' },
  linkedWarranties: [{ providerName: 'Rheem Care' }, { providerName: 'Home Shield' }], insurancePolicy: { carrierName: 'Acme Mutual' }, _count: { documents: 2 },
};

function stubItem(item) {
  const saved = prisma.inventoryItem;
  const calls = [];
  prisma.inventoryItem = { findFirst: async (args) => { calls.push(args); return item; } };
  return { calls, restore: () => { prisma.inventoryItem = saved; } };
}

test('inventory detail reads only visible items and never prints a serial number or a cost', async () => {
  const { calls, restore } = stubItem(ITEM);
  try {
    const detail = await sectionReader('inventory')(ctx('VIEWER'), 'i1');
    assert.deepEqual(calls[0].where.AND[1], visibleInventoryItemWhere());
    assert.deepEqual(calls[0].where.AND[0], { id: 'i1', propertyId: 'p1' });
    const text = JSON.stringify(detail);
    assert.ok(!text.includes('SN-SECRET-123') && !text.includes('123456'));
    const byLabel = Object.fromEntries(detail.facts.map((f) => [f.label, f.value]));
    assert.match(byLabel['Serial number'], /^Recorded/);
    assert.match(byLabel['Purchase cost'], /^Recorded/);
    assert.equal(byLabel['Replacement cost'], 'Not recorded');
    assert.equal(byLabel.Installed, '2019-03', 'a month-precision date is never shown as a day');
    assert.equal(byLabel.Purchased, 'Not recorded');
  } finally { restore(); }
});

test('inventory provenance: source from the record, verification from the record, related records de-duplicated, history UNAVAILABLE', async () => {
  const { restore } = stubItem(ITEM);
  try {
    const { provenance } = await sectionReader('inventory')(ctx('CONTRIBUTOR'), 'i1');
    assert.equal(provenance.source.value, 'Scanned in the app · confirmed from a scan');
    assert.equal(provenance.verification.state, 'AVAILABLE');
    assert.match(provenance.verification.value, /Verified/);
    assert.deepEqual(provenance.related.records.map((r) => r.kindLabel + ':' + r.label), ['Room:Garage', 'Warranty:Rheem Care', 'Warranty:Home Shield', 'Insurance policy:Acme Mutual', 'Attached documents:2 documents']);
    assert.equal(provenance.history.state, 'UNAVAILABLE');
    assert.equal(provenance.visibility.state, 'AVAILABLE');
  } finally { restore(); }
});

test('an unverified, unlinked item states NOT_RECORDED rather than inventing a source or link', async () => {
  const bare = { ...ITEM, isVerified: false, verificationSource: null, room: null, warranty: null, linkedWarranties: [], insurancePolicy: null, _count: { documents: 0 } };
  const { restore } = stubItem(bare);
  try {
    const { provenance } = await sectionReader('inventory')(ctx('OWNER'), 'i1');
    assert.equal(provenance.verification.state, 'NOT_RECORDED');
    assert.equal(provenance.related.state, 'NOT_RECORDED');
    assert.deepEqual(provenance.related.records, []);
  } finally { restore(); }
});

test('a hidden or missing inventory item is a not-found', async () => {
  const { restore } = stubItem(null);
  try {
    await assert.rejects(() => sectionReader('inventory')(ctx('OWNER'), 'hidden'), AskRecordNotFoundError);
  } finally { restore(); }
});

test('inventory correction routes use INVENTORY_ITEM_CORRECT at its registered floor and launch the declared item answer', async () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.INVENTORY_ITEM_CORRECT.propertyRoleFloor, 'CONTRIBUTOR');
  const { restore } = stubItem(ITEM);
  try {
    const viewer = (await sectionReader('inventory')(ctx('VIEWER'), 'i1')).corrections[0];
    assert.deepEqual([viewer.operationId, viewer.state, viewer.requiredRole, viewer.launch], ['INVENTORY_ITEM_CORRECT', 'ROLE_REQUIRED', 'CONTRIBUTOR', null]);
    const contributor = (await sectionReader('inventory')(ctx('CONTRIBUTOR'), 'i1')).corrections[0];
    assert.deepEqual([contributor.state, contributor.launch], ['AVAILABLE', { message: 'Correct a detail of this inventory item.', operationId: 'INVENTORY_ITEM_CORRECT', entityType: 'INVENTORY_ITEM', entityId: 'i1', actionId: null }]);
  } finally { restore(); }
});

// ---- warranties ----------------------------------------------------------------------------------------------------------------

const WARRANTY = {
  id: 'w1', propertyId: 'p1', providerName: 'Rheem Care', category: 'APPLIANCE', coverageDetails: 'Parts and labor', policyNumber: 'POL-SECRET-9', cost: '499.00',
  startDate: day(-100), expiryDate: day(200), sourceExecutionId: null, updatedAt: day(-1), homeownerProfile: { userId: 'u1' }, inventoryItem: { name: 'Water heater' }, _count: { documents: 0 },
};
function stubWarranty(row) {
  const saved = prisma.warranty;
  prisma.warranty = { findFirst: async (args) => (args.where.propertyId === 'p1' && args.where.id === 'w1' ? row : null) };
  return () => { prisma.warranty = saved; };
}

test('warranty detail never prints the policy number or cost, states the governed status, and keeps history UNAVAILABLE', async () => {
  const restore = stubWarranty(WARRANTY);
  try {
    const detail = await sectionReader('warranties')(ctx('VIEWER'), 'w1');
    const text = JSON.stringify(detail);
    assert.ok(!text.includes('POL-SECRET-9') && !text.includes('499'));
    const byLabel = Object.fromEntries(detail.facts.map((f) => [f.label, f.value]));
    assert.equal(byLabel.Status, 'Active');
    assert.equal(byLabel.Expires, day(200).toISOString().slice(0, 10));
    assert.match(byLabel['Policy number'], /^Recorded/);
    assert.equal(detail.provenance.source.state, 'NOT_RECORDED');
    assert.equal(detail.provenance.verification.state, 'UNAVAILABLE');
    assert.equal(detail.provenance.history.state, 'UNAVAILABLE');
    assert.deepEqual(detail.provenance.related.records.map((r) => r.label), ['Water heater']);
  } finally { restore(); }
});

test('a warranty added through Ask says so', async () => {
  const restore = stubWarranty({ ...WARRANTY, sourceExecutionId: 'exec-1' });
  try {
    assert.equal((await sectionReader('warranties')(ctx('OWNER'), 'w1')).provenance.source.value, 'Added through Ask');
  } finally { restore(); }
});

test('warranty correction needs the registered floor AND being the member who added it (the existing Ask rule, not a new one)', async () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.WARRANTY_CORRECT.propertyRoleFloor, 'CONTRIBUTOR');
  let restore = stubWarranty(WARRANTY);
  try {
    assert.equal((await sectionReader('warranties')(ctx('VIEWER'), 'w1')).corrections[0].state, 'ROLE_REQUIRED');
    const own = (await sectionReader('warranties')(ctx('CONTRIBUTOR'), 'w1')).corrections[0];
    assert.deepEqual([own.state, own.launch], ['AVAILABLE', { message: 'Correct a detail of this warranty.', operationId: 'WARRANTY_CORRECT', entityType: 'WARRANTY', entityId: 'w1', actionId: null }]);
    const other = (await sectionReader('warranties')(ctx('OWNER', { userId: 'someone-else' }), 'w1')).corrections[0];
    assert.deepEqual([other.state, other.reason, other.launch], ['UNAVAILABLE', 'Only the member who added this warranty can correct it.', null]);
  } finally { restore(); }
  restore = stubWarranty(null);
  try {
    await assert.rejects(() => sectionReader('warranties')(ctx('OWNER'), 'w1'), AskRecordNotFoundError);
  } finally { restore(); }
});

// ---- documents -----------------------------------------------------------------------------------------------------------------

const listed = (overrides = {}) => ({
  id: 'd1', source: 'HOME_RECORD', transitional: false, title: 'Roof receipt', kind: 'RECEIPT', kindLabel: 'Receipts', description: null, addedAt: day(-30), updatedAt: day(-3),
  verification: 'VERIFIED', verifiedAt: day(-2), needsReview: false, expiry: null, lifecycle: 'ACTIVE', sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', ...overrides,
});
const homeRecord = (overrides = {}) => ({
  id: 'd1', title: 'Roof receipt', description: 'Replacement', lifecycleStatus: 'ACTIVE', sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', createdByUserId: 'u1', createdAt: day(-30), updatedAt: day(-3),
  effectiveFrom: null, effectiveTo: null, needsReview: false,
  versions: [{ versionNumber: 1, createdAt: day(-30) }, { versionNumber: 2, createdAt: day(-3) }],
  links: [{ entityType: 'INVENTORY_ITEM', label: 'Water heater', broken: false }, { entityType: 'WARRANTY', label: null, broken: true }],
  allowedActions: { read: true, archive: true, manageEffectivePeriod: true, verify: true }, ...overrides,
});
function stubDocuments(items, record) {
  const savedList = documentInventory.listPropertyDocuments;
  const savedGet = homeRecordsService.get;
  documentInventory.listPropertyDocuments = async () => ({ items, totals: { total: items.length, homeRecords: 0, legacy: 0 } });
  homeRecordsService.get = async (propertyId, id, role) => {
    if (record === 'NOT_FOUND') { const error = new Error('Record not found.'); error.statusCode = 404; throw error; }
    stubDocuments.lastCall = [propertyId, id, role];
    return record;
  };
  return () => { documentInventory.listPropertyDocuments = savedList; homeRecordsService.get = savedGet; };
}

test('a Home Record opens through the canonical Home Records reader with the caller’s role, and reports versions, links and verification', async () => {
  const restore = stubDocuments([listed()], homeRecord());
  try {
    const detail = await sectionReader('documents')(ctx('CONTRIBUTOR'), 'd1');
    assert.deepEqual(stubDocuments.lastCall, ['p1', 'd1', 'CONTRIBUTOR']);
    assert.equal(detail.provenance.source.value, 'Added by you');
    assert.equal(detail.provenance.verification.state, 'AVAILABLE');
    assert.equal(detail.provenance.verification.at, day(-2).toISOString());
    assert.equal(detail.provenance.history.state, 'AVAILABLE');
    assert.deepEqual(detail.provenance.history.entries.map((e) => e.label), ['Version 2 added', 'Version 1 added']);
    assert.deepEqual(detail.provenance.related.records.map((r) => [r.label, r.broken]), [['Water heater', false], ['Warranty', true]]);
    assert.deepEqual(detail.corrections.map((c) => [c.id, c.operationId, c.state]), [
      ['document-verification', 'HOME_RECORD_STATE_COMMAND', 'AVAILABLE'], ['document-effective-period', 'HOME_RECORD_STATE_COMMAND', 'AVAILABLE'], ['document-archive', 'HOME_RECORD_STATE_COMMAND', 'AVAILABLE'],
    ]);
    assert.deepEqual(detail.corrections.map((c) => [c.launch.message, c.launch.entityType, c.launch.entityId]), [['Record whether I have verified this home record.', 'PROPERTY_RECORD', 'd1'], ['Set the period this home record is in effect.', 'PROPERTY_RECORD', 'd1'], ['Archive this home record.', 'PROPERTY_RECORD', 'd1']]);
  } finally { restore(); }
});

test('document correction availability follows the record’s own allowed actions and the registered floor', async () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.HOME_RECORD_STATE_COMMAND.propertyRoleFloor, 'CONTRIBUTOR');
  const restore = stubDocuments([listed({ lifecycle: 'ARCHIVED' })], homeRecord({ lifecycleStatus: 'ARCHIVED', allowedActions: { read: true, archive: false, manageEffectivePeriod: true, verify: true } }));
  try {
    const viewer = await sectionReader('documents')(ctx('VIEWER'), 'd1');
    assert.ok(viewer.corrections.every((c) => c.state === 'ROLE_REQUIRED' && c.requiredRole === 'CONTRIBUTOR'));
    const owner = await sectionReader('documents')(ctx('OWNER'), 'd1');
    const byId = Object.fromEntries(owner.corrections.map((c) => [c.id, c]));
    assert.equal(byId['document-archive'].state, 'UNAVAILABLE');
    assert.equal(byId['document-archive'].reason, 'This record is not active.');
    assert.equal(byId['document-verification'].state, 'AVAILABLE');
  } finally { restore(); }
});

test('an owner-only record is described as owner-only, and a record from another member is not attributed to the caller', async () => {
  const restore = stubDocuments([listed({ visibility: 'OWNER_ONLY' })], homeRecord({ visibility: 'OWNER_ONLY', createdByUserId: 'u2' }));
  try {
    const detail = await sectionReader('documents')(ctx('OWNER'), 'd1');
    assert.equal(detail.provenance.visibility.value, 'Only home owners can see this record.');
    assert.equal(detail.provenance.source.value, 'Added by a household member');
  } finally { restore(); }
});

test('a legacy vault document is shown from its listed metadata, with history, links and correction stated UNAVAILABLE', async () => {
  const restore = stubDocuments([listed({ id: 'legacy1', source: 'LEGACY_DOCUMENT', transitional: true, verification: null, verifiedAt: null })], homeRecord());
  try {
    const detail = await sectionReader('documents')(ctx('OWNER'), 'legacy1');
    assert.equal(stubDocuments.lastCall?.[1] === 'legacy1', false, 'the Home Records reader is never asked for a legacy id');
    assert.equal(detail.provenance.history.state, 'UNAVAILABLE');
    assert.equal(detail.provenance.related.state, 'UNAVAILABLE');
    assert.equal(detail.provenance.verification.state, 'UNAVAILABLE');
    assert.equal(detail.provenance.visibility.state, 'UNAVAILABLE');
    assert.equal(detail.corrections.length, 1);
    assert.deepEqual([detail.corrections[0].state, detail.corrections[0].launch], ['UNAVAILABLE', null]);
    assert.doesNotMatch(JSON.stringify(detail), /\/dashboard/, 'no desktop link');
  } finally { restore(); }
});

test('a document the caller cannot see, or that does not exist, is a not-found', async () => {
  let restore = stubDocuments([], homeRecord());
  try {
    await assert.rejects(() => sectionReader('documents')(ctx('VIEWER'), 'hidden'), AskRecordNotFoundError);
  } finally { restore(); }
  restore = stubDocuments([listed()], 'NOT_FOUND');
  try {
    await assert.rejects(() => sectionReader('documents')(ctx('VIEWER'), 'd1'), AskRecordNotFoundError);
  } finally { restore(); }
});

test('the contract version is stamped on every detail', async () => {
  const restore = stubAccess('OWNER');
  const saved = prisma.inventoryRoom;
  prisma.inventoryRoom = { findFirst: async () => ROOM };
  const savedItems = prisma.inventoryItem;
  prisma.inventoryItem = { count: async () => 0 };
  try {
    const detail = await getAskRecordDetail('u1', 'p1', 'rooms', 'r1', 'HOMEOWNER', NOW);
    assert.equal(detail.contractVersion, ASK_RECORD_DETAIL_CONTRACT_VERSION);
    assert.deepEqual([detail.sectionId, detail.recordId, detail.propertyId, detail.generatedAt], ['rooms', 'r1', 'p1', NOW.toISOString()]);
  } finally { restore(); prisma.inventoryRoom = saved; prisma.inventoryItem = savedItems; }
});

test('a document-derived candidate opens from the uncapped pending set, states it is not trusted data, and routes to the promotion command', async () => {
  const handler = require('../../src/services/ask/handlers/documents.handler.ts');
  const saved = handler.pendingDocumentPromotionCandidates;
  let limitSeen;
  handler.pendingDocumentPromotionCandidates = async (propertyId, limit) => { limitSeen = limit; return [{ id: 'm1', kind: 'MATERIAL_EXTRACTION_REVIEW', title: 'Material review: Paint', description: '4 extracted fields awaiting review', updatedAt: day(-1), parentId: 'ms1' }]; };
  try {
    const detail = await sectionReader('documents')(ctx('CONTRIBUTOR'), 'candidate:MATERIAL_EXTRACTION_REVIEW:m1');
    assert.equal(limitSeen, null, 'the Record reads every candidate, not the 25 Ask lists');
    assert.equal(detail.provenance.verification.state, 'NOT_RECORDED');
    assert.match(detail.facts.find((f) => f.label === 'State').value, /not trusted data/);
    assert.deepEqual(detail.corrections.map((c) => [c.id, c.operationId, c.state, c.launch.message, c.launch.entityType, c.launch.entityId]), [['candidate-confirm', 'DOCUMENT_PROMOTION_CONFIRM', 'AVAILABLE', 'Confirm this document extraction.', 'MATERIAL_EXTRACTION_REVIEW', 'm1'], ['candidate-reject', 'DOCUMENT_PROMOTION_CONFIRM', 'AVAILABLE', 'Reject this document extraction.', 'MATERIAL_EXTRACTION_REVIEW', 'm1']]);
    assert.equal((await sectionReader('documents')(ctx('VIEWER'), 'candidate:MATERIAL_EXTRACTION_REVIEW:m1')).corrections[0].state, 'ROLE_REQUIRED');
    await assert.rejects(() => sectionReader('documents')(ctx('OWNER'), 'candidate:MATERIAL_EXTRACTION_REVIEW:gone'), AskRecordNotFoundError);
  } finally { handler.pendingDocumentPromotionCandidates = saved; }
});
