const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Loading the extraction service constructs an AI client at import time.
process.env.GEMINI_API_KEY ??= 'test-key';

require('ts-node/register');

// Record-level authorization for Home Records. Property-level access decides who may act on a home; the visibility rule decides which records a
// member may see. Every mutation and extraction entry point must apply the same rule the read paths apply, so a member can never change, link,
// analyze or promote a record they cannot read, and never learns that it exists. The fake database HONORS `where`, so an invisible record is
// really invisible (unlike the loose fakes in homeRecordsFoundation.test.js).
const RECORDS = [
  { id: 'rec-h', propertyId: 'p1', visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE', title: 'HVAC warranty', recordType: 'WARRANTY', currentVersionId: 'v-h', versions: [] },
  { id: 'rec-o', propertyId: 'p1', visibility: 'OWNER_ONLY', lifecycleStatus: 'ACTIVE', title: 'Trust deed', recordType: 'DEED', currentVersionId: 'v-o', versions: [] },
  { id: 'rec-r', propertyId: 'p1', visibility: 'RECIPIENT_SELECTED', lifecycleStatus: 'ACTIVE', title: 'Shared with lawyer', recordType: 'OTHER', currentVersionId: 'v-r', versions: [] },
  { id: 'rec-o-trashed', propertyId: 'p1', visibility: 'OWNER_ONLY', lifecycleStatus: 'TRASHED', title: 'Old deed', recordType: 'DEED', currentVersionId: null, versions: [] },
];
const VERSIONS = [
  { id: 'v-h', recordId: 'rec-h', sha256: 'hash-h', versionNumber: 1, scanStatus: 'CLEAN' },
  { id: 'v-o', recordId: 'rec-o', sha256: createHash('sha256').update(Buffer.from('hash-o')).digest('hex'), versionNumber: 1, scanStatus: 'CLEAN' },
];
const LINKS = [{ id: 'link-o', recordId: 'rec-o' }, { id: 'link-h', recordId: 'rec-h' }];

function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'AND') return expected.every((clause) => matches(row, clause));
    if (key === 'record') return matches(RECORDS.find((record) => record.id === row.recordId) ?? {}, expected);
    const actual = row[key];
    if (expected && typeof expected === 'object' && 'not' in expected) return actual !== expected.not;
    if (expected && typeof expected === 'object' && 'equals' in expected) return String(actual).toLowerCase() === String(expected.equals).toLowerCase();
    return actual === expected;
  });
}

const writes = [];
const prismaPath = require.resolve('../../src/lib/prisma.ts');
const fake = {
  propertyRecord: {
    findFirst: async ({ where }) => RECORDS.find((row) => matches(row, where)) ?? null,
    updateMany: async ({ where }) => { const rows = RECORDS.filter((row) => matches(row, where)); if (rows.length) writes.push(['propertyRecord.updateMany', where]); return { count: rows.length }; },
    update: async (args) => { writes.push(['propertyRecord.update', args]); return {}; },
  },
  propertyRecordVersion: { findFirst: async ({ where }) => VERSIONS.find((row) => matches(row, where)) ?? null },
  propertyRecordLink: {
    findFirst: async ({ where }) => LINKS.find((row) => matches(row, where)) ?? null,
    create: async (args) => { writes.push(['propertyRecordLink.create', args]); return {}; },
    delete: async (args) => { writes.push(['propertyRecordLink.delete', args]); return {}; },
  },
  propertyRecordPurgeJob: { updateMany: async () => ({ count: 0 }), create: async () => ({}) },
  extractedFactCandidate: { findFirst: async () => { throw new Error('candidate lookup must not be reached for an invisible record'); }, findMany: async () => [] },
  $transaction: async (fn) => fn(fake),
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: fake } };

const { HomeRecordsService } = require('../../src/services/homeRecords.service.ts');
const { assertRecordVisible, visibleRecordWhere } = require('../../src/services/homeRecordsAccess.ts');
const service = new HomeRecordsService();
const file = { buffer: Buffer.from('hash-o'), originalname: 'deed.pdf', mimetype: 'application/pdf', size: 6 };
test.beforeEach(() => { writes.length = 0; });

const notFound = (error) => error?.statusCode === 404 || error?.status === 404 || /not found/i.test(error?.message ?? '');
const refused = async (call) => assert.rejects(call, (error) => { assert.ok(notFound(error), `expected not-found, got ${error?.message}`); return true; });

test('the visibility rule: owners see everything, every other role sees household records only', () => {
  assert.deepEqual(visibleRecordWhere('OWNER'), {});
  for (const role of ['CONTRIBUTOR', 'VIEWER']) assert.deepEqual(visibleRecordWhere(role), { visibility: 'HOUSEHOLD' });
});

test('the shared lookup treats an invisible record exactly like a missing one', async () => {
  await assertRecordVisible('p1', 'rec-h', 'CONTRIBUTOR');
  await assertRecordVisible('p1', 'rec-o', 'OWNER');
  await refused(() => assertRecordVisible('p1', 'rec-o', 'CONTRIBUTOR'));
  await refused(() => assertRecordVisible('p1', 'rec-r', 'CONTRIBUTOR'));
  await refused(() => assertRecordVisible('p1', 'no-such-record', 'OWNER'));
});

test('a contributor cannot add a version, link, unlink, archive, trash, restore or change retention or dates on an owner-only record', async () => {
  const role = 'CONTRIBUTOR';
  await refused(() => service.addVersion({ propertyId: 'p1', recordId: 'rec-o', userId: 'u1', role, file: { ...file, buffer: Buffer.from('new bytes') } }));
  await refused(() => service.addLink({ propertyId: 'p1', recordId: 'rec-o', userId: 'u1', role, entityType: 'OTHER', entityId: 'x', purpose: 'EVIDENCE' }));
  await refused(() => service.removeLink('p1', 'rec-o', 'link-o', role));
  await refused(() => service.archive('p1', 'rec-o', role));
  await refused(() => service.trash({ propertyId: 'p1', recordId: 'rec-o', userId: 'u1', role }));
  await refused(() => service.restore('p1', 'rec-o-trashed', role));
  await refused(() => service.setRetention({ propertyId: 'p1', recordId: 'rec-o', retainUntil: new Date(), role }));
  await refused(() => service.setEffectivePeriod({ propertyId: 'p1', recordId: 'rec-o', effectiveTo: new Date(), role }));
  assert.deepEqual(writes, [], 'nothing was written');
});

test('RECIPIENT_SELECTED is owner-only in practice, so a contributor cannot mutate it either', async () => {
  await refused(() => service.archive('p1', 'rec-r', 'CONTRIBUTOR'));
  await refused(() => service.trash({ propertyId: 'p1', recordId: 'rec-r', userId: 'u1', role: 'CONTRIBUTOR' }));
  assert.deepEqual(writes, []);
});

test('an owner still can, and a contributor still can on a household record', async () => {
  await service.archive('p1', 'rec-h', 'CONTRIBUTOR');
  await service.archive('p1', 'rec-o', 'OWNER');
  await service.removeLink('p1', 'rec-h', 'link-h', 'CONTRIBUTOR');
  await service.removeLink('p1', 'rec-o', 'link-o', 'OWNER');
  assert.equal(writes.filter(([name]) => name === 'propertyRecord.updateMany').length, 2);
  assert.equal(writes.filter(([name]) => name === 'propertyRecordLink.delete').length, 2);
});

test('possible-version matching never offers a record the caller cannot see (it would reveal that it exists and hand over its id)', async () => {
  assert.equal(await service.checkPossibleVersion('p1', 'trust deed', 'DEED', 'CONTRIBUTOR'), null);
  const asOwner = await service.checkPossibleVersion('p1', 'trust deed', 'DEED', 'OWNER');
  assert.equal(asOwner?.id, 'rec-o');
  assert.equal((await service.checkPossibleVersion('p1', 'HVAC warranty', 'WARRANTY', 'CONTRIBUTOR'))?.id, 'rec-h');
});

test('an identical file to an owner-only record is not reported to a contributor as a duplicate (the conflict body carries a record id)', async () => {
  const input = { propertyId: 'p1', userId: 'u1', file, title: 'My copy', recordType: 'OTHER', sensitivity: 'STANDARD', visibility: 'HOUSEHOLD' };
  await assert.rejects(() => service.create({ ...input, role: 'OWNER' }), (error) => error?.code === 'PROPERTY_RECORD_DUPLICATE_CONTENT');
  // The contributor's duplicate check does not see the owner-only record, so it is not the duplicate error and no record id is disclosed.
  await assert.rejects(() => service.create({ ...input, role: 'CONTRIBUTOR' }), (error) => error?.code !== 'PROPERTY_RECORD_DUPLICATE_CONTENT' && !JSON.stringify(error?.details ?? {}).includes('rec-o'));
});

test('extraction and promotion refuse an invisible record before touching a candidate or a canonical record', async () => {
  const { homeRecordsExtractionService } = require('../../src/services/homeRecordsExtraction.service.ts');
  const base = { propertyId: 'p1', recordId: 'rec-o', userId: 'u1', role: 'CONTRIBUTOR' };
  await refused(() => homeRecordsExtractionService.runExtraction({ ...base, versionId: 'v-o' }));
  await refused(() => homeRecordsExtractionService.reviewCandidate({ ...base, candidateId: 'c1', action: 'CONFIRM' }));
  await refused(() => homeRecordsExtractionService.promoteWarranty({ ...base, versionId: 'v-o' }));
  await refused(() => homeRecordsExtractionService.promoteExpense({ ...base, versionId: 'v-o' }));
  await refused(() => homeRecordsExtractionService.promoteInsurancePolicy({ ...base, versionId: 'v-o' }));
  assert.deepEqual(writes, []);
});

test('every mutating and extraction route hands the caller\'s household role to the service', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/routes/homeRecords.routes.ts'), 'utf8');
  const calls = [...source.matchAll(/(homeRecordsService|homeRecordsExtractionService)\.(create|createBatch|addVersion|addLink|removeLink|archive|trash|restore|setRetention|setEffectivePeriod|checkPossibleVersion|runExtraction|reviewCandidate|promoteWarranty|promoteExpense|promoteInsurancePolicy)\(([\s\S]*?)\n?\s*\);/g)];
  assert.equal(calls.length, 16, 'every guarded entry point is called by a route');
  for (const [, , method, args] of calls) assert.match(args, /req\.householdRole!/, `${method} must receive req.householdRole`);
});
