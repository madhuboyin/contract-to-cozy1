const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Owner ruling D-T5 (design docs/architecture/PROPERTY_TAX_EVIDENCE_AND_INTAKE_IN_ASK_DESIGN.md §3.3): what a purge does to property tax records.
const { removePropertyTaxSourceContent } = require('../../src/services/propertyTax/propertyTaxSourcePurge.ts');
const { reconcilePropertyTaxField, effectiveConfidence } = require('../../src/services/propertyTax/propertyTaxReconciliation.ts');

function fakeDb() {
  const calls = [];
  const rec = (name) => ({
    findMany: async (args) => { calls.push([name, 'findMany', args.where]); return name === 'propertyTaxAssessmentDocument' ? [{ assessmentRecordId: 'a-1' }] : [{ billRecordId: 'b-1' }]; },
    updateMany: async (args) => { calls.push([name, 'updateMany', args.where, args.data]); return { count: 2 }; },
    delete: async () => { throw new Error('a purge must not delete tax records'); },
    deleteMany: async () => { throw new Error('a purge must not delete tax records'); },
  });
  return { calls, db: {
    propertyTaxAssessmentDocument: rec('propertyTaxAssessmentDocument'), propertyTaxBillDocument: rec('propertyTaxBillDocument'),
    propertyTaxFieldEvidence: rec('propertyTaxFieldEvidence'), propertyTaxAssessmentRecord: rec('propertyTaxAssessmentRecord'),
    propertyTaxBillRecord: rec('propertyTaxBillRecord'), propertyTaxAppealEvidence: rec('propertyTaxAppealEvidence'),
  } };
}

test('a purge marks what depended on the record as source-removed and deletes nothing', async () => {
  const { db, calls } = fakeDb();
  const now = new Date('2026-10-13T00:00:00Z');
  const summary = await removePropertyTaxSourceContent(db, 'rec-1', now);
  assert.deepEqual(summary, { fieldEvidence: 2, assessments: 2, bills: 2, appealEvidence: 2 });
  const marks = calls.filter((c) => c[1] === 'updateMany');
  assert.equal(marks.length, 4);
  for (const mark of marks) assert.deepEqual(mark[3], { sourceRemovedAt: now });
  assert.deepEqual(marks.find((c) => c[0] === 'propertyTaxFieldEvidence')[2], { sourceDocumentId: 'rec-1', sourceRemovedAt: null });
  assert.deepEqual(marks.find((c) => c[0] === 'propertyTaxAssessmentRecord')[2], { id: { in: ['a-1'] }, sourceRemovedAt: null });
  assert.deepEqual(marks.find((c) => c[0] === 'propertyTaxAppealEvidence')[2], { supportingDocumentId: 'rec-1', sourceRemovedAt: null });
});

test('a value whose source document was removed is presented as homeowner confirmed, never as document-backed high confidence', () => {
  const observation = (over = {}) => ({
    id: 'o-1', fieldKey: 'totalAssessedValue', value: 250000, sourceType: 'DOCUMENT', confidence: 'HIGH', reviewStatus: 'HOMEOWNER_CONFIRMED',
    observedAt: '2026-09-01T00:00:00Z', effectiveAt: null, sourceDocumentId: 'rec-1', sourceDataSourceId: null, sourceExternalId: null, sourceUrl: null, sourceRemovedAt: null, ...over,
  });
  const present = reconcilePropertyTaxField('totalAssessedValue', [observation()]);
  assert.deepEqual([present.canonicalState, present.confidence], ['DOCUMENT_CONFIRMED', 'HIGH']);
  const removed = reconcilePropertyTaxField('totalAssessedValue', [observation({ sourceRemovedAt: '2026-10-01T00:00:00Z', sourceDocumentId: null })]);
  assert.deepEqual([removed.state, removed.value, removed.canonicalState, removed.confidence], ['KNOWN', 250000, 'HOMEOWNER_CONFIRMED_SOURCE_REMOVED', 'MEDIUM']);
  assert.equal(effectiveConfidence(observation({ sourceRemovedAt: '2026-10-01T00:00:00Z', confidence: 'VERIFIED' })), 'MEDIUM');
  assert.equal(effectiveConfidence(observation({ sourceRemovedAt: '2026-10-01T00:00:00Z', confidence: 'LOW' })), 'LOW', 'only lowers, never raises');
  assert.equal(effectiveConfidence(observation({ sourceType: 'OFFICIAL_SOURCE', sourceRemovedAt: '2026-10-01T00:00:00Z' })), 'HIGH', 'an official source is unaffected');
});

test('the worker runs the tax purge inside the delete transaction, before the record is deleted', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../../workers/src/runners/propertyRecordPurge.cleanup.ts'), 'utf8');
  const taxAt = source.indexOf('removePropertyTaxSourceContent(tx');
  const deleteAt = source.indexOf('tx.propertyRecord.delete');
  assert.ok(taxAt > 0 && taxAt < deleteAt);
  assert.ok(source.indexOf('$transaction') < taxAt);
});
