const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

// Capability discovery Phase 6 gaps: the server-owned expiry reconciliation, the expiry hook, and the continuation hooks.
const { reconcileExpiredDiscoveryProposals, ASK_PENDING_RECONCILIATION_LOOKBACK_DAYS } = require('../../src/services/ask/askPendingExpiryReconciliation.ts');
const sessions = require('../../src/services/ask/execution/askSessions.ts');
const lifecycle = require('../../src/services/ask/askCapabilityLifecycle.ts');
const recovery = require('../../src/services/ask/suggestedActions/recoveryCandidates.ts');
const { prisma } = require('../../src/lib/prisma.ts');

const NOW = new Date('2026-10-10T12:00:00.000Z');
const minutes = (n) => new Date(NOW.getTime() + n * 60_000).toISOString();
const discovery = { surface: 'ASK_PAGE', operationId: 'MAINTENANCE_TASK_CREATE', discovery: { entryId: 'maintain-create-task', surface: 'EXPLORER' } };
const pending = (id, over = {}) => ({
  id, userId: 'u1', propertyId: 'p1', sessionId: 's1', operationId: 'MAINTENANCE_TASK_CREATE', status: 'NEEDS_CONFIRMATION', reasonCode: null,
  launchContextJson: discovery, resultJson: { confirmation: { expiresAt: minutes(-5) } }, ...over,
});

function harness({ pendingRows = [], lapsedRows = [] } = {}) {
  const calls = { expired: [], abandoned: [] };
  return {
    calls,
    deps: {
      findPending: async () => pendingRows,
      findLapsed: async () => lapsedRows,
      expire: async (execution) => { calls.expired.push(execution.id); return { status: 'EXPIRED' }; },
      recordAbandoned: async (id) => { calls.abandoned.push(id); return [{ stage: 'ABANDONED' }]; },
    },
  };
}

test('the sweep expires only discovery-launched interactions whose stored expiry has passed', async () => {
  const h = harness({ pendingRows: [
    pending('past'),
    pending('future', { resultJson: { confirmation: { expiresAt: minutes(30) } } }),
    pending('clarification-past', { status: 'NEEDS_CLARIFICATION', resultJson: { clarification: { expiresAt: minutes(-1) } } }),
    pending('not-discovery', { launchContextJson: { surface: 'ASK_PAGE' } }),
    pending('no-expiry', { resultJson: { confirmation: {} } }),
    pending('no-launch-context', { launchContextJson: null }),
  ] });
  const result = await reconcileExpiredDiscoveryProposals({ now: NOW }, h.deps);
  assert.deepEqual(h.calls.expired, ['past', 'clarification-past']);
  assert.deepEqual(result, { expired: 2, backfilled: 0 });
});

test('the sweep reuses the existing expiry rule exactly: the interaction\'s own stored expiresAt, no discovery-specific duration', async () => {
  // Exactly at the boundary counts as expired (the lazy rule is `expiresAt > now` means still pending).
  const h = harness({ pendingRows: [pending('boundary', { resultJson: { confirmation: { expiresAt: NOW.toISOString() } } }), pending('one-ms-left', { resultJson: { confirmation: { expiresAt: new Date(NOW.getTime() + 1).toISOString() } } })] });
  await reconcileExpiredDiscoveryProposals({ now: NOW }, h.deps);
  assert.deepEqual(h.calls.expired, ['boundary']);
  assert.equal(typeof sessions.pendingInteractionExpiresAt, 'function');
  assert.equal(sessions.pendingInteractionExpiresAt({ resultJson: { confirmation: { expiresAt: minutes(-5) } } }).toISOString(), minutes(-5));
});

test('the sweep backfills a missing ABANDONED only for discovery-launched executions that expired by time', async () => {
  const h = harness({ lapsedRows: [
    { id: 'lapsed', launchContextJson: discovery, status: 'EXPIRED', reasonCode: 'ASK_EXECUTION_EXPIRED' },
    { id: 'plain', launchContextJson: { surface: 'ASK_PAGE' }, status: 'EXPIRED', reasonCode: 'ASK_EXECUTION_EXPIRED' },
  ] });
  const result = await reconcileExpiredDiscoveryProposals({ now: NOW }, h.deps);
  assert.deepEqual(h.calls.abandoned, ['lapsed']);
  assert.deepEqual(result, { expired: 0, backfilled: 1 });
});

test('a replay records nothing new, and one batch is bounded', async () => {
  const replay = harness({ lapsedRows: [{ id: 'lapsed', launchContextJson: discovery }] });
  replay.deps.recordAbandoned = async () => [];
  assert.deepEqual(await reconcileExpiredDiscoveryProposals({ now: NOW }, replay.deps), { expired: 0, backfilled: 0 });
  const many = harness({ pendingRows: Array.from({ length: 30 }, (_, index) => pending(`p${index}`)) });
  const result = await reconcileExpiredDiscoveryProposals({ now: NOW, batchSize: 7 }, many.deps);
  assert.equal(result.expired, 7);
  assert.equal(many.calls.expired.length, 7);
});

test('the lookback is bounded, and the sweep asks for a window ending at "now"', async () => {
  let seen;
  const h = harness();
  h.deps.findPending = async (args) => { seen = args; return []; };
  await reconcileExpiredDiscoveryProposals({ now: NOW, batchSize: 10 }, h.deps);
  assert.equal(NOW.getTime() - seen.since.getTime(), ASK_PENDING_RECONCILIATION_LOOKBACK_DAYS * 86_400_000);
  assert.equal(seen.take, 50);
});

test('lazy expiry records ABANDONED through the same transition the sweep uses, and not when another request already expired it', async () => {
  const original = {
    finalize: recovery.finalizeRecoveryActions, updateMany: prisma.askExecution.updateMany, create: prisma.askExecutionEvent.create,
    findUniqueOrThrow: prisma.askExecution.findUniqueOrThrow, record: lifecycle.recordAskCapabilityLifecycle,
  };
  const recorded = [];
  recovery.finalizeRecoveryActions = async () => [];
  prisma.askExecutionEvent.create = async () => ({});
  prisma.askExecution.findUniqueOrThrow = async ({ where }) => ({ id: where.id, status: 'EXPIRED' });
  lifecycle.recordAskCapabilityLifecycle = async (id, signal) => { recorded.push([id, signal]); return []; };
  try {
    // expirePendingInteraction uses the real clock, so the stored expiry is relative to it.
    const lapsed = { resultJson: { confirmation: { expiresAt: new Date(Date.now() - 60_000).toISOString() } }, updatedAt: NOW };
    prisma.askExecution.updateMany = async () => ({ count: 1 });
    await sessions.expirePendingInteraction({ ...pending('x'), ...lapsed });
    prisma.askExecution.updateMany = async () => ({ count: 0 });
    await sessions.expirePendingInteraction({ ...pending('y'), ...lapsed });
    // A still-pending interaction is untouched.
    await sessions.expirePendingInteraction({ ...pending('z'), resultJson: { confirmation: { expiresAt: new Date(Date.now() + 3_600_000).toISOString() } }, updatedAt: NOW });
    assert.deepEqual(recorded, [['x', 'EXPIRED']]);
  } finally {
    recovery.finalizeRecoveryActions = original.finalize; prisma.askExecution.updateMany = original.updateMany; prisma.askExecutionEvent.create = original.create;
    prisma.askExecution.findUniqueOrThrow = original.findUniqueOrThrow; lifecycle.recordAskCapabilityLifecycle = original.record;
  }
});

test('the continuation entry points (clarification, property choice, structured capture) record the later result against the original execution', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution', file), 'utf8');
  for (const [file, name] of [['askClarification.ts', 'submitAskClarification'], ['askClarification.ts', 'resolveAskExecutionProperty'], ['askCapture.ts', 'submitAskCapture']]) {
    const source = read(file);
    const wrapper = source.slice(source.indexOf(`export async function ${name}(`));
    assert.match(wrapper.slice(0, 400), new RegExp(`await ${name}Core\\(`), `${name} delegates to its core`);
    assert.match(wrapper.slice(0, 500), /void recordAskCapabilityLifecycle\(executionId, 'RESULT'\)/, `${name} records the result for the same execution`);
  }
});

test('the reconciliation job is deployable: a script, an npm entry, and a CronJob that mirrors the retention job', () => {
  const root = path.resolve(__dirname, '../../../..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/backend/package.json'), 'utf8'));
  assert.equal(pkg.scripts['reconcile:ask-pending'], 'node dist/scripts/askPendingExpiryReconcile.js');
  const cron = fs.readFileSync(path.join(root, 'infrastructure/kubernetes/apps/backend/ask-pending-expiry-cronjob.yaml'), 'utf8');
  assert.match(cron, /name: ask-pending-expiry/);
  assert.match(cron, /concurrencyPolicy: Forbid/);
  assert.match(cron, /\["npm", "run", "reconcile:ask-pending"\]/);
  assert.match(fs.readFileSync(path.join(root, 'infrastructure/kubernetes/overlays/raspberry-pi/kustomization.yaml'), 'utf8'), /ask-pending-expiry-cronjob\.yaml/);
});
