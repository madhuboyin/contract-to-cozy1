const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Negotiation Shield slice 2c (docs/architecture/ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md): edit a review's saved details inside Ask. No database,
// browser or native module: `sharp` is stubbed and the Prisma models are an in-memory fake.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');
const { negotiationShieldReviewFromView } = require('../../src/services/ask/handlers/negotiationShield.handler.ts');
const { negotiationShieldEditResult, negotiationShieldEditContextVersion } = require('../../src/services/ask/handlers/negotiationShieldEdit.handler.ts');
const { getNegotiationShieldEditableInputForProperty } = require('../../src/services/negotiationShieldCaseList.ts');
const edit = require('../../src/services/ask/support/negotiationShieldEdit.ts');
const start = require('../../src/services/ask/support/negotiationShieldStart.ts');

const OP = 'NEGOTIATION_SHIELD_CASE_UPDATE';
const LAUNCH = { operationId: OP, surface: 'ASK_PAGE', entityType: 'NEGOTIATION_SHIELD_CASE', entityId: 'case-1' };
const KEYS = start.NEGOTIATION_START_SCENARIO_SPECS.CONTRACTOR_QUOTE_REVIEW.fields.map((f) => f.key);

// ───────────────────────────── answer parsing and diff ─────────────────────────────

test('the edit form validates into a value for every field, with blank and "not sure" meaning no value', () => {
  const ok = edit.parseNegotiationEditAnswer('CONTRACTOR_QUOTE_REVIEW', {
    contractorName: ' Acme Roofing ', quoteAmount: '17900', quoteDate: { precision: 'EXACT_DATE', value: '2026-09-30' }, urgencyClaimed: 'no', serviceCategory: '', notes: undefined,
  });
  assert.equal(ok.success, true);
  assert.deepEqual(ok.values, { contractorName: 'Acme Roofing', quoteAmount: 17900, quoteDate: '2026-09-30', serviceCategory: null, urgencyClaimed: false, notes: null });
  assert.equal(edit.parseNegotiationEditAnswer('CONTRACTOR_QUOTE_REVIEW', { urgencyClaimed: 'unknown' }).values.urgencyClaimed, null);
  assert.equal(edit.parseNegotiationEditAnswer('CONTRACTOR_QUOTE_REVIEW', { urgencyClaimed: 'yes' }).values.urgencyClaimed, true);
});

test('the edit form rejects other keys, a title, raw text, bad amounts and long notes', () => {
  for (const bad of [{ title: 'New name' }, { rawText: 'pasted' }, { insurerName: 'x' }, { quoteAmount: -1 }, { quoteAmount: 'abc' }, { quoteDate: 'soon' }, { notes: 'n'.repeat(1001) }]) {
    assert.equal(edit.parseNegotiationEditAnswer('CONTRACTOR_QUOTE_REVIEW', bad).success, false, JSON.stringify(bad).slice(0, 50));
  }
  // Clearing everything is allowed here (unlike starting a review): the person may be emptying a field they entered by mistake.
  assert.equal(edit.parseNegotiationEditAnswer('CONTRACTOR_QUOTE_REVIEW', {}).success, true);
});

test('the diff names exactly what changes, and set/remove are what the canonical merge applies', () => {
  const current = { contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: true };
  const submitted = { contractorName: 'Acme Roofing', quoteAmount: 17900, quoteDate: '2026-09-30', serviceCategory: null, urgencyClaimed: null, notes: null };
  const diff = edit.diffNegotiationEdit('CONTRACTOR_QUOTE_REVIEW', current, submitted);
  assert.deepEqual(diff.set, { quoteAmount: 17900, quoteDate: '2026-09-30' });
  assert.deepEqual(diff.remove, ['urgencyClaimed']);
  assert.deepEqual(diff.changes.map((c) => [c.field.key, c.before, c.after]), [['quoteAmount', 18500, 17900], ['quoteDate', null, '2026-09-30'], ['urgencyClaimed', true, null]]);
  assert.deepEqual(edit.diffNegotiationEdit('CONTRACTOR_QUOTE_REVIEW', current, { ...submitted, quoteAmount: 18500, quoteDate: null, urgencyClaimed: true }).changes, []);
});

// ───────────────────────────── the restricted reader ─────────────────────────────

const savedInput = (over = {}) => ({ id: 'input-1', inputType: 'CONTRACTOR_QUOTE', updatedAt: new Date('2026-10-02T09:00:00Z'), structuredData: {
  contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: true, systemCategory: 'roof', accountNumber: 'ACCT-123', nested: { a: 1 },
}, ...over });
const baseCase = (inputs, over = {}) => ({
  id: 'case-1', propertyId: 'prop-1', title: 'Roof quote', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'ANALYZED', createdByUserId: 'user-1', description: null,
  sourceType: 'MANUAL', perspective: 'HOMEOWNER', analysisVersion: null, latestAnalysisAt: null, quoteDecisionWorkspaceId: null,
  createdAt: new Date('2026-10-01T12:00:00Z'), updatedAt: new Date('2026-10-01T12:00:00Z'), analyses: [], drafts: [], inputs, ...over,
});

function readerStore(record) {
  const state = { record, queries: [] };
  const saved = { model: prisma.negotiationShieldCase, resolve: propertyAccess.resolvePropertyAccess };
  prisma.negotiationShieldCase = {
    findFirst: async (args) => {
      state.queries.push(args);
      const r = state.record;
      if (!r || args.where.propertyId !== r.propertyId || args.where.id !== r.id) return null;
      return { ...r, inputs: (r.inputs ?? []).filter((input) => !args.select?.inputs?.where || input.inputType === args.select.inputs.where.inputType) };
    },
  };
  propertyAccess.resolvePropertyAccess = async () => ({ role: state.role ?? 'CONTRIBUTOR', userId: 'user-1', propertyId: 'prop-1' });
  state.restore = () => { prisma.negotiationShieldCase = saved.model; propertyAccess.resolvePropertyAccess = saved.resolve; };
  return state;
}

test('the reader returns only the form\'s own keys and primitive values, never raw text or other keys', async () => {
  const st = readerStore(baseCase([savedInput({ rawText: 'RAW PASTED QUOTE TEXT' })]));
  try {
    const result = await getNegotiationShieldEditableInputForProperty('prop-1', 'case-1', 'CONTRACTOR_QUOTE', KEYS);
    assert.deepEqual(result.values, { contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: true });
    assert.equal(result.inputId, 'input-1');
    assert.equal(result.inputUpdatedAt, '2026-10-02T09:00:00.000Z');
    assert.equal(JSON.stringify(result).includes('RAW PASTED'), false);
    assert.equal(JSON.stringify(result).includes('ACCT-123'), false);
    const [query] = st.queries;
    assert.deepEqual(query.select.inputs.select, { id: true, structuredData: true, updatedAt: true }, 'raw text is never selected');
    assert.deepEqual(query.where, { id: 'case-1', propertyId: 'prop-1' });
  } finally { st.restore(); }
});

test('a parsed-document input is never the one edited; another property\'s case is not found', async () => {
  const parsed = savedInput({ id: 'input-parsed', updatedAt: new Date('2026-10-04T00:00:00Z'), structuredData: { quoteAmount: 99999, _meta: { origin: 'PARSED_DOCUMENT' } } });
  const manual = savedInput({ id: 'input-manual', updatedAt: new Date('2026-10-02T09:00:00Z') });
  const st = readerStore(baseCase([parsed, manual]));
  try {
    const result = await getNegotiationShieldEditableInputForProperty('prop-1', 'case-1', 'CONTRACTOR_QUOTE', KEYS);
    assert.equal(result.inputId, 'input-manual');
    assert.equal(result.values.quoteAmount, 18500);
    assert.equal(await getNegotiationShieldEditableInputForProperty('prop-2', 'case-1', 'CONTRACTOR_QUOTE', KEYS), null);
    st.record = baseCase([parsed]);
    const none = await getNegotiationShieldEditableInputForProperty('prop-1', 'case-1', 'CONTRACTOR_QUOTE', KEYS);
    assert.deepEqual([none.inputId, none.values], [null, {}]);
  } finally { st.restore(); }
});

// ───────────────────────────── the canonical merge (the real service) ─────────────────────────────

function modelStore() {
  const inputs = [];
  const cases = [{ id: 'case-1', propertyId: 'prop-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', sourceType: 'MANUAL', title: 'Roof quote', status: 'DRAFT', perspective: 'HOMEOWNER',
    createdAt: new Date(), updatedAt: new Date() }];
  const match = (record, where) => Object.entries(where).every(([k, v]) => record[k] === v);
  const caseModel = {
    findFirst: async ({ where }) => { const c = cases.find((r) => match(r, where)); return c ? { ...c, inputs: inputs.filter((i) => i.caseId === c.id), documents: [], analyses: [], drafts: [], buyerFindingLinks: [] } : null; },
    update: async ({ data }) => { Object.assign(cases[0], data); },
  };
  const inputModel = {
    findFirst: async ({ where }) => inputs.find((r) => match(r, where)) ?? null,
    findMany: async ({ where }) => inputs.filter((r) => match(r, where)).sort((a, b) => b.updatedAt - a.updatedAt),
    create: async ({ data }) => { const row = { id: `input-${inputs.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; inputs.push(row); return row; },
    update: async ({ where, data }) => { const row = inputs.find((r) => r.id === where.id); Object.assign(row, data, { updatedAt: new Date() }); return row; },
    count: async () => inputs.length,
  };
  return { cases, inputs, caseModel, inputModel };
}
function installModels(store) {
  const keys = ['negotiationShieldCase', 'negotiationShieldInput', 'negotiationShieldDocument', 'negotiationShieldAnalysis', 'negotiationShieldDraft', 'negotiationShieldBuyerFinding'];
  const saved = Object.fromEntries(keys.map((k) => [k, prisma[k]]));
  prisma.negotiationShieldCase = store.caseModel;
  prisma.negotiationShieldInput = store.inputModel;
  prisma.negotiationShieldDocument = { count: async () => 0 };
  prisma.negotiationShieldAnalysis = {};
  prisma.negotiationShieldDraft = {};
  prisma.negotiationShieldBuyerFinding = {};
  return () => { for (const k of keys) prisma[k] = saved[k]; };
}

test('the canonical merge changes only what was named, keeps keys the form does not know, and leaves raw text as saved', async () => {
  const store = modelStore();
  store.inputs.push({ id: 'input-1', caseId: 'case-1', inputType: 'CONTRACTOR_QUOTE', rawText: 'PAGE RAW TEXT', createdAt: new Date(), updatedAt: new Date('2026-10-02T09:00:00Z'),
    structuredData: { contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: true, systemCategory: 'roof', notes: 'old' } });
  const restore = installModels(store);
  try {
    const service = new NegotiationShieldService();
    await service.updateManualInputFields('prop-1', 'case-1', { inputType: 'CONTRACTOR_QUOTE', inputId: 'input-1', set: { quoteAmount: 17900, quoteDate: '2026-09-30' }, remove: ['urgencyClaimed', 'notes'] });
    assert.deepEqual(store.inputs[0].structuredData, { contractorName: 'Acme Roofing', quoteAmount: 17900, systemCategory: 'roof', quoteDate: '2026-09-30' });
    assert.equal(store.inputs[0].rawText, 'PAGE RAW TEXT');
    assert.equal(store.inputs.length, 1, 'updated in place');
  } finally { restore(); }
});

test('with no saved input the merge creates one; a parsed input is immutable; an unknown input id or another property\'s case is refused', async () => {
  const store = modelStore();
  const restore = installModels(store);
  try {
    const service = new NegotiationShieldService();
    await service.updateManualInputFields('prop-1', 'case-1', { inputType: 'CONTRACTOR_QUOTE', set: { quoteAmount: 1000 }, remove: [] });
    assert.equal(store.inputs.length, 1);
    assert.deepEqual(store.inputs[0].structuredData, { quoteAmount: 1000 });

    await assert.rejects(() => service.updateManualInputFields('prop-1', 'case-1', { inputType: 'CONTRACTOR_QUOTE', inputId: 'nope', set: { quoteAmount: 1 }, remove: [] }), (e) => e.code === 'NEGOTIATION_SHIELD_INPUT_NOT_FOUND');
    await assert.rejects(() => service.updateManualInputFields('prop-2', 'case-1', { inputType: 'CONTRACTOR_QUOTE', set: { quoteAmount: 1 }, remove: [] }));

    store.inputs[0].structuredData = { quoteAmount: 5, _meta: { origin: 'PARSED_DOCUMENT' } };
    await assert.rejects(() => service.updateManualInputFields('prop-1', 'case-1', { inputType: 'CONTRACTOR_QUOTE', inputId: 'input-1', set: { quoteAmount: 1 }, remove: [] }), (e) => e.code === 'NEGOTIATION_SHIELD_PARSED_INPUT_IMMUTABLE');
    assert.equal(store.inputs[0].structuredData.quoteAmount, 5);
  } finally { restore(); }
});

// ───────────────────────────── the command ─────────────────────────────

const invoke = (message, launchContext, role = 'CONTRIBUTOR', propertyId = 'prop-1') => capabilityInvoke(OP, { userId: 'user-1', propertyId, message, launchContext }, { propertyAccess: { role } });
const reviewable = (over = {}) => baseCase([savedInput()], over);

test('Edit details opens the scenario form pre-filled from what is saved, bound to the input\'s last-saved time', async () => {
  const st = readerStore(reviewable());
  try {
    const result = await invoke(edit.NEGOTIATION_SHIELD_EDIT_MESSAGE, LAUNCH);
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_EDIT_INPUT_REQUIRED');
    assert.deepEqual(result.parameters.negotiationEditLaunch, { caseId: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', sourceExecutionId: null });
    const [capture] = result.captureRequests;
    assert.equal(capture.captureKey, edit.NEGOTIATION_SHIELD_EDIT_CAPTURE_KEY);
    assert.deepEqual(capture.inputSchema.fields.map((f) => f.key), KEYS, 'the same fields as starting a review, without a title');
    assert.deepEqual(capture.currentAnswer, { contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: 'yes' });
    assert.equal(capture.expectedContextVersion, negotiationShieldEditContextVersion('case-1', 'input-1', '2026-10-02T09:00:00.000Z'));
    assert.equal(JSON.stringify(result).includes('ACCT-123'), false, 'a key outside the form is never shown');
  } finally { st.restore(); }
});

test('a viewer, an undeclared message, a refresh, another property, and a buyer inspection review never get a form', async () => {
  const st = readerStore(reviewable());
  try {
    assert.notEqual((await invoke(edit.NEGOTIATION_SHIELD_EDIT_MESSAGE, LAUNCH, 'VIEWER')).status, 'NEEDS_CONTEXT');
    assert.equal((await invoke('edit the details', null)).reasonCode, 'ASK_NEGOTIATION_SHIELD_EDIT_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(edit.NEGOTIATION_SHIELD_EDIT_MESSAGE, { ...LAUNCH, surface: 'ASK_REFRESH' })).reasonCode, 'ASK_NEGOTIATION_SHIELD_EDIT_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(edit.NEGOTIATION_SHIELD_EDIT_MESSAGE, LAUNCH, 'CONTRIBUTOR', 'prop-2')).reasonCode, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    st.record = reviewable({ scenarioType: 'BUYER_INSPECTION_NEGOTIATION' });
    const buyer = await invoke(edit.NEGOTIATION_SHIELD_EDIT_MESSAGE, LAUNCH);
    assert.equal(buyer.reasonCode, 'NEGOTIATION_SHIELD_EDIT_UNSUPPORTED');
    assert.equal(buyer.captureRequests, undefined);
  } finally { st.restore(); }
});

test('a submitted form is shown as exactly what changes, before and after, and writes nothing yet', async () => {
  const st = readerStore(reviewable());
  const original = NegotiationShieldService.prototype.updateManualInputFields;
  let wrote = 0;
  NegotiationShieldService.prototype.updateManualInputFields = async () => { wrote += 1; return {}; };
  try {
    const submitted = edit.parseNegotiationEditAnswer('CONTRACTOR_QUOTE_REVIEW', { contractorName: 'Acme Roofing', quoteAmount: 17900, quoteDate: '2026-09-30', urgencyClaimed: '' }).values;
    const result = await negotiationShieldEditResult('user-1', 'prop-1', { caseId: 'case-1', sourceExecutionId: 'src-1' }, submitted);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(result.parameters.negotiationShieldEdit, { caseId: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', inputId: 'input-1', set: { quoteAmount: 17900, quoteDate: '2026-09-30' }, remove: ['urgencyClaimed'] });
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.equal(fields['Quoted amount ($)'], '$18,500 → $17,900');
    assert.equal(fields['Quote date'], 'Not set → Sep 30, 2026');
    assert.equal(fields['Did they say it has to be done urgently?'], 'Yes → Removed');
    assert.equal(Object.keys(fields).includes('Contractor'), false, 'unchanged fields are not listed');
    assert.match(result.confirmation.description, /analysis is not re-run/);
    assert.equal(wrote, 0);
    assert.equal(result.captureRequests[0].currentAnswer.quoteAmount, 17900, 'the form keeps what was entered');
  } finally { NegotiationShieldService.prototype.updateManualInputFields = original; st.restore(); }
});

test('submitting what is already saved changes nothing and says so', async () => {
  const st = readerStore(reviewable());
  try {
    const same = edit.parseNegotiationEditAnswer('CONTRACTOR_QUOTE_REVIEW', { contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: 'yes' }).values;
    const result = await negotiationShieldEditResult('user-1', 'prop-1', { caseId: 'case-1', sourceExecutionId: null }, same);
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_EDIT_NO_CHANGE');
    assert.equal(result.confirmation ?? null, null);
  } finally { st.restore(); }
});

test('the command is a registered, confirmation-gated contributor command with no typed route', () => {
  const command = getAskDomainCommandByOperation(OP);
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.equal(command.adapterKey, 'negotiation-shield.update');
  assert.equal(command.supportsCancelBeforeExecution, true);
});

// ───────────────────────────── confirm ─────────────────────────────

const CONFIRMED = (over = {}) => ({
  negotiationShieldEdit: { caseId: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', inputId: 'input-1', set: { quoteAmount: 17900, quoteDate: '2026-09-30' }, remove: ['urgencyClaimed'], ...over },
  negotiationEditContextVersion: negotiationShieldEditContextVersion('case-1', 'input-1', '2026-10-02T09:00:00.000Z'),
});
const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-3', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

function installWrite(st) {
  const saved = { update: NegotiationShieldService.prototype.updateManualInputFields, reconcile: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  NegotiationShieldService.prototype.updateManualInputFields = async function (...args) {
    calls.push(args);
    const [, , payload] = args;
    const input = st.record.inputs[0];
    const data = { ...input.structuredData, ...payload.set };
    for (const key of payload.remove) delete data[key];
    st.record = { ...st.record, inputs: [{ ...input, structuredData: data, updatedAt: new Date('2026-10-12T10:00:00Z') }] };
    return { case: { id: 'case-1' }, inputs: [{ id: 'input-1', inputType: 'CONTRACTOR_QUOTE' }] };
  };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { NegotiationShieldService.prototype.updateManualInputFields = saved.update; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; } };
}

test('confirming saves exactly the named fields through the canonical merge and offers Review and the analysis', async () => {
  const st = readerStore(reviewable());
  const w = installWrite(st);
  try {
    const outcome = await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    assert.deepEqual(w.calls, [['prop-1', 'case-1', { inputType: 'CONTRACTOR_QUOTE', inputId: 'input-1', set: { quoteAmount: 17900, quoteDate: '2026-09-30' }, remove: ['urgencyClaimed'] }]]);
    assert.equal(outcome.result.status, 'COMPLETED');
    assert.equal(outcome.artifactType, 'NEGOTIATION_SHIELD_INPUT');
    assert.equal(outcome.artifactId, 'input-1');
    const receipt = outcome.result.blocks[0];
    assert.equal(receipt.title, 'Details saved');
    assert.match(receipt.description, /has not been analyzed yet/, 'a review that was never analysed says so');
    assert.deepEqual(receipt.actions.map((a) => [a.id, a.label, a.operationId, a.entityId]), [
      ['negotiation-shield-review', 'Review', 'NEGOTIATION_SHIELD_CASES', 'case-1'],
      ['negotiation-shield-analyze', 'Run the analysis', 'NEGOTIATION_SHIELD_CASE_ANALYZE', 'case-1'],
    ]);
  } finally { w.restore(); st.restore(); }
});

test('after details change on an analysed review, the receipt says the analysis was not re-run and offers Run it again', async () => {
  const analysed = reviewable({ status: 'ANALYZED', analyses: [{ id: 'an-1', caseId: 'case-1', generatedAt: new Date('2026-10-03T12:00:00Z') }] });
  const st = readerStore(analysed);
  const w = installWrite(st);
  try {
    const outcome = await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    const receipt = outcome.result.blocks[0];
    assert.match(receipt.description, /not re-run/);
    assert.equal(receipt.actions[1].label, 'Run it again');
  } finally { w.restore(); st.restore(); }
});

test('a retry finds the details already as intended and reports them without writing again', async () => {
  const st = readerStore(reviewable());
  const w = installWrite(st);
  try {
    await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    const again = await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    assert.equal(w.calls.length, 1);
    assert.equal(again.result.blocks[0].title, 'Details already saved');
  } finally { w.restore(); st.restore(); }
});

test('details changed elsewhere after the review card was shown are refused, not overwritten', async () => {
  const st = readerStore(reviewable({ inputs: [savedInput({ updatedAt: new Date('2026-10-09T09:00:00Z'), structuredData: { contractorName: 'Acme Roofing', quoteAmount: 19999 } })] }));
  const w = installWrite(st);
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(CONFIRMED())), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); st.restore(); }
});

test('a tampered or malformed stored change is refused before any write', async () => {
  const st = readerStore(reviewable());
  const w = installWrite(st);
  try {
    for (const parameters of [
      {},
      CONFIRMED({ scenarioType: 'BUYER_INSPECTION_NEGOTIATION' }),
      CONFIRMED({ set: { accountNumber: 'ACCT-123' } }),
      CONFIRMED({ set: { quoteAmount: -5 }, remove: [] }),
      CONFIRMED({ set: {}, remove: [] }),
      CONFIRMED({ set: { quoteAmount: 1 }, remove: ['_meta'] }),
      CONFIRMED({ set: { rawText: 'x' }, remove: [] }),
    ]) {
      await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    }
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); st.restore(); }
});

test('a removed review is refused at confirmation', async () => {
  const st = readerStore(null);
  const w = installWrite(st);
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(CONFIRMED())), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); st.restore(); }
});

// ───────────────────────────── the review offers it, and the validator keeps it ─────────────────────────────

const reviewDto = (scenarioType, hasInput = true) => ({
  case: { id: 'case-1', propertyId: 'prop-1', scenarioType, status: 'DRAFT', title: 'Roof quote', perspective: 'HOMEOWNER', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  latestAnalysis: null, latestDraft: null, hasInput, inputsUpdatedAt: hasInput ? new Date().toISOString() : null,
});
const summaryActionIds = (result) => result.blocks.find((b) => b.id === 'negotiation-shield-review-summary').actions.map((a) => a.id);

test('Edit details is offered to a contributor for the four scenarios and not for a buyer inspection or a viewer', () => {
  for (const scenario of start.NEGOTIATION_START_SCENARIOS) {
    assert.ok(summaryActionIds(negotiationShieldReviewFromView(reviewDto(scenario), true)).includes('negotiation-shield-edit'), scenario);
    assert.equal(summaryActionIds(negotiationShieldReviewFromView(reviewDto(scenario), false)).includes('negotiation-shield-edit'), false, `${scenario} viewer`);
  }
  assert.equal(summaryActionIds(negotiationShieldReviewFromView(reviewDto('BUYER_INSPECTION_NEGOTIATION'), true)).includes('negotiation-shield-edit'), false);
});

test('every action of the edit receipt and of the review survives the answer-trust validator', async () => {
  const st = readerStore(reviewable());
  const w = installWrite(st);
  const SOURCES = { NEGOTIATION_SHIELD_CASE_UPDATE: 'negotiation-shield.update', NEGOTIATION_SHIELD_CASES: 'negotiation-shield.cases', NEGOTIATION_SHIELD_CASE_ANALYZE: 'negotiation-shield.analyze' };
  const evidence = (op) => ({ answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: SOURCES[op], operationId: op, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] } });
  const ids = (blocks) => blocks.flatMap((b) => [...(b.actions ?? []), ...((b.sections ?? []).flatMap((sec) => sec.items.flatMap((i) => i.actions ?? [])))]).map((a) => a.id);
  try {
    const confirmed = await confirmCapabilityInvoke(OP, ctx(CONFIRMED()));
    const receipt = { ...confirmed.result, parameters: evidence(OP) };
    const { result: validated } = validateAskAnswerTrust({ question: edit.NEGOTIATION_SHIELD_EDIT_MESSAGE, operationId: OP, result: receipt, propertyId: 'prop-1' });
    assert.deepEqual(ids(validated.blocks), ids(receipt.blocks));
    assert.ok(ids(receipt.blocks).length >= 2);

    // The review (under the list operation) and the analysis receipt (which carries the review) both carry Edit details.
    for (const op of ['NEGOTIATION_SHIELD_CASES', 'NEGOTIATION_SHIELD_CASE_ANALYZE']) {
      const review = { ...negotiationShieldReviewFromView(reviewDto('CONTRACTOR_QUOTE_REVIEW'), true), parameters: evidence(op) };
      const { result: checked } = validateAskAnswerTrust({ question: 'Review this negotiation case.', operationId: op, result: review, propertyId: 'prop-1' });
      assert.deepEqual(ids(checked.blocks), ids(review.blocks), op);
      assert.ok(ids(review.blocks).includes('negotiation-shield-edit'), op);
    }
  } finally { w.restore(); st.restore(); }
});
