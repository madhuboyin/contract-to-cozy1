// apps/backend/src/services/agents/hvacSpecialistEvaluation.ts
//
// IPD-005: the versioned HVAC Specialist evaluation contract. The repository
// has no environment and no users, so this is a fixture corpus + thresholds
// exercised against the deterministic loop (runHvacSpecialist over a stubbed
// decision-family port) — not a live metric. It defines what "passing" means
// before the definition is ENABLED, and hvacSpecialistEvaluation.test.js runs
// it in CI.

import type { SpecialistThreadState } from './hvacRepairReplaceSpecialist.service';

export const HVAC_SPECIALIST_EVAL_SUITE_ID = 'agent-hvac-repair-replace-eval@1.0.0';

export type EvalExpectedPhase = 'RECOMMENDATION_READY' | 'NEEDS_CONTEXT' | 'NEEDS_DOCUMENT' | 'ABSTAINED';

export interface HvacSpecialistEvalCase {
  id: string;
  description: string;
  /** One or more successive decision-family port states (later = after a resume). */
  portStates: SpecialistThreadState[];
  expectedPhase: EvalExpectedPhase;
  expectedVerdict?: 'REPAIR' | 'REPLACE' | 'MONITOR';
  expectedAbstentionReason?: string;
  /** This case must complete without any LLM invocation (all v1 cases: true). */
  deterministic: true;
}

function state(overrides: Partial<SpecialistThreadState>): SpecialistThreadState {
  return {
    ambiguous: false,
    decisionThreadId: 'thr',
    currentRecommendationSnapshotId: 'snap',
    contextStatus: 'CURRENT',
    verdict: null,
    confidenceLabel: null,
    reasonCodes: [],
    limitationCodes: [],
    ...overrides,
  };
}

export const HVAC_SPECIALIST_EVAL_CASES: readonly HvacSpecialistEvalCase[] = [
  {
    id: 'replace-clear',
    description: 'Aged system, elevated repair spend, current context — clear REPLACE.',
    portStates: [state({ verdict: 'REPLACE', confidenceLabel: 'HIGH', reasonCodes: ['SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN', 'ELEVATED_REPAIR_SPEND'] })],
    expectedPhase: 'RECOMMENDATION_READY',
    expectedVerdict: 'REPLACE',
    deterministic: true,
  },
  {
    id: 'repair-warranty',
    description: 'Relatively new, active warranty — REPAIR.',
    portStates: [state({ verdict: 'REPAIR', confidenceLabel: 'MEDIUM', reasonCodes: ['SYSTEM_RELATIVELY_NEW', 'ACTIVE_WARRANTY_REDUCES_REPAIR_RISK'] })],
    expectedPhase: 'RECOMMENDATION_READY',
    expectedVerdict: 'REPAIR',
    deterministic: true,
  },
  {
    id: 'monitor-low-signal',
    description: 'No strong signal either way — MONITOR.',
    portStates: [state({ verdict: 'MONITOR', confidenceLabel: 'MEDIUM', reasonCodes: ['NO_RECENT_REPAIR_SPEND'] })],
    expectedPhase: 'RECOMMENDATION_READY',
    expectedVerdict: 'MONITOR',
    deterministic: true,
  },
  {
    id: 'needs-install-date',
    description: 'Install date unknown — ask the homeowner, do not guess.',
    portStates: [state({ verdict: null, confidenceLabel: 'LOW', limitationCodes: ['INSTALL_DATE_UNKNOWN'] })],
    expectedPhase: 'NEEDS_CONTEXT',
    deterministic: true,
  },
  {
    id: 'needs-condition',
    description: 'Condition unknown — ask the homeowner.',
    portStates: [state({ verdict: null, confidenceLabel: 'LOW', limitationCodes: ['CONDITION_UNKNOWN'] })],
    expectedPhase: 'NEEDS_CONTEXT',
    deterministic: true,
  },
  {
    id: 'needs-quote-doc',
    description: 'Only a technician assessment is missing — ask for the document.',
    portStates: [state({ verdict: null, confidenceLabel: 'LOW', limitationCodes: ['NO_TECHNICIAN_ASSESSMENT_ON_FILE'] })],
    expectedPhase: 'NEEDS_DOCUMENT',
    deterministic: true,
  },
  {
    id: 'resume-after-context',
    description: 'Missing install date, then supplied — resumes to a recommendation.',
    portStates: [
      state({ verdict: null, confidenceLabel: 'LOW', limitationCodes: ['INSTALL_DATE_UNKNOWN'] }),
      state({ verdict: 'REPLACE', confidenceLabel: 'MEDIUM', reasonCodes: ['SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN'] }),
    ],
    expectedPhase: 'NEEDS_CONTEXT',
    deterministic: true,
  },
  {
    id: 'abstain-ambiguous',
    description: 'Two active decision threads for the system — abstain, never guess.',
    portStates: [state({ ambiguous: true, decisionThreadId: null, currentRecommendationSnapshotId: null, contextStatus: null })],
    expectedPhase: 'ABSTAINED',
    expectedAbstentionReason: 'AMBIGUOUS_DECISION_THREAD',
    deterministic: true,
  },
  {
    id: 'abstain-transient',
    description: 'Engine hit only lookup timeouts on every attempt — abstain, do not ask the homeowner for system data.',
    portStates: [state({ verdict: null, limitationCodes: ['HVAC_REPAIR_HISTORY_LOOKUP_TIMED_OUT'] })],
    expectedPhase: 'ABSTAINED',
    expectedAbstentionReason: 'TOOL_FAILURE',
    deterministic: true,
  },
  {
    id: 'abstain-no-verdict',
    description: 'Current context, no actionable gap, but the engine produced no supported verdict — abstain.',
    portStates: [state({ verdict: null, confidenceLabel: 'LOW', reasonCodes: [] })],
    expectedPhase: 'ABSTAINED',
    expectedAbstentionReason: 'UNSUPPORTED_VERDICT',
    deterministic: true,
  },
];

/**
 * The passing bar. `abstentionBand` is the acceptable fraction of the corpus
 * that ends in ABSTAINED (too low = the loop is guessing; too high = it is
 * useless). `minDeterministicCompletionRate` is the fraction of
 * non-abstain-designed cases that reach their expected non-abstain phase with
 * zero LLM invocations.
 */
export const HVAC_SPECIALIST_EVAL_THRESHOLDS = Object.freeze({
  contractVersion: '1.0.0',
  abstentionBand: { min: 0.2, max: 0.5 },
  minDeterministicCompletionRate: 1.0,
  requireZeroLlmInvocations: true,
});
