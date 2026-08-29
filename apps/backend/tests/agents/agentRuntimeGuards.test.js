const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  invokeAgentRuntime,
  AgentRuntimeAuthorizationError,
  AgentRuntimeCasConflictError,
  AgentRuntimeStateError,
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

function pausedRun(overrides = {}) {
  return { runId: 'run-1', agentVersion: '1.0.0', casVersion: 2, decisionThreadId: 'thr-1', ...overrides };
}

test('an unauthorized principal fails closed regardless of requestingAgentId', async () => {
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'GET_STATUS' }, {
      authorize: async () => false,
      resolvePausedRun: async () => null,
    }),
    AgentRuntimeAuthorizationError,
  );
});

test('SUBMIT_CONTEXT with no paused run is rejected', async () => {
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'SUBMIT_CONTEXT', contextIntake: { 'hvac.installDate': 2015 } }, {
      authorize: async () => true,
      resolvePausedRun: async () => null,
    }),
    AgentRuntimeStateError,
  );
});

test('SUBMIT_CONTEXT with a stale expectedCasVersion is a CAS conflict', async () => {
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'SUBMIT_CONTEXT', expectedCasVersion: 1, contextIntake: {} }, {
      authorize: async () => true,
      resolvePausedRun: async () => pausedRun({ casVersion: 2 }),
    }),
    AgentRuntimeCasConflictError,
  );
});

test('SUBMIT_CONTEXT rejects intake keys outside the accepted set before any write', async () => {
  let handlerCalled = false;
  await assert.rejects(
    invokeAgentRuntime({ ...BASE, operation: 'SUBMIT_CONTEXT', expectedCasVersion: 2, contextIntake: { 'evil.key': 1 } }, {
      authorize: async () => true,
      resolvePausedRun: async () => pausedRun(),
      contextIntakeHandler: async () => { handlerCalled = true; },
    }),
    /Unsupported context keys/,
  );
  assert.equal(handlerCalled, false);
});

test('GET_STATUS with no run returns a WORKING projection without touching persistence', async () => {
  const result = await invokeAgentRuntime({ ...BASE, operation: 'GET_STATUS' }, {
    authorize: async () => true,
    resolvePausedRun: async () => null,
  });
  assert.equal(result.mutated, false);
  assert.equal(result.status.phase, 'WORKING');
  assert.equal(result.status.paused, false);
  assert.equal(result.status.runId, null);
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
