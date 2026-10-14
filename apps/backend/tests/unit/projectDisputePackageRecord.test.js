'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Dispute package as a Home Record (docs/architecture/PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md §7, owner ruling D-P4): render and upload first with no
// transaction open, then one transaction for the record, version, package row and link, and cleanup of the staged object when it fails. No database,
// storage or browser is used.

const { prisma } = require('../../src/lib/prisma.ts');
const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
const reportStorage = require('../../src/services/storage/reportStorage.ts');
const tracker = require('../../src/services/projectTracker.service.ts');
const { discardStagedObject, retryOrphanedObjectCleanup } = require('../../src/services/storage/orphanedObjects.ts');

function world({ failTransaction = false, failDelete = false } = {}) {
  const saved = {
    t: prisma.$transaction, pr: prisma.projectRecord, pi: prisma.projectIssue, pn: prisma.projectIssueNote, pd: prisma.projectDisputePackage, doc: prisma.document,
    pdoc: prisma.propertyRecord, o: prisma.orphanedStorageObject, stage: homeRecordsService.stageGeneratedDocument, del: reportStorage.deleteDocumentObject,
  };
  const events = [];
  let inTransaction = false;
  const issue = { id: 'iss-1', title: 'Cabinet delay', description: 'Late', status: 'ESCALATED', createdAt: new Date('2026-10-01'), severity: 'MAJOR' };
  prisma.projectRecord = {
    findUnique: async () => ({ id: 'proj-1', propertyId: 'prop-1', status: 'IN_PROGRESS', projectType: 'CUSTOM', contractAmountCents: 0, approvedChangeOrderDeltaCents: 0, renovationCaseId: null }),
    findUniqueOrThrow: async () => ({ id: 'proj-1', name: 'Kitchen', projectType: 'KITCHEN_REMODEL', contractDocumentKey: null, contractDocumentIds: [], milestones: [], payments: [], changeOrders: [], issues: [issue] }),
  };
  prisma.projectIssue = { findUnique: async () => ({ id: 'iss-1', projectId: 'proj-1', status: 'ESCALATED', severity: 'MAJOR', blocksPayment: false, sourceEntityType: null, sourceEntityId: null, evidenceDocumentIds: [], evidenceVersionIds: null }) };
  prisma.projectIssueNote = { findMany: async () => [] };
  prisma.projectDisputePackage = { findFirst: async () => ({ version: 2 }), create: async ({ data }) => { events.push(['package', data]); return { id: 'pkg-1', version: data.version, documentId: data.documentId }; } };
  prisma.propertyRecord = { findMany: async () => [{ id: 'ev-1', title: 'Photo.jpg', recordType: 'PHOTO', sensitivity: 'STANDARD', currentVersionId: 'ev-v1', currentVersion: { mimeType: 'image/jpeg' } }] };
  prisma.document = { create: async () => { throw new Error('a dispute package must not create a legacy Document'); }, findMany: async () => [], findFirst: async () => null };
  prisma.orphanedStorageObject = { upsert: async ({ create }) => { events.push(['orphan', create.storageKey]); return {}; } };
  const staged = { recordId: 'rec-9', versionId: 'ver-9', storageKey: 'property-records/prop-1/rec-9/ver-9/package.pdf', storageEtag: 'etag', sha256: 'a'.repeat(64), fileSizeBytes: 10, fileName: 'p.pdf', mimeType: 'application/pdf' };
  homeRecordsService.stageGeneratedDocument = async (input) => { events.push(['stage', { inTransaction, mimeType: input.mimeType, bytes: input.buffer.length > 0 }]); return staged; };
  reportStorage.deleteDocumentObject = async (key) => { events.push(['delete', key]); if (failDelete) throw new Error('storage unavailable'); };
  const tx = {
    propertyRecord: {
      create: async ({ data }) => { events.push(['record', { type: data.recordType, sensitivity: data.sensitivity, visibility: data.visibility, id: data.id, version: data.versions.create.versionNumber }]); return {}; },
      update: async ({ data }) => { events.push(['current', data.currentVersionId]); return {}; },
    },
    projectDisputePackage: prisma.projectDisputePackage,
    propertyRecordLink: { create: async ({ data }) => { events.push(['link', { entity: data.entityType, id: data.entityId, purpose: data.purpose, record: data.recordId, version: data.versionId }]); return {}; } },
  };
  prisma.$transaction = async (callback) => {
    inTransaction = true;
    try {
      const result = await callback(tx);
      if (failTransaction) throw new Error('commit failed');
      return result;
    } finally { inTransaction = false; }
  };
  return { events, staged, restore() {
    prisma.$transaction = saved.t; prisma.projectRecord = saved.pr; prisma.projectIssue = saved.pi; prisma.projectIssueNote = saved.pn; prisma.projectDisputePackage = saved.pd;
    prisma.document = saved.doc; prisma.propertyRecord = saved.pdoc; prisma.orphanedStorageObject = saved.o; homeRecordsService.stageGeneratedDocument = saved.stage;
    reportStorage.deleteDocumentObject = saved.del;
  } };
}

test('the package is staged before any transaction, then one transaction creates the record, version, package and link; no legacy Document is created', async () => {
  const w = world();
  try {
    const result = await tracker.generateDisputePackage('iss-1', 'proj-1', 'prop-1', 'u1', ['ev-1']);
    const names = w.events.map(([name]) => name);
    assert.deepEqual(names, ['stage', 'record', 'current', 'package', 'link']);
    assert.equal(w.events[0][1].inTransaction, false, 'nothing is held open while the document is rendered and uploaded');
    assert.deepEqual(w.events[1][1], { type: 'PROJECT_DISPUTE_PACKAGE', sensitivity: 'LEGAL', visibility: 'HOUSEHOLD', id: 'rec-9', version: 1 });
    assert.equal(w.events[2][1], 'ver-9');
    const pkg = w.events[3][1];
    assert.deepEqual([pkg.documentId, pkg.version, pkg.storageKey, pkg.snapshot.schemaVersion], ['rec-9', 3, w.staged.storageKey, 'project-dispute-package-v2']);
    assert.deepEqual(w.events[4][1], { entity: 'PROJECT_ISSUE', id: 'iss-1', purpose: 'SOURCE', record: 'rec-9', version: 'ver-9' });
    assert.equal(result.documentId, 'rec-9');
    assert.ok(!names.includes('delete'));
  } finally { w.restore(); }
});

test('when the transaction fails the staged object is removed and the error is raised', async () => {
  const w = world({ failTransaction: true });
  try {
    await assert.rejects(() => tracker.generateDisputePackage('iss-1', 'proj-1', 'prop-1', 'u1', []), /commit failed/);
    assert.deepEqual(w.events.filter(([name]) => name === 'delete'), [['delete', w.staged.storageKey]]);
    assert.equal(w.events.some(([name]) => name === 'orphan'), false);
  } finally { w.restore(); }
});

test('when the removal also fails the key is recorded for retry', async () => {
  const w = world({ failTransaction: true, failDelete: true });
  try {
    await assert.rejects(() => tracker.generateDisputePackage('iss-1', 'proj-1', 'prop-1', 'u1', []), /commit failed/);
    assert.deepEqual(w.events.filter(([name]) => name === 'orphan'), [['orphan', w.staged.storageKey]]);
  } finally { w.restore(); }
});

test('the orphan helpers: delete now, else record, and retry until resolved, without throwing', async () => {
  const rows = [];
  const db = { orphanedStorageObject: {
    upsert: async ({ where, create }) => { if (!rows.find((r) => r.storageKey === where.storageKey)) rows.push({ id: `o${rows.length}`, ...create, resolvedAt: null }); return {}; },
    findMany: async () => rows.filter((r) => !r.resolvedAt),
    update: async ({ where, data }) => { Object.assign(rows.find((r) => r.id === where.id), data); return {}; },
  } };
  assert.equal(await discardStagedObject(db, async () => {}, 'k1', 'x'), 'DELETED');
  assert.equal(await discardStagedObject(db, async () => { throw new Error('down'); }, 'k2', 'x'), 'RECORDED_FOR_RETRY');
  assert.equal(await discardStagedObject({ orphanedStorageObject: { upsert: async () => { throw new Error('db down'); } } }, async () => { throw new Error('down'); }, 'k3', 'x'), 'UNRECORDED');
  let up = false;
  const failing = await retryOrphanedObjectCleanup(db, async () => { if (!up) throw new Error('still down'); });
  assert.deepEqual(failing, { attempted: 1, resolved: 0 });
  up = true;
  assert.deepEqual(await retryOrphanedObjectCleanup(db, async () => {}), { attempted: 1, resolved: 1 });
  assert.deepEqual(await retryOrphanedObjectCleanup(db, async () => {}), { attempted: 0, resolved: 0 });
  assert.equal(rows[0].resolvedAt instanceof Date, true);
});

test('the worker retries orphaned objects in its purge tick, and Home Records lists the new type', () => {
  const worker = fs.readFileSync(path.join(__dirname, '../../../workers/src/runners/propertyRecordPurge.cleanup.ts'), 'utf8');
  assert.match(worker, /retryOrphanedObjectCleanup\(prisma as never, \(key\) => deleteObject\(bucket, key\)\)/);
  const routes = fs.readFileSync(path.join(__dirname, '../../src/routes/homeRecords.routes.ts'), 'utf8');
  assert.equal(/PROJECT_DISPUTE_PACKAGE/.test(routes), false, 'a person cannot upload this type');
  const service = fs.readFileSync(path.join(__dirname, '../../src/services/projectTracker.service.ts'), 'utf8');
  assert.equal(/tx\.document\.create\(\{ data: \{ propertyId, projectId, uploadedBy: userId, type: 'OTHER', name: fileName/.test(service), false);
});
