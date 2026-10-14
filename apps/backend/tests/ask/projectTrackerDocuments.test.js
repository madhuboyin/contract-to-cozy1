const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Project Tracker documents (docs/architecture/PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md, slice 0; owner rulings D-P3, D-P6, D-P7).
// The regression this file pins: Ask listed and validated project documents against the legacy Document table, while project completion looks proof ids
// up in Home Records, so a proof chosen in Ask was refused. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const handler = require('../../src/services/ask/handlers/projectTracker.handler.ts');

const RECORD = { id: 'rec-1', title: 'Final inspection.pdf', recordType: 'INSPECTION_REPORT', sensitivity: 'LEGAL', currentVersionId: 'ver-1', currentVersion: { mimeType: 'application/pdf' } };

function install({ records = [RECORD] } = {}) {
  const saved = { r: prisma.propertyRecord, d: prisma.document };
  const where = [];
  prisma.propertyRecord = { findMany: async (args) => { where.push(args.where); return records.filter((row) => !args.where.id || args.where.id.in.includes(row.id)); } };
  prisma.document = { findMany: async () => { throw new Error('the legacy Document table must not be queried for project documents'); }, count: async () => { throw new Error('legacy count'); } };
  return { where, restore() { prisma.propertyRecord = saved.r; prisma.document = saved.d; } };
}

test('Ask offers Home Records, never the legacy table, with the household-visible active clean rule and the sensitivity shown', async () => {
  const w = install();
  try {
    const options = await handler.projectDocumentOptions('prop-1');
    assert.deepEqual(options.map((option) => option.value), ['rec-1']);
    assert.match(options[0].label, /Final inspection\.pdf/);
    assert.match(options[0].label, /Legal/, 'the sensitivity is displayed');
    const rule = w.where[0];
    assert.equal(rule.propertyId, 'prop-1');
    assert.equal(rule.lifecycleStatus, 'ACTIVE');
    assert.equal(rule.visibility, 'HOUSEHOLD');
    assert.deepEqual(rule.currentVersion, { is: { scanStatus: 'CLEAN' } });
    assert.equal('sensitivity' in rule, false, 'sensitivity is shown, never a filter');
    assert.equal('recordType' in rule, false, 'any record type');
  } finally { w.restore(); }
});

test('a sensitive but otherwise eligible household record is selectable (the label does not filter)', async () => {
  const w = install({ records: [{ ...RECORD, id: 'rec-legal', sensitivity: 'LEGAL' }, { ...RECORD, id: 'rec-personal', sensitivity: 'PERSONAL' }] });
  try {
    const resolved = await handler.projectDocuments('prop-1', ['rec-legal', 'rec-personal']);
    assert.deepEqual(resolved.map((document) => document.id), ['rec-legal', 'rec-personal']);
  } finally { w.restore(); }
});

test('a Home Record id passes the validation that project completion uses; a missing, cross-property or ineligible id is refused as stale', async () => {
  const w = install();
  try {
    const [ok] = await handler.projectDocuments('prop-1', ['rec-1']);
    assert.equal(ok.id, 'rec-1');
    await assert.rejects(() => handler.projectDocuments('prop-1', ['rec-1', 'rec-missing']), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => handler.projectDocuments('prop-1', ['a-legacy-document-id']), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.deepEqual(w.where.at(-1).id, { in: ['a-legacy-document-id'] });
    assert.equal(w.where.at(-1).propertyId, 'prop-1');
  } finally { w.restore(); }
});

test('Ask project document fields store Home Record ids on columns that hold them, never a copied storage key, and never offer a legacy upload', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/projectTracker.handler.ts'), 'utf8');
  assert.equal(/allowUpload: true/.test(source), false, 'no upload control until project uploads go to Home Records');
  // Slice 1 gave each of these its own id column, so the fields are back and write ids (owner ruling D-P1).
  assert.match(source, /receiptDocumentId: receipt\.id/);
  assert.match(source, /supportingDocumentId: supportingDocument\.id/);
  assert.match(source, /photoDocumentIds: photos\.map\(\(document\) => document\.id\)/);
  assert.equal(/\b(receiptDocumentKey|supportingDocumentKey|photoKeys|attachmentKeys):/.test(source.replace(/\/\/.*$/gm, '')), false, 'no key column is written from Ask');
  assert.equal(/\.fileUrl/.test(source.replace(/\/\/.*$/gm, '')), false, 'no storage key is copied from a document');
});

test('project completion sends Home Record ids, and a warranty document becomes the warranty proof, not a storage key', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/projectTracker.handler.ts'), 'utf8');
  assert.match(source, /proofKey: 'warranty', documentId: warrantyDocument\.id/);
  assert.equal(/warrantyDocumentKey: warrantyDocument/.test(source), false);
});
