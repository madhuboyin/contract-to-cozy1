'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Project Tracker documents, slice 0 (docs/architecture/PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md; owner rulings D-P3, D-P6, D-P7): one eligibility rule,
// cross-property and missing documents refused, legacy ids accepted only when already stored, and a dispute package that names its documents.
// No database is used.

const { prisma } = require('../../src/lib/prisma.ts');
const documents = require('../../src/services/projectDocuments.service.ts');
const tracker = require('../../src/services/projectTracker.service.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');

const rec = (id, over = {}) => ({ id, title: `Record ${id}`, recordType: 'OTHER', sensitivity: 'STANDARD', currentVersionId: `ver-${id}`, currentVersion: { mimeType: 'application/pdf' }, ...over });

function world({ records = [], legacy = [] } = {}) {
  const saved = { r: prisma.propertyRecord, d: prisma.document };
  const seen = { record: [], document: [] };
  prisma.propertyRecord = { findMany: async (args) => { seen.record.push(args.where); return records.filter((row) => !args.where.id || args.where.id.in.includes(row.id)); } };
  prisma.document = { findMany: async (args) => { seen.document.push(args.where); return legacy.filter((row) => args.where.id.in.includes(row.id)); } };
  return { seen, restore() { prisma.propertyRecord = saved.r; prisma.document = saved.d; } };
}

test('the eligibility rule is the service\'s, with no sensitivity or type filter', async () => {
  const w = world({ records: [rec('a', { sensitivity: 'LEGAL' })] });
  try {
    const options = await documents.listProjectDocumentOptions('prop-1');
    assert.deepEqual(options.map((o) => [o.id, o.sensitivity, o.versionId]), [['a', 'LEGAL', 'ver-a']]);
    const rule = w.seen.record[0];
    assert.deepEqual([rule.propertyId, rule.lifecycleStatus, rule.visibility], ['prop-1', 'ACTIVE', 'HOUSEHOLD']);
    assert.deepEqual(rule.currentVersion, { is: { scanStatus: 'CLEAN' } });
    assert.equal('sensitivity' in rule || 'recordType' in rule, false);
  } finally { w.restore(); }
});

test('a missing id and another property\'s id are refused; the query is scoped to the property', async () => {
  const w = world({ records: [rec('a')] });
  try {
    const result = await documents.resolveProjectDocuments('prop-1', ['a', 'in-another-property', 'missing']);
    assert.deepEqual(result.documents.map((d) => d.id), ['a']);
    assert.deepEqual(result.unavailable, ['in-another-property', 'missing']);
    assert.equal(w.seen.record[0].propertyId, 'prop-1', 'a record of another property can never be returned');
    await assert.rejects(
      () => documents.assertProjectDocuments('prop-1', ['a', 'missing'], { message: 'unavailable', code: 'X' }),
      (error) => error instanceof APIError && error.code === 'X' && error.statusCode === 400,
    );
  } finally { w.restore(); }
});

test('a legacy document is accepted only when named as already stored, in this property, and is never an option', async () => {
  const w = world({ records: [], legacy: [{ id: 'old', name: 'Old contract.pdf', mimeType: 'application/pdf' }] });
  try {
    assert.deepEqual((await documents.resolveProjectDocuments('prop-1', ['old'])).unavailable, ['old'], 'not newly selectable');
    const allowed = await documents.resolveProjectDocuments('prop-1', ['old'], { transitionalLegacyIds: ['old'] });
    assert.deepEqual(allowed.documents.map((d) => [d.id, d.source]), [['old', 'LEGACY_DOCUMENT']]);
    assert.equal(w.seen.document[0].propertyId, 'prop-1');
    assert.deepEqual((await documents.resolveProjectDocuments('prop-1', ['other-legacy'], { transitionalLegacyIds: ['old'] })).unavailable, ['other-legacy']);
    const options = await documents.listProjectDocumentOptions('prop-1');
    assert.deepEqual(options, [], 'legacy documents are never listed');
  } finally { w.restore(); }
});

test('an issue note and a change-order compliance review refuse evidence that is not an eligible record of this property', async () => {
  const w = world({ records: [rec('a')] });
  const saved = { p: prisma.projectRecord, i: prisma.projectIssue, c: prisma.projectChangeOrder, n: prisma.projectIssueNote, t: prisma.$transaction, l: prisma.propertyRecordLink };
  prisma.propertyRecordLink = { findMany: async () => [], create: async () => ({}), update: async () => ({}), deleteMany: async () => ({}) };
  prisma.$transaction = async (callback) => callback(prisma);
  const projectRow = { id: 'proj-1', propertyId: 'prop-1', status: 'IN_PROGRESS', projectType: 'CUSTOM', contractAmountCents: 0, approvedChangeOrderDeltaCents: 0, renovationCaseId: null };
  const writes = [];
  prisma.projectRecord = { findUnique: async () => projectRow };
  prisma.projectIssue = { findUnique: async () => ({ id: 'iss-1', projectId: 'proj-1', status: 'OPEN', severity: 'MINOR', blocksPayment: false, sourceEntityType: null, sourceEntityId: null, evidenceDocumentIds: [] }) };
  prisma.projectIssueNote = { create: async (args) => { writes.push(args.data); return { id: 'n-1' }; }, update: async () => ({ id: 'n-1' }) };
  prisma.projectChangeOrder = { findUnique: async () => ({
    id: 'co-1', projectId: 'proj-1', status: 'PROPOSED', costDeltaCents: 0, complianceStatus: 'IMPACT_RECORDED', complianceImpact: { explanation: 'x' },
    amendedPermitStatus: 'NOT_APPLICABLE', hoaReapprovalStatus: 'NOT_APPLICABLE', complianceEvidenceDocumentIds: [],
  }), update: async (args) => { writes.push(args.data); return {}; } };
  try {
    await assert.rejects(() => tracker.addIssueNote('iss-1', 'proj-1', 'prop-1', 'u1', { notes: 'x', evidenceDocumentIds: ['missing'] }), (e) => e.code === 'PROJECT_ISSUE_NOTE_DOCUMENT_UNAVAILABLE');
    await tracker.addIssueNote('iss-1', 'proj-1', 'prop-1', 'u1', { notes: 'x', evidenceDocumentIds: ['a'] });
    assert.deepEqual(writes.shift().evidenceDocumentIds, ['a']);
    await assert.rejects(
      () => tracker.reviewChangeOrderCompliance('co-1', 'proj-1', 'prop-1', 'u1', { amendedPermitStatus: 'CONFIRMED', hoaReapprovalStatus: 'CONFIRMED', evidenceDocumentIds: ['typed-by-hand'], reviewNotes: 'ok' }),
      (e) => e.code === 'CHANGE_ORDER_COMPLIANCE_EVIDENCE_UNAVAILABLE' && e.statusCode === 409,
    );
    assert.equal(writes.length, 0, 'nothing was stored');
  } finally { Object.assign(prisma, { projectRecord: saved.p, projectIssue: saved.i, projectChangeOrder: saved.c, projectIssueNote: saved.n, $transaction: saved.t, propertyRecordLink: saved.l }); w.restore(); }
});

test('the dispute package names the contract document and never prints a storage key', async () => {
  const project = (over) => ({ contractDocumentKey: null, contractDocumentIds: [], ...over });
  let w = world({ records: [rec('c1', { title: 'Signed contract.pdf' })] });
  const savedV = prisma.propertyRecordVersion;
  prisma.propertyRecordVersion = { findFirst: async () => null };
  try {
    assert.deepEqual(await tracker.describeContractDocument('prop-1', project({ contractDocumentIds: ['c1'] })), { label: 'Signed contract.pdf', state: 'NAMED', id: 'c1' });
    assert.equal((await tracker.describeContractDocument('prop-1', project({}))).label, 'No contract document recorded');
    assert.equal((await tracker.describeContractDocument('prop-1', project({ contractDocumentIds: ['gone'] }))).label, 'Contract document unavailable');
    prisma.document = { ...prisma.document, findFirst: async () => null };
    const removed = await tracker.describeContractDocument('prop-1', project({ contractDocumentKey: 'documents/user-1/prop-1/secret-key.pdf' }));
    assert.equal(removed.label, 'Contract document removed');
    assert.equal(JSON.stringify(removed).includes('secret-key'), false, 'a key never appears');
  } finally { prisma.propertyRecordVersion = savedV; w.restore(); }
  w = world({ records: [] });
  prisma.propertyRecordVersion = { findFirst: async () => ({ record: { id: 'r9', title: 'Contract v2.pdf' } }) };
  prisma.document = { ...prisma.document, findFirst: async () => null };
  try {
    assert.equal((await tracker.describeContractDocument('prop-1', project({ contractDocumentKey: 'k' }))).label, 'Contract v2.pdf', 'a key that is a Home Record version resolves to its title');
  } finally { prisma.propertyRecordVersion = savedV; w.restore(); }
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/projectTracker.service.ts'), 'utf8');
  assert.equal(source.includes('snapshot.project.contractDocumentKey'), false);
  assert.match(source, /snapshot\.project\.contractDocument\?\.label/);
});

test('completion proof documents must be active, household-visible, clean Home Records of the property (source check)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/projectTracker.service.ts'), 'utf8');
  const rule = "where: { id: proof.documentId, propertyId, lifecycleStatus: 'ACTIVE', visibility: 'HOUSEHOLD', currentVersion: { is: { scanStatus: 'CLEAN' } } }";
  assert.equal(source.split(rule).length - 1, 2, 'both completion loops use the rule');
  assert.equal(/id: proof\.documentId, propertyId, lifecycleStatus: \{ not: 'TRASHED' \}/.test(source), false);
});
