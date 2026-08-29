// apps/backend/src/services/agents/hvacRepairReplaceSpecialist.service.ts
//
// §7.3.6/§7.3.8: the HVAC Specialist drives the canonical decision-family
// adapter (create/resume DecisionThread + immutable RecommendationSnapshot)
// and reads the verdict ONLY from a contextStatus=CURRENT snapshot. It never
// recomputes HVAC scoring and never reads a generic verdict. The bounded
// selectNextTool loop lives in specialistToolSelection; this file wires it to
// the real decision state, the property-context authorization gate (§7.3.7),
// the deterministic typed-claim explanation (§7.3.9), and per-tool audit
// records (§7.3.5, persisted by the runtime once the AgentRun row exists).

import { prisma } from '../../lib/prisma';
import { withTimeout } from '../../lib/aiResilience';
import { hvacDecisionFamilyAdapter } from '../decisionPlatform/decisionThreadService';
import { DecisionFamilyAmbiguousThreadError } from '../decisionPlatform/decisionFamilyAdapter';
import type {
  AgentRunStatusProjection,
  HvacSpecialistHomeActionOrigin,
  PendingLlmInvocation,
  PendingToolInvocation,
} from './agentRuntime.contract';
import { selectTypedClaims } from './specialistTypedClaims';
import { narrateTypedClaims, type NarrationProvider } from './agentLlmPurpose.contract';
import {
  HVAC_SPECIALIST_CONTEXT_SCOPES,
  readAgentPropertyContext,
  type AgentPropertyContextReader,
} from './agentPropertyContext.service';
import {
  emptyLedger,
  budgetExceeded,
  noteToolAttempt,
  selectNextSpecialistStep,
  type SpecialistBudgetLedger,
  type SpecialistBudgets,
  type SpecialistObservation,
} from './specialistToolSelection';
import { recordSpecialistToolInvocation } from './agentMetrics.service';

const SPECIALIST_AGENT_ID = 'hvac-repair-replace-specialist';

export interface SpecialistThreadState {
  ambiguous: boolean;
  decisionThreadId: string | null;
  currentRecommendationSnapshotId: string | null;
  contextStatus: 'CURRENT' | 'STALE' | 'CONFLICTED' | null;
  verdict: 'REPAIR' | 'REPLACE' | 'MONITOR' | null;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reasonCodes: string[];
  limitationCodes: string[];
}

export interface SpecialistThreadPort {
  createOrResume(input: {
    propertyId: string;
    principalUserId: string;
    inventoryItemId: string;
    homeActionOrigin?: HvacSpecialistHomeActionOrigin;
    askExecutionId?: string;
  }): Promise<SpecialistThreadState>;
}

function parseConfidenceLabel(value: unknown): 'HIGH' | 'MEDIUM' | 'LOW' | null {
  if (value && typeof value === 'object') {
    const label = (value as { label?: unknown }).label;
    if (label === 'HIGH' || label === 'MEDIUM' || label === 'LOW') return label;
  }
  return null;
}

const SUPPORTED_VERDICTS = new Set(['REPAIR', 'REPLACE', 'MONITOR']);

/** Default port: the canonical HVAC decision-family adapter + snapshot read. */
export const defaultThreadPort: SpecialistThreadPort = {
  async createOrResume(input) {
    let lineage;
    try {
      lineage = await hvacDecisionFamilyAdapter.createOrResumeThread({
        propertyId: input.propertyId,
        userId: input.principalUserId,
        primaryEntityId: input.inventoryItemId,
        askExecutionId: input.askExecutionId,
        homeActionOrigin: input.homeActionOrigin,
      });
    } catch (error) {
      if (error instanceof DecisionFamilyAmbiguousThreadError) {
        return {
          ambiguous: true,
          decisionThreadId: null,
          currentRecommendationSnapshotId: null,
          contextStatus: null,
          verdict: null,
          confidenceLabel: null,
          reasonCodes: [],
          limitationCodes: [],
        };
      }
      throw error;
    }

    const snapshot = lineage.currentRecommendationSnapshotId
      ? await prisma.recommendationSnapshot.findUnique({
        where: { id: lineage.currentRecommendationSnapshotId },
        select: { verdictCode: true, reasonCodes: true, limitationCodes: true, confidenceBreakdown: true },
      })
      : null;

    const verdict = snapshot && SUPPORTED_VERDICTS.has(snapshot.verdictCode)
      ? (snapshot.verdictCode as 'REPAIR' | 'REPLACE' | 'MONITOR')
      : null;

    return {
      ambiguous: false,
      decisionThreadId: lineage.decisionThreadId,
      currentRecommendationSnapshotId: lineage.currentRecommendationSnapshotId,
      contextStatus: lineage.contextStatus,
      verdict,
      confidenceLabel: parseConfidenceLabel(snapshot?.confidenceBreakdown),
      reasonCodes: snapshot?.reasonCodes ?? [],
      limitationCodes: [...new Set([...(snapshot?.limitationCodes ?? []), ...lineage.limitationCodes])],
    };
  },
};

export interface RunSpecialistInput {
  propertyId: string;
  principalUserId: string;
  requestingAgentId: string;
  inventoryItemId: string;
  agentVersion: string;
  budgets: SpecialistBudgets;
  homeActionOrigin?: HvacSpecialistHomeActionOrigin;
  askExecutionId?: string;
  initialLedger?: SpecialistBudgetLedger;
  env?: NodeJS.ProcessEnv;
}

export interface SpecialistRunDependencies {
  port: SpecialistThreadPort;
  contextReader: AgentPropertyContextReader;
  narrationProvider: NarrationProvider | null;
}

const DEFAULT_RUN_DEPS: SpecialistRunDependencies = {
  port: defaultThreadPort,
  contextReader: readAgentPropertyContext,
  narrationProvider: null,
};

export interface SpecialistRunResult {
  status: Omit<AgentRunStatusProjection, 'runId' | 'paused' | 'casVersion' | 'expectedOperation'>;
  ledger: SpecialistBudgetLedger;
  /** PAUSE => the runtime persists an AgentState; TERMINAL => it writes a terminal AgentRun. */
  disposition: 'PAUSE' | 'TERMINAL';
  /** §7.3.5 — one per tool call; the runtime persists these against the run id. */
  toolInvocations: PendingToolInvocation[];
  llmInvocations: PendingLlmInvocation[];
  usedLlm: boolean;
}

export async function runHvacSpecialist(
  input: RunSpecialistInput,
  deps: Partial<SpecialistRunDependencies> = {},
): Promise<SpecialistRunResult> {
  const { port, contextReader, narrationProvider } = { ...DEFAULT_RUN_DEPS, ...deps };
  const ledger = input.initialLedger ? {
    ...input.initialLedger,
    toolAttempts: { ...input.initialLedger.toolAttempts },
  } : emptyLedger();
  const toolInvocations: PendingToolInvocation[] = [];
  const llmInvocations: PendingLlmInvocation[] = [];
  let seq = 0;
  const startedAt = Date.now();
  const priorElapsedMs = ledger.elapsedMs;

  const record = (
    toolId: PendingToolInvocation['toolId'],
    outcome: PendingToolInvocation['outcome'],
    detail: { input: unknown; output?: unknown; errorCode?: string | null; at: number },
  ): void => {
    toolInvocations.push({
      sequence: seq++,
      toolId,
      toolVersion: '1.0',
      input: detail.input,
      output: detail.output,
      outcome,
      errorCode: detail.errorCode ?? null,
      startedAt: new Date(detail.at).toISOString(),
      finishedAt: new Date().toISOString(),
    });
    recordSpecialistToolInvocation(SPECIALIST_AGENT_ID, toolId, outcome);
  };

  const terminal = (
    status: SpecialistRunResult['status'],
    disposition: SpecialistRunResult['disposition'],
    usedLlm: boolean,
  ): SpecialistRunResult => ({ status, disposition, ledger, toolInvocations, llmInvocations, usedLlm });

  const base = {
    agentId: SPECIALIST_AGENT_ID,
    agentVersion: input.agentVersion,
  };

  // §7.3.7 — the agent's context access goes through getPropertyContext with
  // the real resolved-owner user ID. Defense in depth over the runtime's own
  // property-access check; also the point the boundary test verifies.
  const gateAt = startedAt;
  const remainingMs = Math.max(1, input.budgets.maxExecutionMsPerRun - ledger.elapsedMs);
  const context = await withTimeout(() => contextReader({
    propertyId: input.propertyId,
    principalUserId: input.principalUserId,
    requestingAgentId: input.requestingAgentId,
    scopes: HVAC_SPECIALIST_CONTEXT_SCOPES,
    maxFacts: Math.max(0, input.budgets.maxContextFactsPerRun - ledger.contextFactsUsed),
  }), { timeoutMs: remainingMs, operation: 'agent.hvac.property-context' });
  if (!context.authorized) {
    record('REQUEST_CONTEXT', 'FAILED', { input: { scopes: HVAC_SPECIALIST_CONTEXT_SCOPES }, errorCode: 'CONTEXT_UNAUTHORIZED', at: gateAt });
    return terminal({
      ...base,
      phase: 'ABSTAINED',
      decisionThreadId: null,
      currentRecommendationSnapshotId: null,
      verdict: null,
      confidenceLabel: null,
      outstanding: [],
      explanation: [],
      abstentionReason: 'CONTEXT_UNAUTHORIZED',
    }, 'TERMINAL', false);
  }

  ledger.contextFactsUsed += Object.keys(context.snapshot?.facts ?? {}).length;

  let resumeCount = 0;
  let state = await withTimeout(() => port.createOrResume(input), {
    timeoutMs: Math.max(1, input.budgets.maxExecutionMsPerRun - ledger.elapsedMs),
    operation: 'agent.hvac.create-or-resume-thread',
  });

  for (;;) {
    ledger.loopIterations += 1;
    ledger.elapsedMs = priorElapsedMs + (Date.now() - startedAt);

    const exceeded = budgetExceeded(ledger, input.budgets);
    if (exceeded) {
      return terminal({
        ...base,
        phase: 'ABSTAINED',
        decisionThreadId: state.decisionThreadId,
        currentRecommendationSnapshotId: state.currentRecommendationSnapshotId,
        verdict: null,
        confidenceLabel: state.confidenceLabel,
        outstanding: [],
        explanation: [],
        abstentionReason: exceeded,
      }, 'TERMINAL', llmInvocations.length > 0);
    }

    const observation: SpecialistObservation = {
      ambiguous: state.ambiguous,
      contextStatus: state.contextStatus,
      verdict: state.verdict,
      confidenceLabel: state.confidenceLabel,
      reasonCodes: state.reasonCodes,
      limitationCodes: state.limitationCodes,
      resumeCount,
    };

    const step = selectNextSpecialistStep(observation, ledger, input.budgets);
    const stepAt = Date.now();

    if (step.kind === 'RESUME_THREAD') {
      resumeCount += 1;
      const backoffMs = Math.max(0, input.budgets.retryBackoffMs ?? 0) * resumeCount;
      if (backoffMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
      state = await withTimeout(() => port.createOrResume(input), {
        timeoutMs: Math.max(1, input.budgets.maxExecutionMsPerRun - (priorElapsedMs + (Date.now() - startedAt))),
        operation: 'agent.hvac.resume-thread',
      });
      record('SCORE', 'EMPTY', { input: { action: 'RESUME_THREAD', resumeCount }, at: stepAt });
      continue;
    }

    if (step.kind === 'PAUSE') {
      noteToolAttempt(ledger, step.tool);
      record(step.tool, 'OK', { input: { limitationCodes: state.limitationCodes }, output: { outstanding: step.outstanding.map((o) => o.key) }, at: stepAt });
      return terminal({
        ...base,
        phase: step.phase,
        decisionThreadId: state.decisionThreadId,
        currentRecommendationSnapshotId: state.currentRecommendationSnapshotId,
        verdict: state.verdict,
        confidenceLabel: state.confidenceLabel,
        outstanding: step.outstanding,
        explanation: [],
        abstentionReason: null,
      }, 'PAUSE', false);
    }

    if (step.kind === 'TOOL') {
      noteToolAttempt(ledger, step.tool);
      if (step.tool === 'SCORE') {
        record('SCORE', state.verdict ? 'OK' : 'EMPTY', { input: { snapshotId: state.currentRecommendationSnapshotId }, output: { verdict: state.verdict }, at: stepAt });
        continue;
      }
      // EXPLAIN — deterministic typed claims are authoritative; a governed LLM
      // (when enabled) may only re-select from that closed set.
      const deterministic = selectTypedClaims(state.reasonCodes);
      const hasLlmBudget = Boolean(narrationProvider)
        && ledger.llmInvocationsUsed < input.budgets.maxLLMInvocationsPerRun
        && ledger.llmCostUsdUsed + (narrationProvider?.maxCostUsd ?? 0) <= input.budgets.maxLLMCostPerRunUsd;
      const narrated = await narrateTypedClaims(deterministic, {
        provider: hasLlmBudget ? narrationProvider ?? undefined : undefined,
        env: input.env,
        sequence: llmInvocations.length,
      });
      if (narrated.usedLlm) {
        ledger.llmInvocationsUsed += 1;
        ledger.llmCostUsdUsed += narrated.costUsd;
      }
      if (narrated.invocation) llmInvocations.push(narrated.invocation);
      record('EXPLAIN', narrated.claims.length ? 'OK' : 'EMPTY', {
        input: { reasonCodes: state.reasonCodes },
        output: { claimIds: narrated.claims.map((c) => c.claimId), usedLlm: narrated.usedLlm },
        at: stepAt,
      });
      return terminal({
        ...base,
        phase: 'RECOMMENDATION_READY',
        decisionThreadId: state.decisionThreadId,
        currentRecommendationSnapshotId: state.currentRecommendationSnapshotId,
        verdict: state.verdict,
        confidenceLabel: state.confidenceLabel,
        outstanding: [],
        explanation: narrated.claims,
        abstentionReason: null,
      }, 'TERMINAL', narrated.usedLlm);
    }

    // TERMINAL — abstain (or, defensively, a ready phase with no verdict).
    const readyClaims = step.phase === 'RECOMMENDATION_READY' ? selectTypedClaims(state.reasonCodes) : [];
    record(step.phase === 'RECOMMENDATION_READY' ? 'EXPLAIN' : 'SCORE', 'ABSTAINED', {
      input: { reason: step.abstentionReason }, at: stepAt,
    });
    return terminal({
      ...base,
      phase: step.phase,
      decisionThreadId: state.decisionThreadId,
      currentRecommendationSnapshotId: state.currentRecommendationSnapshotId,
      verdict: step.phase === 'RECOMMENDATION_READY' ? state.verdict : null,
      confidenceLabel: state.confidenceLabel,
      outstanding: [],
      explanation: readyClaims,
      abstentionReason: step.abstentionReason,
    }, 'TERMINAL', false);
  }
}
