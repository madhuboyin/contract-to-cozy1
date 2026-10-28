const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Records views in Ask (FRD v1.463): needs review, expired or expiring, archived and the trash, as declared chips on the document answer. The real
// registered `documents.lookup` handler runs against a stubbed Home Records list (by lifecycle) and stubbed counts, so what is asserted is what the
// homeowner would get. No database, browser or native module.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
const { documentViewFromMessage, DOCUMENT_VIEW_MESSAGES } = require('../../src/services/ask/handlers/documents.handler.ts');
const { isFilterContinuationMessage } = require('../../src/services/ask/askFollowUpContext.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const realList = homeRecordsService.list;

const record = (id, recordType, extra = {}) => ({
  id, title: `Record ${id}`, description: null, recordType, sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE',
  createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'), verificationStatus: 'UNVERIFIED', verifiedAt: null, needsReview: false, expiryStatus: null, ...extra,
});
const DAY = 24 * 60 * 60 * 1000;
const base = () => ({
  ACTIVE: [record('plain', 'INVOICE'), record('review', 'WARRANTY', { needsReview: true }), record('lapsed', 'PERMIT', { expiryStatus: 'EXPIRED' }), record('soon', 'PERMIT', { expiryStatus: 'EXPIRING_SOON' })],
  ARCHIVED: [record('old', 'RECEIPT', { lifecycleStatus: 'ARCHIVED' })],
  TRASHED: [
    record('gone', 'MANUAL', { lifecycleStatus: 'TRASHED', trashedAt: new Date(Date.now() - 3 * DAY) }),
    record('held', 'CONTRACT', { lifecycleStatus: 'TRASHED', trashedAt: new Date(Date.now() - 5 * DAY), legalHoldReason: 'dispute' }),
  ],
});

let data; let counts; let role; let priorViewState; let listCalls;
function install(over = {}) {
  data = { ...base(), ...(over.data ?? {}) };
  counts = { ARCHIVED: data.ARCHIVED.length, TRASHED: data.TRASHED.length, ...(over.counts ?? {}) };
  role = over.role ?? 'OWNER'; priorViewState = null; listCalls = [];
  homeRecordsService.list = async (_property, _role, options) => { listCalls.push(options?.lifecycleStatus); return data[options?.lifecycleStatus ?? 'ACTIVE']; };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'askExecution') return { findFirst: async () => (priorViewState ? { operationId: 'DOCUMENT_LOOKUP', parametersJson: { viewState: priorViewState } } : null) };
    if (model === 'document') return { findMany: async () => [] };
    if (model === 'propertyRecord') return { count: async ({ where }) => counts[where.lifecycleStatus] ?? 0 };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; homeRecordsService.list = realList; });
const run = (message, sourceExecutionId) => capabilityInvoke('DOCUMENT_LOOKUP', { userId: 'u1', propertyId: 'p1', message, launchContext: sourceExecutionId ? { surface: 'ASK_WORKSPACE', sourceExecutionId } : undefined }, { propertyAccess: { role } });
const list = (result) => result.blocks.find((block) => block.id === 'document-lookup-groups');
const summary = (result) => result.blocks.find((block) => block.id === 'document-lookup-summary');
const rows = (result) => list(result).sections.flatMap((section) => section.items);
const ids = (result) => rows(result).map((item) => item.id).sort();
const chipIds = (result) => list(result).filters.map((filter) => filter.id);
const state = (view, status = 'ALL', kind = null, revision = 1) => ({ resultId: 'r-1', domainScopePhrase: kind, dateScopePhrase: view, statusFilter: status, selectedTaskId: null, revision });

test('a declared view message names its view exactly and is a filter continuation; typed wording never switches the view', () => {
  for (const [view, message] of Object.entries(DOCUMENT_VIEW_MESSAGES)) {
    assert.equal(documentViewFromMessage(message), view);
    assert.equal(documentViewFromMessage(`${message}.`), view);
    assert.equal(isFilterContinuationMessage(message), true, message);
  }
  for (const typed of ['show my trash', 'what is archived?', 'documents that need review']) assert.equal(documentViewFromMessage(typed), null, typed);
});

test('view chips appear only for views that have something, and the trash only to a contributor or owner', async () => {
  install();
  const full = await run('Show my documents');
  assert.deepEqual(chipIds(full).filter((id) => id.startsWith('view-')), ['view-needs-review', 'view-expiring', 'view-archived', 'view-trash']);
  assert.deepEqual(rows(full).map((r) => r.id).sort(), ['lapsed', 'plain', 'review', 'soon'], 'the default list is the active records, as before');

  install({ role: 'VIEWER' });
  assert.deepEqual(chipIds(await run('Show my documents')).filter((id) => id.startsWith('view-')), ['view-needs-review', 'view-expiring', 'view-archived'], 'no trash chip for a viewer');

  install({ data: { ACTIVE: [record('a', 'INVOICE')], ARCHIVED: [], TRASHED: [] } });
  assert.deepEqual(chipIds(await run('Show my documents')).filter((id) => id.startsWith('view-')), [], 'nothing to view, nothing offered');
});

test('Needs review and Expired or expiring narrow the active records and say what they show', async () => {
  install();
  priorViewState = state(null);
  const asked = await run(DOCUMENT_VIEW_MESSAGES.NEEDS_REVIEW, 'exec-1');
  assert.deepEqual(ids(asked), ['review']);
  assert.equal(summary(asked).headline, '1 document needs review.');
  assert.equal(asked.parameters.viewState.dateScopePhrase, 'NEEDS_REVIEW');
  assert.equal(asked.parameters.viewState.revision, 2);
  assert.ok(list(asked).filters.find((f) => f.id === 'view-needs-review').active);
  assert.ok(chipIds(asked).includes('view-current') && chipIds(asked).includes('clear-all'));
  const expiring = await run(DOCUMENT_VIEW_MESSAGES.EXPIRING, 'exec-1');
  assert.deepEqual(ids(expiring), ['lapsed', 'soon']);
  assert.equal(summary(expiring).headline, '2 documents expired or expiring soon.');
});

test('the Trash lists trashed records only, with when each can be restored, and offers Restore to a contributor or owner', async () => {
  install(); priorViewState = state(null);
  const trash = await run(DOCUMENT_VIEW_MESSAGES.TRASHED, 'exec-1');
  assert.ok(listCalls.includes('TRASHED'));
  assert.deepEqual(ids(trash), ['gone', 'held']);
  assert.equal(summary(trash).headline, '2 documents in the trash.');
  assert.match(summary(trash).supportLine, /restored for 30 days/);
  const byId = Object.fromEntries(rows(trash).map((item) => [item.id, item]));
  assert.ok(byId.gone.meta.some((m) => /^in the trash since /.test(m)) && byId.gone.meta.some((m) => /^restorable until /.test(m)));
  assert.ok(byId.held.meta.includes('on legal hold') && !byId.held.meta.some((m) => /^restorable until /.test(m)), 'a held record is not given a removal date');
  for (const item of Object.values(byId)) {
    assert.deepEqual(item.actions.map((a) => [a.id, a.message, a.operationId, a.interactionType]), [['home-record-restore', 'Restore this home record from the trash.', 'HOME_RECORD_STATE_COMMAND', 'MUTATE_RECORD']]);
    assert.equal(item.entityType, 'PROPERTY_RECORD');
    assert.equal(item.href, null, 'no desktop link');
  }
});

test('a viewer who asks for the Trash gets the current list, never the trash, and no Restore', async () => {
  install({ role: 'VIEWER' }); priorViewState = state(null);
  const result = await run(DOCUMENT_VIEW_MESSAGES.TRASHED, 'exec-1');
  assert.equal(listCalls.includes('TRASHED'), false);
  assert.equal(result.parameters.viewState.dateScopePhrase, null);
  assert.equal(rows(result).some((item) => item.actions.some((a) => a.id === 'home-record-restore')), false);
});

test('Archived lists archived records, with no Archive action again, and keeps their other controls', async () => {
  install(); priorViewState = state(null);
  const archived = await run(DOCUMENT_VIEW_MESSAGES.ARCHIVED, 'exec-1');
  assert.ok(listCalls.includes('ARCHIVED'));
  assert.deepEqual(ids(archived), ['old']);
  assert.ok(rows(archived)[0].meta.includes('archived'));
  assert.deepEqual(rows(archived)[0].actions.map((a) => a.id), ['home-record-verification', 'home-record-effective-period', 'home-record-options']);
  assert.equal(summary(archived).headline, '1 document archived.');
});

test('an empty view says so and keeps the chips so it can be left', async () => {
  install({ data: { ACTIVE: [record('a', 'INVOICE')], ARCHIVED: [], TRASHED: [] }, counts: {} }); priorViewState = state(null);
  const empty = await run(DOCUMENT_VIEW_MESSAGES.TRASHED, 'exec-1');
  assert.equal(empty.reasonCode, 'DOCUMENT_VIEW_EMPTY');
  assert.equal(summary(empty).headline, 'The trash is empty.');
  assert.deepEqual(chipIds(empty).filter((id) => ['view-current', 'view-trash', 'clear-all'].includes(id)), ['view-current', 'view-trash', 'clear-all']);
  assert.equal(empty.parameters.viewState.dateScopePhrase, 'TRASHED');
});

test('switching view starts it clean, a status chip keeps the view, and Clear filters or Current returns to the active records', async () => {
  install(); priorViewState = state('TRASHED', 'VERIFIED', 'MANUAL');
  const switched = await run(DOCUMENT_VIEW_MESSAGES.ARCHIVED, 'exec-1');
  assert.deepEqual([switched.parameters.viewState.statusFilter, switched.parameters.viewState.domainScopePhrase], ['ALL', null], 'a filter from the trash does not hide the archive');

  priorViewState = state('NEEDS_REVIEW');
  const status = await run('Only show unverified documents', 'exec-1');
  assert.equal(status.parameters.viewState.dateScopePhrase, 'NEEDS_REVIEW', 'a status chip keeps the view');
  assert.deepEqual(ids(status), ['review']);

  priorViewState = state('TRASHED');
  const cleared = await run('Now show all documents with no filters', 'exec-1');
  assert.equal(cleared.parameters.viewState.dateScopePhrase, null);
  assert.deepEqual(ids(cleared), ['lapsed', 'plain', 'review', 'soon']);
  priorViewState = state('ARCHIVED');
  assert.equal((await run(DOCUMENT_VIEW_MESSAGES.CURRENT, 'exec-1')).parameters.viewState.dateScopePhrase, null);
});

test('Restore is allowlisted on the document answer and refused to a viewer', () => {
  const action = { id: 'home-record-restore', label: 'Restore', interactionType: 'MUTATE_RECORD', message: 'Restore this home record from the trash.', operationId: 'HOME_RECORD_STATE_COMMAND', style: 'SECONDARY' };
  assert.equal(isAskActionApplicable({ action, operationId: 'DOCUMENT_LOOKUP', propertyId: 'p1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'CONTRIBUTOR'), true);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'VIEWER'), false);
});
