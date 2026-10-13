const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Buyer Closing": lender conditions and title or escrow issues (FRD v1.346). No database, browser or native module.

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
const { BuyerPurchaseLenderReadinessService: Lender } = require('../../src/services/buyerPurchaseLenderReadiness.service.ts');
const { BuyerTitleEscrowService: Title } = require('../../src/services/buyerTitleEscrow.service.ts');
const command = require('../../src/services/ask/support/buyerClosingItemCommand.ts');
const { closingItemResult } = require('../../src/services/ask/handlers/buyerClosingItemCommands.handler.ts');

const OP = 'BUYER_CLOSING_ITEM_COMMAND';
const M = command.CLOSING_ITEM_MESSAGES;
const T = '2026-09-01T00:00:00.000Z';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const item = (over = {}) => ({ id: 'c1', title: 'Pay stubs', category: 'INCOME_ASSET', status: 'OPEN', blocking: true, dueAt: null, notes: null, updatedAt: T, ...over });
const version = (tracker, items) => sha(`closing-${tracker}:${items.map((i) => `${i.id}:${i.status}:${i.updatedAt}`).sort().join('|')}`);

function install(role, { lender = [item()], title = [item({ id: 't1', title: 'Lien', category: 'LIEN_JUDGMENT' })], selected = 'rev-1', path = 'FINANCED', readiness = {} } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, lg: Lender.get, lc: Lender.createCondition, lu: Lender.updateCondition, lr: Lender.updateReadiness, tg: Title.get, ti: Title.createIssue, tu: Title.updateIssue, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  Lender.get = async () => ({ purchasePath: path, selectedRevisionId: selected, readiness: { appraisalStatus: 'ORDERED', appraisalOrderedAt: '2026-09-01T12:00:00.000Z', appraisalScheduledAt: null, appraisalCompletedAt: null, appraisalIssueType: null, appraisalIssueNotes: null, underwritingStatus: 'IN_REVIEW', updatedAt: T, ...readiness, conditions: lender } });
  Lender.updateReadiness = async (...a) => { calls.push(['readiness', ...a]); return {}; };
  Lender.createCondition = async (...a) => { calls.push(['lenderAdd', ...a]); return {}; };
  Lender.updateCondition = async (...a) => { calls.push(['lenderUpdate', ...a]); return {}; };
  Title.get = async () => ({ workspace: { issues: title } });
  Title.createIssue = async (...a) => { calls.push(['titleAdd', ...a]); return {}; };
  Title.updateIssue = async (...a) => { calls.push(['titleUpdate', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; Lender.get = saved.lg; Lender.createCondition = saved.lc; Lender.updateCondition = saved.lu; Lender.updateReadiness = saved.lr; Title.get = saved.tg; Title.createIssue = saved.ti; Title.updateIssue = saved.tu; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const run = (kind, entityId, answer) => closingItemResult('u1', 'prop-1', { kind, entityId, sourceExecutionId: null }, answer);

test('declared-action only; contributor floor; viewers refused; an update needs its item and its entity type', async () => {
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke('LENDER_ADD', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('LENDER_UPDATE', launch())).reasonCode, 'ASK_BUYER_CLOSING_ITEM_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('LENDER_UPDATE', launch({ entityType: 'BUYER_TITLE_ESCROW_ISSUE', entityId: 'c1' }))).reasonCode, 'ASK_BUYER_CLOSING_ITEM_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('LENDER_UPDATE', launch({ surface: 'ASK_REFRESH', entityType: 'BUYER_LENDER_CONDITION', entityId: 'c1' }))).reasonCode, 'ASK_BUYER_CLOSING_ITEM_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('LENDER_UPDATE', launch({ entityType: 'BUYER_LENDER_CONDITION', entityId: 'c1' }))).status, 'NEEDS_CONTEXT');
    assert.equal((await invoke('TITLE_ADD', launch())).status, 'NEEDS_CONTEXT');
  } finally { w.restore(); }
});

test('a lender condition needs a selected loan estimate and a financed purchase; a title issue does not', async () => {
  let w = install('CONTRIBUTOR', { selected: null });
  try {
    const out = await invoke('LENDER_ADD', launch());
    assert.equal(out.reasonCode, 'BUYER_CLOSING_ITEM_NOT_AVAILABLE');
    assert.match(out.blocks[0].body, /Select a confirmed Loan Estimate first/);
    assert.equal((await invoke('TITLE_ADD', launch())).status, 'NEEDS_CONTEXT');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', { path: 'CASH' });
  try { assert.match((await invoke('LENDER_ADD', launch())).blocks[0].body, /cash/); } finally { w.restore(); }
});

test('forms validate like the schemas; the review shows before and after and writes nothing; a settled item is left alone', async () => {
  const p = command.parseClosingItemAnswer;
  assert.equal(p('LENDER_ADD', { category: 'CREDIT', title: 'Explain inquiry', blocking: 'YES' }).success, true);
  assert.equal(p('LENDER_ADD', { category: 'LIEN_JUDGMENT', title: 'x', blocking: 'NO' }).success, false);
  assert.equal(p('TITLE_ADD', { category: 'LIEN_JUDGMENT', title: 'x', blocking: 'NO' }).success, true);
  assert.equal(p('TITLE_UPDATE', { status: 'SATISFIED' }).success, false);
  assert.equal(p('LENDER_UPDATE', { status: 'SATISFIED' }).success, true);
  const w = install('CONTRIBUTOR', { lender: [item(), item({ id: 'c2', status: 'SATISFIED' })] });
  try {
    const update = await run('LENDER_UPDATE', 'c1', { status: 'SUBMITTED' });
    assert.deepEqual(update.confirmation.fields[1], { label: 'Where it stands', value: 'Open → Submitted to the lender' });
    assert.match(update.confirmation.description, /Ask contacts no one and does not tell you whether to close/);
    const add = await run('TITLE_ADD', null, { category: 'SURVEY', title: 'Survey missing', dueDate: '2026-11-10', blocking: 'YES' });
    assert.equal(add.status, 'NEEDS_CONFIRMATION');
    assert.equal(add.confirmation.fields.length, 4);
    assert.equal((await run('LENDER_UPDATE', 'c2', { status: 'OPEN' })).reasonCode, 'BUYER_CLOSING_ITEM_SETTLED');
    assert.equal((await run('LENDER_UPDATE', 'nope', { status: 'OPEN' })).reasonCode, 'BUYER_CLOSING_ITEM_NOT_FOUND');
    assert.equal((await run('TITLE_ADD', null, { category: 'SURVEY' })).reasonCode, 'BUYER_CLOSING_ITEM_INPUT_INVALID');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls the service the route calls with the right body; a changed tracker or settled item writes nothing', async () => {
  const lender = [item()];
  const title = [item({ id: 't1', title: 'Lien', category: 'LIEN_JUDGMENT' })];
  const w = install('CONTRIBUTOR', { lender, title });
  try {
    const p = (kind, entityId, form, cv) => ({ closingItemCommand: { kind, entityId }, closingItemForm: form, closingItemContextVersion: cv });
    const lv = version('LENDER', lender);
    const tv = version('TITLE', title);
    await confirmCapabilityInvoke(OP, ctx(p('LENDER_ADD', null, { category: 'CREDIT', title: 'Explain inquiry', dueDate: '2026-11-10', blocking: 'YES' }, lv)));
    assert.deepEqual(w.calls[0].slice(0, 3), ['lenderAdd', 'u1', 'prop-1']);
    assert.deepEqual(w.calls[0][3], { category: 'CREDIT', title: 'Explain inquiry', blocking: true, dueAt: '2026-11-10T12:00:00.000Z' });
    await confirmCapabilityInvoke(OP, ctx(p('TITLE_UPDATE', 't1', { status: 'PROFESSIONAL_REVIEW', notes: 'With attorney' }, tv)));
    assert.deepEqual(w.calls[1], ['titleUpdate', 'u1', 'prop-1', 't1', { status: 'PROFESSIONAL_REVIEW', notes: 'With attorney' }]);
    await confirmCapabilityInvoke(OP, ctx(p('LENDER_UPDATE', 'c1', { status: 'SATISFIED' }, lv)));
    assert.deepEqual(w.calls[2], ['lenderUpdate', 'u1', 'prop-1', 'c1', { status: 'SATISFIED' }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('LENDER_UPDATE', 'c1', { status: 'SATISFIED' }, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('TITLE_UPDATE', 't1', { status: 'LIEN' }, tv))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
  const settled = [item({ status: 'SATISFIED' })];
  const w2 = install('CONTRIBUTOR', { lender: settled });
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ closingItemCommand: { kind: 'LENDER_UPDATE', entityId: 'c1' }, closingItemForm: { status: 'OPEN' }, closingItemContextVersion: version('LENDER', settled) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w2.calls.length, 0);
  } finally { w2.restore(); }
});

test('the action ids are allowlisted on the readiness answers and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('closing-lender-condition-add', 'BUYER_FINANCING_READINESS'), true);
  assert.equal(applicable('closing-lender-condition-update', 'BUYER_FINANCING_READINESS'), true);
  assert.equal(applicable('closing-title-issue-add', 'BUYER_TITLE_ESCROW_READINESS'), true);
  assert.equal(applicable('closing-title-issue-update', 'BUYER_TITLE_ESCROW_READINESS'), true);
  assert.equal(applicable('buyer-closing-item-back', OP), true);
  assert.deepEqual([command.closingItemUpdatable('LENDER', 'SUBMITTED'), command.closingItemUpdatable('LENDER', 'WAIVED'), command.closingItemUpdatable('TITLE', 'PROFESSIONAL_REVIEW'), command.closingItemUpdatable('TITLE', 'RESOLVED')], [true, false, true, false]);
});

test('appraisal and underwriting: the service\'s required details and date order are checked at review; clear to close is the buyer\'s own record', async () => {
  const w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('LENDER_APPRAISAL', launch())).status, 'NEEDS_CONTEXT');
    assert.equal((await run('LENDER_APPRAISAL', null, { status: 'SCHEDULED' })).reasonCode, 'BUYER_CLOSING_ITEM_INPUT_INVALID');
    assert.equal((await run('LENDER_APPRAISAL', null, { status: 'COMPLETED' })).reasonCode, 'BUYER_CLOSING_ITEM_INPUT_INVALID');
    assert.equal((await run('LENDER_APPRAISAL', null, { status: 'ISSUE_REPORTED' })).reasonCode, 'BUYER_CLOSING_ITEM_INPUT_INVALID');
    assert.match((await run('LENDER_APPRAISAL', null, { status: 'SCHEDULED', scheduledDate: '2026-08-01' })).blocks[0].body, /cannot be before it was ordered/);
    const ok = await run('LENDER_APPRAISAL', null, { status: 'SCHEDULED', scheduledDate: '2026-10-05' });
    assert.equal(ok.status, 'NEEDS_CONFIRMATION');
    assert.match(ok.confirmation.fields[0].value, /Ordered \u2192 Scheduled/);
    const uw = await run('LENDER_UNDERWRITING', null, { status: 'USER_RECORDED_CLEAR_TO_CLOSE' });
    assert.match(uw.confirmation.description, /Your lender issues clear to close, not Ask/);
    assert.equal(w.calls.length, 0);
    const p = (kind, form, cv) => ({ closingItemCommand: { kind, entityId: null }, closingItemForm: form, closingItemContextVersion: cv });
    await confirmCapabilityInvoke(OP, ctx(p('LENDER_APPRAISAL', { status: 'SCHEDULED', scheduledDate: '2026-10-05' }, ok.contextVersion)));
    assert.deepEqual(w.calls[0], ['readiness', 'u1', 'prop-1', { appraisalStatus: 'SCHEDULED', appraisalScheduledAt: '2026-10-05T12:00:00.000Z' }]);
    await confirmCapabilityInvoke(OP, ctx(p('LENDER_UNDERWRITING', { status: 'CONDITIONAL' }, uw.contextVersion)));
    assert.deepEqual(w.calls[1], ['readiness', 'u1', 'prop-1', { underwritingStatus: 'CONDITIONAL' }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('LENDER_UNDERWRITING', { status: 'CONDITIONAL' }, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { w.restore(); }
});
