const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  selectNextSpecialistStep,
  emptyLedger,
} = require('../../src/services/agents/specialistToolSelection.ts');
const {
  selectTypedClaims,
  selectOutstanding,
  ACCEPTED_INTAKE_KEYS,
} = require('../../src/services/agents/specialistTypedClaims.ts');
const {
  runHvacSpecialist,
} = require('../../src/services/agents/hvacRepairReplaceSpecialist.service.ts');

const BUDGETS = {
  maxLoopIterations: 8,
  maxExecutionMsPerRun: 30_000,
  maxContextFactsPerRun: 100,
  maxLLMInvocationsPerRun: 1,
  maxLLMCostPerRunUsd: 0.25,
};

function observation(overrides = {}) {
  return {
    ambiguous: false,
    contextStatus: 'CURRENT',
    verdict: 'REPLACE',
    confidenceLabel: 'MEDIUM',
    reasonCodes: [],
    limitationCodes: [],
    resumeCount: 0,
    ...overrides,
  };
}

// ── pure step selection ─────────────────────────────────────────────────────

test('an ambiguous decision thread abstains immediately', () => {
  const step = selectNextSpecialistStep(observation({ ambiguous: true }), emptyLedger(), BUDGETS);
  assert.deepEqual(step, { kind: 'TERMINAL', phase: 'ABSTAINED', abstentionReason: 'AMBIGUOUS_DECISION_THREAD' });
});

test('loop/time budget exhaustion abstains with a partial result', () => {
  const ledger = { ...emptyLedger(), loopIterations: 8 };
  assert.equal(selectNextSpecialistStep(observation(), ledger, BUDGETS).abstentionReason, 'LOOP_BUDGET_EXHAUSTED');
});

test('an actionable data gap pauses to ask the homeowner, facts before documents', () => {
  const step = selectNextSpecialistStep(
    observation({ limitationCodes: ['INSTALL_DATE_UNKNOWN', 'NO_TECHNICIAN_ASSESSMENT_ON_FILE'], verdict: null }),
    emptyLedger(), BUDGETS,
  );
  assert.equal(step.kind, 'PAUSE');
  assert.equal(step.tool, 'REQUEST_CONTEXT');
  assert.equal(step.phase, 'NEEDS_CONTEXT');
  assert.deepEqual(step.outstanding.map((o) => o.key), ['hvac.installDate']);
});

test('a document-only gap pauses as NEEDS_DOCUMENT', () => {
  const step = selectNextSpecialistStep(
    observation({ limitationCodes: ['NO_TECHNICIAN_ASSESSMENT_ON_FILE'], verdict: null }),
    emptyLedger(), BUDGETS,
  );
  assert.equal(step.tool, 'REQUEST_DOCUMENT');
  assert.equal(step.phase, 'NEEDS_DOCUMENT');
});

test('transient lookup timeouts retry via RESUME_THREAD, then abstain as TOOL_FAILURE', () => {
  const obs = observation({ limitationCodes: ['HVAC_REPAIR_HISTORY_LOOKUP_TIMED_OUT'], verdict: null });
  assert.deepEqual(selectNextSpecialistStep({ ...obs, resumeCount: 0 }, emptyLedger(), BUDGETS), { kind: 'RESUME_THREAD' });
  assert.equal(selectNextSpecialistStep({ ...obs, resumeCount: 2 }, emptyLedger(), BUDGETS).abstentionReason, 'TOOL_FAILURE');
});

test('a stale thread resumes, then abstains CONTEXT_UNRESOLVED if still not current', () => {
  const obs = observation({ contextStatus: 'STALE' });
  assert.deepEqual(selectNextSpecialistStep({ ...obs, resumeCount: 0 }, emptyLedger(), BUDGETS), { kind: 'RESUME_THREAD' });
  assert.equal(selectNextSpecialistStep({ ...obs, resumeCount: 2 }, emptyLedger(), BUDGETS).abstentionReason, 'CONTEXT_UNRESOLVED');
});

test('a current snapshot with a supported verdict runs SCORE then EXPLAIN', () => {
  const ledger = emptyLedger();
  assert.deepEqual(selectNextSpecialistStep(observation(), ledger, BUDGETS), { kind: 'TOOL', tool: 'SCORE' });
  ledger.toolAttempts.SCORE = 1;
  assert.deepEqual(selectNextSpecialistStep(observation(), ledger, BUDGETS), { kind: 'TOOL', tool: 'EXPLAIN' });
});

test('a missing/unsupported verdict with no data gap abstains UNSUPPORTED_VERDICT', () => {
  assert.equal(
    selectNextSpecialistStep(observation({ verdict: null }), emptyLedger(), BUDGETS).abstentionReason,
    'UNSUPPORTED_VERDICT',
  );
});

// ── typed claims ────────────────────────────────────────────────────────────

test('typed claims are selected only for registered reason codes, deduped, never invented', () => {
  const claims = selectTypedClaims(['SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN', 'SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN', 'NOT_A_REAL_CODE']);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].sourceCode, 'SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN');
  assert.match(claims[0].claimId, /^hvac\.reason\./);
});

test('selectOutstanding classifies facts, documents, and transient-only', () => {
  assert.equal(selectOutstanding(['HVAC_IDENTITY_LOOKUP_TIMED_OUT']).transientOnly, true);
  const mixed = selectOutstanding(['CONDITION_UNKNOWN', 'REPLACEMENT_COST_RANGE_UNAVAILABLE', 'NO_TECHNICIAN_ASSESSMENT_ON_FILE']);
  assert.deepEqual(mixed.facts.map((f) => f.key).sort(), ['hvac.condition', 'hvac.replacementCost']);
  assert.deepEqual(mixed.documents.map((d) => d.key), ['hvac.technicianAssessment']);
  assert.equal(mixed.transientOnly, false);
});

test('ACCEPTED_INTAKE_KEYS is the FACT asks only — documents are never submitted back', () => {
  assert.ok(ACCEPTED_INTAKE_KEYS.has('hvac.installDate'));
  assert.ok(ACCEPTED_INTAKE_KEYS.has('hvac.condition'));
  assert.ok(ACCEPTED_INTAKE_KEYS.has('hvac.replacementCost'));
  assert.equal(ACCEPTED_INTAKE_KEYS.has('hvac.technicianAssessment'), false);
  assert.equal(ACCEPTED_INTAKE_KEYS.has('hvac.somethingElse'), false);
});

// ── full loop over an injected thread port ───────────────────────────────────

const AUTHORIZED_CONTEXT = async () => ({ authorized: true, snapshot: null });

function deps(...states) {
  let i = 0;
  return {
    port: { createOrResume: async () => states[Math.min(i++, states.length - 1)] },
    contextReader: AUTHORIZED_CONTEXT,
    narrationProvider: null,
  };
}

// Back-compat name used by several tests below.
const portReturning = (...states) => deps(...states);

const RUN_INPUT = {
  propertyId: 'prop-1', principalUserId: 'user-1', requestingAgentId: 'test', inventoryItemId: 'item-1',
  agentVersion: '1.0.0', budgets: BUDGETS,
};

test('runHvacSpecialist pauses NEEDS_CONTEXT when the snapshot flags a data gap', async () => {
  const result = await runHvacSpecialist(RUN_INPUT, portReturning({
    ambiguous: false, decisionThreadId: 'thr-1', currentRecommendationSnapshotId: 'snap-1',
    contextStatus: 'CURRENT', verdict: null, confidenceLabel: 'LOW',
    reasonCodes: [], limitationCodes: ['INSTALL_DATE_UNKNOWN'],
  }));
  assert.equal(result.disposition, 'PAUSE');
  assert.equal(result.status.phase, 'NEEDS_CONTEXT');
  assert.deepEqual(result.status.outstanding.map((o) => o.key), ['hvac.installDate']);
});

test('runHvacSpecialist terminates RECOMMENDATION_READY with a deterministic explanation', async () => {
  const result = await runHvacSpecialist(RUN_INPUT, portReturning({
    ambiguous: false, decisionThreadId: 'thr-1', currentRecommendationSnapshotId: 'snap-1',
    contextStatus: 'CURRENT', verdict: 'REPLACE', confidenceLabel: 'HIGH',
    reasonCodes: ['SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN', 'ELEVATED_REPAIR_SPEND'], limitationCodes: [],
  }));
  assert.equal(result.disposition, 'TERMINAL');
  assert.equal(result.status.phase, 'RECOMMENDATION_READY');
  assert.equal(result.status.verdict, 'REPLACE');
  assert.equal(result.status.explanation.length, 2);
});

test('runHvacSpecialist abstains on an ambiguous thread', async () => {
  const result = await runHvacSpecialist(RUN_INPUT, portReturning({
    ambiguous: true, decisionThreadId: null, currentRecommendationSnapshotId: null,
    contextStatus: null, verdict: null, confidenceLabel: null, reasonCodes: [], limitationCodes: [],
  }));
  assert.equal(result.status.phase, 'ABSTAINED');
  assert.equal(result.status.abstentionReason, 'AMBIGUOUS_DECISION_THREAD');
});

test('runHvacSpecialist recomputes a stale thread once, then proceeds when it becomes current', async () => {
  const result = await runHvacSpecialist(RUN_INPUT, portReturning(
    { ambiguous: false, decisionThreadId: 'thr-1', currentRecommendationSnapshotId: 'snap-1', contextStatus: 'STALE', verdict: null, confidenceLabel: null, reasonCodes: [], limitationCodes: [] },
    { ambiguous: false, decisionThreadId: 'thr-1', currentRecommendationSnapshotId: 'snap-2', contextStatus: 'CURRENT', verdict: 'MONITOR', confidenceLabel: 'MEDIUM', reasonCodes: ['SYSTEM_RELATIVELY_NEW'], limitationCodes: [] },
  ));
  assert.equal(result.status.phase, 'RECOMMENDATION_READY');
  assert.equal(result.status.verdict, 'MONITOR');
  assert.ok(result.ledger.loopIterations >= 2);
});
