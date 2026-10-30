const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The rules of scripts/copy-legacy-documents-to-home-records.ts (what a legacy documents row becomes as a Home Record). Pure: no database, storage or clock.
const plan = require('../../scripts/legacyDocumentCopyPlan.ts');

const doc = (over = {}) => ({
  id: 'doc-1', propertyId: 'prop-1', uploadedBy: 'profile-1', type: 'INVOICE', name: 'Roof invoice 2019.pdf', description: 'Re-roof', fileUrl: 'documents/u/abc.pdf', fileSize: 10,
  mimeType: 'application/pdf', sha256: null, verificationStatus: 'VERIFIED', verifiedAt: new Date('2026-01-01T00:00:00Z'), verifiedByUserId: 'u1', deletedAt: null,
  warrantyId: null, policyId: null, inventoryItemId: null, projectId: null, homeEventLinks: [], ...over,
});

test('the ids are stable UUIDs per document, different for the record and its version, so a re-run recognises its own work', () => {
  assert.equal(plan.recordIdFor('doc-1'), plan.recordIdFor('doc-1'));
  assert.notEqual(plan.recordIdFor('doc-1'), plan.recordIdFor('doc-2'));
  assert.notEqual(plan.recordIdFor('doc-1'), plan.versionIdFor('doc-1'));
  assert.match(plan.recordIdFor('doc-1'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('every legacy type maps to a Home Record type and a sensitivity; unknown ones are other and standard', () => {
  assert.deepEqual([plan.recordTypeFor('ESTIMATE'), plan.sensitivityFor('ESTIMATE')], ['QUOTE', 'FINANCIAL']);
  assert.deepEqual([plan.recordTypeFor('INSURANCE_CERTIFICATE'), plan.sensitivityFor('INSURANCE_CERTIFICATE')], ['INSURANCE_POLICY', 'INSURANCE']);
  assert.deepEqual([plan.recordTypeFor('CONTRACT'), plan.sensitivityFor('CONTRACT')], ['CONTRACT', 'LEGAL']);
  assert.deepEqual([plan.recordTypeFor('VIDEO'), plan.recordTypeFor('LICENSE'), plan.recordTypeFor('HOME_REPORT_PDF')], ['OTHER', 'OTHER', 'OTHER']);
  assert.deepEqual([plan.recordTypeFor('SOMETHING_NEW'), plan.sensitivityFor('SOMETHING_NEW')], ['OTHER', 'STANDARD']);
});

test('a document is left alone when it is in the trash, has no property, no file, was already copied, or has no user to own it', () => {
  const ok = { ownerUserId: 'u1', alreadyCopied: false };
  assert.equal(plan.skipReason(doc(), ok), null);
  assert.match(plan.skipReason(doc({ deletedAt: new Date() }), ok), /trash/);
  assert.match(plan.skipReason(doc({ propertyId: null }), ok), /not attached to a property/);
  assert.match(plan.skipReason(doc({ fileUrl: '' }), ok), /no stored file/);
  assert.equal(plan.skipReason(doc(), { ...ok, alreadyCopied: true }), 'already copied');
  assert.match(plan.skipReason(doc(), { ownerUserId: null, alreadyCopied: false }), /no user/);
});

test('the legacy links become Home Record links: home events keep their caption, the rest carry over; nothing else is invented', () => {
  assert.deepEqual(plan.plannedLinks(doc()), []);
  const links = plan.plannedLinks(doc({ homeEventLinks: [{ eventId: 'e1', caption: 'Before' }, { eventId: 'e2', caption: null }], warrantyId: 'w1', policyId: 'pol1', inventoryItemId: 'i1', projectId: 'pr1' }));
  assert.deepEqual(links.map((l) => [l.entityType, l.entityId, l.purpose, l.label]), [
    ['HOME_EVENT', 'e1', 'EVIDENCE', 'Before'], ['HOME_EVENT', 'e2', 'EVIDENCE', null], ['WARRANTY', 'w1', 'WARRANTY', null],
    ['INSURANCE_POLICY', 'pol1', 'EVIDENCE', null], ['INVENTORY_ITEM', 'i1', 'ATTACHMENT', null], ['PROJECT', 'pr1', 'EVIDENCE', null],
  ]);
});

test('the plan keeps the title without its extension, the verification the household gave, and the key a normal upload would have', () => {
  const p = plan.planFor(doc(), 'u1');
  assert.equal(p.title, 'Roof invoice 2019');
  assert.deepEqual([p.recordType, p.sensitivity, p.verificationStatus, p.ownerUserId], ['INVOICE', 'FINANCIAL', 'VERIFIED', 'u1']);
  assert.equal(p.storageKey, `property-records/prop-1/${p.recordId}/${p.versionId}/Roof-invoice-2019.pdf`);
  assert.equal(plan.titleFor('.pdf'), '.pdf');
  assert.equal(plan.titleFor('scan'), 'scan');
  assert.equal(plan.sanitizedFileName('a b/c?.pdf'), 'a-b_c_.pdf');
});

test('the script is report-only without --apply, never deletes or hides a legacy row, and removes its copy if the database step fails', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../scripts/copy-legacy-documents-to-home-records.ts'), 'utf8');
  assert.match(source, /const apply = args\.includes\('--apply'\)/);
  assert.match(source, /if \(!apply\) \{ note\(doc, 'WOULD_COPY'/);
  assert.ok(!/document\.(delete|deleteMany)|deletedAt:\s*new Date|home[Ee]ventDocument\.(delete|update)/.test(source), 'legacy rows and links are left alone');
  assert.match(source, /await deleteDocumentObject\(plan\.storageKey\)/);
});
