// BICC-BUY-008 (behavioral): a viewer is refused, with no write, for EVERY kind of the buyer insurance and loan-estimate commands. The older suites for these two commands check this
// only after a routing assertion that currently fails (the deterministic rules are demoted), so the viewer check there never runs; this file does not depend on routing.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { BuyerInsuranceService: Ins } = require('../../src/services/buyerInsurance.service.ts');
const { BuyerPurchaseLoanEstimateService: LE } = require('../../src/services/buyerPurchaseLoanEstimate.service.ts');
const insurance = require('../../src/services/ask/support/buyerInsuranceCommand.ts');
const loan = require('../../src/services/ask/support/buyerLoanEstimateCommand.ts');

const T = '2026-09-01T00:00:00.000Z';
function stub(service, writes, reads) {
  const saved = {}; const calls = [];
  for (const name of writes) { saved[name] = service[name]; service[name] = async (...a) => { calls.push([name, ...a]); return {}; }; }
  for (const [name, value] of Object.entries(reads)) { saved[name] = service[name]; service[name] = async () => value; }
  return { calls, restore: () => { for (const [name, fn] of Object.entries(saved)) service[name] = fn; } };
}
async function asRole(role, fn) {
  const savedAccess = propertyAccess.resolvePropertyAccess; const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try { return await fn(); } finally { propertyAccess.resolvePropertyAccess = savedAccess; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; }
}

test('a viewer is refused for every buyer-insurance command kind and nothing is written', async () => {
  const OP = 'BUYER_INSURANCE_COMMAND';
  const s = stub(Ins, ['createRequirement', 'updateRequirement', 'createQuote', 'selectQuote', 'bind', 'update'], { get: { workspace: { updatedAt: T, selectedQuoteId: null, boundPolicyId: null, lenderProofStatus: 'PENDING', closingProofStatus: 'PENDING', quotes: [], requirements: [] }, contact: null, policy: null, documents: [] } });
  try {
    const kinds = Object.keys(insurance.INSURANCE_MESSAGES);
    assert.ok(kinds.length >= 5, `kinds found: ${kinds.length}`);
    await asRole('VIEWER', async () => {
      for (const kind of kinds) {
        const out = await capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: insurance.INSURANCE_MESSAGES[kind], launchContext: { operationId: OP, surface: 'ASK_PAGE', entityId: 'x' } });
        assert.equal(out.reasonCode, 'ASK_PERMISSION_REQUIRED', kind);
        assert.notEqual(out.status, 'NEEDS_CONFIRMATION', kind);
      }
    });
    assert.deepEqual(s.calls, []);
  } finally { s.restore(); }
});

test('a viewer is refused for every buyer loan-estimate command kind and nothing is written', async () => {
  const OP = 'BUYER_LOAN_ESTIMATE_COMMAND';
  const s = stub(LE, ['createOffer', 'addRevision', 'updateDraft', 'confirm', 'selectOffer'], { list: { purchasePath: 'FINANCED', selection: null, offers: [{ id: 'o1', lenderName: 'First Bank', updatedAt: T, revisions: [{ id: 'r1', status: 'DRAFT', revisionNumber: 1, updatedAt: T }] }], comparison: null } });
  try {
    const kinds = Object.keys(loan.LE_MESSAGES);
    assert.ok(kinds.length >= 4, `kinds found: ${kinds.length}`);
    await asRole('VIEWER', async () => {
      for (const kind of kinds) {
        const out = await capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: loan.LE_MESSAGES[kind], launchContext: { operationId: OP, surface: 'ASK_PAGE', entityType: loan.LE_ENTITY_TYPE, entityId: 'r1' } });
        assert.equal(out.reasonCode, 'ASK_PERMISSION_REQUIRED', kind);
        assert.notEqual(out.status, 'NEEDS_CONFIRMATION', kind);
      }
    });
    assert.deepEqual(s.calls, []);
  } finally { s.restore(); }
});
