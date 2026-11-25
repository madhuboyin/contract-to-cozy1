// BICC-BUY-008 (behavioral): the purchase-lifecycle command (cancel, pause, resume, reschedule) never writes before an explicit confirmation, only the owner can cancel/pause/resume,
// and a confirmation calls exactly the buyer service method the routes call. Services are stubbed; no database.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { BuyerAcquisitionService } = require('../../src/services/buyerAcquisition.service.ts');

const OP = 'BUYER_LIFECYCLE_UPDATE';
const plan = { id: 'plan-1', updatedAt: new Date('2026-11-24T00:00:00Z') };

function install(role) {
  const S = BuyerAcquisitionService; const calls = [];
  const saved = { a: propertyAccess.resolvePropertyAccess, c: S.cancelJourney, p: S.pauseJourney, r: S.resumeJourney, u: S.updateLifecycle, e: executeOperation.reconcileAskExecutionSideEffects };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  S.cancelJourney = async (...a) => { calls.push(['cancel', ...a]); return plan; };
  S.pauseJourney = async (...a) => { calls.push(['pause', ...a]); return plan; };
  S.resumeJourney = async (...a) => { calls.push(['resume', ...a]); return plan; };
  S.updateLifecycle = async (...a) => { calls.push(['reschedule', ...a]); return plan; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; S.cancelJourney = saved.c; S.pauseJourney = saved.p; S.resumeJourney = saved.r; S.updateLifecycle = saved.u; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const preview = (message) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message });
const confirm = (role, parameters) => confirmCapabilityInvoke(OP, { userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the operation is a contributor-floor material decision', () => {
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
});

test('asking to cancel, pause or resume only previews: it returns a confirmation and writes nothing', async () => {
  const h = install('OWNER');
  try {
    const cancel = await preview('cancel my purchase: the seller backed out of the deal');
    assert.equal(cancel.status, 'NEEDS_CONFIRMATION');
    assert.equal(cancel.parameters.buyerLifecycleAction, 'CANCEL');
    assert.match(cancel.parameters.buyerCancelReason, /seller backed out/);
    assert.equal((await preview('pause my purchase')).status, 'NEEDS_CONFIRMATION');
    assert.equal((await preview('resume my purchase')).status, 'NEEDS_CONFIRMATION');
    assert.equal((await preview('cancel my purchase')).status, 'NEEDS_CLARIFICATION', 'a reason is required before a confirmation is even offered');
    assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
});

test('a contributor or viewer cannot cancel, pause or resume: refused at preview and again at confirmation, with nothing written', async () => {
  for (const role of ['CONTRIBUTOR', 'VIEWER']) {
    const h = install(role);
    try {
      for (const message of ['cancel my purchase: the seller backed out of the deal', 'pause my purchase', 'resume my purchase']) {
        const out = await preview(message);
        assert.equal(out.reasonCode, 'ASK_PERMISSION_REQUIRED', `${role}: ${message}`);
        assert.notEqual(out.status, 'NEEDS_CONFIRMATION');
      }
      for (const parameters of [{ buyerLifecycleAction: 'CANCEL', buyerCancelReason: 'seller backed out' }, { buyerLifecycleAction: 'PAUSE' }, { buyerLifecycleAction: 'RESUME' }]) {
        await assert.rejects(() => confirm(role, parameters), (e) => e.code === 'ASK_PERMISSION_REQUIRED', `${role}: ${parameters.buyerLifecycleAction}`);
      }
      assert.deepEqual(h.calls, [], role);
    } finally { h.restore(); }
  }
});

test('a viewer cannot change the purchase dates; a contributor can, and the service gets exactly the date that was confirmed', async () => {
  let h = install('VIEWER');
  try {
    await assert.rejects(() => confirm('VIEWER', { buyerLifecycleAction: 'RESCHEDULE_CLOSING', buyerLifecycleDate: '2027-01-15T00:00:00.000Z' }), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
  h = install('CONTRIBUTOR');
  try {
    await confirm('CONTRIBUTOR', { buyerLifecycleAction: 'RESCHEDULE_CLOSING', buyerLifecycleDate: '2027-01-15T00:00:00.000Z' });
    await confirm('CONTRIBUTOR', { buyerLifecycleAction: 'RESCHEDULE_MOVE_IN', buyerLifecycleDate: '2027-02-01T00:00:00.000Z' });
    assert.deepEqual(h.calls.map((c) => [c[0], c[1], c[2], c[3]]), [['reschedule', 'u1', 'prop-1', { targetCloseDate: '2027-01-15T00:00:00.000Z' }], ['reschedule', 'u1', 'prop-1', { moveInDate: '2027-02-01T00:00:00.000Z' }]]);
  } finally { h.restore(); }
});

test('the owner confirming calls exactly the route\'s service method, once, flagged as confirmed; a cancel with no usable reason writes nothing; an unknown action writes nothing', async () => {
  const h = install('OWNER');
  try {
    await confirm('OWNER', { buyerLifecycleAction: 'CANCEL', buyerCancelReason: 'seller backed out' });
    await confirm('OWNER', { buyerLifecycleAction: 'PAUSE' });
    await confirm('OWNER', { buyerLifecycleAction: 'RESUME' });
    assert.deepEqual(h.calls, [
      ['cancel', 'u1', 'prop-1', { confirmed: true, reason: 'seller backed out' }],
      ['pause', 'u1', 'prop-1', { confirmed: true }],
      ['resume', 'u1', 'prop-1', { confirmed: true }],
    ]);
    const before = h.calls.length;
    await assert.rejects(() => confirm('OWNER', { buyerLifecycleAction: 'CANCEL', buyerCancelReason: 'no' }), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirm('OWNER', { buyerLifecycleAction: 'CLOSE_THE_DEAL' }), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirm('OWNER', {}), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(h.calls.length, before);
  } finally { h.restore(); }
});

test('recording the close is not available here: it is redirected, not performed', async () => {
  const h = install('OWNER');
  try {
    const out = await preview('we closed today');
    assert.equal(out.reasonCode, 'BUYER_CLOSE_REQUIRES_DEDICATED_TOOL');
    assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
});
