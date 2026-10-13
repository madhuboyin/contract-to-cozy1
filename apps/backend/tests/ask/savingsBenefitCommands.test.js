const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P1 "Savings & Benefits": save, dismiss, stop pursuing and record the outcome of an opportunity (FRD v1.323). No database, browser or native module.

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
const canonical = require('../../src/services/savingsBenefitsCanonical.service.ts');
const command = require('../../src/services/ask/support/savingsBenefitCommand.ts');
const handler = require('../../src/services/ask/handlers/savingsBenefitCommands.handler.ts');

const OP = 'SAVINGS_BENEFIT_COMMAND';
const M = command.SAVINGS_COMMAND_MESSAGES;
const OPP = '11111111-1111-4111-8111-111111111111';
const ACTION = '22222222-2222-4222-8222-222222222222';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('row ids map to the family and opportunity; anything else is not a savings row', () => {
  assert.deepEqual(command.parseSavingsRowId(`recurring-${OPP}`), { family: 'RECURRING_COST', opportunityId: OPP });
  assert.deepEqual(command.parseSavingsRowId(`benefit-${OPP}`), { family: 'BENEFIT', opportunityId: OPP });
  assert.deepEqual(command.parseSavingsRowId(`progress-BENEFIT-${OPP}`), { family: 'BENEFIT', opportunityId: OPP });
  assert.deepEqual(command.parseSavingsRowId(`progress-RECURRING_COST-${OPP}`), { family: 'RECURRING_COST', opportunityId: OPP });
  assert.equal(command.parseSavingsRowId(`related-PROPERTY_TAX`), null);
  assert.equal(command.parseSavingsRowId(OPP), null);
});

test('the outcome form mirrors the service\'s own stage rules and says what is missing', () => {
  const p = (family, answer) => command.parseSavingsOutcomeAnswer(family, answer, '2026-10-12');
  assert.equal(p('BENEFIT', { stage: 'SUBMITTED' }).success, true);
  assert.equal(p('BENEFIT', { stage: 'RECEIVED' }).reason, 'MISSING_VALUE');
  assert.equal(p('BENEFIT', { stage: 'RECEIVED', amountReceived: 400 }).reason, 'MISSING_EVIDENCE');
  assert.equal(p('BENEFIT', { stage: 'RECEIVED', amountReceived: 400, evidenceNote: 'Award letter 5/2' }).success, true);
  assert.equal(p('BENEFIT', { stage: 'DENIED' }).reason, 'MISSING_DENIAL_REASON');
  assert.equal(p('BENEFIT', { stage: 'WITHDRAWN' }).reason, 'MISSING_CLOSURE_REASON');
  assert.equal(p('BENEFIT', { stage: 'NO_ACTION', closureReason: 'Not worth the paperwork' }).success, true);
  assert.equal(p('RECURRING_COST', { stage: 'RECEIVED', observedMonthlyValue: 20, evidenceNote: 'Bill' }).reason, 'MISSING_OBSERVATION_WINDOW');
  assert.equal(p('RECURRING_COST', { stage: 'RECEIVED', observedMonthlyValue: 20, evidenceNote: 'Bill', observationStartedOn: '2026-09-20', observationEndedOn: '2026-10-05' }).reason, 'OBSERVATION_WINDOW_TOO_SHORT');
  assert.equal(p('RECURRING_COST', { stage: 'RECEIVED', observedMonthlyValue: 20, evidenceNote: 'Bill', observationStartedOn: '2026-08-01', observationEndedOn: '2026-10-01' }).success, true);
  assert.equal(p('BENEFIT', { stage: 'LOTTERY' }).reason, 'INVALID');
  assert.equal(p('BENEFIT', { stage: 'SUBMITTED', actionId: 'x' }).reason, 'INVALID', 'a raw service field is not a form field');
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ primary = true, detail = { family: 'BENEFIT', opportunity: { id: OPP, status: 'DETECTED', updatedAt: UPDATED, program: { name: 'Heat pump rebate' } } }, action = { id: ACTION, state: 'STARTED', updatedAt: UPDATED, actionType: 'PREPARE' } } = {}) {
  const saved = { p: prisma.property, a: prisma.savingsBenefitAction, d: canonical.getCanonicalOpportunityDetail };
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.savingsBenefitAction = { findFirst: async () => action };
  canonical.getCanonicalOpportunityDetail = async () => { if (!detail) throw new Error('Opportunity not found or access denied.'); return detail; };
  return () => { prisma.property = saved.p; prisma.savingsBenefitAction = saved.a; canonical.getCanonicalOpportunityDetail = saved.d; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.savingsCommandEntityType(kind), ...over });

test('declared-action only, a contributor command; viewers, refreshes and a non-primary owner are refused', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let restoreRole = withRole('CONTRIBUTOR'); let restore = withData();
  try {
    assert.equal((await invoke(M.SAVE, launch('SAVE', `benefit-${OPP}`, { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_SAVINGS_BENEFIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.SAVE, launch('SAVE', `benefit-${OPP}`, { entityType: command.SAVINGS_IN_PROGRESS_ENTITY_TYPE }))).reasonCode, 'ASK_SAVINGS_BENEFIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.SAVE, launch('SAVE', `benefit-${OPP}`), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restore(); restoreRole(); }
  restoreRole = withRole('CONTRIBUTOR'); restore = withData({ primary: false });
  try { assert.equal((await invoke(M.SAVE, launch('SAVE', `benefit-${OPP}`))).reasonCode, 'SAVINGS_BENEFIT_PRIMARY_OWNER_ONLY'); } finally { restore(); restoreRole(); }
});

test('save and dismiss ask for confirmation naming the opportunity; an opportunity that is gone is refused', async () => {
  let restoreRole = withRole('CONTRIBUTOR'); let restore = withData();
  try {
    const save = await invoke(M.SAVE, launch('SAVE', `benefit-${OPP}`));
    assert.equal(save.status, 'NEEDS_CONFIRMATION');
    assert.equal(save.confirmation.fields[0].value, 'Heat pump rebate');
    assert.match(save.confirmation.description, /Nothing is applied for or sent anywhere/);
    const dismiss = await invoke(M.DISMISS, launch('DISMISS', `benefit-${OPP}`));
    assert.equal(dismiss.parameters.savingsCommand.kind, 'DISMISS');
  } finally { restore(); restoreRole(); }
  restoreRole = withRole('CONTRIBUTOR'); restore = withData({ detail: null });
  try { assert.equal((await invoke(M.SAVE, launch('SAVE', `benefit-${OPP}`))).reasonCode, 'SAVINGS_OPPORTUNITY_NOT_FOUND'); } finally { restore(); restoreRole(); }
});

test('the outcome step opens a form for its family, then reviews what was said and writes nothing yet', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  const saved = canonical.recordCanonicalActionOutcome; let writes = 0;
  canonical.recordCanonicalActionOutcome = async () => { writes += 1; };
  try {
    const form = await invoke(M.OUTCOME, launch('OUTCOME', `progress-BENEFIT-${OPP}`));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const keys = form.captureRequests[0].inputSchema.fields.map((f) => f.key);
    assert.ok(keys.includes('amountReceived') && !keys.includes('observedMonthlyValue'));
    const parsed = command.parseSavingsOutcomeAnswer('BENEFIT', { stage: 'RECEIVED', amountReceived: 400, evidenceNote: 'Award letter' });
    const review = await handler.savingsCommandResult('user-1', 'prop-1', { kind: 'OUTCOME', entityId: `progress-BENEFIT-${OPP}`, sourceExecutionId: null }, parsed.data);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /Cozy does not verify it against the provider/);
    assert.deepEqual(Object.fromEntries(review.confirmation.fields.map((f) => [f.label, f.value])), { 'What happened': 'I received the savings', 'Amount received': '$400', 'Backed by': 'Award letter' });
    assert.equal(writes, 0);
  } finally { canonical.recordCanonicalActionOutcome = saved; restore(); restoreRole(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
function installService() {
  const names = ['createCanonicalAction', 'updateCanonicalAction', 'recordCanonicalActionOutcome'];
  const saved = Object.fromEntries(names.map((n) => [n, canonical[n]]));
  const calls = [];
  for (const n of names) canonical[n] = async (...args) => { calls.push([n, ...args]); return { id: ACTION }; };
  const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, canonical, restore() { for (const n of names) canonical[n] = saved[n]; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; } };
}

test('confirming calls the canonical service with a stable key; stale, invalid and refused steps write nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  const w = installService();
  try {
    const oppVersion = (kind) => sha(`savings:${kind}:${OPP}:DETECTED:${UPDATED.toISOString()}`);
    const actVersion = (kind) => sha(`savings:${kind}:${ACTION}:STARTED:${UPDATED.toISOString()}`);
    await confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'SAVE', entityId: `benefit-${OPP}` }, savingsContextVersion: oppVersion('SAVE') }));
    assert.deepEqual(w.calls[0], ['createCanonicalAction', 'prop-1', OPP, 'user-1', { idempotencyKey: `ask-save-${OPP}`, family: 'BENEFIT', actionType: 'SAVE', followUpAt: null }]);
    await confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'STOP', entityId: `progress-BENEFIT-${OPP}` }, savingsContextVersion: actVersion('STOP') }));
    assert.deepEqual(w.calls[1], ['updateCanonicalAction', 'prop-1', ACTION, 'user-1', { state: 'CANCELLED' }, 'CONTRIBUTOR']);
    await confirmCapabilityInvoke(OP, ctx({
      savingsCommand: { kind: 'OUTCOME', entityId: `progress-BENEFIT-${OPP}` }, savingsContextVersion: actVersion('OUTCOME'),
      savingsOutcome: { stage: 'RECEIVED', amountReceived: 400, evidenceNote: 'Award letter' },
    }));
    const [name, propertyId, actionId, userId, input, role] = w.calls[2];
    assert.deepEqual([name, propertyId, actionId, userId, role], ['recordCanonicalActionOutcome', 'prop-1', ACTION, 'user-1', 'CONTRIBUTOR']);
    assert.equal(input.stage, 'RECEIVED');
    assert.equal(input.amountReceived, 400);
    assert.equal(input.evidenceNote, 'Award letter');
    assert.match(input.idempotencyKey, /^ask-outcome-/);
    const before = w.calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'SAVE', entityId: `benefit-${OPP}` }, savingsContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({
      savingsCommand: { kind: 'OUTCOME', entityId: `progress-BENEFIT-${OPP}` }, savingsContextVersion: actVersion('OUTCOME'), savingsOutcome: { stage: 'RECEIVED' },
    })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /how much/i.test(e.message));
    assert.equal(w.calls.length, before);
  } finally { w.restore(); restore(); restoreRole(); }
});

test('a governance refusal from the service reaches the person in its own words', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withData();
  const w = installService();
  w.canonical.updateCanonicalAction = async () => { const e = new Error('Cannot transition an action from COMPLETED to CANCELLED.'); throw e; };
  w.canonical.recordCanonicalActionOutcome = async () => { const e = new Error('A RECEIVED outcome must state what evidence backs it.'); e.name = 'SavingsOutcomeGovernanceError'; e.code = 'MISSING_EVIDENCE'; throw e; };
  try {
    const actVersion = (kind) => sha(`savings:${kind}:${ACTION}:STARTED:${UPDATED.toISOString()}`);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ savingsCommand: { kind: 'STOP', entityId: `progress-BENEFIT-${OPP}` }, savingsContextVersion: actVersion('STOP') })),
      (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /Cannot transition/.test(e.message));
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({
      savingsCommand: { kind: 'OUTCOME', entityId: `progress-BENEFIT-${OPP}` }, savingsContextVersion: actVersion('OUTCOME'),
      savingsOutcome: { stage: 'RECEIVED', amountReceived: 5, evidenceNote: 'x' },
    })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /evidence/.test(e.message));
  } finally { w.restore(); restore(); restoreRole(); }
});

test('the ids are allowlisted for the answer that emits them', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.SAVINGS_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'SAVINGS_OPPORTUNITIES'), true, id);
  assert.equal(applicable('savings-benefit-back', OP), true);
});

test('every writing savings-benefits route under a property has the contributor floor', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/routes/savingsBenefitsUnified.routes.ts'), 'utf8');
  const statements = source.split(/\nrouter\./).slice(1);
  const writing = statements.filter((s) => /^(post|put|patch|delete)\(\s*'\/properties\/:propertyId\//.test(s));
  assert.ok(writing.length >= 6);
  const open = writing.filter((s) => !s.includes("requireHouseholdRole('CONTRIBUTOR')")).map((s) => s.slice(0, 100));
  assert.deepEqual(open, []);
});
