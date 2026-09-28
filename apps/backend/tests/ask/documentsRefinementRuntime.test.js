const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Documents D-2 (FRD v1.153): filters are a governed viewState refinement, the same continuity model as Maintenance, Buyer Deadlines and
// Warranties. The real registered `documents.lookup` handler runs against a stubbed Home Records list and a fake legacy table, so what is
// asserted is the result the homeowner would get, including continuity (result identity and revision) across chips.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
const { resolveDocumentRefinement, documentFilterChips } = require('../../src/services/ask/handlers/documents.handler.ts');
const { isFilterContinuationMessage, resolveAskFollowUpMessage } = require('../../src/services/ask/askFollowUpContext.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const realList = homeRecordsService.list;

const record = (id, recordType, verificationStatus, createdAt, extra = {}) => ({
  id, title: `Record ${id}`, description: null, recordType, sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE',
  createdAt: new Date(createdAt), updatedAt: new Date(createdAt), verificationStatus, verifiedAt: null, needsReview: false, expiryStatus: null, ...extra,
});
const legacyRow = (id, type, verificationStatus, createdAt = '2026-09-01') => ({
  id, name: `Legacy ${id}`, type, description: null, verificationStatus, createdAt: new Date(createdAt), updatedAt: new Date(createdAt),
});
const ROWS = {
  records: [
    record('inv-verified', 'INVOICE', 'VERIFIED', '2026-09-05'),
    record('inv-unverified', 'INVOICE', 'UNVERIFIED', '2026-09-04'),
    record('deed-pending', 'DEED', 'PENDING', '2026-09-03'),
  ],
  legacy: [legacyRow('est-rejected', 'ESTIMATE', 'REJECTED')],
};

let priorOperation; let priorViewState; let role;
function install(rows = ROWS) {
  priorOperation = 'DOCUMENT_LOOKUP'; priorViewState = null; role = 'OWNER';
  homeRecordsService.list = async () => rows.records;
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'askExecution') return { findFirst: async () => (priorViewState ? { operationId: priorOperation, parametersJson: { viewState: priorViewState } } : null) };
    if (model === 'document') return { findMany: async () => rows.legacy };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; homeRecordsService.list = realList; });
const run = (message, sourceExecutionId) => capabilityInvoke('DOCUMENT_LOOKUP', { userId: 'u1', propertyId: 'p1', message, launchContext: sourceExecutionId ? { surface: 'ASK_WORKSPACE', sourceExecutionId } : undefined });
const list = (result) => result.blocks.find((block) => block.id === 'document-lookup-groups');
const summary = (result) => result.blocks.find((block) => block.id === 'document-lookup-summary');
const ids = (result) => list(result).sections.flatMap((section) => section.items.map((item) => item.id)).sort();
const active = (result) => list(result).filters.filter((filter) => filter.active).map((filter) => filter.id).sort();
const view = (status, kind, revision, resultId = 'result-1') => ({ resultId, domainScopePhrase: kind, dateScopePhrase: null, statusFilter: status, selectedTaskId: null, revision });

test('a fresh collection question carries a new view state and declared chips that reflect only what this home has', async () => {
  install();
  const result = await run('Show my documents');
  assert.equal(result.parameters.viewState.revision, 1);
  assert.equal(result.parameters.viewState.statusFilter, 'ALL');
  assert.equal(result.parameters.viewState.domainScopePhrase, null);
  assert.match(result.parameters.viewState.resultId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(list(result).filters.map((filter) => filter.id), [
    'status-all', 'status-verified', 'status-unverified', 'status-pending', 'status-rejected', 'type-all', 'type-deed', 'type-estimate', 'type-invoice',
  ]);
  assert.deepEqual(active(result), ['status-all', 'type-all']);
  assert.ok(!list(result).filters.some((filter) => filter.id === 'clear-all'), 'nothing to clear yet');
});

test('a home with one type and no pending/rejected documents gets neither a type row nor those status chips', async () => {
  install({ records: [record('a', 'INVOICE', 'VERIFIED', '2026-09-01'), record('b', 'INVOICE', 'VERIFIED', '2026-09-02')], legacy: [] });
  const result = await run('Show my documents');
  assert.deepEqual(list(result).filters.map((filter) => filter.id), ['status-all', 'status-verified', 'status-unverified']);
});

test('a status chip keeps the result identity, bumps the revision, re-queries every document and offers a way back', async () => {
  install(); priorViewState = view('ALL', null, 1);
  const result = await run('Only show unverified documents', 'exec-1');
  assert.equal(result.parameters.viewState.resultId, 'result-1');
  assert.equal(result.parameters.viewState.revision, 2);
  assert.equal(result.parameters.viewState.statusFilter, 'UNVERIFIED');
  assert.deepEqual(ids(result), ['inv-unverified']);
  assert.match(summary(result).title, /1 document matches this request/);
  assert.deepEqual(active(result), ['status-unverified', 'type-all']);
  assert.ok(list(result).filters.some((filter) => filter.id === 'clear-all'));
});

test('a type chip replaces only the type and keeps the status that was already applied', async () => {
  install(); priorViewState = view('VERIFIED', null, 2);
  const result = await run('Only show Invoices', 'exec-2');
  assert.equal(result.parameters.viewState.statusFilter, 'VERIFIED');
  assert.equal(result.parameters.viewState.domainScopePhrase, 'INVOICE');
  assert.equal(result.parameters.viewState.revision, 3);
  assert.deepEqual(ids(result), ['inv-verified']);
  assert.deepEqual(active(result), ['status-verified', 'type-invoice']);
});

test('every status has its own chip and lands on exactly its rows', async () => {
  install();
  const expected = {
    'Only show verified documents': ['inv-verified'], 'Only show unverified documents': ['inv-unverified'],
    'Only show documents pending verification': ['deed-pending'], 'Only show rejected documents': ['est-rejected'],
  };
  for (const [message, want] of Object.entries(expected)) {
    priorViewState = view('ALL', null, 1);
    assert.deepEqual(ids(await run(message, 'exec-1')), want, message);
  }
});

test('"All" clears only the status, "All types" only the type, and "no filters" clears both', async () => {
  install();
  priorViewState = view('REJECTED', 'ESTIMATE', 3);
  const allStatus = await run('Now show all documents', 'exec-3');
  assert.equal(allStatus.parameters.viewState.statusFilter, 'ALL');
  assert.equal(allStatus.parameters.viewState.domainScopePhrase, 'ESTIMATE');
  assert.deepEqual(ids(allStatus), ['est-rejected']);

  priorViewState = view('REJECTED', 'ESTIMATE', 3);
  const allTypes = await run('Now show all document types', 'exec-3');
  assert.equal(allTypes.parameters.viewState.statusFilter, 'REJECTED');
  assert.equal(allTypes.parameters.viewState.domainScopePhrase, null);
  assert.deepEqual(ids(allTypes), ['est-rejected']);

  priorViewState = view('REJECTED', 'ESTIMATE', 3);
  const cleared = await run('Now show all documents with no filters', 'exec-3');
  assert.equal(cleared.parameters.viewState.statusFilter, 'ALL');
  assert.equal(cleared.parameters.viewState.domainScopePhrase, null);
  assert.equal(ids(cleared).length, 4);
  assert.ok(!list(cleared).filters.some((filter) => filter.id === 'clear-all'));
});

test('a filter that matches nothing still continues the result and keeps every chip so it can be widened', async () => {
  install(); priorViewState = view('ALL', 'ESTIMATE', 1);
  const result = await run('Only show verified documents', 'exec-1');
  assert.equal(result.reasonCode, 'DOCUMENT_FILTER_NO_MATCH');
  assert.equal(result.parameters.viewState.revision, 2);
  assert.equal(result.parameters.viewState.statusFilter, 'VERIFIED');
  assert.equal(summary(result).headline, 'No documents match these filters.');
  assert.equal(list(result).sections[0].count, 0);
  assert.ok(list(result).filters.some((filter) => filter.id === 'clear-all'));
  assert.equal(result.blocks.at(-1).id, 'document-lookup-boundary');
});

test('a fresh free-text question can filter by type on its own words, without a prior result', async () => {
  install();
  const result = await run('Show my deeds');
  assert.deepEqual(ids(result), ['deed-pending']);
  assert.equal(result.parameters.viewState.domainScopePhrase, 'DEED');
});

test('another domain\'s view state is never continued', async () => {
  install(); priorViewState = view('ALL', null, 7, 'buyer-result'); priorOperation = 'BUYER_DEADLINES';
  const result = await run('Only show verified documents', 'exec-buyer');
  assert.notEqual(result.parameters.viewState.resultId, 'buyer-result');
  assert.equal(result.parameters.viewState.revision, 1);
});

test('every declared chip is recognised as a filter continuation, round-trips to its own state, and resolves through the follow-up resolver', async () => {
  install();
  const prior = view('ALL', null, 1);
  const present = { kinds: [{ kind: 'INVOICE', label: 'Invoices' }, { kind: 'DEED', label: 'Deeds' }, { kind: 'ESTIMATE', label: 'Estimates' }], pending: true, rejected: true };
  const expectations = {
    'status-all': { verification: 'ALL' }, 'status-verified': { verification: 'VERIFIED' }, 'status-unverified': { verification: 'UNVERIFIED' },
    'status-pending': { verification: 'PENDING' }, 'status-rejected': { verification: 'REJECTED' },
    'type-all': { kind: null }, 'type-invoice': { kind: 'INVOICE' }, 'type-deed': { kind: 'DEED' }, 'type-estimate': { kind: 'ESTIMATE' },
  };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model !== 'askExecution') throw new Error(`Unexpected prisma.${String(model)} access`);
    return { findFirst: async () => ({ id: 'exec-1', operationId: 'DOCUMENT_LOOKUP', message: 'Show my documents', resultJson: {}, parametersJson: null, launchContextJson: null }) };
  } });
  for (const chip of documentFilterChips('REJECTED', 'INVOICE', present)) {
    assert.ok(isFilterContinuationMessage(chip.message), `${chip.label}: "${chip.message}" must start with a filter-continuation phrase`);
    const resolved = resolveDocumentRefinement(chip.message, prior, present.kinds);
    assert.ok(resolved, `${chip.label} must resolve to a refinement`);
    if (chip.id === 'clear-all') assert.deepEqual(resolved, { verification: 'ALL', kind: null });
    else {
      assert.ok(expectations[chip.id], `unexpected chip ${chip.id}`);
      if (expectations[chip.id].verification) assert.equal(resolved.verification, expectations[chip.id].verification, chip.label);
      if (expectations[chip.id].kind !== undefined) assert.equal(resolved.kind, expectations[chip.id].kind, chip.label);
    }
    const resolution = await resolveAskFollowUpMessage({ sessionId: 's1', propertyId: 'p1', message: chip.message, declaredSourceExecutionId: 'exec-1' });
    assert.equal(resolution.forcedOperationId, 'DOCUMENT_LOOKUP', chip.label);
    assert.equal(resolution.isFilterRefinement, true, `${chip.label}: a refinement is what supersedes the earlier result`);
    assert.equal(resolution.effectiveMessage, chip.message, `${chip.label}: the chip wording is a complete specification`);
  }
  assert.equal(resolveDocumentRefinement('Tell me about my roof', prior, present.kinds), null, 'an ordinary question is not a refinement');
  assert.equal(resolveDocumentRefinement('Only show Invoices', null, present.kinds), null);
});
