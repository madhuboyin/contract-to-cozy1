// apps/backend/src/services/agents/specialistToolSelection.ts
//
// §7.3.4/§7.3.5: the bounded selectNextTool loop for the HVAC Specialist.
// Pure decision logic over a compact observation of the canonical decision
// state plus a mutable budget ledger. It never scores HVAC itself and never
// reads a generic verdict — `observation` is derived only from the
// authoritative RecommendationSnapshot. Abstention is a first-class outcome.

import type {
  AgentAbstentionReason,
  AgentContextRequestItem,
  AgentRunPhase,
  HvacSpecialistTool,
} from './agentRuntime.contract';
import { selectOutstanding } from './specialistTypedClaims';

export interface SpecialistBudgets {
  maxLoopIterations: number;
  maxExecutionMsPerRun: number;
  maxContextFactsPerRun: number;
  maxLLMInvocationsPerRun: number;
  maxLLMCostPerRunUsd: number;
  maxToolAttempts?: number;
  retryBackoffMs?: number;
}

export interface SpecialistBudgetLedger {
  loopIterations: number;
  elapsedMs: number;
  contextFactsUsed: number;
  llmInvocationsUsed: number;
  llmCostUsdUsed: number;
  toolAttempts: Partial<Record<HvacSpecialistTool, number>>;
}

export function emptyLedger(): SpecialistBudgetLedger {
  return { loopIterations: 0, elapsedMs: 0, contextFactsUsed: 0, llmInvocationsUsed: 0, llmCostUsdUsed: 0, toolAttempts: {} };
}

export const MAX_ATTEMPTS_PER_TOOL = 2;

export interface SpecialistObservation {
  ambiguous: boolean;
  contextStatus: 'CURRENT' | 'STALE' | 'CONFLICTED' | null;
  verdict: 'REPAIR' | 'REPLACE' | 'MONITOR' | null;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reasonCodes: readonly string[];
  limitationCodes: readonly string[];
  /** How many times this invocation has already re-resolved the thread. */
  resumeCount: number;
}

export type SpecialistStep =
  | { kind: 'RESUME_THREAD' }
  | { kind: 'TOOL'; tool: 'SCORE' | 'EXPLAIN' }
  | { kind: 'PAUSE'; tool: 'REQUEST_CONTEXT' | 'REQUEST_DOCUMENT'; phase: Extract<AgentRunPhase, 'NEEDS_CONTEXT' | 'NEEDS_DOCUMENT'>; outstanding: AgentContextRequestItem[] }
  | { kind: 'TERMINAL'; phase: Extract<AgentRunPhase, 'RECOMMENDATION_READY' | 'ABSTAINED'>; abstentionReason: AgentAbstentionReason | null };

export function selectNextSpecialistStep(
  observation: SpecialistObservation,
  ledger: SpecialistBudgetLedger,
  budgets: SpecialistBudgets,
): SpecialistStep {
  if (observation.ambiguous) {
    return { kind: 'TERMINAL', phase: 'ABSTAINED', abstentionReason: 'AMBIGUOUS_DECISION_THREAD' };
  }
  if (ledger.loopIterations >= budgets.maxLoopIterations || ledger.elapsedMs >= budgets.maxExecutionMsPerRun) {
    return { kind: 'TERMINAL', phase: 'ABSTAINED', abstentionReason: 'LOOP_BUDGET_EXHAUSTED' };
  }

  const outstanding = selectOutstanding(observation.limitationCodes);

  // The engine hit only transient lookup timeouts — resume once to retry, then
  // abstain rather than asking the homeowner for something the system knows.
  if (outstanding.transientOnly) {
    if (observation.resumeCount < (budgets.maxToolAttempts ?? MAX_ATTEMPTS_PER_TOOL)) return { kind: 'RESUME_THREAD' };
    return { kind: 'TERMINAL', phase: 'ABSTAINED', abstentionReason: 'TOOL_FAILURE' };
  }

  if (observation.contextStatus !== null && observation.contextStatus !== 'CURRENT') {
    if (observation.resumeCount < (budgets.maxToolAttempts ?? MAX_ATTEMPTS_PER_TOOL)) return { kind: 'RESUME_THREAD' };
    return { kind: 'TERMINAL', phase: 'ABSTAINED', abstentionReason: 'CONTEXT_UNRESOLVED' };
  }

  // Actionable data gaps: pause and ask the homeowner. Documents are asked for
  // only once every fact ask is also outstanding-or-satisfied; facts first.
  if (outstanding.facts.length > 0) {
    return { kind: 'PAUSE', tool: 'REQUEST_CONTEXT', phase: 'NEEDS_CONTEXT', outstanding: outstanding.facts };
  }
  if (outstanding.documents.length > 0) {
    return { kind: 'PAUSE', tool: 'REQUEST_DOCUMENT', phase: 'NEEDS_DOCUMENT', outstanding: outstanding.documents };
  }

  if (observation.verdict === null) {
    return { kind: 'TERMINAL', phase: 'ABSTAINED', abstentionReason: 'UNSUPPORTED_VERDICT' };
  }

  // SCORE is satisfied by the authoritative snapshot; EXPLAIN composes the
  // deterministic typed-claim explanation. Both count as tool attempts.
  const scoreAttempts = ledger.toolAttempts.SCORE ?? 0;
  if (scoreAttempts === 0) return { kind: 'TOOL', tool: 'SCORE' };
  return { kind: 'TOOL', tool: 'EXPLAIN' };
}

export function noteToolAttempt(ledger: SpecialistBudgetLedger, tool: HvacSpecialistTool): void {
  ledger.toolAttempts[tool] = (ledger.toolAttempts[tool] ?? 0) + 1;
}

export function budgetExceeded(ledger: SpecialistBudgetLedger, budgets: SpecialistBudgets): AgentAbstentionReason | null {
  if (ledger.contextFactsUsed > budgets.maxContextFactsPerRun) return 'CONTEXT_UNRESOLVED';
  if (ledger.llmInvocationsUsed > budgets.maxLLMInvocationsPerRun) return 'TOOL_FAILURE';
  if (ledger.llmCostUsdUsed > budgets.maxLLMCostPerRunUsd) return 'TOOL_FAILURE';
  for (const [tool, attempts] of Object.entries(ledger.toolAttempts)) {
    if ((attempts ?? 0) >= (budgets.maxToolAttempts ?? MAX_ATTEMPTS_PER_TOOL)) {
      void tool;
      return 'LOOP_BUDGET_EXHAUSTED';
    }
  }
  return null;
}
