// BICC-3.1: attachment lifecycle and isolation (MM-002, 003, 004, 005, 010; FRD D04, D10). Pure rules and the sweeper against in-memory fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const policy = require('../../src/services/ask/attachments/attachmentPolicy.ts');
const life = require('../../src/services/ask/attachments/attachmentLifecycle.ts');
const { sweepExpiredAttachments, deleteSessionAttachments } = require('../../src/services/ask/attachments/attachmentSweeper.ts');

const bytes = (...values) => Uint8Array.from(values);
const pdf = Uint8Array.from(Buffer.from('%PDF-1.7 rest of file'));
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const ftyp = (brand) => Uint8Array.from(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(12)]));

test('the type comes from the bytes: PDF, JPEG, PNG, HEIC and HEIF are recognised, and nothing else is', () => {
  assert.equal(policy.sniffAttachmentType(pdf), 'application/pdf');
  assert.equal(policy.sniffAttachmentType(jpeg), 'image/jpeg');
  assert.equal(policy.sniffAttachmentType(png), 'image/png');
  assert.equal(policy.sniffAttachmentType(ftyp('heic')), 'image/heic');
  assert.equal(policy.sniffAttachmentType(ftyp('heix')), 'image/heic');
  assert.equal(policy.sniffAttachmentType(ftyp('mif1')), 'image/heif');
  for (const other of [bytes(), bytes(1, 2, 3), Uint8Array.from(Buffer.from('<html></html>')), Uint8Array.from(Buffer.from('MZ\x90\x00')), ftyp('mp42'), Uint8Array.from(Buffer.from('GIF89a')), Uint8Array.from(Buffer.from('PK\x03\x04'))]) assert.equal(policy.sniffAttachmentType(other), null);
});

test('a declared type or extension is never authoritative: a mismatch is refused, an octet-stream declaration defers to the content', () => {
  assert.equal(policy.validateAttachment({ declaredMimeType: 'application/pdf', bytes: jpeg }).code, 'TYPE_MISMATCH');
  assert.equal(policy.validateAttachment({ declaredMimeType: 'image/png', bytes: pdf }).code, 'TYPE_MISMATCH');
  assert.equal(policy.validateAttachment({ declaredMimeType: 'application/pdf', bytes: Uint8Array.from(Buffer.from('not a pdf at all')) }).code, 'TYPE_NOT_ALLOWED');
  assert.deepEqual(policy.validateAttachment({ declaredMimeType: 'application/octet-stream', bytes: jpeg }), { ok: true, type: 'image/jpeg', needsConversion: false });
  assert.deepEqual(policy.validateAttachment({ declaredMimeType: 'image/jpg', bytes: jpeg }), { ok: true, type: 'image/jpeg', needsConversion: false });
  assert.equal(policy.validateAttachment({ declaredMimeType: 'application/pdf; charset=binary', bytes: pdf }).ok, true);
});

test('empty and oversized files are refused with a way forward; the effective ceiling is the current Ask intake limit, not the provisional 25 MB', () => {
  assert.equal(policy.validateAttachment({ declaredMimeType: 'application/pdf', bytes: bytes() }).code, 'EMPTY');
  const big = policy.validateAttachment({ declaredMimeType: 'application/pdf', bytes: pdf, maxBytes: 10 });
  assert.equal(big.code, 'TOO_LARGE');
  assert.match(big.message, /smaller file|lower-resolution/);
  assert.equal(policy.ATTACHMENT_EFFECTIVE_MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(policy.ATTACHMENT_PROVISIONAL_TARGET_BYTES, 25 * 1024 * 1024);
});

test('HEIC and HEIF are converted when the server can, and otherwise rejected with a specific recovery (MM-002), never accepted unconverted', () => {
  const heic = ftyp('heic');
  const without = policy.validateAttachment({ declaredMimeType: 'image/heic', bytes: heic });
  assert.equal(without.code, 'HEIC_CONVERSION_UNAVAILABLE');
  assert.match(without.message, /JPEG/);
  assert.deepEqual(policy.validateAttachment({ declaredMimeType: 'image/heif', bytes: ftyp('mif1'), canConvertHeic: true }), { ok: true, type: 'image/heif', needsConversion: true });
  assert.equal(policy.validateAttachment({ declaredMimeType: 'image/jpeg', bytes: heic, canConvertHeic: true }).code, 'TYPE_MISMATCH', 'HEIC bytes declared as JPEG are a mismatch');
});

const T0 = new Date('2026-11-23T10:00:00Z'); const H = 60 * 60 * 1000;
test('D10 retention: 24h after analysis completes, 24h after upload if never analysed, 1h for a failed or unfinished upload', () => {
  assert.equal(life.deleteAfter({ state: 'ANALYZED', uploadedAt: T0, analysisCompletedAt: new Date(T0.getTime() + 2 * H) }).getTime(), T0.getTime() + 26 * H);
  assert.equal(life.deleteAfter({ state: 'READY', uploadedAt: T0 }).getTime(), T0.getTime() + 24 * H);
  assert.equal(life.deleteAfter({ state: 'FAILED', uploadedAt: T0 }).getTime(), T0.getTime() + 1 * H);
  assert.equal(life.deleteAfter({ state: 'UPLOADING', uploadedAt: T0 }).getTime(), T0.getTime() + 1 * H);
  assert.equal(life.deleteAfter({ state: 'PROMOTED', uploadedAt: T0 }).getTime(), T0.getTime() + 24 * H, 'a promoted chat copy still ends; the canonical record has its own retention');
});

test('a retention period is a boundary: expired exactly at deleteAfter, not a moment before, never for a terminal state', () => {
  const times = { state: 'ANALYZED', uploadedAt: T0, analysisCompletedAt: T0 };
  assert.equal(life.isExpired(times, new Date(T0.getTime() + 24 * H - 1)), false);
  assert.equal(life.isExpired(times, new Date(T0.getTime() + 24 * H)), true);
  assert.equal(life.isExpired({ ...times, state: 'DELETED' }, new Date(T0.getTime() + 99 * H)), false);
  assert.equal(life.isExpired({ ...times, state: 'EXPIRED' }, new Date(T0.getTime() + 99 * H)), false);
});

test('MM-003: analysis never leads to a canonical state; promotion is a separate, explicit transition and terminal states never move', () => {
  assert.equal(life.canTransition('ANALYZING', 'ANALYZED'), true);
  assert.equal(life.canTransition('ANALYZING', 'PROMOTED'), false, 'analysing cannot promote');
  assert.equal(life.canTransition('ANALYZED', 'PROMOTED'), true);
  for (const terminal of ['DELETED', 'EXPIRED']) for (const to of life.ATTACHMENT_STATES) assert.equal(life.canTransition(terminal, to), false, `${terminal} -> ${to}`);
  assert.throws(() => life.transition('UPLOADING', 'ANALYZED'), /cannot move from UPLOADING to ANALYZED/);
  assert.equal(life.transition('READY', 'ANALYZING'), 'ANALYZING');
});

test('MM-004/005: retrieval needs the owner, a reachable scope and a live state; deletion, expiry, access loss and another person each yield nothing', () => {
  const att = { userId: 'u1', scopeKind: 'PROPERTY', scopeId: 'p1', state: 'ANALYZED' };
  const reader = { userId: 'u1', reachableScopes: new Set([life.attachmentScopeKey('PROPERTY', 'p1')]) };
  assert.equal(life.canRetrieve(att, reader), true);
  assert.equal(life.canRetrieve({ ...att, state: 'DELETED' }, reader), false);
  assert.equal(life.canRetrieve({ ...att, state: 'EXPIRED' }, reader), false);
  assert.equal(life.canRetrieve({ ...att, state: 'UPLOADING' }, reader), false, 'an unfinished upload is not retrievable');
  assert.equal(life.canRetrieve({ ...att, state: 'FAILED' }, reader), false);
  assert.equal(life.canRetrieve(att, { ...reader, reachableScopes: new Set() }), false, 'access to the home was lost');
  assert.equal(life.canRetrieve(att, { ...reader, userId: 'u2' }), false, 'another person');
  assert.equal(life.canRetrieve({ ...att, scopeKind: 'CANDIDATE' }, reader), false, 'a candidate scope is not the home scope of the same id');
});

test('storage keys carry owner and scope, accept only safe characters, and one person\'s key cannot address another\'s', () => {
  const owner = { userId: 'u1', scopeKind: 'PROPERTY', scopeId: 'p1' };
  assert.equal(life.storageKeyFor(owner, 'a1'), 'ask-attachments/u1/property/p1/a1/raw_file');
  assert.equal(life.storageKeyFor({ ...owner, scopeKind: 'CANDIDATE' }, 'a1', 'PREVIEW'), 'ask-attachments/u1/candidate/p1/a1/preview');
  for (const bad of ['../x', 'a/b', 'a b', '', 'x'.repeat(81)]) assert.throws(() => life.storageKeyFor(owner, bad), /accept only/, bad);
  assert.throws(() => life.storageKeyFor({ ...owner, userId: 'u1/../u2' }, 'a1'), /accept only/);
  assert.notEqual(life.storageKeyFor(owner, 'a1'), life.storageKeyFor({ ...owner, userId: 'u2' }, 'a1'));
});

test('MM-010: a deletion plan covers the raw file, preview, OCR text, chunks and derived index', () => {
  assert.deepEqual([...life.deletionPlan()], ['RAW_FILE', 'PREVIEW', 'OCR_TEXT', 'CHUNKS', 'DERIVED_INDEX']);
});

// ---- the sweeper ----
const row = (id, state, extra = {}) => ({ id, userId: 'u1', scopeKind: 'PROPERTY', scopeId: 'p1', sessionId: 's1', state, deleteAfter: T0, ...extra });
function fakes(rows, { failFor = new Set() } = {}) {
  const ended = []; const deleted = [];
  const store = {
    findDue: async (now, limit) => rows.filter((r) => !['DELETED', 'EXPIRED'].includes(r.state) && r.deleteAfter <= now).slice(0, limit),
    findBySession: async (userId, sessionId) => rows.filter((r) => r.userId === userId && r.sessionId === sessionId && !['DELETED', 'EXPIRED'].includes(r.state)),
    markEnded: async (id, state, reason) => { ended.push({ id, state, reason }); const r = rows.find((x) => x.id === id); if (r) r.state = state; },
  };
  const storage = { deleteCopies: async (attachment, kinds) => { deleted.push({ id: attachment.id, kinds: [...kinds] }); return { failed: failFor.has(attachment.id) ? ['CHUNKS'] : [] }; } };
  return { store, storage, ended, deleted };
}
const LATER = new Date(T0.getTime() + 1);

test('the sweep removes every copy of each due attachment, then ends it: failed uploads as DELETED, everything else as EXPIRED', async () => {
  const f = fakes([row('a', 'ANALYZED'), row('b', 'FAILED'), row('c', 'READY'), row('d', 'ANALYZED', { deleteAfter: new Date(T0.getTime() + 99 * H) })]);
  const result = await sweepExpiredAttachments({ ...f, now: LATER });
  assert.deepEqual(result, { examined: 3, ended: 3, retryLater: 0 });
  assert.deepEqual(f.ended.map((e) => [e.id, e.state, e.reason]), [['a', 'EXPIRED', 'RETENTION_ELAPSED'], ['b', 'DELETED', 'FAILED_UPLOAD_CLEANUP'], ['c', 'EXPIRED', 'RETENTION_ELAPSED']]);
  for (const d of f.deleted) assert.deepEqual(d.kinds, ['RAW_FILE', 'PREVIEW', 'OCR_TEXT', 'CHUNKS', 'DERIVED_INDEX']);
  assert.ok(!f.deleted.some((d) => d.id === 'd'), 'an attachment not yet due is untouched');
});

test('a row is ended ONLY after every copy was removed: a failed copy leaves it due for the next sweep, and the others still proceed', async () => {
  const f = fakes([row('a', 'ANALYZED'), row('b', 'ANALYZED')], { failFor: new Set(['a']) });
  const first = await sweepExpiredAttachments({ ...f, now: LATER });
  assert.deepEqual(first, { examined: 2, ended: 1, retryLater: 1 });
  assert.deepEqual(f.ended.map((e) => e.id), ['b']);
  f.storage.deleteCopies = async () => ({ failed: [] });
  const second = await sweepExpiredAttachments({ ...f, now: LATER });
  assert.deepEqual(second, { examined: 1, ended: 1, retryLater: 0 });
  assert.deepEqual(f.ended.map((e) => e.id), ['b', 'a']);
});

test('a storage error is treated as every copy failed (never as success), and the sweep is idempotent and bounded', async () => {
  const f = fakes([row('a', 'ANALYZED'), row('b', 'ANALYZED'), row('c', 'ANALYZED')]);
  f.storage.deleteCopies = async () => { throw new Error('storage down'); };
  assert.deepEqual(await sweepExpiredAttachments({ ...f, now: LATER }), { examined: 3, ended: 0, retryLater: 3 });
  assert.deepEqual(f.ended, []);
  f.storage.deleteCopies = async () => ({ failed: [] });
  assert.deepEqual(await sweepExpiredAttachments({ ...f, now: LATER, limit: 2 }), { examined: 2, ended: 2, retryLater: 0 });
  assert.deepEqual(await sweepExpiredAttachments({ ...f, now: LATER, limit: 2 }), { examined: 1, ended: 1, retryLater: 0 });
  assert.deepEqual(await sweepExpiredAttachments({ ...f, now: LATER }), { examined: 0, ended: 0, retryLater: 0 }, 'nothing is processed twice');
});

test('deleting a conversation deletes that person\'s attachments in it with every derivative, and never another person\'s', async () => {
  const f = fakes([row('a', 'ANALYZED'), row('b', 'PROMOTED'), row('c', 'READY', { sessionId: 's2' }), row('d', 'ANALYZED', { userId: 'u2' })]);
  const result = await deleteSessionAttachments({ ...f, userId: 'u1', sessionId: 's1', now: T0 });
  assert.deepEqual(result, { examined: 2, ended: 2, retryLater: 0 });
  assert.deepEqual(f.ended.map((e) => [e.id, e.state, e.reason]), [['a', 'DELETED', 'SESSION_DELETED'], ['b', 'DELETED', 'SESSION_DELETED']]);
  assert.ok(!f.ended.some((e) => ['c', 'd'].includes(e.id)));
});

test('the session delete refuses a row that is not the caller\'s even if the store returned it', async () => {
  const f = fakes([row('x', 'ANALYZED', { userId: 'u2' })]);
  f.store.findBySession = async () => [row('x', 'ANALYZED', { userId: 'u2' })];
  assert.deepEqual(await deleteSessionAttachments({ ...f, userId: 'u1', sessionId: 's1', now: T0 }), { examined: 1, ended: 0, retryLater: 1 });
  assert.deepEqual(f.deleted, [], 'nothing of another person\'s was deleted');
});

test('the Prisma store reads only live rows, scopes the session read to the user, and ends a row only while it is live', async () => {
  const { prisma } = require('../../src/lib/prisma.ts');
  const { prismaAttachmentSweepStore } = require('../../src/services/ask/attachments/attachmentStore.prisma.ts');
  const calls = []; const original = prisma.askChatAttachment;
  prisma.askChatAttachment = { findMany: async (args) => { calls.push(['findMany', args]); return []; }, updateMany: async (args) => { calls.push(['updateMany', args]); return { count: 1 }; } };
  try {
    await prismaAttachmentSweepStore.findDue(T0, 50);
    await prismaAttachmentSweepStore.findBySession('u1', 's1');
    await prismaAttachmentSweepStore.markEnded('a1', 'EXPIRED', 'RETENTION_ELAPSED', T0);
    const live = ['UPLOADING', 'READY', 'ANALYZING', 'ANALYZED', 'FAILED', 'PROMOTED'];
    assert.deepEqual(calls[0][1].where, { state: { in: live }, deleteAfter: { lte: T0 } });
    assert.equal(calls[0][1].take, 50);
    assert.deepEqual(calls[1][1].where, { userId: 'u1', sessionId: 's1', state: { in: live } });
    assert.deepEqual(calls[2][1].where, { id: 'a1', state: { in: live } });
    assert.equal(calls[2][1].data.state, 'EXPIRED');
  } finally { prisma.askChatAttachment = original; }
});
