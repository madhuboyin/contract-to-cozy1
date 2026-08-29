const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { runHvacSpecialist } = require('../../src/services/agents/hvacRepairReplaceSpecialist.service.ts');
const { narrateTypedClaims } = require('../../src/services/agents/agentLlmPurpose.contract.ts');
const {
  invokeAgentRuntime,
  AgentRuntimeStateError,
} = require('../../src/services/agents/agentRuntime.service.ts');

const BUDGETS = {
  maxLoopIterations: 8, maxExecutionMsPerRun: 30_000, maxContextFactsPerRun: 100,
  maxLLMInvocationsPerRun: 1, maxLLMCostPerRunUsd: 0.25,
};
const RUN_INPUT = {
  propertyId: 'p', principalUserId: 'u', requestingAgentId: 'test', inventoryItemId: 'i',
  agentVersion: '1.0.0', budgets: BUDGETS,
};
const AUTHORIZED = async () => ({ authorized: true, snapshot: null });
const ENABLED_ENV = { AGENT_HVAC_REPAIR_REPLACE_ENABLED: 'true' };
const PASS_THROUGH_GOVERNANCE = async (input) => input.work();

function deps(states, over = {}) {
  let i = 0;
  return {
    port: { createOrResume: async () => states[Math.min(i++, states.length - 1)] },
    contextReader: AUTHORIZED,
    narrationProvider: null,
    ...over,
  };
}

function readyState(over = {}) {
  return {
    ambiguous: false, decisionThreadId: 'thr', currentRecommendationSnapshotId: 'snap',
    contextStatus: 'CURRENT', verdict: 'REPLACE', confidenceLabel: 'HIGH',
    reasonCodes: ['SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN'], limitationCodes: [], ...over,
  };
}

// ── §7.3.5 per-tool audit accumulation ──────────────────────────────────────

test('runHvacSpecialist accumulates one bounded ToolInvocation per tool call', async () => {
  const result = await runHvacSpecialist(RUN_INPUT, deps([readyState()]));
  const tools = result.toolInvocations.map((t) => t.toolId);
  assert.deepEqual(tools, ['SCORE', 'EXPLAIN']);
  for (const inv of result.toolInvocations) {
    assert.equal(typeof inv.sequence, 'number');
    assert.ok(inv.startedAt && inv.finishedAt);
    // No raw homeowner data — only codes / ids / small structured objects.
    assert.doesNotMatch(JSON.stringify(inv), /Main St|SSN|@/);
  }
});

test('a NEEDS_CONTEXT pause records a REQUEST_CONTEXT tool invocation', async () => {
  const result = await runHvacSpecialist(RUN_INPUT, deps([readyState({ verdict: null, limitationCodes: ['INSTALL_DATE_UNKNOWN'] })]));
  assert.equal(result.disposition, 'PAUSE');
  assert.equal(result.toolInvocations.at(-1).toolId, 'REQUEST_CONTEXT');
});

// ── §7.3.7 property-context authorization gate ──────────────────────────────

test('an unauthorized context read abstains CONTEXT_UNAUTHORIZED and never runs the loop', async () => {
  let portCalled = false;
  const result = await runHvacSpecialist(RUN_INPUT, deps([readyState()], {
    contextReader: async () => ({ authorized: false, snapshot: null }),
    port: { createOrResume: async () => { portCalled = true; return readyState(); } },
  }));
  assert.equal(result.status.phase, 'ABSTAINED');
  assert.equal(result.status.abstentionReason, 'CONTEXT_UNAUTHORIZED');
  assert.equal(portCalled, false);
  assert.equal(result.toolInvocations[0].outcome, 'FAILED');
});

// ── §7.3.9 governed narration is LLM-optional and closed ─────────────────────

test('narrateTypedClaims returns the deterministic set when no provider / disabled', async () => {
  const deterministic = [{ claimId: 'a', text: 'A', sourceCode: 'X' }, { claimId: 'b', text: 'B', sourceCode: 'Y' }];
  const out = await narrateTypedClaims(deterministic, {});
  assert.equal(out.usedLlm, false);
  assert.deepEqual(out.claims, deterministic);
});

test('an enabled provider may only re-select from the closed set; invented claims are discarded', async () => {
  const deterministic = [{ claimId: 'a', text: 'A', sourceCode: 'X' }, { claimId: 'b', text: 'B', sourceCode: 'Y' }];
  const env = { AGENT_HVAC_NARRATION_LLM_ENABLED: 'true' };

  const reorder = await narrateTypedClaims(deterministic, {
    env, provider: {
      modelId: 'test-model', maxCostUsd: 0.01, executeGovernedRequest: PASS_THROUGH_GOVERNANCE,
      narrate: async () => ({ claims: [{ claimId: 'b', text: 'hallucinated', sourceCode: 'Z' }], inputTokens: 4, outputTokens: 1, costUsd: 0.001 }),
    },
  });
  assert.equal(reorder.usedLlm, true);
  assert.deepEqual(reorder.claims.map((c) => c.claimId), ['b']);
  assert.equal(reorder.claims[0].text, 'B'); // text comes from the deterministic claim, not the LLM

  const invented = await narrateTypedClaims(deterministic, {
    env, provider: {
      modelId: 'test-model', maxCostUsd: 0.01, executeGovernedRequest: PASS_THROUGH_GOVERNANCE,
      narrate: async () => ({ claims: [{ claimId: 'c', text: 'new', sourceCode: 'Z' }], inputTokens: 4, outputTokens: 1, costUsd: 0.001 }),
    },
  });
  assert.equal(invented.usedLlm, true);
  assert.equal(invented.invocation.outcome, 'REJECTED');
  assert.deepEqual(invented.claims, deterministic);
});

test('the specialist accounts for and emits bounded LLM audit metadata when narration runs', async () => {
  const result = await runHvacSpecialist({ ...RUN_INPUT, env: { AGENT_HVAC_NARRATION_LLM_ENABLED: 'true' } }, deps([readyState()], {
    narrationProvider: {
      modelId: 'test-model', policyId: 'policy-v1', maxCostUsd: 0.01, executeGovernedRequest: PASS_THROUGH_GOVERNANCE,
      narrate: async (claims) => ({ claims: [claims[0]], inputTokens: 5, outputTokens: 2, costUsd: 0.003 }),
    },
  }));
  assert.equal(result.ledger.llmInvocationsUsed, 1);
  assert.equal(result.ledger.llmCostUsdUsed, 0.003);
  assert.equal(result.llmInvocations.length, 1);
  assert.equal(result.llmInvocations[0].outcome, 'OK');
  assert.deepEqual(result.llmInvocations[0].typedClaimIds, ['hvac.reason.SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN']);
});

// ── §7.5 pause expiry ──────────────────────────────────────────────────────

test('SUBMIT_CONTEXT against an expired pause fails closed', async () => {
  await assert.rejects(
    invokeAgentRuntime({ operation: 'SUBMIT_CONTEXT', principalUserId: 'u', propertyId: 'p', inventoryItemId: 'i', requestingAgentId: 't', contextIntake: {} }, {
      env: ENABLED_ENV,
      authorize: async () => true,
      resolvePausedRun: async () => ({
        runId: 'r', agentVersion: '1.0.0', casVersion: 1, decisionThreadId: 'thr',
        pauseExpiresAt: new Date(Date.now() - 1000), serializedState: {}, expectedEvent: 'SUBMIT_CONTEXT',
      }),
    }),
    /expired/i,
  );
});

// ── §7.5 static boundary: agents never read property facts via Prisma ───────

test('agent modules do not read property-fact tables through Prisma', () => {
  const dir = resolve(__dirname, '../../src/services/agents');
  const forbidden = /prisma\.(inventoryItem|property|address|warranty|homeEvent|homeownerProfile|householdMember|room|inventoryDraftItem)\b/;
  const offenders = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    if (forbidden.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `agent modules must reach property facts only through getPropertyContext / decisionThreadService: ${offenders.join(', ')}`);
});

test('the runtime only touches its own persistence tables directly', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/agents/agentRuntime.service.ts'), 'utf8');
  const prismaAccesses = [...source.matchAll(/prisma\.([a-zA-Z]+)\b/g)].map((m) => m[1]);
  const allowed = new Set(['agentRun', 'agentState', 'agentRunReservation', 'toolInvocation', 'llmInvocation']);
  for (const model of prismaAccesses) {
    assert.ok(allowed.has(model), `agentRuntime.service.ts reads prisma.${model} directly`);
  }
});

test('the runtime claims idempotency and CAS ownership before any specialist or intake side effect', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/agents/agentRuntime.service.ts'), 'utf8');
  const body = source.slice(source.indexOf('async function advanceRun'));
  assert.ok(body.indexOf('claimAgentRunReservation({') < body.indexOf('runHvacSpecialist({'));
  assert.ok(body.indexOf('compareAndSwapAgentState({') < body.indexOf('await intakeHandler({'));
  assert.doesNotMatch(body, /episodeDay/);
  assert.match(body, /origin\.lineageId/);
  assert.match(body, /origin\.engagementNonce/);
  assert.match(body, /verifyCanonicalHomeActionOrigin/);
  assert.match(source, /action\.decisionLineage\?\.decisionDefinitionId === 'HVAC_REPAIR_REPLACE'/);
  assert.match(source, /action\.decisionLineage\.primaryEntityId === input\.inventoryItemId/);
});
