const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  invokeAgentRuntime,
  AgentRuntimeAuthorizationError,
  AgentRuntimeCasConflictError,
  AgentRuntimeDisabledError,
  AgentRuntimeStateError,
  resolveAgentDeploymentRevision,
} = require('../../src/services/agents/agentRuntime.service.ts');
const {
  validateAgentTriggerHandlers,
  AGENT_TRIGGER_HANDLERS,
} = require('../../src/services/agents/agentTriggerRegistry.ts');
const { AGENT_TRIGGER_HANDLER_REGISTRY } = require('../../src/services/agents/agentRegistryValidation.ts');
const { boundedHash } = require('../../src/services/agents/agentInvocationAudit.service.ts');

const BASE = {
  principalUserId: 'user-1',
  propertyId: 'prop-1',
  inventoryItemId: 'item-1',
  requestingAgentId: 'test',
};
const ENABLED_ENV = { AGENT_HVAC_REPAIR_REPLACE_ENABLED: 'true' };

function runtimeDeps(overrides = {}) {
  return { env: ENABLED_ENV, resolveLatestRun: async () => null, ...overrides };
}

function pausedRun(overrides = {}) {
  return {
    runId: 'run-1', agentVersion: '1.0.0', casVersion: 2, decisionThreadId: 'thr-1',
    pauseExpiresAt: new Date(Date.now() + 60_000),
    serializedState: {}, expectedEvent: 'SUBMIT_CONTEXT',
    ...overrides,
  };
}

test('an unauthorized principal fails closed regardless of requestingAgentId', async () => {
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'GET_STATUS' }, runtimeDeps({
      authorize: async () => false,
      resolvePausedRun: async () => null,
    })),
    AgentRuntimeAuthorizationError,
  );
});

test('SUBMIT_CONTEXT with no paused run is rejected', async () => {
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'SUBMIT_CONTEXT', contextIntake: { 'hvac.installDate': 2015 } }, runtimeDeps({
      authorize: async () => true,
      resolvePausedRun: async () => null,
    })),
    AgentRuntimeStateError,
  );
});

test('SUBMIT_CONTEXT with a stale expectedCasVersion is a CAS conflict', async () => {
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'SUBMIT_CONTEXT', expectedCasVersion: 1, contextIntake: {} }, runtimeDeps({
      authorize: async () => true,
      resolvePausedRun: async () => pausedRun({ casVersion: 2 }),
    })),
    AgentRuntimeCasConflictError,
  );
});

test('a paused mutation requires the client-visible CAS version', async () => {
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'SUBMIT_CONTEXT', contextIntake: {} }, runtimeDeps({
      authorize: async () => true,
      resolvePausedRun: async () => pausedRun(),
    })),
    AgentRuntimeCasConflictError,
  );
});

test('the feature flag and kill switch fail closed before mutation', async () => {
  for (const env of [
    {},
    { AGENT_HVAC_REPAIR_REPLACE_ENABLED: 'true', AGENT_HVAC_REPAIR_REPLACE_KILL_SWITCH: 'true' },
  ]) {
    await assert.rejects(
      invokeAgentRuntime({ ...BASE, operation: 'SUBMIT_CONTEXT', contextIntake: {} }, {
        env, authorize: async () => true, resolvePausedRun: async () => null,
      }),
      AgentRuntimeDisabledError,
    );
  }
});

test('SUBMIT_CONTEXT rejects intake keys outside the accepted set before any write', async () => {
  let handlerCalled = false;
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'SUBMIT_CONTEXT', expectedCasVersion: 2, contextIntake: { 'evil.key': 1 } }, runtimeDeps({
      authorize: async () => true,
      resolvePausedRun: async () => pausedRun(),
      contextIntakeHandler: async () => { handlerCalled = true; },
    })),
    /Unsupported context keys/,
  );
  assert.equal(handlerCalled, false);
});

test('GET_STATUS with no run returns a WORKING projection without touching persistence', async () => {
  const result = await invokeAgentRuntime({ ...BASE, operation: 'GET_STATUS' }, runtimeDeps({
    authorize: async () => true,
    resolvePausedRun: async () => null,
  }));
  assert.equal(result.mutated, false);
  assert.equal(result.status.phase, 'WORKING');
  assert.equal(result.status.paused, false);
  assert.equal(result.status.runId, null);
});

test('GET_STATUS restores the latest terminal bounded status instead of returning WORKING', async () => {
  const result = await invokeAgentRuntime({ ...BASE, operation: 'GET_STATUS' }, runtimeDeps({
    authorize: async () => true,
    resolvePausedRun: async () => null,
    resolveLatestRun: async () => ({
      id: 'run-done', agentVersion: '1.0.0', outcome: 'COMPLETED', decisionThreadId: 'thr-1',
      statusJson: {
        agentId: 'hvac-repair-replace-specialist', agentVersion: '1.0.0', phase: 'RECOMMENDATION_READY',
        decisionThreadId: 'thr-1', currentRecommendationSnapshotId: 'snap-1', verdict: 'REPLACE',
        confidenceLabel: 'HIGH', outstanding: [], explanation: [], abstentionReason: null,
      },
    }),
  }));
  assert.equal(result.status.phase, 'RECOMMENDATION_READY');
  assert.equal(result.status.runId, 'run-done');
  assert.equal(result.status.verdict, 'REPLACE');
});

test('an expired RESUME_IN_PROGRESS claim restores the paused session instead of stranding it', async () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  const status = {
    agentId: 'hvac-repair-replace-specialist', agentVersion: '1.0.0', phase: 'NEEDS_CONTEXT',
    decisionThreadId: 'thr-1', currentRecommendationSnapshotId: 'snap-1', verdict: null,
    confidenceLabel: 'LOW', outstanding: [], explanation: [], abstentionReason: null,
  };
  let recoveredInput = null;
  const result = await invokeAgentRuntime({ ...BASE, operation: 'START_OR_RESUME' }, runtimeDeps({
    now: () => now,
    authorize: async () => true,
    resolvePausedRun: async () => pausedRun({
      casVersion: 3,
      expectedEvent: 'RESUME_IN_PROGRESS',
      serializedState: { status, ledger: {}, resumeClaim: { reservationId: 'res-dead', previousExpectedEvent: 'SUBMIT_CONTEXT' } },
    }),
    resolveReservation: async () => ({ id: 'res-dead', resultRunId: null, leaseExpiresAt: new Date(now.getTime() - 1) }),
    recoverPausedState: async (input) => { recoveredInput = input; return { swapped: true, casVersion: 4 }; },
    resolveRunById: async () => ({ id: 'run-1', statusJson: status }),
    resolveStateByRun: async () => ({ runId: 'run-1', casVersion: 4, resolvedAt: null, serializedStateJson: { status } }),
  }));

  assert.equal(recoveredInput.expectedEvent, 'SUBMIT_CONTEXT');
  assert.equal(result.status.phase, 'NEEDS_CONTEXT');
  assert.equal(result.status.casVersion, 4);
});

test('DISPUTE_INPUT accepts only canonical keys and preserves the bounded note for hashing', async () => {
  const terminal = {
    id: 'run-done', correlationId: 'corr-done', agentVersion: '1.0.0', outcome: 'COMPLETED',
    statusJson: {
      agentId: 'hvac-repair-replace-specialist', agentVersion: '1.0.0', phase: 'RECOMMENDATION_READY',
      decisionThreadId: 'thr-1', currentRecommendationSnapshotId: 'snap-1', verdict: 'REPLACE',
      confidenceLabel: 'HIGH', outstanding: [], explanation: [], abstentionReason: null,
    },
  };
  let audit = null;
  const deps = runtimeDeps({
    authorize: async () => true,
    resolvePausedRun: async () => null,
    resolveLatestRun: async () => terminal,
    recordDispute: async (input) => { audit = input; },
  });
  await invokeAgentRuntime({ ...BASE, operation: 'DISPUTE_INPUT', dispute: { key: 'hvac.condition', note: 'The inspection says good.' } }, deps);
  assert.equal(audit.input.key, 'hvac.condition');
  assert.equal(audit.input.note, 'The inspection says good.');
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'DISPUTE_INPUT', dispute: { key: 'arbitrary.secret' } }, deps),
    /supported Specialist input key/,
  );
});

test('deployment provenance fails closed when no concrete revision is present', () => {
  assert.throws(() => resolveAgentDeploymentRevision({}), /concrete deployment revision/);
  assert.throws(() => resolveAgentDeploymentRevision({ DEPLOYMENT_REVISION: 'UNSPECIFIED' }), /concrete deployment revision/);
  assert.equal(resolveAgentDeploymentRevision({ GIT_SHA: 'deadbeef' }), 'deadbeef');
});

test('trigger-handler parity: every AVAILABLE ref has a concrete handler and vice versa', () => {
  assert.deepEqual(validateAgentTriggerHandlers(AGENT_TRIGGER_HANDLER_REGISTRY), []);
  assert.ok(AGENT_TRIGGER_HANDLERS['agent.hvac.home-action-engagement@1.0.0']);
  assert.equal(AGENT_TRIGGER_HANDLER_REGISTRY['agent.hvac.home-action-engagement@1.0.0'], 'AVAILABLE');
});

test('validateAgentTriggerHandlers flags an AVAILABLE ref with no handler', () => {
  const issues = validateAgentTriggerHandlers({ 'agent.ghost@1.0.0': 'AVAILABLE' });
  assert.ok(issues.some((i) => /agent.ghost@1.0.0.*no concrete handler/.test(i)));
});

test('boundedHash is a stable digest that never echoes the input', () => {
  const secret = { promptText: 'the homeowner said their address is 123 Main St' };
  const hash = boundedHash(secret);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(hash, /Main St|homeowner/);
  assert.equal(boundedHash(secret), hash);
  assert.notEqual(boundedHash({ promptText: 'different' }), hash);
});
