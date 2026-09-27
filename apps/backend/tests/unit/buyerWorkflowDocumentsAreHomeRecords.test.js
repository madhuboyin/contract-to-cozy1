const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// S5b-1: the buyer workflows whose document references are plain ids (title and escrow, insurance, walkthrough, contract) store Home Record
// ids. Their uploads go to Home Records and their readers resolve those ids through the canonical inventory with the caller's role; none of
// them touches the legacy table any more. (Closing day, loan estimate, closing disclosure and reinspection proof held real foreign keys to
// the legacy table; S5b-2 retargeted those relations to PropertyRecord — see propertyBriefFoundation.test.js and homeBuyerSlice4B/4C for their
// own coverage. HomeBuyerTask.completionDocumentId is also retargeted, EXCEPT the negotiation-shield outcome-document flow, which still
// writes a legacy id and is deliberately not linked into it until negotiation shield's own domain converts, S5f.)
const backendRoot = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(backendRoot, relative), 'utf8');
const readFrontend = (relative) => fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan', relative), 'utf8');

test('the four converted buyer services never read or write the legacy document table', () => {
  for (const file of ['buyerTitleEscrow', 'buyerInsurance', 'buyerWalkthrough', 'buyerContract']) {
    const source = read(`src/services/${file}.service.ts`);
    assert.doesNotMatch(source, /(prisma|tx)\.document\./, `${file} must not touch the legacy document table`);
    assert.match(source, /propertyDocumentInventory\.service/, `${file} reads the canonical inventory`);
  }
});

test('the converted buyer screens upload to Home Records, including closing day now that its foreign key is retargeted (S5b-2)', () => {
  for (const file of ['BuyerTitleEscrowCenter.tsx', 'BuyerInsuranceCenter.tsx', 'BuyerWalkthroughCenter.tsx', 'BuyerClosingDayCenter.tsx']) {
    const source = readFrontend(file);
    assert.match(source, /uploadRecordForWorkflow\(/, `${file} uploads to Home Records`);
    assert.doesNotMatch(source, /api\.uploadDocument\(/, `${file} must not upload to the legacy table`);
  }
});

test('the buyer evidence panel links a Home Record row back to Home Records and offers verify/reject on every row', () => {
  // Post-b462e090 (Home Records verification-status decision): a Home Record row is no longer read-only here —
  // it gets the same Verify/Reject actions as a legacy row, plus a link back into Home Records.
  const page = readFrontend('page.tsx');
  assert.match(page, /document\.source === 'HOME_RECORD' && <Button asChild/);
  assert.match(page, /tools\/home-records\?recordId=\$\{encodeURIComponent\(document\.id\)\}/);
  const service = read('src/services/buyerAcquisition.service.ts');
  assert.match(service, /listPropertyDocuments\(\{ propertyId, role: access\.role, includeLegacy: true \}\)/);
  // Verification routes to the record itself for a Home Record and to the legacy status update otherwise.
  assert.match(service, /homeRecordsService\.setVerification\(/);
  assert.match(service, /prisma\.document\.update\(/);
});

test('linkRecordToEntityInTransaction links a record idempotently inside the caller\'s transaction and refuses a record outside the property', async () => {
  const { linkRecordToEntityInTransaction } = require('../../src/services/homeRecords.service.ts');
  const upserts = [];
  const tx = (record) => ({
    propertyRecord: { findFirst: async ({ where }) => { tx.lookup = where; return record; } },
    propertyRecordLink: { upsert: async (args) => { upserts.push(args); return {}; } },
  });
  const input = { propertyId: 'p1', recordId: 'r1', entityType: 'INSURANCE_POLICY', entityId: 'policy-1', purpose: 'EVIDENCE', userId: 'u1', label: 'Insurance binder' };
  await linkRecordToEntityInTransaction(tx({ id: 'r1', currentVersionId: 'v1' }), input);
  assert.deepEqual(tx.lookup, { id: 'r1', propertyId: 'p1', lifecycleStatus: { not: 'TRASHED' } });
  assert.deepEqual(upserts[0].where, { recordId_entityType_entityId_purpose: { recordId: 'r1', entityType: 'INSURANCE_POLICY', entityId: 'policy-1', purpose: 'EVIDENCE' } });
  assert.deepEqual(upserts[0].update, {}, 'linking again changes nothing');
  assert.equal(upserts[0].create.versionId, 'v1');
  assert.equal(upserts[0].create.label, 'Insurance binder');
  await assert.rejects(() => linkRecordToEntityInTransaction(tx(null), input), (error) => error?.code === 'PROPERTY_RECORD_NOT_FOUND');
  assert.equal(upserts.length, 1);
});
