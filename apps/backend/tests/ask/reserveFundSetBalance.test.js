const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Reserve balance-to-target (FRD v1.329, owner ruling 2026-10-13): "set my reserve fund to $5,000" is a BALANCE_CORRECTION of the difference, computed
// from the canonical balance, reviewed with the arithmetic, revalidated at execution and a no-op when it already matches. No database or browser.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { homeReserveFundService } = require('../../src/services/homeReserveFund.service.ts');
const { parseReserveFundMessage } = require('../../src/services/ask/support/reserveFundMessage.ts');
const { RESERVE_FUND_ACTION_IDS } = require('../../src/services/ask/support/reserveFundConstants.ts');
const { reserveFundCommandResult } = require('../../src/services/ask/handlers/reserveFundCommands.handler.ts');

const OP = 'RESERVE_FUND_COMMAND';
const launch = { actionId: RESERVE_FUND_ACTION_IDS.SET_BALANCE, entityId: null, sourceExecutionId: null };

test('typed phrasings that state a balance are recognised; deposits, posture and questions are not', () => {
  assert.deepEqual(parseReserveFundMessage('set my reserve fund to $5,000'), { kind: 'SET_BALANCE', targetDollars: 5000 });
  assert.deepEqual(parseReserveFundMessage('Set my reserve fund balance to 4200 dollars.'), { kind: 'SET_BALANCE', targetDollars: 4200 });
  assert.deepEqual(parseReserveFundMessage('my reserve fund balance is $5k'), { kind: 'SET_BALANCE', targetDollars: 5000 });
  assert.equal(parseReserveFundMessage('add $500 to my reserve fund').kind, 'CONTRIBUTION');
  assert.equal(parseReserveFundMessage('set my reserve fund posture to conservative').kind, 'POSTURE');
  assert.equal(parseReserveFundMessage('should I set my reserve fund to $5,000?'), null);
});

function withBalance(cents, role = 'CONTRIBUTOR') {
  const saved = { role: propertyAccess.resolvePropertyAccess, summary: homeReserveFundService.getSummary };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  const state = { cents };
  homeReserveFundService.getSummary = async () => ({ currentBalanceCents: state.cents });
  return { state, restore() { propertyAccess.resolvePropertyAccess = saved.role; homeReserveFundService.getSummary = saved.summary; } };
}

test('a stated balance shows current, target and the signed correction, and writes nothing yet', async () => {
  const w = withBalance(380000);
  const saved = homeReserveFundService.addContribution; let writes = 0;
  homeReserveFundService.addContribution = async () => { writes += 1; };
  try {
    const up = await reserveFundCommandResult('user-1', 'prop-1', launch, undefined, null, { targetDollars: 5000, note: null });
    assert.equal(up.status, 'NEEDS_CONFIRMATION');
    assert.match(up.confirmation.title, /\$5,000\.00/);
    assert.match(up.confirmation.description, /an increase of \$1,200\.00/);
    assert.match(up.confirmation.description, /not a deposit or a withdrawal/);
    assert.deepEqual(up.confirmation.fields.map((f) => f.label), ['Balance on record', 'Balance you stated', 'Correction']);
    assert.deepEqual(up.parameters.reserveFundCommand.balance, { targetCents: 500000, baselineCents: 380000, note: null });
    const down = await reserveFundCommandResult('user-1', 'prop-1', launch, undefined, null, { targetDollars: 3000, note: null });
    assert.match(down.confirmation.description, /a decrease of \$800\.00/);
    assert.equal(writes, 0);
  } finally { homeReserveFundService.addContribution = saved; w.restore(); }
});

test('an already-matching balance logs nothing; no figure asks for one; a viewer is refused', async () => {
  const w = withBalance(500000);
  try {
    const same = await reserveFundCommandResult('user-1', 'prop-1', launch, undefined, null, { targetDollars: 5000, note: null });
    assert.equal(same.reasonCode, 'RESERVE_FUND_BALANCE_ALREADY_SET');
    assert.equal(same.confirmation, undefined);
    const ask = await reserveFundCommandResult('user-1', 'prop-1', launch, undefined, null, null);
    assert.equal(ask.status, 'NEEDS_CONTEXT');
    assert.equal(ask.captureRequests[0].captureKey, 'reserve-fund-balance');
  } finally { w.restore(); }
  const viewer = withBalance(500000, 'VIEWER');
  try { assert.equal((await reserveFundCommandResult('user-1', 'prop-1', launch, undefined, null, { targetDollars: 1, note: null })).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { viewer.restore(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('confirming writes one BALANCE_CORRECTION of the difference; a balance that changed meanwhile is rejected and writes nothing', async () => {
  const w = withBalance(380000);
  const saved = { add: homeReserveFundService.addContribution, rec: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  homeReserveFundService.addContribution = async (propertyId, input) => { calls.push([propertyId, input]); return { id: 'c-1' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  const parameters = { reserveFundCommand: { actionId: RESERVE_FUND_ACTION_IDS.SET_BALANCE, entityId: '', balance: { targetCents: 500000, baselineCents: 380000, note: null } } };
  try {
    await confirmCapabilityInvoke(OP, ctx(parameters));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'prop-1');
    assert.equal(calls[0][1].type, 'BALANCE_CORRECTION');
    assert.equal(calls[0][1].amountCents, 120000);
    w.state.cents = 390000;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT' && /\$3,900\.00/.test(e.message));
    w.state.cents = 500000;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ reserveFundCommand: { ...parameters.reserveFundCommand, balance: { targetCents: 500000, baselineCents: 500000, note: null } } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ reserveFundCommand: { actionId: RESERVE_FUND_ACTION_IDS.SET_BALANCE, balance: { targetCents: -5, baselineCents: 0 } } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(calls.length, 1);
  } finally { homeReserveFundService.addContribution = saved.add; executeOperation.reconcileAskExecutionSideEffects = saved.rec; w.restore(); }
});
