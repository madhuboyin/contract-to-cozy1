// BICC-3.1 (MM-001/002/003/004/010): receiving, listing and removing an ephemeral chat attachment. Prisma, storage, the malware scan and access checks are replaced by
// in-memory fakes; nothing here touches a database, S3 or a browser.
require('ts-node/register');
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../../src/lib/prisma.ts');
const { attachmentService, MAX_LIVE_ATTACHMENTS_PER_USER } = require('../../src/services/ask/attachments/attachment.service.ts');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(16)]);
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');

function fake() {
  const rows = []; const sessions = []; const events = []; let id = 0;
  const orig = { a: prisma.askChatAttachment, s: prisma.askSession };
  const match = (r, w) => Object.entries(w).every(([k, v]) => (k === 'state' && v?.in ? v.in.includes(r.state) : k === 'deleteAfter' && v?.gt ? r.deleteAfter > v.gt : r[k] === v));
  prisma.askSession = { findFirst: async ({ where }) => sessions.find((s) => s.id === where.id && (!where.userId || s.userId === where.userId)) ?? null };
  prisma.askChatAttachment = {
    count: async ({ where }) => rows.filter((r) => match(r, where)).length,
    create: async ({ data }) => { const row = { id: `att${++id}`, ...data }; rows.push(row); return row; },
    update: async ({ where, data }) => { const r = rows.find((x) => x.id === where.id); Object.assign(r, data); return r; },
    updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    findFirst: async ({ where }) => rows.find((r) => match(r, where)) ?? null,
    findMany: async ({ where }) => rows.filter((r) => match(r, where)),
  };
  const objects = {
    stored: new Set(), failPut: false, failDelete: false,
    async putRaw(owner, attachmentId, bytes) { events.push(['put', owner.userId, owner.scopeKind, owner.scopeId, attachmentId]); if (this.failPut) throw new Error('s3 down'); this.stored.add(attachmentId); },
    async deleteCopies(att, kinds) { events.push(['delete', att.id, kinds.length]); if (this.failDelete) return { failed: [...kinds] }; this.stored.delete(att.id); return { failed: [] }; },
  };
  return { rows, sessions, events, objects, restore() { prisma.askChatAttachment = orig.a; prisma.askSession = orig.s; } };
}
const deps = (f, over = {}) => ({ objects: f.objects, scan: async () => ({ status: 'CLEAN' }), propertyRole: async (u, p) => (p === 'p1' ? 'OWNER' : p === 'pv' ? 'VIEWER' : null), candidateExists: async (u, c) => c === 'c1' && u === 'u1', now: () => new Date('2026-11-25T12:00:00Z'), ...over });
const file = (buffer, name = 'a.pdf', mimetype = 'application/pdf') => ({ originalname: name, mimetype, buffer });
const up = (f, o = {}, d = {}) => attachmentService.upload('u1', { scopeKind: 'PROPERTY', scopeId: 'p1', file: file(PDF), ...o }, deps(f, d));

test('a good PDF is stored under the person and scope, ends READY (not analysed), and expires 24 hours after upload', async () => {
  const f = fake();
  try {
    const view = await up(f);
    assert.equal(view.state, 'READY');
    assert.equal(view.type, 'application/pdf');
    assert.equal(view.scopeKind, 'PROPERTY');
    assert.equal(new Date(view.deleteAfter).getTime() - new Date(view.uploadedAt).getTime(), 24 * 3600 * 1000);
    assert.deepEqual(f.events[0].slice(0, 4), ['put', 'u1', 'PROPERTY', 'p1']);
    assert.equal(f.rows[0].userId, 'u1');
    assert.match(f.rows[0].sha256, /^[0-9a-f]{64}$/);
    assert.equal('storageKey' in view, false, 'no storage key is exposed');
    assert.equal(f.rows[0].analysisCompletedAt, undefined, 'uploading never analyses (MM-003)');
  } finally { f.restore(); }
});

test('the type comes from the bytes: a mismatched declared type, an executable, an empty file and HEIC are refused and nothing is stored', async () => {
  const f = fake();
  try {
    const cases = [
      [file(EXE, 'a.pdf', 'application/pdf'), 'ATTACHMENT_TYPE_NOT_ALLOWED'],
      [file(JPG, 'a.pdf', 'application/pdf'), 'ATTACHMENT_TYPE_MISMATCH'],
      [file(Buffer.alloc(0)), 'ATTACHMENT_EMPTY'],
      [file(HEIC, 'a.heic', 'image/heic'), 'ATTACHMENT_HEIC_CONVERSION_UNAVAILABLE'],
    ];
    for (const [fl, code] of cases) await assert.rejects(() => up(f, { file: fl }), (e) => e.code === code, code);
    await assert.rejects(() => up(f, { file: file(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(11 * 1024 * 1024)])) }), (e) => e.code === 'ATTACHMENT_TOO_LARGE' && e.statusCode === 413);
    assert.equal(f.rows.length, 0);
    assert.equal(f.events.length, 0);
  } finally { f.restore(); }
});

test('a file the scanner rejects is refused before any row or copy exists', async () => {
  const f = fake();
  try {
    await assert.rejects(() => up(f, {}, { scan: async () => ({ status: 'REJECTED' }) }), (e) => e.code === 'ATTACHMENT_MALWARE_DETECTED' && e.statusCode === 422);
    assert.equal(f.rows.length, 0); assert.equal(f.events.length, 0);
    // an unavailable scanner throws (503 upstream) and also stores nothing
    await assert.rejects(() => up(f, {}, { scan: async () => { throw new Error('clamd down'); } }));
    assert.equal(f.rows.length, 0); assert.equal(f.events.length, 0);
  } finally { f.restore(); }
});

test('scope: another person\'s or a missing home is "not found", a viewer cannot add, and a candidate must be the person\'s own', async () => {
  const f = fake();
  try {
    await assert.rejects(() => up(f, { scopeId: 'someone-elses' }), (e) => e.code === 'ATTACHMENT_SCOPE_NOT_FOUND' && e.statusCode === 404);
    await assert.rejects(() => up(f, { scopeId: 'pv' }), (e) => e.code === 'ATTACHMENT_ROLE_FORBIDDEN' && e.statusCode === 403);
    await assert.rejects(() => up(f, { scopeKind: 'CANDIDATE', scopeId: 'c-other' }), (e) => e.code === 'ATTACHMENT_SCOPE_NOT_FOUND');
    await assert.rejects(() => up(f, { scopeKind: 'DOCUMENT', scopeId: 'p1' }), (e) => e.code === 'ATTACHMENT_SCOPE_INVALID');
    await assert.rejects(() => up(f, { scopeId: '../etc' }), (e) => e.code === 'ATTACHMENT_SCOPE_INVALID');
    const ok = await up(f, { scopeKind: 'CANDIDATE', scopeId: 'c1' });
    assert.equal(ok.scopeKind, 'CANDIDATE');
    assert.equal(f.rows.length, 1);
  } finally { f.restore(); }
});

test('another person\'s conversation id cannot be used; one that does not exist yet is fine', async () => {
  const f = fake(); f.sessions.push({ id: 'theirs', userId: 'u2' }, { id: 'mine', userId: 'u1' });
  try {
    await assert.rejects(() => up(f, { sessionId: 'theirs' }), (e) => e.code === 'ATTACHMENT_SCOPE_NOT_FOUND');
    assert.equal((await up(f, { sessionId: 'mine' })).sessionId, 'mine');
    assert.equal((await up(f, { sessionId: 'brand-new' })).sessionId, 'brand-new');
  } finally { f.restore(); }
});

test('a person can keep only ten live files; the eleventh is refused with a way forward', async () => {
  const f = fake();
  try {
    for (let i = 0; i < MAX_LIVE_ATTACHMENTS_PER_USER; i += 1) await up(f);
    await assert.rejects(() => up(f), (e) => e.code === 'ATTACHMENT_LIMIT_REACHED' && e.statusCode === 429 && /Remove one/.test(e.message));
    assert.equal(f.rows.length, MAX_LIVE_ATTACHMENTS_PER_USER);
  } finally { f.restore(); }
});

test('a storage failure leaves no live file: copies are cleaned up, the row is FAILED with the one-hour deadline, and the person is told to retry', async () => {
  const f = fake(); f.objects.failPut = true;
  try {
    await assert.rejects(() => up(f), (e) => e.code === 'ATTACHMENT_STORAGE_FAILED' && e.statusCode === 503);
    assert.equal(f.rows.length, 1);
    assert.equal(f.rows[0].state, 'FAILED');
    assert.equal(f.rows[0].deleteAfter.getTime() - new Date('2026-11-25T12:00:00Z').getTime(), 3600 * 1000);
    assert.ok(f.events.some((e) => e[0] === 'delete'), 'whatever may have been written is removed');
    // a FAILED row is listed so the client can show it and offer a retry (a new upload); it is never READY, so nothing can ask about it
    f.rows[0].deleteAfter = new Date(Date.now() + 1800 * 1000); // the fixture clock is fixed in the past; make it live now
    const listed = await attachmentService.list('u1');
    assert.deepEqual(listed.map((v) => v.state), ['FAILED']);
  } finally { f.restore(); }
});

test('list is the caller\'s own, hides expired and ended files, and can be narrowed to one conversation', async () => {
  const f = fake();
  try {
    const a = await up(f, { sessionId: 's1' }); await up(f, { sessionId: 's2' });
    f.rows.push({ id: 'other', userId: 'u2', state: 'READY', deleteAfter: new Date('2099-01-01'), uploadedAt: new Date(), scopeKind: 'PROPERTY', scopeId: 'p9', originalFileName: 'x', sizeBytes: 1, declaredMimeType: 'application/pdf', detectedMimeType: 'application/pdf', sessionId: 's1' });
    f.rows.push({ id: 'old', userId: 'u1', state: 'READY', deleteAfter: new Date('2000-01-01'), uploadedAt: new Date(), scopeKind: 'PROPERTY', scopeId: 'p1', originalFileName: 'old', sizeBytes: 1, declaredMimeType: 'application/pdf', detectedMimeType: 'application/pdf', sessionId: 's1' });
    f.rows.push({ id: 'gone', userId: 'u1', state: 'DELETED', deleteAfter: new Date('2099-01-01'), uploadedAt: new Date(), scopeKind: 'PROPERTY', scopeId: 'p1', originalFileName: 'gone', sizeBytes: 1, declaredMimeType: 'application/pdf', detectedMimeType: 'application/pdf', sessionId: 's1' });
    const mine = await attachmentService.list('u1');
    assert.deepEqual(mine.map((v) => v.id).sort(), ['att1', 'att2']);
    assert.deepEqual((await attachmentService.list('u1', 's1')).map((v) => v.id), [a.id]);
  } finally { f.restore(); }
});

test('removing deletes every copy then ends the row; a copy that cannot be removed leaves it due for the sweep, and another person\'s file is not found', async () => {
  const f = fake();
  try {
    const a = await up(f); const b = await up(f);
    assert.deepEqual(await attachmentService.remove('u1', a.id, deps(f)), { deleted: true });
    assert.equal(f.rows.find((r) => r.id === a.id).state, 'DELETED');
    assert.equal(f.rows.find((r) => r.id === a.id).endedReason, 'USER_REMOVED');
    f.objects.failDelete = true;
    assert.deepEqual(await attachmentService.remove('u1', b.id, deps(f)), { deleted: false, retryLater: true });
    const rowB = f.rows.find((r) => r.id === b.id);
    assert.notEqual(rowB.state, 'DELETED', 'never claimed gone while a copy may remain');
    assert.ok(rowB.deleteAfter.getTime() <= Date.now(), 'left due so the sweeper retries');
    await assert.rejects(() => attachmentService.remove('u2', b.id, deps(f)), (e) => e.code === 'ATTACHMENT_NOT_FOUND' && e.statusCode === 404);
    await assert.rejects(() => attachmentService.remove('u1', 'nope', deps(f)), (e) => e.code === 'ATTACHMENT_NOT_FOUND');
  } finally { f.restore(); }
});

test('(STATIC) routes, session deletion and the worker job are wired to the real services', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
  const routes = read('src/routes/ask.routes.ts');
  assert.match(routes, /router\.post\('\/ask\/attachments', uploadRateLimiter, attachmentUpload\.single\('file'\), postAskAttachment\)/);
  assert.match(routes, /router\.delete\('\/ask\/attachments\/:attachmentId'/);
  assert.match(read('src/services/ask/askRetention.service.ts'), /deleteSessionAttachments\(\{ store: prismaAttachmentSweepStore, storage: s3AttachmentObjectStore, userId, sessionId \}\)/);
  assert.match(read('../workers/src/jobs/cleanupAskAttachments.job.ts'), /storage: AttachmentDerivedStorage = s3AttachmentObjectStore/);
  assert.doesNotMatch(read('src/controllers/askAttachments.controller.ts').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'), /analy[sz]e|promot|HomeRecord|propertyRecord/i, 'the upload path creates no record and runs no analysis (MM-003)');
});
