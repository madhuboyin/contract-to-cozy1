const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// The Property Tax exemption and correction steps inside Ask (FRD v1.485). Extra actions of PROPERTY_TAX_APPEAL_COMMAND. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { propertyTaxHomeownerActionService } = require('../../src/services/propertyTax/propertyTaxHomeownerAction.service.ts');
const { propertyTaxRuleService } = require('../../src/services/propertyTax/propertyTaxRule.service.ts');
const command = require('../../src/services/ask/support/propertyTaxActionCommand.ts');
const { propertyTaxActionBlocks } = require('../../src/services/ask/handlers/propertyTaxActionCommands.handler.ts');

const OP = 'PROPERTY_TAX_APPEAL_COMMAND';
const IDS = command.PROPERTY_TAX_ACTION_IDS;
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const row = (over = {}) => ({
  id: 'act-1', type: 'EXEMPTION_REVIEW', title: 'Review verified exemption programs', explanation: 'Review official eligibility.', status: 'OPEN', officialUrl: 'https://tax.example.gov/exemptions',
  checklistJson: ['Choose a program', 'Gather documents'], decisionJson: null, decidedAt: null, updatedAt: UPDATED, ...over,
});
const version = (r) => sha(`tax-action:${r.id}:${r.status}:${r.updatedAt.toISOString()}`);

function stubs({ role = 'OWNER', primary = true, rows = [row()], coverage = 'REVIEWED' } = {}) {
  const saved = {
    a: propertyAccess.resolvePropertyAccess, p: prisma.property, h: prisma.propertyTaxHomeownerAction, d: propertyTaxHomeownerActionService.decide, l: propertyTaxHomeownerActionService.listAndRefresh,
    g: propertyTaxRuleService.getForProperty, q: executeOperation.reconcileAskExecutionSideEffects,
  };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.propertyTaxHomeownerAction = {
    findFirst: async (args) => (args.where.id ? rows.find((r) => r.id === args.where.id) ?? null : rows[0] ?? null),
    findMany: async () => rows,
  };
  propertyTaxHomeownerActionService.decide = async (arg) => { calls.push(['decide', arg]); return {}; };
  propertyTaxHomeownerActionService.listAndRefresh = async (...args) => { calls.push(['refresh', ...args]); return { coverage, reason: 'No reviewed workflow.', actions: rows }; };
  propertyTaxRuleService.getForProperty = async () => ({ coverage, profile: coverage === 'REVIEWED' ? { id: 'prof-1' } : null });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore: () => {
    propertyAccess.resolvePropertyAccess = saved.a; prisma.property = saved.p; prisma.propertyTaxHomeownerAction = saved.h; propertyTaxHomeownerActionService.decide = saved.d;
    propertyTaxHomeownerActionService.listAndRefresh = saved.l; propertyTaxRuleService.getForProperty = saved.g; executeOperation.reconcileAskExecutionSideEffects = saved.q;
  } };
}
const launch = (actionId, entityId, entityType = command.PROPERTY_TAX_ACTION_ENTITY_TYPE) => ({ operationId: OP, surface: 'ASK_PAGE', actionId, entityId, entityType });
const invoke = (actionId, entityId) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: command.PROPERTY_TAX_ACTION_MESSAGES[actionId], launchContext: launch(actionId, entityId) });
const ctx = (parameters, role = 'OWNER') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the decision form: three decisions, a note of three characters, and a completed step needs its reference', () => {
  const p = command.parsePropertyTaxActionDecision;
  assert.equal(p({ status: 'NOT_APPLICABLE', note: 'We are not eligible' }).success, true);
  assert.equal(p({ status: 'COMPLETED', note: 'Applied online' }).reason, 'REFERENCE_REQUIRED');
  assert.equal(p({ status: 'COMPLETED', note: 'Applied online', externalReference: 'ABC-1' }).success, true);
  assert.equal(p({ status: 'DISMISSED', note: 'nope nope' }).success, false);
  assert.equal(p({ status: 'READY_FOR_EXTERNAL_ACTION', note: 'ab' }).success, false);
  assert.equal(p({ status: 'READY_FOR_EXTERNAL_ACTION', note: 'okay', userId: 'x' }).success, false);
  for (const message of Object.values(command.PROPERTY_TAX_ACTION_MESSAGES)) {
    assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP);
  }
});

test('a viewer and a household member who is not the primary owner are refused, and nothing is written', async () => {
  let s = stubs({ role: 'VIEWER' });
  try { assert.equal((await invoke(IDS.DECIDE, 'act-1')).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { s.restore(); }
  s = stubs({ role: 'CONTRIBUTOR', primary: false });
  try {
    for (const id of Object.values(IDS)) assert.equal((await invoke(id, 'act-1')).reasonCode, 'PROPERTY_TAX_ACTION_PRIMARY_OWNER_ONLY');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ propertyTaxActionCommand: { actionId: IDS.REFRESH } }, 'CONTRIBUTOR')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
});

test('decide: the form, a review of the status change, note and reference, then the canonical decide call bound to the step version', async () => {
  const s = stubs();
  try {
    const form = await invoke(IDS.DECIDE, 'act-1');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.PROPERTY_TAX_ACTION_CAPTURE_KEY);
    assert.equal(form.parameters.propertyTaxActionLaunch.entityId, 'act-1');

    const { propertyTaxActionCommandResult } = require('../../src/services/ask/handlers/propertyTaxActionCommands.handler.ts');
    const launchInput = { actionId: IDS.DECIDE, entityId: 'act-1', sourceExecutionId: null };
    assert.equal((await propertyTaxActionCommandResult('user-1', 'prop-1', launchInput, { status: 'COMPLETED', note: 'Applied online' })).reasonCode, 'PROPERTY_TAX_ACTION_REFERENCE_REQUIRED');
    const review = await propertyTaxActionCommandResult('user-1', 'prop-1', launchInput, { status: 'COMPLETED', note: 'Applied online', externalReference: 'REF-9' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => f.label), ['Step', 'Status', 'Your note', 'Confirmation reference']);
    assert.equal(review.confirmation.fields[1].value, 'Not started → Completed');
    assert.equal(s.calls.length, 0);

    const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.deepEqual(s.calls[0], ['decide', { propertyId: 'prop-1', actionId: 'act-1', userId: 'user-1', status: 'COMPLETED', note: 'Applied online', externalReference: 'REF-9' }]);
    assert.equal(out.result.blocks[0].title, 'Decision recorded');
    assert.equal(out.artifactId, 'act-1');

    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...review.parameters, propertyTaxActionContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(s.calls.length, 1);
    assert.equal(version(row()), review.contextVersion);
  } finally { s.restore(); }
});

test('refresh: confirmed first, then the canonical listAndRefresh; with no reviewed coverage the receipt says so', async () => {
  let s = stubs();
  try {
    const review = await invoke(IDS.REFRESH, 'prop-1');
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(s.calls.length, 0);
    const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.deepEqual(s.calls[0], ['refresh', 'prop-1', 'user-1']);
    assert.equal(out.result.blocks[0].title, 'Steps refreshed');
  } finally { s.restore(); }
  s = stubs({ coverage: 'UNREVIEWED' });
  try {
    const review = await invoke(IDS.REFRESH, 'prop-1');
    const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.equal(out.result.blocks[0].title, 'No reviewed steps for this home yet');
    assert.equal(out.result.blocks[0].description, 'No reviewed workflow.');
  } finally { s.restore(); }
});

test('the answer lists the stored steps as text with no link, offers actions to the primary owner only, and every id is allowlisted', async () => {
  let s = stubs({ rows: [row({ status: 'COMPLETED', decidedAt: UPDATED, decisionJson: { note: 'done', externalReference: 'REF-9' } })] });
  try {
    const [recordBlock, owner] = await propertyTaxActionBlocks('user-1', 'prop-1', true);
    assert.deepEqual(recordBlock.actions.map((a) => [a.id, a.interactionType]), [[IDS.RECORD, 'START_WORKFLOW']]);
    const item = owner.sections[0].items[0];
    assert.equal(item.status, 'Completed');
    assert.equal(item.href, null);
    assert.ok(item.meta.includes('1. Choose a program'));
    assert.ok(item.meta.includes('Official instructions: tax.example.gov'));
    assert.ok(item.meta.some((line) => /reference REF-9/.test(line)));
    assert.deepEqual(item.actions.map((a) => [a.id, a.entityId, a.operationId]), [[IDS.DECIDE, 'act-1', OP]]);
    assert.deepEqual(owner.actions.map((a) => a.id), [IDS.REFRESH]);
    const [viewer] = await propertyTaxActionBlocks('user-1', 'prop-1', false);
    assert.deepEqual(viewer.sections[0].items[0].actions, []);
    assert.deepEqual(viewer.actions, []);
  } finally { s.restore(); }
  s = stubs({ rows: [] });
  try {
    const [, empty] = await propertyTaxActionBlocks('user-1', 'prop-1', true);
    assert.deepEqual(empty.sections, []);
    assert.deepEqual(empty.actions.map((a) => a.label), ['Check for steps']);
  } finally { s.restore(); }
  s = stubs({ coverage: 'UNREVIEWED' });
  try {
    assert.deepEqual((await propertyTaxActionBlocks('user-1', 'prop-1', true)).map((b) => b.id), ['tax-record-enter']);
    assert.deepEqual(await propertyTaxActionBlocks('user-1', 'prop-1', false), []);
  } finally { s.restore(); }
  for (const id of Object.values(IDS)) {
    assert.equal(isAskActionApplicable({
      action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: OP, style: 'SECONDARY' }, operationId: 'PROPERTY_TAX_APPEAL_READINESS', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true,
    }), true, id);
  }
});

test('typed-in figures: the form, a review, then the canonical recordHomeownerValues with the rate as a fraction, bound to the record version', async () => {
  const { propertyTaxRecordService } = require('../../src/services/propertyTax/propertyTaxRecord.service.ts');
  const { propertyTaxActionCommandResult } = require('../../src/services/ask/handlers/propertyTaxActionCommands.handler.ts');
  const s = stubs();
  const saved = { a: prisma.propertyTaxAssessmentRecord, b: prisma.propertyTaxBillRecord, r: propertyTaxRecordService.recordHomeownerValues };
  const T = new Date('2026-08-01T00:00:00Z');
  prisma.propertyTaxAssessmentRecord = { findFirst: async () => ({ updatedAt: T }) };
  prisma.propertyTaxBillRecord = { findFirst: async () => null };
  propertyTaxRecordService.recordHomeownerValues = async (...args) => { s.calls.push(['record', ...args]); return {}; };
  try {
    const form = await invoke(IDS.RECORD, 'prop-1');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].inputSchema.fields.map((f) => f.key), ['taxYear', 'parcelId', 'totalAssessedValue', 'taxRatePercent', 'billAmount']);
    const launchInput = { actionId: IDS.RECORD, entityId: 'prop-1', sourceExecutionId: null };
    assert.equal((await propertyTaxActionCommandResult('user-1', 'prop-1', launchInput, { taxYear: 2026 })).reasonCode, 'PROPERTY_TAX_RECORD_NOTHING_ENTERED');
    assert.equal((await propertyTaxActionCommandResult('user-1', 'prop-1', launchInput, { taxYear: 1800, billAmount: 5 })).reasonCode, 'PROPERTY_TAX_RECORD_INPUT_INVALID');
    const review = await propertyTaxActionCommandResult('user-1', 'prop-1', launchInput, { taxYear: 2026, totalAssessedValue: '450000', taxRatePercent: 1.25, billAmount: '5600.5', parcelId: '' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => f.label), ['Tax year', 'Assessed value', 'Tax rate', 'Bill amount']);
    assert.equal(s.calls.length, 0);
    const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.deepEqual(s.calls[0], ['record', 'prop-1', 'user-1', { taxYear: 2026, parcelId: undefined, totalAssessedValue: 450000, billAmount: 5600.5, effectiveTaxRate: 0.0125 }]);
    assert.equal(out.result.blocks[0].title, 'Figures saved');
    prisma.propertyTaxBillRecord = { findFirst: async () => ({ updatedAt: T }) };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(s.calls.length, 1);
  } finally {
    prisma.propertyTaxAssessmentRecord = saved.a; prisma.propertyTaxBillRecord = saved.b; propertyTaxRecordService.recordHomeownerValues = saved.r; s.restore();
  }
});
