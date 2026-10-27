const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Buyer Closing": contract revision draft, edit, contingency note and per-field confirmation (FRD v1.349). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { BuyerContractService: Contract } = require('../../src/services/buyerContract.service.ts');
const command = require('../../src/services/ask/support/buyerContractCommand.ts');
const { contractCommandResult } = require('../../src/services/ask/handlers/buyerContractCommands.handler.ts');

const OP = 'BUYER_CONTRACT_COMMAND';
const M = command.CONTRACT_MESSAGES;
const T = '2026-09-01T00:00:00.000Z';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const rev = (over = {}) => ({
  id: 'rev1', status: 'CONFIRMED', revisionNumber: 1, updatedAt: T, propertyAddress: '1 Main St', buyerNames: ['Sam'], sellerNames: [], acceptedAt: '2026-08-01', targetClosingDate: '2026-10-30',
  possessionAt: null, possessionTerms: null, earnestMoneyAmountCents: 500000, earnestMoneyRecipient: 'Title Co', earnestMoneyMethod: null, sellerCreditsCents: null,
  includedItems: [], excludedItems: [], agreedRepairs: [], specialConditions: null,
  contingencies: [{ id: 'c1', contingencyKey: 'inspection', type: 'INSPECTION', label: 'Inspection', status: 'ACTIVE', dueAt: '2026-09-10T12:00:00.000Z', notes: null }], ...over,
});
const version = (revisions) => sha(`buyer-contract:${revisions.map((r) => `${r.id}:${r.status}:${r.updatedAt}:${r.contingencies.map((c) => `${c.contingencyKey}:${c.status}:${c.dueAt ?? ''}`).join(',')}`).join('|')}`);

function install(role, revisions = [rev()]) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: Contract.get, c: Contract.createRevision, u: Contract.updateDraft, f: Contract.confirm, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  Contract.get = async () => ({ workspace: { revisions }, propertyAddress: '1 Main St, Town', documents: [], conflicts: [] });
  Contract.createRevision = async (...a) => { calls.push(['create', ...a]); return {}; };
  Contract.updateDraft = async (...a) => { calls.push(['update', ...a]); return {}; };
  Contract.confirm = async (...a) => { calls.push(['confirm', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; Contract.get = saved.g; Contract.createRevision = saved.c; Contract.updateDraft = saved.u; Contract.confirm = saved.f; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const run = (kind, entityId, answer) => contractCommandResult('u1', 'prop-1', { kind, entityId, sourceExecutionId: null }, answer);
const draft = (over = {}) => rev({ id: 'd1', status: 'DRAFT', revisionNumber: 2, ...over });

test('declared-action only; contributor floor; viewers refused; a contingency update needs its entity', async () => {
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke('DRAFT_START', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('DRAFT_START', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_BUYER_CONTRACT_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('CONTINGENCY_UPDATE', launch())).reasonCode, 'ASK_BUYER_CONTRACT_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('DRAFT_START', launch())).status, 'NEEDS_CONFIRMATION');
    assert.equal((await invoke('DRAFT_EDIT', launch())).reasonCode, 'BUYER_CONTRACT_NO_DRAFT');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', [rev(), draft()]);
  try { assert.equal((await invoke('DRAFT_START', launch())).reasonCode, 'BUYER_CONTRACT_DRAFT_EXISTS'); } finally { w.restore(); }
});

test('the form validates; the edit review shows before and after and the draft-only effect; nothing is written', async () => {
  const p = command.parseContractAnswer;
  assert.equal(p('DRAFT_EDIT', {}).success, false);
  assert.equal(p('DRAFT_EDIT', { targetClosingDate: '2026-11-15' }).success, true);
  assert.equal(p('CONFIRM', { fields: ['TARGET_CLOSING_DATE'] }).success, false);
  assert.equal(p('CONFIRM', { fields: ['PROPERTY_ADDRESS', 'NOPE'] }).success, false);
  assert.equal(p('CONFIRM', { fields: ['PROPERTY_ADDRESS', 'TARGET_CLOSING_DATE'] }).success, true);
  const w = install('CONTRIBUTOR', [rev(), draft()]);
  try {
    assert.equal((await invoke('DRAFT_EDIT', launch())).status, 'NEEDS_CONTEXT');
    const review = await run('DRAFT_EDIT', null, { targetClosingDate: '2026-11-15', earnestMoney: 7500 });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.confirmation.fields.length, 2);
    assert.match(review.confirmation.fields[1].value, /\$5,000 → \$7,500/);
    assert.match(review.confirmation.description, /changes the draft only/);
    const c = await run('CONTINGENCY_UPDATE', 'c1', { status: 'SATISFIED' });
    assert.match(c.confirmation.description, /does not waive or satisfy anything with the seller/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirmation is per field: only held fields are offered, the address is required, and the review says what moves', async () => {
  const w = install('CONTRIBUTOR', [rev(), draft()]);
  try {
    const form = await invoke('CONFIRM', launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const values = form.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value);
    assert.ok(values.includes('PROPERTY_ADDRESS') && values.includes('TARGET_CLOSING_DATE') && !values.includes('SELLER_CREDITS'));
    assert.equal((await run('CONFIRM', null, { fields: ['TARGET_CLOSING_DATE'] })).reasonCode, 'BUYER_CONTRACT_INPUT_INVALID');
    const review = await run('CONFIRM', null, { fields: ['PROPERTY_ADDRESS', 'TARGET_CLOSING_DATE'] });
    assert.match(review.confirmation.description, /checked 2 fields/);
    assert.match(review.confirmation.description, /closing date and the deadlines counted from it/);
    assert.match(review.confirmation.description, /does not review contracts, and this waives nothing/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls the service the routes call; a changed revision list or a missing draft writes nothing', async () => {
  const revisions = [rev(), draft()];
  const w = install('CONTRIBUTOR', revisions);
  try {
    const v = version(revisions);
    const p = (kind, entityId, form, cv = v) => ({ contractCommand: { kind, entityId }, contractForm: form, contractContextVersion: cv });
    await confirmCapabilityInvoke(OP, ctx(p('DRAFT_EDIT', null, { targetClosingDate: '2026-11-15', earnestMoney: 7500, sellerCredits: 1000 })));
    assert.deepEqual(w.calls[0], ['update', 'u1', 'prop-1', 'd1', { targetClosingDate: '2026-11-15', earnestMoneyAmountCents: 750000, sellerCreditsCents: 100000 }]);
    await confirmCapabilityInvoke(OP, ctx(p('CONTINGENCY_UPDATE', 'c1', { status: 'SATISFIED' })));
    assert.equal(w.calls[1][3], 'd1');
    assert.deepEqual(w.calls[1][4].contingencies, [{ contingencyKey: 'inspection', type: 'INSPECTION', label: 'Inspection', status: 'SATISFIED', dueAt: '2026-09-10T12:00:00.000Z' }]);
    await confirmCapabilityInvoke(OP, ctx(p('CONFIRM', null, { fields: ['PROPERTY_ADDRESS', 'TARGET_CLOSING_DATE'] })));
    assert.deepEqual(w.calls[2], ['confirm', 'u1', 'prop-1', 'd1', { confirmed: true, fieldConfirmations: [{ fieldKey: 'PROPERTY_ADDRESS' }, { fieldKey: 'TARGET_CLOSING_DATE' }] }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('CONFIRM', null, { fields: ['TARGET_CLOSING_DATE'] }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('CONFIRM', null, { fields: ['PROPERTY_ADDRESS'] }, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
  const only = [rev()];
  const w2 = install('CONTRIBUTOR', only);
  try {
    await confirmCapabilityInvoke(OP, ctx({ contractCommand: { kind: 'DRAFT_START', entityId: null }, contractContextVersion: version(only) }));
    assert.equal(w2.calls[0][0], 'create');
    assert.equal(w2.calls[0][3].propertyAddress, '1 Main St');
    assert.equal(w2.calls[0][3].targetClosingDate, '2026-10-30');
    assert.equal(w2.calls[0][3].contingencies.length, 1);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ contractCommand: { kind: 'DRAFT_EDIT', entityId: null }, contractForm: { targetClosingDate: '2026-11-15' }, contractContextVersion: version(only) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  } finally { w2.restore(); }
});

test('the action ids are allowlisted on the timeline answer and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.CONTRACT_ACTION_IDS)) assert.equal(applicable(id, 'BUYER_CONTRACT_TIMELINE'), true, id);
  assert.equal(applicable('buyer-contract-back', OP), true);
});

// ---- names, lists and adding a contingency (FRD v1.453) -------------------------------------------------------------------------------------------
test('the edit form takes names and the three lists: one per line, blank keeps, "none" empties, and the limits are the service\'s', () => {
  const p = command.parseContractAnswer;
  const ok = p('DRAFT_EDIT', { buyerNames: 'Sam Lee\n Pat Lee \n', includedItems: 'Fridge\nWasher', excludedItems: 'none', agreedRepairs: '' });
  assert.equal(ok.success, true);
  assert.deepEqual([ok.data.buyerNames, ok.data.includedItems, ok.data.excludedItems, ok.data.agreedRepairs], [['Sam Lee', 'Pat Lee'], ['Fridge', 'Washer'], [], undefined]);
  assert.equal(p('DRAFT_EDIT', { buyerNames: Array.from({ length: 11 }, (_, i) => `n${i}`).join('\n') }).success, false, 'more than ten names');
  assert.equal(p('DRAFT_EDIT', { agreedRepairs: 'x'.repeat(501) }).success, false, 'a repair longer than the service allows');
  assert.equal(p('DRAFT_EDIT', { agreedRepairs: '' }).success, false, 'blank everywhere is nothing to save');
});

test('editing the lists reviews the before and after, and the confirmation sends only what was entered', async () => {
  const revisions = [rev(), draft({ buyerNames: ['Sam'], includedItems: ['Fridge'] })];
  const w = install('CONTRIBUTOR', revisions);
  try {
    const review = await run('DRAFT_EDIT', null, { buyerNames: 'Sam\nPat', excludedItems: 'none' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => [f.label, f.value]), [['Buyer name(s)', '1 → Sam; Pat'], ['Excluded items', '0 → none']]);
    assert.equal(w.calls.length, 0);
    await confirmCapabilityInvoke(OP, ctx({ contractCommand: { kind: 'DRAFT_EDIT', entityId: null }, contractForm: { buyerNames: 'Sam\nPat', excludedItems: 'none' }, contractContextVersion: version(revisions) }));
    assert.deepEqual(w.calls[0][4], { buyerNames: ['Sam', 'Pat'], excludedItems: [] });
  } finally { w.restore(); }
});

test('add a contingency: only types the draft lacks are offered, the review is draft-only, and the confirmation keeps the existing ones and adds the new', async () => {
  const revisions = [rev(), draft()];
  const w = install('CONTRIBUTOR', revisions);
  try {
    assert.equal(command.contractKindFromMessage(M.CONTINGENCY_ADD), 'CONTINGENCY_ADD');
    const ask = await invoke('CONTINGENCY_ADD', launch());
    assert.equal(ask.status, 'NEEDS_CONTEXT');
    const options = ask.captureRequests[0].inputSchema.fields.find((f) => f.key === 'type').inputSchema.options.map((o) => o.value);
    assert.equal(options.includes('INSPECTION'), false, 'the draft already has an inspection contingency');
    assert.equal(options.includes('FINANCING'), true);
    const review = await run('CONTINGENCY_ADD', null, { type: 'FINANCING', status: 'ACTIVE', dueDate: '2026-09-20' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /draft only/);
    assert.equal((await run('CONTINGENCY_ADD', null, { type: 'INSPECTION', status: 'ACTIVE' })).reasonCode, 'BUYER_CONTRACT_CONTINGENCY_EXISTS');
    await confirmCapabilityInvoke(OP, ctx({ contractCommand: { kind: 'CONTINGENCY_ADD', entityId: null }, contractForm: { type: 'FINANCING', status: 'ACTIVE', dueDate: '2026-09-20' }, contractContextVersion: version(revisions) }));
    assert.deepEqual(w.calls[0][4].contingencies.map((c) => [c.type, c.status, c.dueAt ?? null]), [['INSPECTION', 'ACTIVE', '2026-09-10T12:00:00.000Z'], ['FINANCING', 'ACTIVE', '2026-09-20T12:00:00.000Z']]);
    assert.equal(w.calls[0][4].contingencies[1].contingencyKey, 'contract:financing');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ contractCommand: { kind: 'CONTINGENCY_ADD', entityId: null }, contractForm: { type: 'INSPECTION', status: 'ACTIVE' }, contractContextVersion: version(revisions) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
  const all = [rev(), draft({ contingencies: Object.keys(command.CONTRACT_CONTINGENCY_TYPES).map((type, i) => ({ id: `c${i}`, contingencyKey: `contract:${type.toLowerCase()}`, type, label: type, status: 'ACTIVE', dueAt: null, notes: null })) })];
  const w2 = install('CONTRIBUTOR', all);
  try { assert.equal((await invoke('CONTINGENCY_ADD', launch())).reasonCode, 'BUYER_CONTRACT_NO_CONTINGENCY_TO_ADD'); } finally { w2.restore(); }
});
