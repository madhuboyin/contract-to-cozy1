const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 6 (provenance and evidence trace, ASK_COZY_PROVENANCE_EVIDENCE_IMPACT_TRACE.md).
//   F6-2: a link must not return a record's title, type or file facts to a role that cannot see the record.
//   F6-4: attaching a document to an event is atomic, and detaching removes the evidence row that attaching created.
// These run the real service code against an in-memory fake that EVALUATES the filters and the transaction (not a source-text check). They prove the
// service logic. They do not prove anything about Prisma's SQL or a real database.

const state = {
  events: [], documents: [], eventDocuments: [], eventEvidence: [],
  // A link carries its record inline so the fake can evaluate `record: { visibility }` the way the database does.
  links: [],
  failEvidenceWrite: false,
};

const matchesRecordFilter = (record, filter) => {
  if (!filter) return true;
  if (filter.propertyId && record.propertyId !== filter.propertyId) return false;
  if (filter.visibility && record.visibility !== filter.visibility) return false;
  return true;
};

function linkRows(where) {
  const ids = where.entityId?.in ?? [where.entityId];
  return state.links
    .filter((link) => link.entityType === where.entityType && ids.includes(link.entityId) && matchesRecordFilter(link.record, where.record))
    .map((link) => ({ ...link, record: { id: link.record.id, title: link.record.title, recordType: link.record.recordType, lifecycleStatus: link.record.lifecycleStatus }, version: null }));
}

function makeTx(target) {
  return {
    homeEventDocument: {
      upsert: async ({ where, create }) => {
        const key = `${where.eventId_documentId.eventId}|${where.eventId_documentId.documentId}`;
        let row = target.eventDocuments.find((r) => r.key === key);
        if (!row) { row = { key, ...create }; target.eventDocuments.push(row); }
        return { ...row, document: target.documents.find((d) => d.id === row.documentId), event: { id: row.eventId, title: 'e' } };
      },
      delete: async ({ where }) => {
        const key = `${where.eventId_documentId.eventId}|${where.eventId_documentId.documentId}`;
        const index = target.eventDocuments.findIndex((r) => r.key === key);
        if (index < 0) throw new Error('record to delete does not exist');
        target.eventDocuments.splice(index, 1);
      },
    },
    homeEventEvidence: {
      upsert: async ({ where, create }) => {
        if (state.failEvidenceWrite) throw new Error('evidence write failed');
        const key = `${where.eventId_evidenceKey.eventId}|${where.eventId_evidenceKey.evidenceKey}`;
        let row = target.eventEvidence.find((r) => r.key === key);
        if (!row) { row = { key, note: null, observedAt: null, ...create }; target.eventEvidence.push(row); }
        return row;
      },
      deleteMany: async ({ where }) => {
        const before = target.eventEvidence.length;
        target.eventEvidence = target.eventEvidence.filter((r) => !(
          r.eventId === where.eventId && r.evidenceKey === where.evidenceKey && r.evidenceType === where.evidenceType
          && r.note === where.note && r.observedAt === where.observedAt));
        return { count: before - target.eventEvidence.length };
      },
    },
  };
}

const fakePrisma = {
  homeEvent: {
    findMany: async () => state.events,
    findFirst: async ({ where }) => state.events.find((event) => event.id === where.id && event.propertyId === where.propertyId) ?? null,
  },
  document: { findUnique: async ({ where }) => state.documents.find((d) => d.id === where.id) ?? null },
  propertyRecordLink: { findMany: async ({ where }) => linkRows(where) },
  homeEventDocument: makeTx(state).homeEventDocument,
  homeEventEvidence: makeTx(state).homeEventEvidence,
  // Transaction semantics: writes go to a staged copy and are kept only if the callback resolves.
  $transaction: async (callback) => {
    const staged = {
      eventDocuments: state.eventDocuments.map((r) => ({ ...r })),
      eventEvidence: state.eventEvidence.map((r) => ({ ...r })),
      documents: state.documents,
    };
    const result = await callback(makeTx(staged));
    state.eventDocuments = staged.eventDocuments;
    state.eventEvidence = staged.eventEvidence;
    return result;
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: fakePrisma } };

const { HomeEventsService } = require('../../src/services/homeEvents.service.ts');
const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');
const service = new HomeEventsService();

const record = (id, visibility, title) => ({ id, propertyId: 'p1', visibility, title, recordType: 'OTHER', lifecycleStatus: 'ACTIVE' });

function reset() {
  state.events = [{ id: 'e1', propertyId: 'p1', type: 'MILESTONE', title: 'Roof replaced', occurredAt: new Date('2026-01-01'), importance: 'NORMAL', datePrecision: 'EXACT_DATE', verificationStatus: 'UNVERIFIED', sourceType: 'USER', observationKind: 'USER_REPORTED', isCurrent: true, documents: [], evidence: [], verificationRecords: [] }];
  state.documents = [{ id: 'd1', propertyId: 'p1', name: 'invoice.pdf' }];
  state.eventDocuments = [];
  state.eventEvidence = [];
  state.failEvidenceWrite = false;
  state.links = [
    { id: 'l1', entityType: 'HOME_EVENT', entityId: 'e1', purpose: 'EVIDENCE', record: record('r-household', 'HOUSEHOLD', 'Roof invoice') },
    { id: 'l2', entityType: 'HOME_EVENT', entityId: 'e1', purpose: 'EVIDENCE', record: record('r-owner', 'OWNER_ONLY', 'Divorce settlement') },
    { id: 'l3', entityType: 'MATERIAL_SPEC', entityId: 's1', purpose: 'APPROVED', record: record('m-household', 'HOUSEHOLD', 'Tile spec sheet') },
    { id: 'l4', entityType: 'MATERIAL_SPEC', entityId: 's1', purpose: 'INSTALLED', record: record('m-owner', 'OWNER_ONLY', 'Private appraisal') },
  ];
}
test.beforeEach(reset);

const titles = (links) => links.map((link) => link.record.title).sort();

test('F6-2 Timeline list: an owner-only record linked to an event is returned to the owner and to no one else', async () => {
  const owner = await service.listHomeEvents('p1', { type: 'MILESTONE' }, 'OWNER');
  assert.deepEqual(titles(owner.events[0].propertyRecordLinks), ['Divorce settlement', 'Roof invoice']);
  for (const role of ['CONTRIBUTOR', 'VIEWER']) {
    const other = await service.listHomeEvents('p1', { type: 'MILESTONE' }, role);
    assert.deepEqual(titles(other.events[0].propertyRecordLinks), ['Roof invoice'], role);
  }
});

test('F6-2 Timeline detail: the same rule applies to a single event', async () => {
  assert.deepEqual(titles((await service.getHomeEvent('p1', 'e1', 'OWNER')).propertyRecordLinks), ['Divorce settlement', 'Roof invoice']);
  assert.deepEqual(titles((await service.getHomeEvent('p1', 'e1', 'CONTRIBUTOR')).propertyRecordLinks), ['Roof invoice']);
  assert.deepEqual(titles((await service.getHomeEvent('p1', 'e1', 'VIEWER')).propertyRecordLinks), ['Roof invoice']);
});

test('F6-2 an omitted role is the least privileged, so a caller that forgets to pass one hides a record instead of revealing it', async () => {
  assert.deepEqual(titles((await service.getHomeEvent('p1', 'e1')).propertyRecordLinks), ['Roof invoice']);
  assert.deepEqual(titles((await service.listHomeEvents('p1', { type: 'MILESTONE' })).events[0].propertyRecordLinks), ['Roof invoice']);
});

test('F6-2 Material Spec detail applies the same rule', async () => {
  const materials = new MaterialSpecService();
  require.cache[prismaPath].exports.prisma.materialSpec = { findFirst: async () => ({ id: 's1', propertyId: 'p1', label: 'Kitchen tile' }) };
  const titlesOf = (spec) => spec.homeRecordLinks.map((link) => link.title).sort();
  assert.deepEqual(titlesOf(await materials.getSpec('p1', 's1', 'OWNER')), ['Private appraisal', 'Tile spec sheet']);
  assert.deepEqual(titlesOf(await materials.getSpec('p1', 's1', 'CONTRIBUTOR')), ['Tile spec sheet']);
  assert.deepEqual(titlesOf(await materials.getSpec('p1', 's1', 'VIEWER')), ['Tile spec sheet']);
  assert.deepEqual(titlesOf(await materials.getSpec('p1', 's1')), ['Tile spec sheet'], 'omitted role');
});

test('F6-4 attach writes the link and the evidence row together', async () => {
  const link = await service.attachDocument({ propertyId: 'p1', eventId: 'e1', documentId: 'd1', userId: 'u1' });
  assert.equal(link.documentId, 'd1');
  assert.equal(state.eventDocuments.length, 1);
  assert.deepEqual(state.eventEvidence.map((row) => row.evidenceKey), ['document:d1']);
});

test('F6-4 a failure on the second write rolls the first back, so there is never a link without its evidence row', async () => {
  state.failEvidenceWrite = true;
  await assert.rejects(service.attachDocument({ propertyId: 'p1', eventId: 'e1', documentId: 'd1', userId: 'u1' }), /evidence write failed/);
  assert.deepEqual([state.eventDocuments.length, state.eventEvidence.length], [0, 0]);
});

test('F6-4 attaching the same document twice is harmless', async () => {
  await service.attachDocument({ propertyId: 'p1', eventId: 'e1', documentId: 'd1', userId: 'u1' });
  await service.attachDocument({ propertyId: 'p1', eventId: 'e1', documentId: 'd1', userId: 'u1' });
  assert.deepEqual([state.eventDocuments.length, state.eventEvidence.length], [1, 1]);
});

test('F6-4 detach removes the link and the evidence row attach created, so the event no longer lists the document', async () => {
  await service.attachDocument({ propertyId: 'p1', eventId: 'e1', documentId: 'd1', userId: 'u1' });
  await service.detachDocument('p1', 'e1', 'd1');
  assert.deepEqual([state.eventDocuments.length, state.eventEvidence.length], [0, 0]);
});

test('F6-4 detach keeps evidence a person added deliberately, with a note or an observed date', async () => {
  await service.attachDocument({ propertyId: 'p1', eventId: 'e1', documentId: 'd1', userId: 'u1' });
  state.eventEvidence[0].note = 'Receipt from the roofer, paid in cash';
  await service.detachDocument('p1', 'e1', 'd1');
  assert.equal(state.eventDocuments.length, 0, 'the document link is removed');
  assert.equal(state.eventEvidence.length, 1, 'the annotated evidence stays');
  assert.equal(state.eventEvidence[0].note, 'Receipt from the roofer, paid in cash');
});

test('F6-4 detach of a document that was never attached still reports it, and leaves other evidence alone', async () => {
  state.eventEvidence.push({ key: 'e1|document:other', eventId: 'e1', evidenceKey: 'document:other', evidenceType: 'DOCUMENT', note: null, observedAt: null });
  await assert.rejects(service.detachDocument('p1', 'e1', 'd1'), /does not exist/);
  assert.equal(state.eventEvidence.length, 1);
});

test('callers pass the asking user\'s role to the readers that return linked records', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = (file) => fs.readFileSync(path.resolve(__dirname, '../../src', file), 'utf8');
  assert.match(src('controllers/homeEvents.controller.ts'), /service\.getHomeEvent\(propertyId, eventId, req\.householdRole\)/);
  assert.match(src('controllers/homeEvents.controller.ts'), /includeSignals,\n    \}, req\.householdRole\)/);
  assert.match(src('controllers/materialSpec.controller.ts'), /service\.getSpec\(propertyId, specId, req\.householdRole\)/);
  assert.match(src('services/ask/handlers/homeTimeline.handler.ts'), /listHomeEvents\(propertyId, \{ limit: HOME_TIMELINE_ASK_LIMIT \}, access\.role\)/);
});
