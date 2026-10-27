const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Negotiation Shield documents slice 3a (docs/architecture/ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md): attach an existing, household-visible Home
// Record to a review inside Ask. No database, file store or native module: `sharp` is stubbed and the models/inventory are in-memory fakes.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const inventory = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');
const { negotiationShieldReviewFromView } = require('../../src/services/ask/handlers/negotiationShield.handler.ts');
const { negotiationShieldAttachContextVersion } = require('../../src/services/ask/handlers/negotiationShieldAttach.handler.ts');
const attach = require('../../src/services/ask/support/negotiationShieldAttach.ts');

const OP = 'NEGOTIATION_SHIELD_CASE_ATTACH';
const LAUNCH = { operationId: OP, surface: 'ASK_PAGE', entityType: 'NEGOTIATION_SHIELD_CASE', entityId: 'case-1' };

// ───────────────────────────── what may be offered ─────────────────────────────

const cand = (id, over = {}) => ({ id, title: `Record ${id}`, kind: 'OTHER', kindLabel: 'Other', addedAt: new Date('2026-10-01T00:00:00Z'), sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', lifecycle: 'ACTIVE', ...over });

test('only active, household-visible records of an allowed sensitivity that are not already attached are offered, newest first', () => {
  const out = attach.offerableNegotiationDocuments([
    cand('old', { addedAt: new Date('2026-09-01T00:00:00Z') }),
    cand('new', { addedAt: new Date('2026-10-05T00:00:00Z'), sensitivity: 'INSURANCE' }),
    cand('fin', { sensitivity: 'FINANCIAL' }),
    cand('claim', { sensitivity: 'CLAIM' }),
    cand('owner', { visibility: 'OWNER_ONLY' }),
    cand('recipient', { visibility: 'RECIPIENT_SELECTED' }),
    cand('personal', { sensitivity: 'PERSONAL' }),
    cand('security', { sensitivity: 'SECURITY' }),
    cand('legal', { sensitivity: 'LEGAL' }),
    cand('unclassified', { sensitivity: null }),
    cand('archived', { lifecycle: 'ARCHIVED' }),
    cand('attached'),
  ], new Set(['attached']));
  assert.deepEqual(out.options.map((o) => o.id), ['new', 'fin', 'claim', 'old']);
  assert.equal(out.excludedPrivate, 2);
  assert.equal(out.excludedSensitive, 4);
});

test('the offer is bounded', () => {
  const many = Array.from({ length: 60 }, (_, i) => cand(`r${i}`, { addedAt: new Date(2026, 0, 1 + (i % 28)) }));
  assert.equal(attach.offerableNegotiationDocuments(many, new Set()).options.length, attach.NEGOTIATION_ATTACH_MAX_OPTIONS);
});

test('each scenario offers only the document roles its rules engine counts, and the answer is strict', () => {
  assert.deepEqual([...attach.NEGOTIATION_ATTACH_DOCUMENT_TYPES.CONTRACTOR_QUOTE_REVIEW], ['QUOTE', 'SUPPORTING_DOCUMENT']);
  assert.deepEqual([...attach.NEGOTIATION_ATTACH_DOCUMENT_TYPES.INSURANCE_PREMIUM_INCREASE], ['PREMIUM_NOTICE', 'SUPPORTING_DOCUMENT']);
  assert.deepEqual([...attach.NEGOTIATION_ATTACH_DOCUMENT_TYPES.INSURANCE_CLAIM_SETTLEMENT], ['CLAIM_SETTLEMENT_NOTICE', 'CLAIM_ESTIMATE', 'SUPPORTING_DOCUMENT']);
  assert.deepEqual([...attach.NEGOTIATION_ATTACH_DOCUMENT_TYPES.CONTRACTOR_URGENCY_PRESSURE], ['CONTRACTOR_RECOMMENDATION', 'CONTRACTOR_ESTIMATE', 'SUPPORTING_DOCUMENT']);
  assert.equal(attach.parseNegotiationAttachAnswer('CONTRACTOR_QUOTE_REVIEW', { documentType: 'QUOTE', recordId: 'rec-1' }).success, true);
  for (const bad of [{ documentType: 'PREMIUM_NOTICE', recordId: 'rec-1' }, { documentType: 'QUOTE' }, { documentType: 'QUOTE', recordId: '' }, { documentType: 'QUOTE', recordId: 'r', fileUrl: 'x' }]) {
    assert.equal(attach.parseNegotiationAttachAnswer('CONTRACTOR_QUOTE_REVIEW', bad).success, false, JSON.stringify(bad));
  }
});

// ───────────────────────────── the review lists what is attached ─────────────────────────────

const reviewDto = (over = {}) => ({
  case: { id: 'case-1', propertyId: 'prop-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'DRAFT', title: 'Roof quote', perspective: 'HOMEOWNER', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  latestAnalysis: null, latestDraft: null, hasInput: true, inputsUpdatedAt: null, documents: [], ...over,
});
const docsBlock = (result) => result.blocks.find((b) => b.id === 'negotiation-shield-documents');

test('the review lists attached documents by title, role and readiness only, and offers Attach to a contributor', () => {
  const result = negotiationShieldReviewFromView(reviewDto({ documents: [
    { id: 'link-1', documentId: 'rec-1', documentType: 'QUOTE', title: 'Acme estimate', shared: true, ready: true },
    { id: 'link-2', documentId: 'rec-2', documentType: 'SUPPORTING_DOCUMENT', title: 'Private document', shared: false, ready: false },
  ] }), true);
  const block = docsBlock(result);
  assert.deepEqual(block.sections[0].items.map((i) => [i.title, i.meta[0], i.status]), [['Acme estimate', 'Quote', 'Ready'], ['Private document', 'Supporting document', 'Being checked']]);
  assert.deepEqual(block.actions.map((a) => [a.id, a.operationId, a.entityType, a.entityId]), [['negotiation-shield-attach', OP, 'NEGOTIATION_SHIELD_CASE', 'case-1']]);
  assert.equal(JSON.stringify(block).includes('http'), false);
  assert.equal(JSON.stringify(block).includes('storage'), false);
});

test('a viewer sees what is attached but no action; with nothing attached a viewer sees no block; a buyer review offers attach to a contributor only', () => {
  const docs = [{ id: 'link-1', documentId: 'rec-1', documentType: 'QUOTE', title: 'Acme estimate', shared: true, ready: true }];
  assert.deepEqual(docsBlock(negotiationShieldReviewFromView(reviewDto({ documents: docs }), false)).actions, []);
  assert.equal(docsBlock(negotiationShieldReviewFromView(reviewDto(), false)), undefined);
  const empty = docsBlock(negotiationShieldReviewFromView(reviewDto(), true));
  assert.equal(empty.sections[0].count, 0);
  assert.match(empty.description, /Nothing is attached yet/);
  const buyer = reviewDto(); buyer.case.scenarioType = 'BUYER_INSPECTION_NEGOTIATION';
  assert.equal(docsBlock(negotiationShieldReviewFromView(buyer, true)).actions[0].id, 'negotiation-shield-attach');
  assert.equal(docsBlock(negotiationShieldReviewFromView(buyer, false)), undefined);
});

// ───────────────────────────── propose ─────────────────────────────

const RECORDS = [
  { id: 'rec-shared', source: 'HOME_RECORD', title: 'Acme roof estimate', kind: 'OTHER', kindLabel: 'Other', addedAt: new Date('2026-10-05T00:00:00Z'), sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', lifecycle: 'ACTIVE' },
  { id: 'rec-private', source: 'HOME_RECORD', title: 'Private contract', kind: 'OTHER', kindLabel: 'Other', addedAt: new Date('2026-10-06T00:00:00Z'), sensitivity: 'STANDARD', visibility: 'OWNER_ONLY', lifecycle: 'ACTIVE' },
  { id: 'rec-legal', source: 'HOME_RECORD', title: 'Attorney letter', kind: 'OTHER', kindLabel: 'Other', addedAt: new Date('2026-10-04T00:00:00Z'), sensitivity: 'LEGAL', visibility: 'HOUSEHOLD', lifecycle: 'ACTIVE' },
  { id: 'rec-legacy', source: 'LEGACY_DOCUMENT', title: 'Legacy file', kind: 'OTHER', kindLabel: 'Other', addedAt: new Date('2026-10-07T00:00:00Z'), sensitivity: null, visibility: null, lifecycle: 'ACTIVE' },
];
const caseRow = (over = {}) => ({
  id: 'case-1', propertyId: 'prop-1', title: 'Roof quote', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'DRAFT', createdByUserId: 'user-1', description: null, sourceType: 'MANUAL',
  perspective: 'HOMEOWNER', analysisVersion: null, latestAnalysisAt: null, quoteDecisionWorkspaceId: null, createdAt: new Date('2026-10-01T12:00:00Z'), updatedAt: new Date('2026-10-01T12:00:00Z'),
  analyses: [], drafts: [], inputs: [{ updatedAt: new Date('2026-10-02T09:00:00Z') }], documents: [], ...over,
});

function install({ record = caseRow(), records = RECORDS, role = 'CONTRIBUTOR' } = {}) {
  const state = { record, records, role, listCalls: [], recordLookups: [] };
  const saved = { cases: prisma.negotiationShieldCase, rec: prisma.propertyRecord, list: inventory.listPropertyDocuments, resolve: propertyAccess.resolvePropertyAccess };
  prisma.negotiationShieldCase = {
    findFirst: async (args) => (state.record && args.where.propertyId === state.record.propertyId && args.where.id === state.record.id ? state.record : null),
  };
  prisma.propertyRecord = {
    findFirst: async (args) => {
      state.recordLookups.push(args.where);
      return state.records.find((r) => r.id === args.where.id && r.source === 'HOME_RECORD' && (!args.where.visibility || r.visibility === args.where.visibility)
        && (!args.where.lifecycleStatus || r.lifecycle === args.where.lifecycleStatus)) ? { id: args.where.id, title: state.records.find((r) => r.id === args.where.id).title, recordType: 'OTHER', sensitivity: state.records.find((r) => r.id === args.where.id).sensitivity } : null;
    },
  };
  inventory.listPropertyDocuments = async (input) => {
    state.listCalls.push(input);
    return { items: state.records, totals: { total: state.records.length, homeRecords: state.records.length, legacy: 0 } };
  };
  propertyAccess.resolvePropertyAccess = async () => ({ role: state.role, userId: 'user-1', propertyId: 'prop-1' });
  state.restore = () => { prisma.negotiationShieldCase = saved.cases; prisma.propertyRecord = saved.rec; inventory.listPropertyDocuments = saved.list; propertyAccess.resolvePropertyAccess = saved.resolve; };
  return state;
}
const invoke = (launchContext, role = 'CONTRIBUTOR', propertyId = 'prop-1', message = attach.NEGOTIATION_SHIELD_ATTACH_MESSAGE) =>
  capabilityInvoke(OP, { userId: 'user-1', propertyId, message, launchContext }, { propertyAccess: { role } });

test('the form offers the two choices, from Home Records the whole household can see, never an owner-only, sensitive or legacy one, even to an owner', async () => {
  const st = install({ role: 'OWNER' });
  try {
    const result = await invoke(LAUNCH, 'OWNER');
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_ATTACH_INPUT_REQUIRED');
    const [capture] = result.captureRequests;
    assert.equal(capture.captureKey, attach.NEGOTIATION_SHIELD_ATTACH_CAPTURE_KEY);
    const [role, record] = capture.inputSchema.fields;
    assert.deepEqual(role.inputSchema.options.map((o) => o.value), ['QUOTE', 'SUPPORTING_DOCUMENT']);
    assert.deepEqual(record.inputSchema.options.map((o) => o.value), ['rec-shared']);
    assert.match(record.inputSchema.options[0].label, /^Acme roof estimate \(Other, added /);
    assert.equal(capture.expectedContextVersion, negotiationShieldAttachContextVersion('case-1', ['rec-shared']));
    assert.equal(st.listCalls[0].includeLegacy, undefined, 'Home Records only');
    assert.equal(JSON.stringify(result).includes('Private contract'), false);
    assert.equal(JSON.stringify(result).includes('Attorney letter'), false);
  } finally { st.restore(); }
});

test('a viewer, an undeclared message, a refresh, and another property never get a form', async () => {
  const st = install();
  try {
    assert.notEqual((await invoke(LAUNCH, 'VIEWER')).status, 'NEEDS_CONTEXT');
    assert.equal((await invoke(null, 'CONTRIBUTOR', 'prop-1', 'attach a document')).reasonCode, 'ASK_NEGOTIATION_SHIELD_ATTACH_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke({ ...LAUNCH, surface: 'ASK_REFRESH' })).reasonCode, 'ASK_NEGOTIATION_SHIELD_ATTACH_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(LAUNCH, 'CONTRIBUTOR', 'prop-2')).reasonCode, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
  } finally { st.restore(); }
});

test('a buyer inspection review gets the form with the buyer document roles, and a quote role is refused for it', async () => {
  const st = install();
  try {
    st.record = caseRow({ scenarioType: 'BUYER_INSPECTION_NEGOTIATION' });
    const form = await invoke(LAUNCH);
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const roles = form.captureRequests[0].inputSchema.fields.find((f) => f.key === 'documentType').inputSchema.options.map((o) => o.value);
    assert.deepEqual(roles, ['INSPECTION_REPORT', 'BUYER_REQUEST', 'SUPPORTING_DOCUMENT']);
    assert.equal(attach.parseNegotiationAttachAnswer('BUYER_INSPECTION_NEGOTIATION', { documentType: 'QUOTE', recordId: 'rec-shared' }).success, false);
    assert.equal(attach.parseNegotiationAttachAnswer('BUYER_INSPECTION_NEGOTIATION', { documentType: 'BUYER_REQUEST', recordId: 'rec-shared' }).success, true);
  } finally { st.restore(); }
});

test('with no record to offer it says so honestly, without a way to add one that Ask does not have', async () => {
  const st = install({ records: [RECORDS[1], RECORDS[2]] });
  try {
    const result = await invoke(LAUNCH);
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_ATTACH_NO_RECORDS');
    assert.match(result.blocks[0].body, /private or of a more sensitive kind/);
    assert.match(result.blocks[0].body, /not currently available in Ask/);
    assert.equal(result.captureRequests, undefined);
    assert.equal(JSON.stringify(result).includes('Private contract'), false);
  } finally { st.restore(); }
});

test('a chosen record is shown with who can see it, and nothing is attached yet', async () => {
  const st = install();
  const original = NegotiationShieldService.prototype.attachDocumentMetadata;
  let wrote = 0;
  NegotiationShieldService.prototype.attachDocumentMetadata = async () => { wrote += 1; return {}; };
  try {
    const { negotiationShieldAttachResult } = require('../../src/services/ask/handlers/negotiationShieldAttach.handler.ts');
    const result = await negotiationShieldAttachResult('user-1', 'prop-1', { caseId: 'case-1', sourceExecutionId: 'src-1' }, { documentType: 'QUOTE', recordId: 'rec-shared' });
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(result.parameters.negotiationShieldAttach, { caseId: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', recordId: 'rec-shared', documentType: 'QUOTE' });
    assert.match(result.confirmation.description, /shares the record with everyone who can see this review/);
    assert.match(result.confirmation.description, /not read or analyzed/);
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.deepEqual(fields, { Review: 'Roof quote', Document: 'Acme roof estimate', Kind: 'Other', Sensitivity: 'Standard', 'It is': 'Quote' });
    assert.equal(wrote, 0);
    // A record that is not in the offer (forged or since changed) goes back to the form, never to a confirmation.
    const forged = await negotiationShieldAttachResult('user-1', 'prop-1', { caseId: 'case-1', sourceExecutionId: null }, { documentType: 'QUOTE', recordId: 'rec-private' });
    assert.equal(forged.reasonCode, 'NEGOTIATION_SHIELD_ATTACH_RECORD_UNAVAILABLE');
  } finally { NegotiationShieldService.prototype.attachDocumentMetadata = original; st.restore(); }
});

test('the command is a registered, confirmation-gated contributor command with no typed route', () => {
  const command = getAskDomainCommandByOperation(OP);
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.equal(command.adapterKey, 'negotiation-shield.attach');
  assert.equal(command.supportsCancelBeforeExecution, true);
});

// ───────────────────────────── confirm ─────────────────────────────

const CONFIRMED = (over = {}) => ({ negotiationShieldAttach: { caseId: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', recordId: 'rec-shared', documentType: 'QUOTE', ...over } });
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-9', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

function installWrite(st) {
  const saved = { attach: NegotiationShieldService.prototype.attachDocumentMetadata, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  NegotiationShieldService.prototype.attachDocumentMetadata = async function (args) {
    calls.push(args);
    st.record = { ...st.record, documents: [{ id: 'link-9', documentId: args.payload.documentId, documentType: args.payload.documentType, document: { title: 'Acme roof estimate', visibility: 'HOUSEHOLD', currentVersion: { scanStatus: 'CLEAN', integrityStatus: 'VERIFIED' } } }] };
    return { case: { id: 'case-1' }, documents: [{ id: 'link-9', documentId: args.payload.documentId }], inputs: [] };
  };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { NegotiationShieldService.prototype.attachDocumentMetadata = saved.attach; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; } };
}

test('confirming attaches a record to a buyer inspection review in a buyer role', async () => {
  const st = install(); st.record = caseRow({ scenarioType: 'BUYER_INSPECTION_NEGOTIATION' });
  const w = installWrite(st);
  try {
    await confirmCapabilityInvoke(OP, ctx(CONFIRMED({ scenarioType: 'BUYER_INSPECTION_NEGOTIATION', documentType: 'INSPECTION_REPORT' })));
    assert.deepEqual(w.calls[0].payload, { documentType: 'INSPECTION_REPORT', documentId: 'rec-shared' });
  } finally { w.restore(); st.restore(); }
});

test('confirming attaches the record by id through the canonical service, with the caller\'s role and no file details', async () => {
  const st = install();
  const w = installWrite(st);
  try {
    const outcome = await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    assert.equal(w.calls.length, 1);
    assert.deepEqual(w.calls[0], { propertyId: 'prop-1', caseId: 'case-1', userId: 'user-1', role: 'CONTRIBUTOR', payload: { documentType: 'QUOTE', documentId: 'rec-shared' } });
    assert.equal(outcome.artifactType, 'NEGOTIATION_SHIELD_DOCUMENT');
    assert.equal(outcome.artifactId, 'link-9');
    const receipt = outcome.result.blocks[0];
    assert.equal(receipt.title, 'Document attached');
    assert.match(receipt.description, /not read/);
    assert.deepEqual(receipt.actions.map((a) => [a.id, a.label]), [['negotiation-shield-review', 'Review'], ['negotiation-shield-analyze', 'Run the analysis']]);
    assert.deepEqual(st.recordLookups[0], { id: 'rec-shared', propertyId: 'prop-1', visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE' });
  } finally { w.restore(); st.restore(); }
});

test('a record already attached is reported, not attached again', async () => {
  const st = install({ record: caseRow({ documents: [{ id: 'link-1', documentId: 'rec-shared', documentType: 'QUOTE', document: { title: 'Acme roof estimate', visibility: 'HOUSEHOLD', currentVersion: { scanStatus: 'CLEAN', integrityStatus: 'VERIFIED' } } }] }) });
  const w = installWrite(st);
  try {
    const outcome = await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    assert.equal(w.calls.length, 0);
    assert.equal(outcome.result.blocks[0].title, 'Document already attached');
    assert.equal(outcome.artifactId, 'link-1');
  } finally { w.restore(); st.restore(); }
});

test('a forged or changed record is refused at confirmation before anything is linked', async () => {
  const st = install();
  const w = installWrite(st);
  try {
    for (const parameters of [
      CONFIRMED({ recordId: 'rec-private' }),   // owner-only
      CONFIRMED({ recordId: 'rec-legal' }),     // not an offered sensitivity
      CONFIRMED({ recordId: 'rec-legacy' }),    // not a Home Record
      CONFIRMED({ recordId: 'rec-missing' }),
    ]) {
      await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE', JSON.stringify(parameters).slice(0, 80));
    }
    for (const parameters of [{}, CONFIRMED({ documentType: 'PREMIUM_NOTICE' }), CONFIRMED({ scenarioType: 'BUYER_INSPECTION_NEGOTIATION' }), CONFIRMED({ scenarioType: 'WHOLE_HOME_SWAP' }), CONFIRMED({ caseId: '' })]) {
      await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    }
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); st.restore(); }
});

test('a removed review is refused at confirmation', async () => {
  const st = install({ record: null });
  const w = installWrite(st);
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(CONFIRMED())), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); st.restore(); }
});

// ───────────────────────────── allowlist and the validator ─────────────────────────────

test('every id the attach flow emits is allowlisted for the operation that emits it', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: OP, entityType: 'NEGOTIATION_SHIELD_CASE', entityId: 'c', style: 'SECONDARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  // The review (list operation) and the analysis receipt (which embeds the review) carry Attach a document; the attach receipt carries Review and Run.
  assert.equal(applicable('negotiation-shield-attach', 'NEGOTIATION_SHIELD_CASES'), true);
  assert.equal(applicable('negotiation-shield-attach', 'NEGOTIATION_SHIELD_CASE_ANALYZE'), true);
  assert.equal(applicable('negotiation-shield-review', OP), true);
  assert.equal(applicable('negotiation-shield-analyze', OP), true);
  assert.equal(applicable('negotiation-shield-attach', 'NEGOTIATION_SHIELD_CASE_UPDATE'), false, 'not carried by the edit receipt');
});

test('the receipt survives the answer-trust validator', async () => {
  const st = install();
  const w = installWrite(st);
  try {
    const confirmed = await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    const receipt = { ...confirmed.result, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'negotiation-shield.attach', operationId: OP, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] } } };
    const { result: validated } = validateAskAnswerTrust({ question: attach.NEGOTIATION_SHIELD_ATTACH_MESSAGE, operationId: OP, result: receipt, propertyId: 'prop-1' });
    const ids = (r) => r.blocks.flatMap((b) => (b.actions ?? []).map((a) => a.id));
    assert.deepEqual(ids(validated), ids(receipt));
    assert.deepEqual(validated.blocks.map((b) => b.id), receipt.blocks.map((b) => b.id));
  } finally { w.restore(); st.restore(); }
});
