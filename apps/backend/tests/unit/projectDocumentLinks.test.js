'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Project documents, slice 1 (docs/architecture/PROJECT_TRACKER_DOCUMENT_STORE_DESIGN.md §7; owner ruling D-P1): the stored id and bound version are the
// durable reference, the link is its projection, and both are written in one transaction. No database is used.

const { prisma } = require('../../src/lib/prisma.ts');
const { syncProjectDocumentLinks } = require('../../src/services/projectDocumentLinks.ts');
const tracker = require('../../src/services/projectTracker.service.ts');
const audit = require('../../src/services/projectDocumentLinkAudit.service.ts');

// An in-memory PropertyRecordLink table that behaves like the model for the calls the helper makes.
function linkTable(rows = []) {
  let n = 0;
  const table = {
    rows,
    findMany: async ({ where }) => rows.filter((r) => (!where.entityType || (where.entityType.in ? where.entityType.in.includes(r.entityType) : r.entityType === where.entityType))
      && (!where.entityId || (where.entityId.in ? where.entityId.in.includes(r.entityId) : r.entityId === where.entityId))
      && (!where.purpose || r.purpose === where.purpose)),
    create: async ({ data }) => { const row = { id: `l${++n}`, ...data }; rows.push(row); return row; },
    update: async ({ where, data }) => { Object.assign(rows.find((r) => r.id === where.id), data); return {}; },
    delete: async ({ where }) => { rows.splice(rows.findIndex((r) => r.id === where.id), 1); return {}; },
    deleteMany: async ({ where }) => { const ids = new Set(where.id.in); for (let i = rows.length - 1; i >= 0; i -= 1) if (ids.has(rows[i].id)) rows.splice(i, 1); return {}; },
  };
  return table;
}
const common = { entityType: 'PROJECT_ISSUE', entityId: 'iss-1', userId: 'u1' };

test('a replaceable reference moves to the new record and the new version; the old link is removed', async () => {
  const table = linkTable([{ id: 'x', recordId: 'old', versionId: 'v1', entityType: 'PROJECT_PAYMENT', entityId: 'pay-1', purpose: 'RECEIPT' }]);
  const tx = { propertyRecordLink: table };
  const base = { entityType: 'PROJECT_PAYMENT', entityId: 'pay-1', purpose: 'RECEIPT', userId: 'u1', mode: 'REPLACE' };
  await syncProjectDocumentLinks(tx, { ...base, documents: [{ id: 'new', versionId: 'v9' }] });
  assert.deepEqual(table.rows.map((r) => [r.recordId, r.versionId]), [['new', 'v9']]);
  await syncProjectDocumentLinks(tx, { ...base, documents: [{ id: 'new', versionId: 'v10' }] });
  assert.deepEqual(table.rows.map((r) => [r.recordId, r.versionId]), [['new', 'v10']], 'the same record moves to the version it was chosen at');
});

test('evidence keeps the version it was first bound to; only new records bind to their chosen version; unlisted ones are removed', async () => {
  const table = linkTable([{ id: 'a1', recordId: 'a', versionId: 'a-v1', entityType: 'PROJECT_ISSUE', entityId: 'iss-1', purpose: 'EVIDENCE' }]);
  const tx = { propertyRecordLink: table };
  const bound = await syncProjectDocumentLinks(tx, {
    ...common, purpose: 'EVIDENCE', mode: 'KEEP_BOUND_VERSION',
    documents: [{ id: 'a', versionId: 'a-v2' }, { id: 'b', versionId: 'b-v1' }],
  });
  assert.deepEqual(bound, { a: 'a-v1', b: 'b-v1' });
  assert.deepEqual(table.rows.map((r) => [r.recordId, r.versionId]).sort(), [['a', 'a-v1'], ['b', 'b-v1']]);
  await syncProjectDocumentLinks(tx, { ...common, purpose: 'EVIDENCE', mode: 'KEEP_BOUND_VERSION', documents: [{ id: 'b', versionId: 'b-v9' }] });
  assert.deepEqual(table.rows.map((r) => [r.recordId, r.versionId]), [['b', 'b-v1']], 'a removed record loses its link and a kept one keeps its binding');
  // The entity's own stored binding wins even if its link was lost.
  const lost = linkTable([]);
  const again = await syncProjectDocumentLinks({ propertyRecordLink: lost }, { ...common, purpose: 'EVIDENCE', mode: 'KEEP_BOUND_VERSION', boundVersions: { a: 'a-v1' }, documents: [{ id: 'a', versionId: 'a-v7' }] });
  assert.deepEqual(again, { a: 'a-v1' });
});

// Writers: one fake transaction client that records every write and can fail on the link.
function fakeWorld({ failLinks = false, records = ['rec-1'] } = {}) {
  const saved = { co: prisma.projectChangeOrder, t: prisma.$transaction, r: prisma.propertyRecord, d: prisma.document, pr: prisma.projectRecord, pp: prisma.projectPayment, pi: prisma.projectIssue, pn: prisma.projectIssueNote, pl: prisma.propertyRecordLink };
  const log = [];
  const table = linkTable([]);
  const guardedTable = failLinks ? { ...table, create: async () => { throw new Error('link failed'); } } : table;
  const tx = {
    propertyRecord: { findMany: async ({ where }) => records.filter((id) => where.id.in.includes(id)).map((id) => ({ id, title: id, recordType: 'OTHER', sensitivity: 'STANDARD', currentVersionId: `${id}-v1`, currentVersion: { mimeType: 'application/pdf' } })) },
    document: { findMany: async () => [] },
    propertyRecordLink: guardedTable,
    projectPayment: { update: async ({ data }) => { log.push(['payment.update', data]); return { id: 'pay-1' }; } },
    projectIssue: { create: async ({ data }) => { log.push(['issue.create', data]); return { id: 'iss-1' }; }, update: async ({ data }) => { log.push(['issue.update', data]); return { id: 'iss-1' }; } },
    projectIssueNote: { create: async ({ data }) => { log.push(['note.create', data]); return { id: 'note-1' }; }, update: async ({ data }) => { log.push(['note.update', data]); return { id: 'note-1' }; } },
  };
  prisma.$transaction = async (callback) => callback(tx);
  prisma.propertyRecord = tx.propertyRecord;
  prisma.document = tx.document;
  prisma.projectRecord = { findUnique: async () => ({ id: 'proj-1', propertyId: 'prop-1', status: 'IN_PROGRESS', projectType: 'CUSTOM', contractAmountCents: 0, approvedChangeOrderDeltaCents: 0, renovationCaseId: null }), update: async () => ({}) };
  prisma.projectChangeOrder = { aggregate: async () => ({ _sum: { costDeltaCents: 0 } }) };
  prisma.projectPayment = { ...tx.projectPayment, findUnique: async () => ({ id: 'pay-1', projectId: 'proj-1', status: 'DUE', triggerType: 'MANUAL', triggerMilestoneId: null, amountCents: 100 }), aggregate: async () => ({ _sum: { amountCents: 0 } }) };
  prisma.projectIssue = { ...tx.projectIssue, findUnique: async () => ({ id: 'iss-1', projectId: 'proj-1', status: 'OPEN', severity: 'MINOR', blocksPayment: false, sourceEntityType: null, sourceEntityId: null, evidenceDocumentIds: [], evidenceVersionIds: null }), findFirst: async () => null };
  prisma.projectIssueNote = tx.projectIssueNote;
  prisma.propertyRecordLink = guardedTable;
  return { log, table, restore() { prisma.$transaction = saved.t; prisma.propertyRecord = saved.r; prisma.document = saved.d; prisma.projectRecord = saved.pr; prisma.projectPayment = saved.pp; prisma.projectIssue = saved.pi; prisma.projectIssueNote = saved.pn; prisma.propertyRecordLink = saved.pl; prisma.projectChangeOrder = saved.co; } };
}

test('a note stores its evidence ids with the exact versions and the links in one transaction; a link failure fails the write', async () => {
  let w = fakeWorld();
  try {
    await tracker.addIssueNote('iss-1', 'proj-1', 'prop-1', 'u1', { notes: 'The cabinets arrived damaged', evidenceDocumentIds: ['rec-1'] });
    assert.deepEqual(w.log.find(([name]) => name === 'note.create')[1].evidenceDocumentIds, ['rec-1']);
    assert.deepEqual(w.log.find(([name]) => name === 'note.update')[1].evidenceVersionIds, { 'rec-1': 'rec-1-v1' });
    assert.deepEqual(w.table.rows.map((r) => [r.entityType, r.entityId, r.purpose, r.recordId, r.versionId]), [['PROJECT_ISSUE_NOTE', 'note-1', 'EVIDENCE', 'rec-1', 'rec-1-v1']]);
  } finally { w.restore(); }
  w = fakeWorld({ failLinks: true });
  try {
    await assert.rejects(() => tracker.addIssueNote('iss-1', 'proj-1', 'prop-1', 'u1', { notes: 'x', evidenceDocumentIds: ['rec-1'] }), /link failed/);
    assert.equal(w.table.rows.length, 0);
  } finally { w.restore(); }
});

test('a paid receipt is stored as an id on the payment with its link; a record that is not eligible is refused before anything is written', async () => {
  let w = fakeWorld();
  try {
    await tracker.markPaymentPaid('pay-1', 'proj-1', 'prop-1', { receiptDocumentId: 'rec-1', actingUserId: 'u1' });
    assert.equal(w.log.find(([name]) => name === 'payment.update')[1].receiptDocumentId, 'rec-1');
    assert.deepEqual(w.table.rows.map((r) => [r.entityType, r.purpose, r.recordId]), [['PROJECT_PAYMENT', 'RECEIPT', 'rec-1']]);
  } finally { w.restore(); }
  w = fakeWorld({ records: [] });
  try {
    await assert.rejects(() => tracker.markPaymentPaid('pay-1', 'proj-1', 'prop-1', { receiptDocumentId: 'rec-9', actingUserId: 'u1' }), (e) => e.code === 'PROJECT_PAYMENT_RECEIPT_UNAVAILABLE');
    assert.equal(w.log.length, 0);
  } finally { w.restore(); }
});

test('an issue binds its evidence versions when created, and keeps them when the evidence is edited', async () => {
  const w = fakeWorld();
  try {
    await tracker.createIssue('proj-1', 'prop-1', { title: 'Crack', description: 'A crack', severity: 'MINOR', category: 'OTHER', evidenceDocumentIds: ['rec-1'], actingUserId: 'u1' });
    assert.deepEqual(w.log.find(([name]) => name === 'issue.update')[1].evidenceVersionIds, { 'rec-1': 'rec-1-v1' });
    assert.equal(w.table.rows.length, 1);
  } finally { w.restore(); }
});

test('the repair check names exactly what drifted and the repair makes the projection match the stored reference, idempotently', async () => {
  const saved = {};
  const set = (name, value) => { saved[name] = prisma[name]; prisma[name] = value; };
  const links = linkTable([
    { id: 'orphan', recordId: 'rec-1', versionId: 'v1', entityType: 'PROJECT_ISSUE', entityId: 'iss-9', purpose: 'EVIDENCE' },
    { id: 'wrong', recordId: 'rec-1', versionId: 'v-other', entityType: 'PROJECT_ISSUE', entityId: 'iss-1', purpose: 'EVIDENCE' },
  ]);
  const issues = { 'iss-1': { id: 'iss-1', evidenceDocumentIds: ['rec-1', 'rec-2', 'legacy-1'], evidenceVersionIds: { 'rec-1': 'v1' } } };
  set('projectRecord', { findMany: async () => [{ id: 'proj-1', contractDocumentIds: ['rec-1'] }] });
  set('projectPayment', { findMany: async () => [] });
  set('projectChangeOrder', { findMany: async () => [] });
  set('projectProgressLog', { findMany: async () => [] });
  set('projectIssue', { findMany: async () => Object.values(issues), findUnique: async ({ where }) => issues[where.id] ?? null, update: async ({ where, data }) => { Object.assign(issues[where.id], data); return {}; } });
  set('projectIssueNote', { findMany: async () => [] });
  set('projectDisputePackage', { findMany: async () => [] });
  set('propertyRecord', { findMany: async ({ where }) => ['rec-1', 'rec-2'].filter((id) => where.id.in.includes(id)).map((id) => ({ id, currentVersionId: `${id}-cur` })) });
  set('propertyRecordLink', links);
  try {
    const found = await audit.findProjectDocumentLinkProblems();
    const summary = found.map((p) => `${p.kind}:${p.entityType}:${p.entityId}:${p.recordId}`).sort();
    assert.deepEqual(summary, [
      'MISSING_LINK:PROJECT:proj-1:rec-1', 'MISSING_LINK:PROJECT_ISSUE:iss-1:rec-2', 'ORPHAN_LINK:PROJECT_ISSUE:iss-9:rec-1', 'VERSION_MISMATCH:PROJECT_ISSUE:iss-1:rec-1',
    ], 'a legacy id is not a problem');
    const dry = await audit.repairProjectDocumentLinks({ apply: false });
    assert.equal(links.rows.length, 2, 'a dry run changes nothing');
    assert.equal(dry.problems.length, 4);
    const applied = await audit.repairProjectDocumentLinks({ apply: true });
    assert.deepEqual(applied.summary, { created: 2, versionsFixed: 1, orphansRemoved: 1, evidenceVersionsBound: 0 });
    assert.deepEqual(issues['iss-1'].evidenceVersionIds, { 'rec-1': 'v1', 'rec-2': 'rec-2-cur' }, 'newly linked evidence is bound on the entity too');
    assert.deepEqual(await audit.findProjectDocumentLinkProblems(), [], 'verification passes');
    assert.deepEqual((await audit.repairProjectDocumentLinks({ apply: true })).summary, { created: 0, versionsFixed: 0, orphansRemoved: 0, evidenceVersionsBound: 0 });
  } finally { for (const [name, value] of Object.entries(saved)) prisma[name] = value; }
});

test('new Home Record link types exist for deletion impact, and the photo gate counts Home Record photos', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  const schema = read('prisma/schema.prisma');
  for (const type of ['PROJECT_PAYMENT', 'PROJECT_CHANGE_ORDER', 'PROJECT_PROGRESS_LOG', 'PROJECT_ISSUE', 'PROJECT_ISSUE_NOTE']) {
    assert.match(schema, new RegExp(`enum PropertyRecordLinkEntityType \\{[^}]*\\b${type}\\b`, 's'));
    assert.ok(read('src/services/homeRecords.service.ts').includes(`case '${type}'`), `${type} has an existence check`);
  }
  const service = read('src/services/projectTracker.service.ts');
  assert.equal((service.match(/photoDocumentIds: \{ isEmpty: false \}/g) ?? []).length, 2, 'both photo-evidence queries count record photos');
});
