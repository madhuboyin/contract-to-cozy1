const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  HVAC_SPECIALIST_EVAL_CASES,
  HVAC_SPECIALIST_EVAL_THRESHOLDS,
} = require('../../src/services/agents/hvacSpecialistEvaluation.ts');
const { runHvacSpecialist } = require('../../src/services/agents/hvacRepairReplaceSpecialist.service.ts');

const BUDGETS = {
  maxLoopIterations: 8, maxExecutionMsPerRun: 30_000, maxContextFactsPerRun: 100,
  maxLLMInvocationsPerRun: 1, maxLLMCostPerRunUsd: 0.25,
};
const RUN_INPUT = {
  propertyId: 'p', principalUserId: 'u', requestingAgentId: 'eval', inventoryItemId: 'i', agentVersion: '1.0.0', budgets: BUDGETS,
};

function portFor(states) {
  let i = 0;
  return {
    port: { createOrResume: async () => states[Math.min(i++, states.length - 1)] },
    contextReader: async () => ({ authorized: true, snapshot: null }),
    narrationProvider: null,
  };
}

test('IPD-005: every evaluation fixture reaches its expected phase deterministically', async () => {
  for (const evalCase of HVAC_SPECIALIST_EVAL_CASES) {
    const result = await runHvacSpecialist(RUN_INPUT, portFor(evalCase.portStates));
    assert.equal(result.status.phase, evalCase.expectedPhase, `${evalCase.id}: phase`);
    if (evalCase.expectedVerdict) assert.equal(result.status.verdict, evalCase.expectedVerdict, `${evalCase.id}: verdict`);
    if (evalCase.expectedAbstentionReason) {
      assert.equal(result.status.abstentionReason, evalCase.expectedAbstentionReason, `${evalCase.id}: abstention`);
    }
    // requireZeroLlmInvocations — the v1 loop must never invoke an LLM.
    assert.equal(result.ledger.llmInvocationsUsed, 0, `${evalCase.id}: no LLM`);
  }
});

test('IPD-005: abstention rate is inside the acceptable band', async () => {
  let abstained = 0;
  for (const evalCase of HVAC_SPECIALIST_EVAL_CASES) {
    const result = await runHvacSpecialist(RUN_INPUT, portFor(evalCase.portStates));
    if (result.status.phase === 'ABSTAINED') abstained += 1;
  }
  const rate = abstained / HVAC_SPECIALIST_EVAL_CASES.length;
  const { min, max } = HVAC_SPECIALIST_EVAL_THRESHOLDS.abstentionBand;
  assert.ok(rate >= min && rate <= max, `abstention rate ${rate} outside [${min}, ${max}]`);
});

test('IPD-005: deterministic completion rate meets the threshold', async () => {
  const nonAbstainCases = HVAC_SPECIALIST_EVAL_CASES.filter((c) => c.expectedPhase !== 'ABSTAINED');
  let completed = 0;
  for (const evalCase of nonAbstainCases) {
    const result = await runHvacSpecialist(RUN_INPUT, portFor(evalCase.portStates));
    if (result.status.phase === evalCase.expectedPhase && result.ledger.llmInvocationsUsed === 0) completed += 1;
  }
  const rate = completed / nonAbstainCases.length;
  assert.ok(rate >= HVAC_SPECIALIST_EVAL_THRESHOLDS.minDeterministicCompletionRate,
    `deterministic completion ${rate} < ${HVAC_SPECIALIST_EVAL_THRESHOLDS.minDeterministicCompletionRate}`);
});

test('IPD-005: the corpus exercises every expected phase', () => {
  const phases = new Set(HVAC_SPECIALIST_EVAL_CASES.map((c) => c.expectedPhase));
  for (const phase of ['RECOMMENDATION_READY', 'NEEDS_CONTEXT', 'NEEDS_DOCUMENT', 'ABSTAINED']) {
    assert.ok(phases.has(phase), `missing coverage for ${phase}`);
  }
});

test('IPD-005: the versioned acceptance contract declares baseline, sample, window, and failure action', () => {
  const c = HVAC_SPECIALIST_EVAL_THRESHOLDS;
  assert.equal(c.fixtureCorpusVersion, 'hvac-specialist-fixtures@1.0.0');
  assert.equal(c.baselineMeasurement.sampleSize, HVAC_SPECIALIST_EVAL_CASES.length);
  assert.ok(c.sampleSizeMinimum <= HVAC_SPECIALIST_EVAL_CASES.length);
  assert.match(c.measurementWindow, /CI_RUN/);
  assert.match(c.failureAction, /FAIL_CI/);
  assert.equal(c.missingBaselineStatus, 'NOT_MEASURED');
});
