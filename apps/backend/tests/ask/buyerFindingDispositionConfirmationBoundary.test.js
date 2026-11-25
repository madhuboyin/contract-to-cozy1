// BICC-BUY-008 (behavioral): classifying an inspection finding as a buyer never writes for a viewer, for an invalid or missing finding, or when the finding changed since it was
// shown; a valid confirmation calls the buyer service once with exactly the confirmed disposition. Services are stubbed; no database.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const { prisma } = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { BuyerAcquisitionService } = require('../../src/services/buyerAcquisition.service.ts');

const OP = 'BUYER_FINDING_DISPOSITION';
const shown = new Date('2026-11-20T00:00:00Z');
const finding = (over = {}) => ({ id: 'f1', propertyId: 'prop-1', homeSystem: 'ROOF', subsystem: 'Flashing', buyerDispositionAt: shown, ...over });

function install(row = finding()) {
  const calls = [];
  const saved = { f: prisma.inspectionFinding.findFirst, d: BuyerAcquisitionService.dispositionFinding, e: executeOperation.reconcileAskExecutionSideEffects };
  prisma.inspectionFinding.findFirst = async ({ where }) => (row && where.id === row.id && where.propertyId === row.propertyId ? row : null);
  BuyerAcquisitionService.dispositionFinding = async (...a) => { calls.push(a); return { finding: { buyerDispositionAt: new Date('2026-11-24T00:00:00Z') } }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { prisma.inspectionFinding.findFirst = saved.f; BuyerAcquisitionService.dispositionFinding = saved.d; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const confirm = (role, parameters) => confirmCapabilityInvoke(OP, { userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
const params = (over = {}) => ({ buyerFindingId: 'f1', buyerFindingDisposition: 'NEGOTIATE', buyerFindingVersion: shown.toISOString(), ...over });

test('a viewer is refused and nothing is written', async () => {
  const h = install();
  try { await assert.rejects(() => confirm('VIEWER', params()), (e) => e.code === 'ASK_PERMISSION_REQUIRED'); assert.deepEqual(h.calls, []); } finally { h.restore(); }
});

test('an invalid selection, a finding that is no longer there, or one from another property writes nothing', async () => {
  const h = install();
  try {
    await assert.rejects(() => confirm('CONTRIBUTOR', params({ buyerFindingId: undefined })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirm('CONTRIBUTOR', params({ buyerFindingDisposition: 7 })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirm('CONTRIBUTOR', params({ buyerFindingId: 'someone-elses' })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
});

test('a finding that changed after it was shown is a conflict and writes nothing', async () => {
  const h = install(finding({ buyerDispositionAt: new Date('2026-11-23T00:00:00Z') }));
  try {
    await assert.rejects(() => confirm('CONTRIBUTOR', params()), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.deepEqual(h.calls, []);
  } finally { h.restore(); }
});

test('a contributor confirming a current finding calls the buyer service once with exactly that disposition; a never-classified finding is matched by a null version', async () => {
  let h = install();
  try {
    await confirm('CONTRIBUTOR', params());
    assert.deepEqual(h.calls, [['u1', 'prop-1', 'f1', { disposition: 'NEGOTIATE' }]]);
  } finally { h.restore(); }
  h = install(finding({ buyerDispositionAt: null }));
  try {
    await confirm('OWNER', params({ buyerFindingVersion: null, buyerFindingDisposition: 'ACCEPT' }));
    assert.deepEqual(h.calls, [['u1', 'prop-1', 'f1', { disposition: 'ACCEPT' }]]);
    await assert.rejects(() => confirm('OWNER', params({ buyerFindingVersion: shown.toISOString() })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(h.calls.length, 1);
  } finally { h.restore(); }
});
