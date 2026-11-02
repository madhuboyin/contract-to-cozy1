const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD v1.6: sharing an export by link, from the conversation. The real handlers run with prisma, the access check, the review and the share
// writes stubbed. The link is a secret: it must never be in the answer that is stored in the conversation.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const reviewService = require('../../src/services/ask/askRecordExportReview.service.ts');
const shareService = require('../../src/services/homeReportExportShare.service.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const support = require('../../src/services/ask/support/homeRecordExport.ts');
const { homeRecordExportStatusFromRows } = require('../../src/services/ask/handlers/homeRecordExport.handler.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { AskPresentationBlockSchema, AskConfirmationSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const OP = 'HOME_RECORD_EXPORT_SHARE';
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
const NOW = new Date();
const day = (n) => new Date(NOW.getTime() + n * 86_400_000);
const row = (over = {}) => ({ id: 'exp-1', status: 'READY', requestedAt: new Date('2026-10-19T12:00:00Z'), expiresAt: day(20), sections: { included: ['warranties', 'inventory'] }, shareToken: null, shareRevokedAt: null, shareExpiresAt: null, ...over });

function install(role = 'CONTRIBUTOR', rows = [row()]) {
  const saved = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, review: reviewService.getAskRecordExportReview, create: shareService.createShareLinkRecord, revoke: shareService.revokeShareLinkRecord, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  reviewService.getAskRecordExportReview = async () => reviewService.composeAskRecordExportReview({ propertyId: 'p1', accessRole: role, operatingMode: 'OWNING', property: { name: null, address: '94 Ashford Dr', city: 'Town', state: 'NJ' } });
  shareService.createShareLinkRecord = async (input) => { calls.push(['share', input]); return { kind: 'CREATED', shareToken: 'SECRET-TOKEN', shareExpiresAt: day(input.expiresInDays), expiresInDays: input.expiresInDays }; };
  shareService.revokeShareLinkRecord = async (input) => { calls.push(['revoke', input]); return { kind: 'REVOKED' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'homeReportExport') return { findFirst: async (args) => rows.find((r) => r.id === args.where.id) ?? null, findMany: async () => rows };
    return new Proxy({}, { get: (_x, method) => async () => { throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); } });
  } });
  return { calls, restore() { prismaModule.prisma = saved.prisma; propertyAccess.resolvePropertyAccess = saved.access; reviewService.getAskRecordExportReview = saved.review; shareService.createShareLinkRecord = saved.create; shareService.revokeShareLinkRecord = saved.revoke; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; } };
}
const propose = (message, launchContext = { surface: 'ASK_PAGE' }) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'p1', message, launchContext });
const field = (result, name) => result.confirmation.fields.find((entry) => entry.label === name)?.value;
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'u1', execution: { id: 'x1', propertyId: 'p1', createdAt: NOW }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the grammar needs the export or the home record, tells share from stop, reads the days, and leaves other share questions alone', () => {
  assert.equal(support.homeRecordExportShareKind('Share my home record export'), 'SHARE');
  assert.equal(support.homeRecordExportShareKind('Create a share link for my export'), 'SHARE');
  assert.equal(support.homeRecordExportShareKind('Stop sharing my export'), 'REVOKE');
  assert.equal(support.homeRecordExportShareKind('Revoke the share link for my home record'), 'REVOKE');
  for (const message of ['Share my home briefing', 'Share this property brief', 'Share my warranties', 'Export my home record', 'Is my export ready?']) assert.equal(support.homeRecordExportShareKind(message), null, message);
  assert.equal(support.isHomeRecordExportRequest('Share my home record export'), false);
  assert.equal(support.shareDaysFromWords('Share my export for 7 days'), 7);
  assert.equal(support.shareDaysFromWords('Share my export for a week'), 7);
  assert.equal(support.shareDaysFromWords('Share my export for two weeks'), 14);
  assert.equal(support.shareDaysFromWords('Share my export for 6 months'), 30);
  assert.equal(support.shareDaysFromWords('Share my export'), null);
  assert.equal(support.shareKindFromMessage(support.shareMessage('REVOKE', 'Home record export')), 'REVOKE');
});

test('routing: share and stop sharing route here by typed pattern; export, status and other shares keep theirs; contributor floor', () => {
  assert.equal(route('Share my home record export'), OP);
  assert.equal(route('Stop sharing my export'), OP);
  assert.equal(route('Export my home record'), 'HOME_RECORD_EXPORT');
  assert.equal(route('Is my home record export ready?'), 'HOME_RECORD_EXPORT_STATUS');
  assert.notEqual(route('Share my home briefing'), OP);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
});

test('the share proposal says what the link shows, who can open it and for how long, creates nothing, and warns when it replaces a link', async () => {
  let w = install();
  try {
    const result = await propose('Share my home record export for 7 days');
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.match(field(result, 'Link works for'), /^7 days, until /);
    assert.equal(field(result, 'Who can open it'), 'Anyone who has the link');
    assert.match(field(result, 'What it shows'), /without the street address or ZIP/);
    assert.equal(field(result, 'The current link'), undefined);
    AskConfirmationSchema.parse(result.confirmation);
    for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
    assert.equal(w.calls.length, 0);
    assert.match((await propose('Share my home record export')).confirmation.fields.find((f) => f.label === 'Link works for').value, /^14 days/);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', [row({ shareToken: 'old', shareExpiresAt: day(5) })]);
  try {
    const replacing = await propose('Share my home record export');
    assert.match(field(replacing, 'The current link'), /^Stops working\./);
    assert.equal(replacing.confirmation.title, 'Replace the share link?');
  } finally { w.restore(); }
});

test('confirm creates the link with the confirmed days, once, and the link is not in the stored answer', async () => {
  const w = install();
  try {
    const proposal = await propose('Share my home record export for 7 days');
    const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
    assert.deepEqual(w.calls, [['share', { exportId: 'exp-1', userId: 'u1', expiresInDays: 7 }]]);
    assert.equal(done.result.blocks[0].id, 'home-record-export-share-exp-1');
    assert.equal(JSON.stringify(done.result).includes('SECRET-TOKEN'), false);
    assert.equal(JSON.stringify(done.result).includes('/reports/share'), false);
    assert.ok(done.result.blocks[0].details.some((d) => d.label === 'Works until'));
    for (const block of done.result.blocks) AskPresentationBlockSchema.parse(block);
  } finally { w.restore(); }
});

test('stop sharing: only an export that is shared; confirmed once', async () => {
  let w = install('CONTRIBUTOR', [row({ shareToken: 'tok', shareExpiresAt: day(5) })]);
  try {
    const proposal = await propose('Stop sharing my export');
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
    assert.match(field(proposal, 'The link'), /^Stops working now\./);
    const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
    assert.deepEqual(w.calls, [['revoke', { exportId: 'exp-1', userId: 'u1' }]]);
    assert.equal(done.result.blocks[0].title, 'Sharing stopped');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', [row()]);
  try { assert.equal((await propose('Stop sharing my export')).reasonCode, 'HOME_RECORD_EXPORT_SHARE_NOT_SHARED'); } finally { w.restore(); }
});

test('a row action targets its own export; an export that is not ready, none at all, and a viewer create nothing', async () => {
  let w = install('CONTRIBUTOR', [row({ id: 'a' }), row({ id: 'b', status: 'GENERATING' })]);
  try {
    const byRow = await propose(support.shareMessage('SHARE', 'Home record export · Oct 19'), { surface: 'ASK_PAGE', operationId: OP, entityType: 'HOME_REPORT_EXPORT', entityId: 'a' });
    assert.equal(byRow.parameters.exportShare.exportId, 'a');
    const notReady = await propose(support.shareMessage('SHARE', 'x'), { surface: 'ASK_PAGE', operationId: OP, entityType: 'HOME_REPORT_EXPORT', entityId: 'b' });
    assert.equal(notReady.reasonCode, 'HOME_RECORD_EXPORT_SHARE_NOT_READY');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', []);
  try { assert.equal((await propose('Share my home record export')).reasonCode, 'HOME_RECORD_EXPORT_SHARE_NO_EXPORT'); } finally { w.restore(); }
  w = install('VIEWER');
  try { assert.equal((await propose('Share my home record export')).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
});

test('confirm fails closed: a changed export or days, a viewer and an export that stopped being ready are stale; nothing is created', async () => {
  const w = install();
  try {
    const proposal = await propose('Share my home record export');
    await assert.rejects(confirmCapabilityInvoke(OP, ctx({ ...proposal.parameters, exportShareContextVersion: 'old' })), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(confirmCapabilityInvoke(OP, ctx(proposal.parameters, 'VIEWER')), (error) => error.code === 'ASK_PERMISSION_REQUIRED');
    await assert.rejects(confirmCapabilityInvoke(OP, ctx({ exportShare: { kind: 'NOPE', exportId: 'exp-1', days: 7 } })), /invalid/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('the status answer offers Share a link, Replace the link and Stop sharing on a ready export, only to someone who can share, and says when it is shared', () => {
  const rows = [row({ id: 'a' }), row({ id: 'b', shareToken: 'tok', shareExpiresAt: day(5) }), row({ id: 'c', status: 'GENERATING' })];
  const result = homeRecordExportStatusFromRows(rows, NOW, true);
  const items = result.blocks.find((block) => block.id === 'home-record-export-status-list').sections[0].items;
  assert.deepEqual(items[0].actions.map((a) => a.label), ['Share a link', 'Make a fresh copy', 'Delete']);
  assert.deepEqual(items[1].actions.map((a) => a.label), ['Replace the link', 'Stop sharing', 'Make a fresh copy', 'Delete']);
  assert.ok(items[1].meta.some((m) => m.startsWith('Shared until')));
  assert.deepEqual(items[2].actions.map((a) => a.label), ['Delete']);
  assert.ok(items[0].actions.every((a) => a.operationId === OP && a.interactionType === 'MUTATE_RECORD'));
  assert.deepEqual(homeRecordExportStatusFromRows(rows, NOW, false).blocks.find((b) => b.id === 'home-record-export-status-list').sections[0].items.map((i) => i.actions.length), [0, 0, 0]);
  assert.equal(JSON.stringify(result).includes('tok'), false);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

// FRD v1.508: make a fresh copy of an export, and delete one. Same operation, same confirmation, the routes' own rules.
const manageService = require('../../src/services/homeReportExportManage.service.ts');
function installManage(role, rows) {
  const w = install(role, rows);
  const saved = { regen: manageService.regenerateHomeReportExportRecord, del: manageService.deleteHomeReportExportRecord };
  manageService.regenerateHomeReportExportRecord = async (input) => { w.calls.push(['regenerate', input]); return { kind: 'CREATED', export: { id: 'new-1' } }; };
  manageService.deleteHomeReportExportRecord = async (input) => { w.calls.push(['delete', input]); return { kind: 'DELETED' }; };
  const restore = w.restore;
  w.restore = () => { restore(); manageService.regenerateHomeReportExportRecord = saved.regen; manageService.deleteHomeReportExportRecord = saved.del; };
  return w;
}

test('the grammar: fresh copy and delete need the export named; the home record, other exports and share links are left alone', () => {
  assert.equal(support.homeRecordExportShareKind('Delete my export'), 'DELETE');
  assert.equal(support.homeRecordExportShareKind('Delete my home record export'), 'DELETE');
  assert.equal(support.homeRecordExportShareKind('Regenerate my home record export'), 'REGENERATE');
  assert.equal(support.homeRecordExportShareKind('Make a fresh copy of my export'), 'REGENERATE');
  assert.equal(support.homeRecordExportShareKind('Delete the share link for my export'), 'REVOKE');
  for (const message of ['Delete my home record', 'Delete my warranties', 'Delete my material specs export', 'Regenerate my permit disclosure export', 'Delete my chat export']) assert.equal(support.homeRecordExportShareKind(message), null, message);
  assert.equal(support.shareKindFromMessage(support.shareMessage('DELETE', 'Home record export · Oct 19')), 'DELETE');
  assert.equal(support.shareKindFromMessage(support.shareMessage('REGENERATE', 'Home record export · Oct 19')), 'REGENERATE');
  assert.equal(route('Delete my export'), OP);
  assert.equal(route('Regenerate my home record export'), OP);
});

test('delete: reviewed first, removes nothing until confirmed, then deletes once and says it cannot be undone from Ask', async () => {
  const w = installManage('CONTRIBUTOR', [row({ shareToken: 'tok', shareExpiresAt: day(5) })]);
  try {
    const proposal = await propose('Delete my export');
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
    assert.equal(proposal.confirmation.title, 'Delete this export?');
    assert.equal(field(proposal, 'The share link'), 'Stops working now');
    assert.match(field(proposal, 'You can'), /cannot be undone from Ask/);
    AskConfirmationSchema.parse(proposal.confirmation);
    assert.equal(w.calls.length, 0);
    const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
    assert.deepEqual(w.calls, [['delete', { exportId: 'exp-1', userId: 'u1' }]]);
    assert.equal(done.result.blocks[0].id, 'home-record-export-delete-exp-1');
    assert.equal(done.result.blocks[0].title, 'Export deleted');
    for (const block of done.result.blocks) AskPresentationBlockSchema.parse(block);
  } finally { w.restore(); }
});

test('a fresh copy: same sections, the earlier export stays, nothing is made until confirmed, and the receipt points at the new one', async () => {
  const w = installManage('CONTRIBUTOR', [row({ status: 'FAILED' })]);
  try {
    const proposal = await propose('Make a fresh copy of my export');
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
    assert.equal(field(proposal, 'This export'), 'Stays as it is');
    assert.equal(field(proposal, 'Kept for'), '30 days from now');
    AskConfirmationSchema.parse(proposal.confirmation);
    assert.equal(w.calls.length, 0);
    const done = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
    assert.deepEqual(w.calls, [['regenerate', { exportId: 'exp-1', userId: 'u1' }]]);
    assert.equal(done.artifactId, 'new-1');
    assert.equal(done.result.blocks[0].id, 'home-record-export-regenerate-new-1');
    for (const block of done.result.blocks) AskPresentationBlockSchema.parse(block);
  } finally { w.restore(); }
});

test('a fresh copy is refused while an export is being prepared, a viewer changes nothing, and a stale confirmation is rejected', async () => {
  let w = installManage('CONTRIBUTOR', [row({ id: 'g', status: 'GENERATING' })]);
  try {
    assert.equal((await propose('Make a fresh copy of my export')).reasonCode, 'HOME_RECORD_EXPORT_REGENERATE_IN_FLIGHT');
    assert.equal((await propose('Delete my export')).status, 'NEEDS_CONFIRMATION'); // a stuck export can still be deleted
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = installManage('VIEWER', [row()]);
  try {
    const result = await propose('Delete my export');
    assert.equal(result.reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { w.restore(); }
  w = installManage('CONTRIBUTOR', [row()]);
  try {
    const proposal = await propose('Delete my export');
    await assert.rejects(confirmCapabilityInvoke(OP, ctx({ ...proposal.parameters, exportShareContextVersion: 'old' })), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(confirmCapabilityInvoke(OP, ctx(proposal.parameters, 'VIEWER')), (error) => error.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = installManage('CONTRIBUTOR', []);
  try { assert.equal((await propose('Delete my export')).reasonCode, 'HOME_RECORD_EXPORT_NONE_TO_CHANGE'); } finally { w.restore(); }
});
