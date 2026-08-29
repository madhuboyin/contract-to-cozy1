// IPD-006: versioned, checked-in evaluation contract for the admitted
// GENERIC_APPLIANCE profile. The corpus exercises the shared Specialist loop
// over APPLIANCE Decision Platform projections only; no LLM is available.

import type { SpecialistThreadState } from './hvacRepairReplaceSpecialist.service';

export const GENERIC_APPLIANCE_SPECIALIST_EVAL_SUITE_ID = 'agent-generic-appliance-repair-replace-eval@1.0.0';

export interface GenericApplianceEvalCase {
  id: string;
  description: string;
  portStates: SpecialistThreadState[];
  expectedPhase: 'RECOMMENDATION_READY' | 'ABSTAINED';
  expectedVerdict?: 'REPAIR' | 'REPLACE';
  expectedAbstentionReason?: string;
  deterministic: true;
}

function state(overrides: Partial<SpecialistThreadState>): SpecialistThreadState {
  return {
    ambiguous: false,
    decisionThreadId: 'appliance-thread',
    currentRecommendationSnapshotId: 'appliance-snapshot',
    contextStatus: 'CURRENT',
    verdict: null,
    confidenceLabel: null,
    reasonCodes: [],
    limitationCodes: [],
    ...overrides,
  };
}

export const GENERIC_APPLIANCE_SPECIALIST_EVAL_CASES: readonly GenericApplianceEvalCase[] = Object.freeze([
  { id: 'replace-now-high', description: 'REPLACE_NOW projection is ready.', portStates: [state({ verdict: 'REPLACE', confidenceLabel: 'HIGH', reasonCodes: ['SOURCE_VERDICT_REPLACE_NOW'] })], expectedPhase: 'RECOMMENDATION_READY', expectedVerdict: 'REPLACE', deterministic: true },
  { id: 'replace-soon-medium', description: 'REPLACE_SOON projection is ready.', portStates: [state({ verdict: 'REPLACE', confidenceLabel: 'MEDIUM', reasonCodes: ['SOURCE_VERDICT_REPLACE_SOON'] })], expectedPhase: 'RECOMMENDATION_READY', expectedVerdict: 'REPLACE', deterministic: true },
  { id: 'replace-now-low', description: 'A supported low-confidence source remains a transparent projection.', portStates: [state({ verdict: 'REPLACE', confidenceLabel: 'LOW', reasonCodes: ['SOURCE_VERDICT_REPLACE_NOW'] })], expectedPhase: 'RECOMMENDATION_READY', expectedVerdict: 'REPLACE', deterministic: true },
  { id: 'repair-monitor-high', description: 'REPAIR_AND_MONITOR maps to REPAIR.', portStates: [state({ verdict: 'REPAIR', confidenceLabel: 'HIGH', reasonCodes: ['SOURCE_VERDICT_REPAIR_AND_MONITOR'] })], expectedPhase: 'RECOMMENDATION_READY', expectedVerdict: 'REPAIR', deterministic: true },
  { id: 'repair-only-medium', description: 'REPAIR_ONLY maps to REPAIR.', portStates: [state({ verdict: 'REPAIR', confidenceLabel: 'MEDIUM', reasonCodes: ['SOURCE_VERDICT_REPAIR_ONLY'] })], expectedPhase: 'RECOMMENDATION_READY', expectedVerdict: 'REPAIR', deterministic: true },
  { id: 'repair-monitor-low', description: 'Low-confidence supported repair remains explicit.', portStates: [state({ verdict: 'REPAIR', confidenceLabel: 'LOW', reasonCodes: ['SOURCE_VERDICT_REPAIR_AND_MONITOR'] })], expectedPhase: 'RECOMMENDATION_READY', expectedVerdict: 'REPAIR', deterministic: true },
  { id: 'repair-only-high', description: 'High-confidence repair projection is ready.', portStates: [state({ verdict: 'REPAIR', confidenceLabel: 'HIGH', reasonCodes: ['SOURCE_VERDICT_REPAIR_ONLY'] })], expectedPhase: 'RECOMMENDATION_READY', expectedVerdict: 'REPAIR', deterministic: true },
  { id: 'abstain-ambiguous', description: 'Multiple active threads must never be guessed between.', portStates: [state({ ambiguous: true, decisionThreadId: null, currentRecommendationSnapshotId: null, contextStatus: null })], expectedPhase: 'ABSTAINED', expectedAbstentionReason: 'AMBIGUOUS_DECISION_THREAD', deterministic: true },
  { id: 'abstain-unsupported', description: 'A source with no supported verdict abstains.', portStates: [state({ verdict: null })], expectedPhase: 'ABSTAINED', expectedAbstentionReason: 'UNSUPPORTED_VERDICT', deterministic: true },
  { id: 'abstain-stale', description: 'A persistently stale projection abstains after bounded retries.', portStates: [state({ contextStatus: 'STALE' })], expectedPhase: 'ABSTAINED', expectedAbstentionReason: 'CONTEXT_UNRESOLVED', deterministic: true },
]);

export const GENERIC_APPLIANCE_SPECIALIST_EVAL_THRESHOLDS = Object.freeze({
  contractVersion: '1.0.0',
  fixtureCorpusVersion: 'generic-appliance-specialist-fixtures@1.0.0',
  baselineMeasurement: { sampleSize: 10, abstentionRate: 0.3, deterministicCompletionRate: 1, llmInvocationRate: 0 },
  sampleSizeMinimum: 10,
  measurementWindow: 'CHECKED_IN_FIXTURE_CORPUS_PER_CI_RUN',
  failureAction: 'FAIL_CI_AND_REVOKE_GENERIC_APPLIANCE_ADMISSION',
  abstentionBand: { min: 0.2, max: 0.5 },
  minDeterministicCompletionRate: 1,
  requireZeroLlmInvocations: true,
});
