const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Property Tax": add a comparable sale to the appeal evidence (FRD v1.355). No database, browser or native module.

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
const { propertyTaxAppealReadinessService: Readiness } = require('../../src/services/propertyTax/propertyTaxAppealReadiness.service.ts');
const command = require('../../src/services/ask/support/propertyTaxComparableCommand.ts');

const OP = 'PROPERTY_TAX_COMPARABLE_COMMAND';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const T = new Date('2026-09-01T00:00:00Z');
const answer = (over = {}) => ({ address: '12 Oak Street', saleDate: '2026-03-15', salePrice: 410000, propertyClass: 'Single family', livingAreaSqFt: 1800, ...over });

function install(role, { covered = true, rows = [] } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, c: prisma.propertyTaxAppealComparable, ev: Readiness.evaluate, up: Readiness.upsertComparable, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.propertyTaxAppealComparable = { findMany: async () => rows };
  Readiness.evaluate = async () => ({ status: covered ? 'READY' : 'NOT_COVERED' });
  Readiness.upsertComparable = async (input) => { calls.push(input); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.propertyTaxAppealComparable = saved.c; Readiness.evaluate = saved.ev; Readiness.upsertComparable = saved.up; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const invoke = (launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: command.COMPARABLE_MESSAGE, launchContext });
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', ...over });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const { comparableCommandResult } = require('../../src/services/ask/handlers/propertyTaxComparableCommands.handler.ts');

test('declared-action only; contributor floor; viewers refused; an uncovered jurisdiction is explained', async () => {
  assert.notEqual(resolveAskRoutingCascade(command.COMPARABLE_MESSAGE, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke(launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke(launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_PROPERTY_TAX_COMPARABLE_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(launch())).status, 'NEEDS_CONTEXT');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', { covered: false });
  try { assert.equal((await invoke(launch())).reasonCode, 'PROPERTY_TAX_RULE_COVERAGE_UNAVAILABLE'); } finally { w.restore(); }
});

test('the form validates; a future sale and a missing price are refused; the review says nothing is verified or filed and writes nothing', async () => {
  const p = command.parseComparableAnswer;
  assert.equal(p(answer()).success, true);
  assert.equal(p(answer({ saleDate: '2999-01-01' })).reason, 'FUTURE');
  assert.equal(p(answer({ salePrice: '' })).success, false);
  assert.equal(p(answer({ address: 'x' })).success, false);
  assert.equal(p({ ...answer(), adjustments: { time: 5 } }).success, false);
  const w = install('CONTRIBUTOR');
  try {
    assert.equal((await comparableCommandResult('u1', 'prop-1', { sourceExecutionId: null }, answer({ saleDate: '2999-01-01' }))).reasonCode, 'PROPERTY_TAX_COMPARABLE_INPUT_INVALID');
    const review = await comparableCommandResult('u1', 'prop-1', { sourceExecutionId: null }, answer());
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /does not verify it or compute an adjustment for it, and nothing is filed/);
    assert.equal(review.confirmation.fields.find((f) => f.label === 'Sale price').value, '$410,000');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls upsertComparable with a stable key; a changed list or a bad form writes nothing', async () => {
  const w = install('CONTRIBUTOR', { rows: [{ comparableKey: 'ask-old', updatedAt: T }] });
  try {
    const version = sha(`property-tax-comparables:ask-old:${T.toISOString()}`);
    const parameters = { comparableForm: answer(), comparableContextVersion: version };
    const done = await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(done.result.reasonCode, 'PROPERTY_TAX_COMPARABLE_ADDED');
    assert.equal(w.calls.length, 1);
    assert.equal(w.calls[0].comparableKey, command.comparableKey('12 Oak Street', '2026-03-15', sha));
    assert.equal(w.calls[0].role, 'CONTRIBUTOR');
    assert.equal(w.calls[0].salePrice, 410000);
    assert.equal(command.comparableKey('12  OAK street', '2026-03-15', sha), w.calls[0].comparableKey);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...parameters, comparableContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ comparableForm: { address: 'x' }, comparableContextVersion: version })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
});

test('the action is allowlisted on the appeal answer and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable(command.COMPARABLE_ACTION_ID, 'PROPERTY_TAX_APPEAL_READINESS'), true);
  assert.equal(applicable('property-tax-comparable-back', OP), true);
});
