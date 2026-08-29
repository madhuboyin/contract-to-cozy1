// apps/backend/src/services/agents/hvacRepairReplaceSpecialist.service.ts
//
// §7.3.6/§7.3.8: the HVAC Specialist drives the canonical decision-family
// adapter (create/resume DecisionThread + immutable RecommendationSnapshot)
// and reads the verdict ONLY from a contextStatus=CURRENT snapshot. It never
// recomputes HVAC scoring and never reads a generic verdict. The bounded
// selectNextTool loop lives in specialistToolSelection; this file wires it to
// the real decision state and the deterministic typed-claim explanation.

import { prisma } from '../../lib/prisma';
import { hvacDecisionFamilyAdapter } from '../decisionPlatform/decisionThreadService';
import { DecisionFamilyAmbiguousThreadError } from '../decisionPlatform/decisionFamilyAdapter';
import type { AgentRunStatusProjection } from './agentRuntime.contract';
import { selectTypedClaims } from './specialistTypedClaims';
import {
  emptyLedger,
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
    homeActionId?: string;
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
        homeActionOrigin: undefined,
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
  inventoryItemId: string;
  agentVersion: string;
  budgets: SpecialistBudgets;
  homeActionId?: string;
  askExecutionId?: string;
}

export interface SpecialistRunResult {
  status: Omit<AgentRunStatusProjection, 'runId' | 'paused' | 'expectedOperation'>;
  ledger: SpecialistBudgetLedger;
  /** PAUSE => the runtime persists an AgentState; TERMINAL => it writes a terminal AgentRun. */
  disposition: 'PAUSE' | 'TERMINAL';
}

export async function runHvacSpecialist(
  input: RunSpecialistInput,
  port: SpecialistThreadPort = defaultThreadPort,
): Promise<SpecialistRunResult> {
  const ledger = emptyLedger();
  const startedAt = Date.now();
  let resumeCount = 0;
  let state = await port.createOrResume(input);

  for (;;) {
    ledger.loopIterations += 1;
    ledger.elapsedMs = Date.now() - startedAt;

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

    if (step.kind === 'RESUME_THREAD') {
      resumeCount += 1;
      state = await port.createOrResume(input);
      continue;
    }

    if (step.kind === 'PAUSE') {
      noteToolAttempt(ledger, step.tool);
      recordSpecialistToolInvocation(SPECIALIST_AGENT_ID, step.tool, 'OK');
      return {
        disposition: 'PAUSE',
        ledger,
        status: {
          agentId: SPECIALIST_AGENT_ID,
          agentVersion: input.agentVersion,
          phase: step.phase,
          decisionThreadId: state.decisionThreadId,
          currentRecommendationSnapshotId: state.currentRecommendationSnapshotId,
          verdict: state.verdict,
          confidenceLabel: state.confidenceLabel,
          outstanding: step.outstanding,
          explanation: [],
          abstentionReason: null,
        },
      };
    }

    if (step.kind === 'TOOL') {
      noteToolAttempt(ledger, step.tool);
      if (step.tool === 'SCORE') {
        recordSpecialistToolInvocation(SPECIALIST_AGENT_ID, 'SCORE', state.verdict ? 'OK' : 'EMPTY');
        continue;
      }
      // EXPLAIN — deterministic typed-claim composition (LLM-optional; none in v1).
      const explanation = selectTypedClaims(state.reasonCodes);
      recordSpecialistToolInvocation(SPECIALIST_AGENT_ID, 'EXPLAIN', explanation.length ? 'OK' : 'EMPTY');
      return {
        disposition: 'TERMINAL',
        ledger,
        status: {
          agentId: SPECIALIST_AGENT_ID,
          agentVersion: input.agentVersion,
          phase: 'RECOMMENDATION_READY',
          decisionThreadId: state.decisionThreadId,
          currentRecommendationSnapshotId: state.currentRecommendationSnapshotId,
          verdict: state.verdict,
          confidenceLabel: state.confidenceLabel,
          outstanding: [],
          explanation,
          abstentionReason: null,
        },
      };
    }

    // TERMINAL — abstain (or, defensively, a ready phase with no verdict).
    return {
      disposition: 'TERMINAL',
      ledger,
      status: {
        agentId: SPECIALIST_AGENT_ID,
        agentVersion: input.agentVersion,
        phase: step.phase,
        decisionThreadId: state.decisionThreadId,
        currentRecommendationSnapshotId: state.currentRecommendationSnapshotId,
        verdict: step.phase === 'RECOMMENDATION_READY' ? state.verdict : null,
        confidenceLabel: state.confidenceLabel,
        outstanding: [],
        explanation: step.phase === 'RECOMMENDATION_READY' ? selectTypedClaims(state.reasonCodes) : [],
        abstentionReason: step.abstentionReason,
      },
    };
  }
}
