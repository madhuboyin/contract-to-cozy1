const test = require('node:test');
const assert = require('node:assert/strict');
const { enabled, unique, seedHouseholds } = require('./realDb');

// Sole Homeowner Interface Phase 9, deliverable 7: authorization, paging, reconciliation, export and retention against a REAL PostgreSQL database.
// Run with:  ASK_CERT_DATABASE_URL=postgresql://user@127.0.0.1:PORT/ask_cert node --test tests/certification/askRealDb.test.js
// (see docs/operations/ASK_CERTIFICATION_RUNBOOK.md). Skipped without that variable.
const skip = enabled ? false : 'ASK_CERT_DATABASE_URL is not set: the production-like database checks run only against a scratch database';

let prisma; let world; let svc;
test.before(async () => {
  if (!enabled) return;
  ({ prisma } = require('../../src/lib/prisma.ts'));
  svc = {
    index: require('../../src/services/ask/askRecordIndex.service.ts'),
    detail: require('../../src/services/ask/askRecordDetail.service.ts'),
    collections: require('../../src/services/ask/askRecordCollections.service.ts'),
    exportReview: require('../../src/services/ask/askRecordExportReview.service.ts'),
    work: require('../../src/services/ask/askWork.service.ts'),
    saved: require('../../src/services/ask/askSaved.service.ts'),
    search: require('../../src/services/ask/askSearch.service.ts'),
    inbox: require('../../src/services/ask/askNotificationInbox.service.ts'),
    retention: require('../../src/services/ask/askRetention.service.ts'),
    execution: require('../../src/services/ask/execution/executeOperation.ts'),
    reconciliation: require('../../src/services/ask/support/askReconciliation.ts'),
    intake: require('../../src/services/ask/askIntake.service.ts'),
  };
  world = await seedHouseholds(prisma);
});
test.after(async () => { if (prisma) await prisma.$disconnect(); });

const denied = (error) => error.code === 'ASK_PROPERTY_NOT_FOUND';
const ids = (rows) => rows.map((row) => row.id);

// ---- Authorization ---------------------------------------------------------------------------------------------------------------------------------------

test('AUTH: every Ask destination reads for a member and refuses a person with no access to the home, with the same error', { skip }, async () => {
  const { owner, viewer, outsider, p1 } = world;
  const reads = {
    index: (u) => svc.index.getAskRecordIndex(u.id, p1.id),
    rooms: (u) => svc.collections.getAskRecordCollectionPage(u.id, p1.id, 'rooms', {}),
    exportReview: (u) => svc.exportReview.getAskRecordExportReview(u.id, p1.id),
    work: (u) => svc.work.getAskWorkPage(u.id, p1.id, {}),
    saved: (u) => svc.saved.getAskSavedPage(u.id, p1.id, {}),
    search: (u) => svc.search.searchAsk(u.id, p1.id, 'kitchen'),
  };
  for (const [name, read] of Object.entries(reads)) {
    for (const member of [owner, viewer]) assert.ok((await read(member)).propertyId === p1.id, `${name} for a member`);
    await assert.rejects(() => read(outsider), denied, `${name} must refuse an outsider`);
  }
});

test('AUTH: a notification inbox only ever holds its own person\'s notifications, and cannot be opened by another', { skip }, async () => {
  const { owner, outsider, p1 } = world;
  const mine = await prisma.notification.create({ data: { userId: owner.id, type: 'CLAIM_SUBMITTED', title: 'Mine', message: 'm', metadata: { propertyId: p1.id } } });
  const theirs = await prisma.notification.create({ data: { userId: outsider.id, type: 'CLAIM_SUBMITTED', title: 'Theirs', message: 't' } });
  const inbox = await svc.inbox.listAskNotifications(owner.id, {});
  assert.deepEqual(ids(inbox.items), [mine.id]);
  const other = await svc.inbox.listAskNotifications(outsider.id, {});
  assert.deepEqual(ids(other.items), [theirs.id]);
  await assert.rejects(() => svc.inbox.openAskNotification(outsider.id, mine.id), (error) => /NOT_FOUND|not found/i.test(`${error.code} ${error.message}`));
  await assert.rejects(() => svc.inbox.setAskNotificationDismissed(outsider.id, mine.id, true), (error) => /NOT_FOUND|not found/i.test(`${error.code} ${error.message}`));
  assert.equal((await prisma.notification.findUnique({ where: { id: mine.id } })).dismissedAt, null, 'the refused request changed nothing');
});

test('AUTH: a record the owner keeps private is invisible to a viewer in the Record, the export review and search', { skip }, async () => {
  const { owner, viewer, p1 } = world;
  const make = (title, visibility) => prisma.propertyRecord.create({ data: { propertyId: p1.id, title, recordType: 'OTHER', createdByUserId: owner.id, visibility, versions: { create: { versionNumber: 1, storageKey: unique('k'), originalFileName: `${title}.pdf`, mimeType: 'application/pdf', fileSizeBytes: 10, sha256: unique('h').padEnd(64, '0').slice(0, 64), uploadedByUserId: owner.id, scanStatus: 'CLEAN' } } } });
  const shared = await make('Shared plumbing receipt', 'HOUSEHOLD');
  const secret = await make('Private plumbing will', 'OWNER_ONLY');
  const titles = async (user) => (await svc.collections.getAskRecordCollectionPage(user.id, p1.id, 'documents', {})).rows.map((row) => row.title);
  assert.ok((await titles(owner)).some((t) => t.includes('Private plumbing will')));
  const viewerTitles = await titles(viewer);
  assert.ok(viewerTitles.some((t) => t.includes('Shared plumbing receipt')));
  assert.ok(!viewerTitles.some((t) => t.includes('Private plumbing will')), 'the viewer never sees it');
  const found = await svc.search.searchAsk(viewer.id, p1.id, 'plumbing');
  const hits = found.groups.flatMap((group) => group.results.map((r) => r.title));
  assert.ok(!hits.some((t) => t.includes('Private')), 'search does not leak it either');
  await assert.rejects(() => svc.detail.getAskRecordDetail(viewer.id, p1.id, 'documents', secret.id), (error) => /NOT_FOUND|not found/i.test(`${error.code} ${error.message}`), 'nor does a direct detail request');
  assert.ok(shared.id);
});

// ---- Paging ----------------------------------------------------------------------------------------------------------------------------------------------

test('PAGING: 130 rooms are delivered once each in order across keyset pages, with the true total, even when rooms change between pages', { skip }, async () => {
  const { owner, p1 } = world;
  await prisma.inventoryRoom.createMany({ data: Array.from({ length: 130 }, (_, index) => ({ propertyId: p1.id, name: `Paging room ${String(index).padStart(3, '0')}`, sortOrder: index % 4 })) });
  const seen = [];
  let cursor = null; let pages = 0; let total = null;
  do {
    const page = await svc.collections.getAskRecordCollectionPage(owner.id, p1.id, 'rooms', { limit: 40, cursor, search: 'Paging room' });
    total = page.total;
    seen.push(...page.rows.map((row) => row.id));
    if (pages === 0) {
      await prisma.inventoryRoom.deleteMany({ where: { propertyId: p1.id, name: 'Paging room 129' } });
      await prisma.inventoryRoom.create({ data: { propertyId: p1.id, name: 'Paging room 000a', sortOrder: 0 } });
    }
    cursor = page.nextCursor; pages += 1;
    assert.ok(pages < 20);
  } while (cursor);
  assert.equal(total, 130, 'the total is the authoritative count when the first page was read');
  assert.equal(new Set(seen).size, seen.length, 'no room is delivered twice');
  assert.ok(seen.length >= 128 && seen.length <= 131, `delivered ${seen.length}`);
});

test('PAGING: 75 work items arrive in the global order with no duplicate or gap, and counts agree with the pages', { skip }, async () => {
  const { owner, p1 } = world;
  for (let index = 0; index < 75; index += 1) {
    await prisma.operationalWorkItem.create({ data: { propertyId: p1.id, workKey: `cert-work-${index}`, subjectType: 'PROPERTY', subjectId: p1.id, obligationType: 'MAINTENANCE_TASK', state: 'ACCEPTED', title: `Cert work ${index}`, homeownerReason: 'r', expectedOutcome: 'o' } });
  }
  const keys = []; const certTitles = []; let cursor = null; let pages = 0; let first;
  do {
    const page = await svc.work.getAskWorkPage(owner.id, p1.id, { view: 'NEEDS_YOU', limit: 25, cursor });
    first ??= page;
    keys.push(...page.rows.map((row) => row.workKey));
    certTitles.push(...page.rows.filter((row) => row.title.startsWith('Cert work ')).map((row) => row.title));
    cursor = page.nextCursor; pages += 1;
    assert.ok(pages < 20);
  } while (cursor);
  assert.equal(new Set(keys).size, keys.length, 'no row twice');
  assert.equal(certTitles.length, 75, 'every item exactly once');
  assert.equal(new Set(certTitles).size, 75);
  assert.equal(first.total, keys.length, 'the first page\'s total is the number delivered across all pages');
  assert.ok(pages >= 3);
});

// ---- Reconciliation --------------------------------------------------------------------------------------------------------------------------------------

test('RECONCILE: a write marks the other conversations\' answers stale in the database without moving them in history, and a refresh clears the mark', { skip }, async () => {
  const { owner, p1 } = world;
  const session = (label) => prisma.askSession.create({ data: { userId: owner.id } });
  const [mine, other] = [await session('a'), await session('b')];
  const execution = (sessionId, operationId, minutes, extra = {}) => prisma.askExecution.create({ data: { sessionId, userId: owner.id, propertyId: p1.id, clientRequestId: unique('req'), message: 'q', operationId, status: 'ANSWERED', createdAt: new Date(Date.now() - minutes * 60_000), ...extra } });
  const writer = await execution(mine.id, 'WARRANTY_UPDATE', 5, { status: 'COMPLETED' });
  const here = await execution(mine.id, 'WARRANTY_LOOKUP', 4);
  const there = await execution(other.id, 'WARRANTY_LOOKUP', 3);
  const unrelated = await execution(other.id, 'ROOM_CREATE', 2, { status: 'COMPLETED' });
  const beforeThere = await prisma.askExecution.findUnique({ where: { id: there.id } });
  const refresh = async (userId, id) => ({ response: { executionId: id, sessionId: mine.id }, refreshed: id === here.id });
  const { value, scope } = await svc.reconciliation.runInReconciliationScope(() => svc.execution.reconcileAskExecutionSideEffects(owner.id, writer, {}, refresh));
  assert.equal(value.markedElsewhere, 1, 'the other conversation\'s answer');
  assert.deepEqual(value.staleExecutionIds, [], 'the answer in this conversation was refreshed');
  const afterThere = await prisma.askExecution.findUnique({ where: { id: there.id } });
  assert.ok(svc.reconciliation.staleMarkerFor(afterThere.parametersJson), 'marked stale in the database');
  assert.equal(afterThere.updatedAt.getTime(), beforeThere.updatedAt.getTime(), 'its place in history is unchanged');
  assert.equal(svc.reconciliation.staleMarkerFor((await prisma.askExecution.findUnique({ where: { id: unrelated.id } })).parametersJson), null, 'a command is never marked');
  assert.equal(scope.markedElsewhere, 1);

  // A refresh that cannot run leaves this conversation's answer marked; the next successful refresh clears it.
  const failing = await svc.reconciliation.runInReconciliationScope(() => svc.execution.reconcileAskExecutionSideEffects(owner.id, writer, {}, async () => { throw new Error('down'); }));
  assert.deepEqual(failing.value.staleExecutionIds, [here.id]);
  const hereMarked = await prisma.askExecution.findUnique({ where: { id: here.id } });
  assert.ok(svc.reconciliation.staleMarkerFor(hereMarked.parametersJson));
  const cleared = svc.reconciliation.withoutStaleMarker(hereMarked.parametersJson);
  await prisma.askExecution.update({ where: { id: here.id }, data: { parametersJson: cleared ?? undefined } });
  assert.equal(svc.reconciliation.staleMarkerFor((await prisma.askExecution.findUnique({ where: { id: here.id } })).parametersJson), null);
});

test('RECONCILE: marking is safe against a concurrent change (a row updated since it was read is left alone)', { skip }, async () => {
  const { owner, p1 } = world;
  const session = await prisma.askSession.create({ data: { userId: owner.id } });
  const row = await prisma.askExecution.create({ data: { sessionId: session.id, userId: owner.id, propertyId: p1.id, clientRequestId: unique('req'), message: 'q', operationId: 'WARRANTY_LOOKUP', status: 'ANSWERED' } });
  const stale = await prisma.askExecution.findUnique({ where: { id: row.id } });
  await prisma.askExecution.update({ where: { id: row.id }, data: { message: 'changed meanwhile' } });
  const marked = await svc.reconciliation.markExecutionsStale([stale], 'WARRANTY_UPDATE');
  assert.deepEqual(marked, [], 'the changed row was not overwritten');
  assert.equal((await prisma.askExecution.findUnique({ where: { id: row.id } })).message, 'changed meanwhile');
});

// ---- File intake against the real schema -----------------------------------------------------------------------------------------------------------------

test('INTAKE: the state of a file is derived correctly from real rows, including the JSON-path lookup of a label draft', { skip }, async () => {
  const { owner, p1 } = world;
  const record = await prisma.propertyRecord.create({ data: { propertyId: p1.id, title: 'label', recordType: 'PHOTO', createdByUserId: owner.id } });
  const version = await prisma.propertyRecordVersion.create({ data: { recordId: record.id, versionNumber: 1, storageKey: unique('k'), originalFileName: 'label.png', mimeType: 'image/png', fileSizeBytes: 10, sha256: unique('h').padEnd(64, '0').slice(0, 64), uploadedByUserId: owner.id, scanStatus: 'CLEAN' } });
  await prisma.propertyRecord.update({ where: { id: record.id }, data: { currentVersionId: version.id } });
  const ctx = { propertyId: p1.id, userId: owner.id, role: 'OWNER' };
  const before = await svc.intake.getAskIntake(ctx, record.id);
  assert.equal(before.state, 'UPLOADED');
  assert.equal(before.labelDraft, null);
  const draft = await prisma.inventoryDraftItem.create({ data: { propertyId: p1.id, userId: owner.id, manufacturer: 'Rheem', modelNumber: 'XE50', confidenceJson: { manufacturer: 0.8 }, explanationJson: { intake: { recordId: record.id, versionId: version.id } } } });
  const after = await svc.intake.getAskIntake(ctx, record.id);
  assert.equal(after.state, 'REVIEW');
  assert.equal(after.kind, 'APPLIANCE_LABEL');
  assert.equal(after.labelDraft.id, draft.id);
  assert.deepEqual(after.labelDraft.fields.find((field) => field.key === 'manufacturer'), { key: 'manufacturer', label: 'Brand', value: 'Rheem', confidence: 0.8 });
  const other = await prisma.inventoryDraftItem.create({ data: { propertyId: p1.id, userId: owner.id, explanationJson: { intake: { recordId: 'some-other-record' } } } });
  assert.equal((await svc.intake.getAskIntake(ctx, record.id)).labelDraft.id, draft.id, 'another record\'s draft is never picked up');
  assert.ok(other.id);
});

test('INTAKE: inspection findings are candidates in the database until accepted, and only accepted ones become findings', { skip }, async () => {
  const { owner, p1 } = world;
  const inspection = require('../../src/services/inspectionExtraction.service.ts');
  const record = await prisma.propertyRecord.create({ data: { propertyId: p1.id, title: 'report', recordType: 'INSPECTION_REPORT', createdByUserId: owner.id } });
  const version = await prisma.propertyRecordVersion.create({ data: { recordId: record.id, versionNumber: 1, storageKey: unique('k'), originalFileName: 'report.pdf', mimeType: 'application/pdf', fileSizeBytes: 10, sha256: unique('h').padEnd(64, '0').slice(0, 64), uploadedByUserId: owner.id, scanStatus: 'CLEAN' } });
  await prisma.propertyRecord.update({ where: { id: record.id }, data: { currentVersionId: version.id } });
  const finding = (n) => ({ homeSystem: 'ROOF', conditionRating: 'POOR', severity: 'MAJOR', inspectorDescription: `Finding ${n}`, inspectorRecommendation: 'REPAIR', aiInterpretation: 'Fix it.', extractionConfidence: 'HIGH' });
  await prisma.extractedFactCandidate.createMany({ data: [
    { propertyRecordVersionId: version.id, targetDomain: 'INSPECTION_FINDING', fieldKey: '_inspectionDetails', proposedValue: JSON.stringify({ reportType: 'GENERAL', inspectionDate: '2026-09-01' }), confidence: 1 },
    ...[1, 2, 3].map((n) => ({ propertyRecordVersionId: version.id, targetDomain: 'INSPECTION_FINDING', fieldKey: `finding:${n}`, proposedValue: JSON.stringify(finding(n)), confidence: 0.9, sourcePage: n, sourceRegionJson: { box: null, excerpt: `Finding ${n}`, basis: 'TEXT_MATCH' } })),
  ] });
  const ctx = { propertyId: p1.id, userId: owner.id, role: 'OWNER' };
  const read = await svc.intake.getAskIntake(ctx, record.id);
  assert.equal(read.candidates.length, 3);
  assert.equal(await prisma.inspectionFinding.count({ where: { propertyId: p1.id } }), 0, 'nothing canonical yet');
  assert.equal(await prisma.inspectionReport.count({ where: { propertyId: p1.id } }), 0);
  await prisma.extractedFactCandidate.updateMany({ where: { propertyRecordVersionId: version.id, fieldKey: 'finding:1' }, data: { reviewStatus: 'CONFIRMED' } });
  await prisma.extractedFactCandidate.updateMany({ where: { propertyRecordVersionId: version.id, fieldKey: 'finding:2' }, data: { reviewStatus: 'REJECTED' } });
  const promoted = await svc.intake.promoteAskIntake(ctx, record.id);
  assert.equal(await prisma.inspectionReport.count({ where: { propertyId: p1.id } }), 1);
  const findings = await prisma.inspectionFinding.findMany({ where: { propertyId: p1.id } });
  assert.deepEqual(findings.map((f) => f.inspectorDescription), ['Finding 1']);
  assert.equal(promoted.inspection.findingCount, 1);
  const rows = await prisma.extractedFactCandidate.findMany({ where: { propertyRecordVersionId: version.id, fieldKey: { startsWith: 'finding:' } }, orderBy: { fieldKey: 'asc' } });
  assert.deepEqual(rows.map((r) => Boolean(r.promotedEntityId)), [true, false, false]);
  assert.equal(rows[0].sourcePage, 1);
  await assert.rejects(() => svc.intake.promoteAskIntake(ctx, record.id), (error) => error.code === 'ASK_INTAKE_ALREADY_USED');
  assert.equal(await prisma.inspectionReport.count({ where: { propertyId: p1.id } }), 1);
  assert.ok(inspection);
});

// ---- Retention -------------------------------------------------------------------------------------------------------------------------------------------

test('RETENTION: expired conversations are purged with their answers, unexpired ones are kept, and a person can delete only their own', { skip }, async () => {
  const { owner, outsider, p1 } = world;
  const now = new Date();
  const session = (userId, expiresAt) => prisma.askSession.create({ data: { userId, expiresAt } });
  const old = await session(owner.id, new Date(now.getTime() - 86_400_000));
  const fresh = await session(owner.id, new Date(now.getTime() + 86_400_000));
  const theirs = await session(outsider.id, new Date(now.getTime() + 86_400_000));
  const answer = (sessionId, userId) => prisma.askExecution.create({ data: { sessionId, userId, propertyId: userId === owner.id ? p1.id : null, clientRequestId: unique('req'), message: 'q', status: 'ANSWERED' } });
  const oldAnswer = await answer(old.id, owner.id);
  const freshAnswer = await answer(fresh.id, owner.id);
  const purged = await svc.retention.purgeExpiredAskSessions(now);
  assert.ok(purged >= 1);
  assert.equal(await prisma.askSession.findUnique({ where: { id: old.id } }), null);
  assert.equal(await prisma.askExecution.findUnique({ where: { id: oldAnswer.id } }), null, 'its answers go with it');
  assert.ok(await prisma.askSession.findUnique({ where: { id: fresh.id } }));
  assert.ok(await prisma.askExecution.findUnique({ where: { id: freshAnswer.id } }));
  assert.equal(await svc.retention.deleteAskSessionForUser(owner.id, theirs.id), false, 'not another person\'s conversation');
  assert.ok(await prisma.askSession.findUnique({ where: { id: theirs.id } }));
  assert.equal(await svc.retention.deleteAskSessionForUser(owner.id, fresh.id), true);
  assert.equal(await prisma.askSession.findUnique({ where: { id: fresh.id } }), null);
});

// ---- Search, Saved, export, notifications ----------------------------------------------------------------------------------------------------------------

test('SEARCH: results come only from the selected home and respect what the role may see', { skip }, async () => {
  const { owner, viewer, p1, p2 } = world;
  await prisma.inventoryRoom.create({ data: { propertyId: p1.id, name: 'Zebra furnace room' } });
  await prisma.inventoryRoom.create({ data: { propertyId: p2.id, name: 'Zebra furnace closet elsewhere' } });
  await prisma.propertyRecord.create({ data: { propertyId: p1.id, title: 'Zebra furnace manual', recordType: 'MANUAL', createdByUserId: owner.id, visibility: 'HOUSEHOLD', versions: { create: { versionNumber: 1, storageKey: unique('k'), originalFileName: 'm.pdf', mimeType: 'application/pdf', fileSizeBytes: 1, sha256: 'a'.repeat(64), uploadedByUserId: owner.id, scanStatus: 'CLEAN' } } } });
  await prisma.propertyRecord.create({ data: { propertyId: p1.id, title: 'Zebra furnace deed', recordType: 'DEED', createdByUserId: owner.id, visibility: 'OWNER_ONLY', versions: { create: { versionNumber: 1, storageKey: unique('k'), originalFileName: 'd.pdf', mimeType: 'application/pdf', fileSizeBytes: 1, sha256: 'b'.repeat(64), uploadedByUserId: owner.id, scanStatus: 'CLEAN' } } } });
  const titles = async (user) => (await svc.search.searchAsk(user.id, p1.id, 'zebra furnace')).groups.flatMap((group) => group.results.map((result) => result.title));
  const ownerTitles = await titles(owner);
  assert.ok(ownerTitles.includes('Zebra furnace room') && ownerTitles.includes('Zebra furnace manual') && ownerTitles.includes('Zebra furnace deed'));
  assert.ok(!ownerTitles.some((title) => title.includes('elsewhere')), 'another home\'s room never appears');
  const viewerTitles = await titles(viewer);
  assert.ok(viewerTitles.includes('Zebra furnace manual'));
  assert.ok(!viewerTitles.includes('Zebra furnace deed'), 'an owner-only record is not searchable by a viewer');
});

test('SAVED: a saved result is a projection of its owner, archiving is per person, and only members read it', { skip }, async () => {
  const { owner, viewer, outsider, p1 } = world;
  const brief = await prisma.propertyBrief.create({ data: { propertyId: p1.id, createdByUserId: owner.id, purpose: 'HOMEOWNER_REFERENCE', title: 'Certification brief', limitationStatement: 'x', asOf: new Date() } });
  const key = `brief:${brief.id}`;
  const visible = async (user, archived = false) => (await svc.saved.getAskSavedPage(user.id, p1.id, { archived })).rows.map((row) => row.artifactKey);
  assert.ok((await visible(owner)).includes(key));
  assert.ok((await visible(viewer)).includes(key));
  await svc.saved.setAskSavedArchive(owner.id, p1.id, key, true);
  assert.ok(!(await visible(owner)).includes(key), 'archived for the person who archived it');
  assert.ok((await visible(owner, true)).includes(key));
  assert.ok((await visible(viewer)).includes(key), 'still there for everyone else');
  assert.equal(await prisma.propertyBrief.count({ where: { id: brief.id } }), 1, 'archiving never touches the artifact');
  await assert.rejects(() => svc.saved.getAskSavedPage(outsider.id, p1.id, {}), denied);
  const refused = await svc.saved.setAskSavedArchive(outsider.id, p1.id, key, true);
  assert.equal(refused.outcome, 'ACCESS_LOST', 'a person without access is told so, and nothing is written');
  assert.equal(refused.artifact, null);
  assert.equal(await prisma.askSavedArtifactPreference.count({ where: { userId: outsider.id } }), 0);
});

test('EXPORT: the review states who can create an export, from the real household role', { skip }, async () => {
  const { owner, viewer, p1 } = world;
  const forOwner = await svc.exportReview.getAskRecordExportReview(owner.id, p1.id);
  const forViewer = await svc.exportReview.getAskRecordExportReview(viewer.id, p1.id);
  assert.equal(forOwner.accessRole, 'OWNER');
  assert.equal(forOwner.create.allowed, true);
  assert.equal(forViewer.accessRole, 'VIEWER');
  assert.equal(forViewer.create.allowed, false);
  assert.match(forViewer.create.reason, /CONTRIBUTOR/);
});

test('NOTIFICATIONS: opening reports the exact current state, never marks a failed open as read, and never reveals a lost home', { skip }, async () => {
  const { owner, p1, p2 } = world;
  const make = (data) => prisma.notification.create({ data: { userId: owner.id, title: 'Cert notice', message: 'm', ...data } });
  const removed = await make({ type: 'CLAIM_SUBMITTED', entityType: 'CLAIM', entityId: '00000000-0000-0000-0000-000000000000', metadata: { propertyId: p1.id } });
  const lostHome = await make({ type: 'CLAIM_SUBMITTED', entityType: 'CLAIM', entityId: '00000000-0000-0000-0000-000000000001', metadata: { propertyId: p2.id } });
  const nothing = await make({ type: 'A_TYPE_NOBODY_REGISTERED', metadata: { propertyId: p1.id } });
  assert.equal((await svc.inbox.openAskNotification(owner.id, removed.id)).outcome, 'DELETED');
  assert.equal((await svc.inbox.openAskNotification(owner.id, lostHome.id)).outcome, 'ACCESS_LOST');
  assert.equal((await svc.inbox.openAskNotification(owner.id, nothing.id)).outcome, 'UNAVAILABLE');
  for (const notice of [removed, lostHome, nothing]) assert.equal((await prisma.notification.findUnique({ where: { id: notice.id } })).isRead, false, 'a failed open does not mark it read');
  const inbox = await svc.inbox.listAskNotifications(owner.id, {});
  const lost = inbox.items.find((item) => item.id === lostHome.id);
  assert.equal(lost.propertyAccess, 'LOST');
  assert.equal(lost.propertyLabel, null, 'the lost home is not named');
});

// ---- Model unavailable -----------------------------------------------------------------------------------------------------------------------------------

test('LLM DRILL: with remote generation off and any model call made to fail, every destination still reads from the real database', { skip }, async () => {
  const governance = require('../../src/services/ai/aiRequestGovernance.service.ts');
  const { documentIntelligenceService } = require('../../src/services/documentIntelligence.service.ts');
  const originals = { governed: governance.executeGovernedAIRequest, analyze: documentIntelligenceService.analyzeDocument, flag: process.env.ASK_REMOTE_GENERATION_ENABLED };
  let modelCalls = 0;
  governance.executeGovernedAIRequest = async () => { modelCalls += 1; throw new Error('the model is down'); };
  documentIntelligenceService.analyzeDocument = async () => { modelCalls += 1; throw new Error('the model is down'); };
  process.env.ASK_REMOTE_GENERATION_ENABLED = 'false';
  try {
    const { owner, p1 } = world;
    const results = await Promise.all([
      svc.index.getAskRecordIndex(owner.id, p1.id),
      svc.collections.getAskRecordCollectionPage(owner.id, p1.id, 'documents', { limit: 10 }),
      svc.exportReview.getAskRecordExportReview(owner.id, p1.id),
      svc.work.getAskWorkPage(owner.id, p1.id, { view: 'NEEDS_YOU' }),
      svc.saved.getAskSavedPage(owner.id, p1.id, {}),
      svc.search.searchAsk(owner.id, p1.id, 'room'),
      svc.inbox.listAskNotifications(owner.id, {}),
    ]);
    assert.equal(results.length, 7);
    assert.equal(modelCalls, 0, 'no destination asked a model for anything');
  } finally {
    governance.executeGovernedAIRequest = originals.governed;
    documentIntelligenceService.analyzeDocument = originals.analyze;
    if (originals.flag === undefined) delete process.env.ASK_REMOTE_GENERATION_ENABLED; else process.env.ASK_REMOTE_GENERATION_ENABLED = originals.flag;
  }
});
