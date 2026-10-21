const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD 1.401: a homeowner withdraws only what they attached and nothing has verified; the withdrawal is paired with a history event.
const { prisma } = require('../../src/lib/prisma.ts');
const repo = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');
const { removeEvidence, EvidenceNotWithdrawableError } = require('../../src/modules/homeOperations/application/removeEvidence.usecase.ts');

function install(row) {
  const saved = { ev: prisma.operationalWorkEvidence, del: repo.deleteWorkEvidence, evt: repo.recordWorkEvent };
  const calls = [];
  prisma.operationalWorkEvidence = { findFirst: async () => row };
  repo.deleteWorkEvidence = async (...args) => { calls.push(['delete', ...args]); return { count: 1 }; };
  repo.recordWorkEvent = async (input) => { calls.push(['event', input]); return {}; };
  return { calls, restore() { prisma.operationalWorkEvidence = saved.ev; repo.deleteWorkEvidence = saved.del; repo.recordWorkEvent = saved.evt; } };
}
const input = { workItemId: 'w1', evidenceId: 'e1', actorUserId: 'u1', idempotencyKey: 'k' };

test('pending homeowner evidence is deleted and the removal is recorded in the work history', async () => {
  const w = install({ id: 'e1', evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-1', verificationStatus: 'PENDING' });
  try {
    assert.deepEqual(await removeEvidence(input), { removed: true });
    assert.deepEqual(w.calls[0], ['delete', 'w1', 'e1']);
    assert.equal(w.calls[1][1].eventType, 'OUTCOME_EVIDENCE_REMOVED');
    assert.deepEqual(w.calls[1][1].payload, { evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-1', verificationStatus: 'PENDING' });
  } finally { w.restore(); }
});

test('verified evidence and evidence written by the governing record are never removed, and nothing is written', async () => {
  for (const row of [
    { id: 'e1', evidenceType: 'DOCUMENT', evidenceEntityId: 'd', verificationStatus: 'VERIFIED' },
    { id: 'e1', evidenceType: 'DOMAIN_COMPLETION_RECORD', evidenceEntityId: 'd', verificationStatus: 'PENDING' },
    { id: 'e1', evidenceType: 'USER_ATTESTATION', evidenceEntityId: 'd', verificationStatus: 'PENDING' },
  ]) {
    const w = install(row);
    try {
      await assert.rejects(() => removeEvidence(input), EvidenceNotWithdrawableError);
      assert.equal(w.calls.length, 0);
    } finally { w.restore(); }
  }
});

test('evidence that is already gone is reported, not an error', async () => {
  const w = install(null);
  try { assert.deepEqual(await removeEvidence(input), { removed: false }); assert.equal(w.calls.length, 0); } finally { w.restore(); }
});
