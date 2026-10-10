const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Documents D-1 (FRD v1.135) on the canonical document inventory (FRD v1.136). The real registered `documents.lookup` handler runs against a
// stubbed Home Records list and a fake legacy table. Nothing here reads a document's contents: the answer states only what is recorded, and
// each row's facts come from its own store (a Home Record needs review or is expiring; a transitional legacy document has a verification status).
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
const { documentsCalmCopy } = require('../../src/services/ask/handlers/documents.handler.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const realList = homeRecordsService.list;
const record = (id, recordType, createdAt, extra = {}) => ({
  id, title: `Record ${id}`, description: null, recordType, sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE',
  createdAt: new Date(createdAt), updatedAt: new Date(createdAt), needsReview: false, expiryStatus: null, ...extra,
});
const legacy = (id, type, verificationStatus, createdAt = '2026-09-01') => ({ id, name: `Legacy ${id}`, type, description: null, verificationStatus, createdAt: new Date(createdAt), updatedAt: new Date(createdAt) });
let listCalls;
function install(records, legacyRows = [], role = 'VIEWER') {
  listCalls = [];
  homeRecordsService.list = async (propertyId, callerRole, options) => { listCalls.push({ propertyId, callerRole, options }); return records; };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'document') return { findMany: async () => legacyRows };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; homeRecordsService.list = realList; });
const run = () => capabilityInvoke('DOCUMENT_LOOKUP', { userId: 'u1', propertyId: 'p1', message: 'Show my documents' });
const summary = (result) => result.blocks.find((block) => block.id === 'document-lookup-summary');
const list = (result) => result.blocks.find((block) => block.id === 'document-lookup-groups');

test('the headline counts what is on file, and each chip states only a fact its own store records', () => {
  const copy = (overrides) => documentsCalmCopy({ total: 0, newest: null, truncatedKinds: 0, ...overrides });
  assert.equal(copy({ total: 12 }).headline, '12 documents on file.');
  assert.equal(copy({ total: 1 }).headline, '1 document on file.');
  assert.equal(copy({}).headline, 'No documents on file.');
  const full = copy({ total: 12, needsReview: 2, expired: 1, expiringSoon: 1, unverified: 3, rejected: 1, verified: 4, legacy: 8, newest: { name: 'Roof invoice', addedOn: 'Sep 3, 2026' } });
  assert.deepEqual(full.chips.map((chip) => chip.label), ['2 need review', '1 expired', '1 expiring soon', '3 not yet verified', '1 rejected', '4 verified']);
  assert.equal(full.supportLine, 'Most recent: Roof invoice, added Sep 3, 2026. 8 are still in the older Documents vault.');
  assert.match(copy({ total: 25, newest: { name: 'A', addedOn: null }, truncatedKinds: 1 }).supportLine, /Showing the most recent of each type/);
  assert.doesNotMatch(JSON.stringify(full).toLowerCase(), /complete|valid|accepted|approved|covered|legal|correct/);
});

test('a real answer reads Home Records with the caller\'s role, marks legacy rows transitional, and routes each row to its own detail', async () => {
  install([record('r1', 'INVOICE', '2026-09-03', { needsReview: true }), record('r2', 'DEED', '2026-09-02', { expiryStatus: 'EXPIRED' })], [legacy('l1', 'INVOICE', 'UNVERIFIED'), legacy('l2', 'ESTIMATE', 'VERIFIED', '2026-08-01')]);
  const result = await run();
  assert.deepEqual(listCalls, [{ propertyId: 'p1', callerRole: 'VIEWER', options: { lifecycleStatus: 'ACTIVE' } }]);
  assert.equal(summary(result).headline, '4 documents on file.');
  assert.deepEqual(summary(result).chips.map((chip) => chip.label), ['1 need review', '1 expired', '1 not yet verified', '1 verified']);
  assert.match(summary(result).supportLine, /2 are still in the older Documents vault\./);
  const items = list(result).sections.flatMap((section) => section.items);
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  assert.equal(byId.r1.entityType, 'PROPERTY_RECORD');
  assert.equal(byId.l1.entityType, 'DOCUMENT');
  assert.ok(byId.l1.meta.includes('older vault') && !byId.r1.meta.includes('older vault'));
  // A Home Record links to Home Records; a transitional legacy document has no page of its own any more, only its inline detail.
  assert.ok(byId.r1.href.endsWith('/tools/home-records') && byId.l1.href === null);
  assert.equal(byId.r1.status, 'NEEDS_REVIEW');
  // One vocabulary for kinds: a Home Record invoice and a legacy invoice share a section.
  assert.equal(list(result).sections.find((section) => section.title === 'Invoices').count, 2);
  assert.deepEqual(list(result).actions.map((action) => action.id), ['open-documents-list']);
  assert.equal(result.blocks.at(-1).id, 'document-lookup-boundary');
  assert.match(result.blocks.at(-1).body, /Ask has not read or interpreted the documents themselves/);
});

test('with no legacy rows the answer says nothing about an older vault', async () => {
  install([record('r1', 'INVOICE', '2026-09-03')]);
  const result = await run();
  assert.equal(summary(result).headline, '1 document on file.');
  assert.doesNotMatch(summary(result).supportLine ?? '', /older Documents vault/);
});

test('the boundary survives the trust validator and the desktop Open Home Records links do not', async () => {
  install([record('r1', 'INVOICE', '2026-09-03')]);
  const raw = await run();
  const validated = validateAskAnswerTrust({
    question: 'Show my documents', operationId: 'DOCUMENT_LOOKUP', propertyId: 'p1',
    result: attachAskAuthoritativeSourceEvidence(raw, [completedAskAuthoritativeSourceEvidence('DOCUMENT_LOOKUP')]),
  });
  assert.deepEqual(summary(validated.result).actions.map((action) => action.id), []);
  assert.deepEqual(list(validated.result).actions.map((action) => action.id), []);
  assert.ok(validated.result.blocks.some((block) => block.id === 'document-lookup-boundary'));
  assert.ok(validated.trust.reasonCodes.includes('INAPPLICABLE_ACTION_REMOVED'));
});

test('an empty record is not read as "nothing exists", offers no desktop link and states what the answer shows', async () => {
  install([], []);
  const result = await run();
  assert.equal(result.blocks[0].id, 'document-lookup-empty');
  assert.equal(result.blocks.at(-1).id, 'document-lookup-boundary');
  const validated = validateAskAnswerTrust({
    question: 'Show my documents', operationId: 'DOCUMENT_LOOKUP', propertyId: 'p1',
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('DOCUMENT_LOOKUP')]),
  });
  assert.deepEqual(validated.result.blocks[0].actions.map((action) => action.id), []);
});
