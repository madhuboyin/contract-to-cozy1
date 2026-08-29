const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  GENERIC_APPLIANCE_SPECIALIST_EVAL_CASES,
  GENERIC_APPLIANCE_SPECIALIST_EVAL_THRESHOLDS,
} = require('../../src/services/agents/genericApplianceSpecialistEvaluation.ts');
const { runHvacSpecialist } = require('../../src/services/agents/hvacRepairReplaceSpecialist.service.ts');

const BUDGETS = {
  maxLoopIterations: 8, maxExecutionMsPerRun: 30_000, maxContextFactsPerRun: 100,
  maxLLMInvocationsPerRun: 1, maxLLMCostPerRunUsd: 0.25, maxToolAttempts: 2, retryBackoffMs: 0,
};
const RUN_INPUT = {
  propertyId: 'p', principalUserId: 'u', requestingAgentId: 'eval', inventoryItemId: 'appliance-1',
  agentVersion: '1.0.0', budgets: BUDGETS, contextScopes: ['INVENTORY'],
};

function dependencies(states) {
  let index = 0;
  return {
    port: { createOrResume: async () => states[Math.min(index++, states.length - 1)] },
    contextReader: async () => ({ authorized: true, snapshot: null }),
    narrationProvider: null,
  };
}

async function runCase(evalCase) {
  return runHvacSpecialist(RUN_INPUT, dependencies(evalCase.portStates));
}

test('IPD-006 corpus passes deterministically with zero LLM calls', async () => {
  for (const evalCase of GENERIC_APPLIANCE_SPECIALIST_EVAL_CASES) {
    const result = await runCase(evalCase);
    assert.equal(result.status.phase, evalCase.expectedPhase, `${evalCase.id}: phase`);
    if (evalCase.expectedVerdict) assert.equal(result.status.verdict, evalCase.expectedVerdict, `${evalCase.id}: verdict`);
    if (evalCase.expectedAbstentionReason) assert.equal(result.status.abstentionReason, evalCase.expectedAbstentionReason, `${evalCase.id}: abstention`);
    assert.equal(result.ledger.llmInvocationsUsed, 0, `${evalCase.id}: no LLM`);
  }
});

test('IPD-006 thresholds enforce sample size, abstention band, and deterministic completion', async () => {
  assert.ok(GENERIC_APPLIANCE_SPECIALIST_EVAL_CASES.length >= GENERIC_APPLIANCE_SPECIALIST_EVAL_THRESHOLDS.sampleSizeMinimum);
  const results = await Promise.all(GENERIC_APPLIANCE_SPECIALIST_EVAL_CASES.map(runCase));
  const abstentionRate = results.filter((result) => result.status.phase === 'ABSTAINED').length / results.length;
  const band = GENERIC_APPLIANCE_SPECIALIST_EVAL_THRESHOLDS.abstentionBand;
  assert.ok(abstentionRate >= band.min && abstentionRate <= band.max);
  const nonAbstention = results.filter((_, index) => GENERIC_APPLIANCE_SPECIALIST_EVAL_CASES[index].expectedPhase !== 'ABSTAINED');
  const deterministicRate = nonAbstention.filter((result) => result.status.phase === 'RECOMMENDATION_READY' && result.ledger.llmInvocationsUsed === 0).length / nonAbstention.length;
  assert.equal(deterministicRate, GENERIC_APPLIANCE_SPECIALIST_EVAL_THRESHOLDS.minDeterministicCompletionRate);
  assert.match(GENERIC_APPLIANCE_SPECIALIST_EVAL_THRESHOLDS.failureAction, /FAIL_CI/);
});
