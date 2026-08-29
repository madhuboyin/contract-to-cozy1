// apps/backend/src/services/agents/agentRuntime.service.ts
//
// §7.3.1-3: the typed-operation entry point for the Phase 2 agent runtime.
// Every operation re-authorizes property access through the canonical
// resolver (NOT requestingAgentId) and verifies the AgentState CAS version.
// A resume pins the originating definition version — a paused run never
// silently upgrades to a newer active version.
//
// IPD-007: AgentRun is an immutable terminal insert; concurrency is the
// separate AgentRunReservation. A paused run = terminal AgentRun(PAUSED) +
// one live AgentState (CAS-versioned).

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { selectHvacDecisionThread } from '../decisionPlatform/decisionThreadService';
import { getAgentDefinition } from './agentDefinitionRegistry';
import { digestAgentDefinition } from './agentRegistryValidation';
import {
  claimAgentRunReservation,
  getAgentRunById,
  writeTerminalAgentRun,
} from './agentRunRepository';
import {
  compareAndSwapAgentState,
  createAgentState,
  loadAgentStateByRun,
  resolveAgentState,
} from './agentStateRepository';
import { recordToolInvocation } from './agentInvocationAudit.service';
import type { NarrationProvider } from './agentLlmPurpose.contract';
import type { AgentPropertyContextReader } from './agentPropertyContext.service';
import type { PendingToolInvocation } from './agentRuntime.contract';
import { recordAgentOperation, recordAgentRunOutcome } from './agentMetrics.service';
import { runHvacSpecialist, type SpecialistThreadPort } from './hvacRepairReplaceSpecialist.service';
import { applyHvacSpecialistContextIntake } from './hvacSpecialistContextIntake';
import { ACCEPTED_INTAKE_KEYS } from './specialistTypedClaims';
import type {
  AgentRunStatusProjection,
  AgentRuntimeInvocation,
  AgentRuntimeResult,
} from './agentRuntime.contract';
import type { SpecialistBudgets } from './specialistToolSelection';

const SPECIALIST_AGENT_ID = 'hvac-repair-replace-specialist';
const SPECIALIST_TRIGGER = 'HOME_ACTION_ENGAGEMENT' as const;
const STATE_SHAPE = 'agent.hvac-repair-replace.state@1.0.0';
const PAUSE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days to respond before the pause is abandoned.

export class AgentRuntimeAuthorizationError extends Error {
  constructor() { super('Property not found or access denied.'); this.name = 'AgentRuntimeAuthorizationError'; }
}
export class AgentRuntimeCasConflictError extends Error {
  constructor() { super('Agent state changed since it was last read; reload and retry.'); this.name = 'AgentRuntimeCasConflictError'; }
}
export class AgentRuntimeStateError extends Error {
  constructor(message: string) { super(message); this.name = 'AgentRuntimeStateError'; }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function deploymentRevision(): string {
  return process.env.DEPLOYMENT_REVISION ?? process.env.RENDER_GIT_COMMIT ?? process.env.GIT_SHA ?? 'UNSPECIFIED';
}

function budgetsOf(definitionBudgets: {
  maxLoopIterations: number; maxExecutionMsPerRun: number; maxContextFactsPerRun: number;
  maxLLMInvocationsPerRun: number; maxLLMCostPerRunUsd: number;
}): SpecialistBudgets {
  return {
    maxLoopIterations: definitionBudgets.maxLoopIterations,
    maxExecutionMsPerRun: definitionBudgets.maxExecutionMsPerRun,
    maxContextFactsPerRun: definitionBudgets.maxContextFactsPerRun,
    maxLLMInvocationsPerRun: definitionBudgets.maxLLMInvocationsPerRun,
    maxLLMCostPerRunUsd: definitionBudgets.maxLLMCostPerRunUsd,
  };
}

interface PausedRun {
  runId: string;
  agentVersion: string;
  casVersion: number;
  decisionThreadId: string | null;
  pauseExpiresAt: Date;
}

async function findPausedRunForItem(propertyId: string, principalUserId: string, inventoryItemId: string): Promise<PausedRun | null> {
  const selection = await selectHvacDecisionThread(propertyId, inventoryItemId);
  const threadId = selection.kind === 'UNIQUE' ? selection.thread.id : null;
  if (!threadId) return null;
  const run = await prisma.agentRun.findFirst({
    where: {
      agentId: SPECIALIST_AGENT_ID,
      propertyId,
      principalUserId,
      decisionThreadId: threadId,
      outcome: 'PAUSED',
      state: { is: { resolvedAt: null } },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, agentVersion: true, decisionThreadId: true, state: { select: { casVersion: true, pauseExpiresAt: true } } },
  });
  if (!run || !run.state) return null;
  return {
    runId: run.id,
    agentVersion: run.agentVersion,
    casVersion: run.state.casVersion,
    decisionThreadId: run.decisionThreadId,
    pauseExpiresAt: run.state.pauseExpiresAt,
  };
}

async function persistToolInvocations(runId: string, correlationId: string, pending: readonly PendingToolInvocation[]): Promise<void> {
  for (const invocation of pending) {
    await recordToolInvocation({
      runId,
      correlationId,
      sequence: invocation.sequence,
      toolId: invocation.toolId,
      toolVersion: invocation.toolVersion,
      input: invocation.input,
      output: invocation.output,
      outcome: invocation.outcome,
      errorCode: invocation.errorCode,
      startedAt: new Date(invocation.startedAt),
      finishedAt: new Date(invocation.finishedAt),
    });
  }
}

function projectionFor(status: Omit<AgentRunStatusProjection, 'runId' | 'paused' | 'expectedOperation'>, runId: string | null, paused: boolean): AgentRunStatusProjection {
  return {
    ...status,
    runId,
    paused,
    expectedOperation: paused ? (status.phase === 'NEEDS_DOCUMENT' || status.phase === 'NEEDS_CONTEXT' ? 'SUBMIT_CONTEXT' : 'GET_STATUS') : null,
  };
}

export interface AgentRuntimeDependencies {
  threadPort?: SpecialistThreadPort;
  /** §7.3: SUBMIT_CONTEXT delegates the real inventory/quote/fact write here. */
  contextIntakeHandler?: (input: {
    propertyId: string; principalUserId: string; inventoryItemId: string; intake: Readonly<Record<string, unknown>>;
  }) => Promise<void>;
  /** §7.3.2 authorization seam — defaults to the canonical property-access resolver. */
  authorize?: (principalUserId: string, propertyId: string) => Promise<boolean>;
  /** Live paused-run lookup seam — defaults to the DecisionThread-scoped query. */
  resolvePausedRun?: (propertyId: string, principalUserId: string, inventoryItemId: string) => Promise<PausedRun | null>;
  /** §7.3.7 property-context authorization gate — defaults to getPropertyContext. */
  contextReader?: AgentPropertyContextReader;
  /** §7.3.9 governed narration — default null keeps EXPLAIN fully deterministic. */
  narrationProvider?: NarrationProvider | null;
  now?: () => Date;
}

// PR 11: SUBMIT_CONTEXT's fact writes go through the existing
// InventoryService.updateItem path (which owns HVAC thread staleness).
const DEFAULT_INTAKE: NonNullable<AgentRuntimeDependencies['contextIntakeHandler']> = applyHvacSpecialistContextIntake;

export async function invokeAgentRuntime(
  invocation: AgentRuntimeInvocation,
  deps: AgentRuntimeDependencies = {},
): Promise<AgentRuntimeResult> {
  const now = deps.now ?? (() => new Date());
  const intakeHandler = deps.contextIntakeHandler ?? DEFAULT_INTAKE;

  // §7.3.2 — real principal, canonical resolver. requestingAgentId is never authz.
  const authorize = deps.authorize ?? (async (userId, propertyId) => Boolean(await resolvePropertyAccess(userId, propertyId)));
  if (!await authorize(invocation.principalUserId, invocation.propertyId)) {
    recordAgentOperation(SPECIALIST_AGENT_ID, invocation.operation, 'DENIED');
    throw new AgentRuntimeAuthorizationError();
  }

  const resolvePaused = deps.resolvePausedRun ?? findPausedRunForItem;
  const rawPaused = await resolvePaused(invocation.propertyId, invocation.principalUserId, invocation.inventoryItemId);
  const nowDate = now();

  // §7.5 expiry: a pause the homeowner never returned to is abandoned. A new
  // START_OR_RESUME resolves the stale state and begins a fresh episode;
  // SUBMIT_CONTEXT against it fails closed with a clear message.
  const expired = Boolean(rawPaused && rawPaused.pauseExpiresAt.getTime() <= nowDate.getTime());
  let paused = rawPaused;
  if (expired && rawPaused) {
    if (invocation.operation === 'SUBMIT_CONTEXT') {
      throw new AgentRuntimeStateError('This repair-or-replace session expired. Start it again to continue.');
    }
    if (invocation.operation === 'START_OR_RESUME') {
      await resolveAgentState(rawPaused.runId, rawPaused.casVersion, nowDate);
      paused = null;
    }
  }

  if (invocation.operation === 'GET_STATUS') {
    const result = await readStatus(invocation, paused);
    recordAgentOperation(SPECIALIST_AGENT_ID, 'GET_STATUS', 'OK');
    return result;
  }

  if (invocation.operation === 'DISPUTE_INPUT') {
    return disputeInput(invocation, paused, nowDate);
  }

  if (invocation.operation === 'SUBMIT_CONTEXT') {
    if (!paused) throw new AgentRuntimeStateError('No paused HVAC Specialist run is awaiting context for this system.');
    assertCas(invocation, paused);
    const intake = invocation.contextIntake ?? {};
    const unknownKeys = Object.keys(intake).filter((key) => !ACCEPTED_INTAKE_KEYS.has(key));
    if (unknownKeys.length) throw new AgentRuntimeStateError(`Unsupported context keys: ${unknownKeys.join(', ')}`);
    await intakeHandler({
      propertyId: invocation.propertyId,
      principalUserId: invocation.principalUserId,
      inventoryItemId: invocation.inventoryItemId,
      intake,
    });
    return advanceRun({ invocation, paused, deps, now: nowDate });
  }

  // START_OR_RESUME
  return advanceRun({ invocation, paused, deps, now: nowDate });
}

function assertCas(invocation: AgentRuntimeInvocation, paused: PausedRun): void {
  if (invocation.expectedCasVersion !== undefined && invocation.expectedCasVersion !== paused.casVersion) {
    recordAgentOperation(SPECIALIST_AGENT_ID, invocation.operation, 'CAS_CONFLICT');
    throw new AgentRuntimeCasConflictError();
  }
}

async function readStatus(invocation: AgentRuntimeInvocation, paused: PausedRun | null): Promise<AgentRuntimeResult> {
  if (paused) {
    const run = await getAgentRunById(paused.runId);
    const state = await loadAgentStateByRun(paused.runId);
    const snapshot = (state?.serializedStateJson ?? {}) as Partial<AgentRunStatusProjection>;
    return {
      mutated: false,
      status: projectionFor({
        agentId: SPECIALIST_AGENT_ID,
        agentVersion: paused.agentVersion,
        phase: snapshot.phase ?? 'WORKING',
        decisionThreadId: run?.decisionThreadId ?? paused.decisionThreadId,
        currentRecommendationSnapshotId: snapshot.currentRecommendationSnapshotId ?? null,
        verdict: snapshot.verdict ?? null,
        confidenceLabel: snapshot.confidenceLabel ?? null,
        outstanding: snapshot.outstanding ?? [],
        explanation: snapshot.explanation ?? [],
        abstentionReason: null,
      }, paused.runId, true),
    };
  }
  const def = getAgentDefinition(SPECIALIST_AGENT_ID)!;
  return {
    mutated: false,
    status: projectionFor({
      agentId: SPECIALIST_AGENT_ID,
      agentVersion: def.version,
      phase: 'WORKING',
      decisionThreadId: null,
      currentRecommendationSnapshotId: null,
      verdict: null,
      confidenceLabel: null,
      outstanding: [],
      explanation: [],
      abstentionReason: null,
    }, null, false),
  };
}

async function disputeInput(invocation: AgentRuntimeInvocation, paused: PausedRun | null, now: Date): Promise<AgentRuntimeResult> {
  // v1: a dispute is recorded as bounded audit against the run (if one exists)
  // and surfaces the correction path; it does not mutate canonical decision
  // state — the homeowner corrects the underlying record, which marks the
  // thread stale through the existing fact-correction path.
  if (paused && invocation.dispute) {
    await recordToolInvocation({
      runId: paused.runId,
      correlationId: randomUUID(),
      sequence: 0,
      toolId: 'DISPUTE_INPUT',
      toolVersion: '1.0',
      input: { key: invocation.dispute.key },
      outcome: 'OK',
      startedAt: now,
      finishedAt: now,
    });
  }
  recordAgentOperation(SPECIALIST_AGENT_ID, 'DISPUTE_INPUT', 'OK');
  return readStatus(invocation, paused);
}

async function advanceRun(args: {
  invocation: AgentRuntimeInvocation;
  paused: PausedRun | null;
  deps: AgentRuntimeDependencies;
  now: Date;
}): Promise<AgentRuntimeResult> {
  const { invocation, paused, deps, now } = args;

  // §7.3.3 — resume pins the originating version; a fresh start uses active.
  const version = paused?.agentVersion;
  const definition = getAgentDefinition(SPECIALIST_AGENT_ID, version);
  if (!definition) throw new AgentRuntimeStateError(`Pinned agent version ${version ?? 'active'} is not registered.`);
  const digest = digestAgentDefinition(definition);

  const startedAt = now;
  const invocationCorrelationId = randomUUID();
  const specialist = await runHvacSpecialist({
    propertyId: invocation.propertyId,
    principalUserId: invocation.principalUserId,
    requestingAgentId: invocation.requestingAgentId,
    inventoryItemId: invocation.inventoryItemId,
    agentVersion: definition.version,
    budgets: budgetsOf(definition.budgets),
    homeActionId: invocation.homeActionId,
    askExecutionId: invocation.askExecutionId,
  }, {
    port: deps.threadPort,
    contextReader: deps.contextReader,
    narrationProvider: deps.narrationProvider ?? null,
  });
  const finishedAt = new Date();

  if (paused) {
    // Resume path: advance or resolve the existing paused run's state.
    // §7.3.5 — this invocation's tool calls join the original run's audit trail.
    await persistToolInvocations(paused.runId, invocationCorrelationId, specialist.toolInvocations);
    if (specialist.disposition === 'PAUSE') {
      const swap = await compareAndSwapAgentState({
        runId: paused.runId,
        expectedCasVersion: paused.casVersion,
        serializedState: asJson(specialist.status),
        expectedEvent: 'SUBMIT_CONTEXT',
        pauseExpiresAt: new Date(now.getTime() + PAUSE_TTL_MS),
      });
      if (!swap.swapped) throw new AgentRuntimeCasConflictError();
      recordAgentRunOutcome(SPECIALIST_AGENT_ID, 'PAUSED');
      return { mutated: true, status: projectionFor(specialist.status, paused.runId, true) };
    }
    const consumed = await resolveAgentState(paused.runId, paused.casVersion, finishedAt);
    if (!consumed) throw new AgentRuntimeCasConflictError();
    recordAgentRunOutcome(SPECIALIST_AGENT_ID, specialist.status.phase);
    // The terminal AgentRun for a resumed run was already written when it first
    // paused (outcome PAUSED). The canonical outcome now lives on the
    // DecisionThread; the run's audit trail is complete.
    return { mutated: true, status: projectionFor(specialist.status, paused.runId, false) };
  }

  // Fresh episode: reserve, run, write exactly one terminal AgentRun.
  const episodeDay = now.toISOString().slice(0, 10);
  const idempotencyKey = `${SPECIALIST_AGENT_ID}:${definition.version}:${invocation.propertyId}:${invocation.inventoryItemId}:${episodeDay}`;
  const correlationId = randomUUID();
  const reservation = await claimAgentRunReservation({
    idempotencyKey,
    agentId: SPECIALIST_AGENT_ID,
    agentVersion: definition.version,
    trigger: SPECIALIST_TRIGGER,
    principalUserId: invocation.principalUserId,
    propertyId: invocation.propertyId,
    decisionThreadId: specialist.status.decisionThreadId,
    correlationId,
  }, now);

  if (!reservation.claimed && reservation.reservation.resultRunId) {
    const existing = await getAgentRunById(reservation.reservation.resultRunId);
    const existingState = existing ? await loadAgentStateByRun(existing.id) : null;
    return {
      mutated: false,
      status: projectionFor(specialist.status, existing?.id ?? null, Boolean(existingState && !existingState.resolvedAt)),
    };
  }

  const outcome = specialist.disposition === 'PAUSE' ? 'PAUSED' : specialist.status.phase === 'RECOMMENDATION_READY' ? 'COMPLETED' : 'ABSTAINED';
  const run = await writeTerminalAgentRun({
    reservationId: reservation.reservation.id,
    idempotencyKey,
    agentId: SPECIALIST_AGENT_ID,
    agentVersion: definition.version,
    definitionDigest: digest,
    deploymentRevision: deploymentRevision(),
    trigger: SPECIALIST_TRIGGER,
    correlationId,
    principalUserId: invocation.principalUserId,
    propertyId: invocation.propertyId,
    decisionThreadId: specialist.status.decisionThreadId,
    originHomeActionId: invocation.homeActionId ?? null,
    originAskExecutionId: invocation.askExecutionId ?? null,
    outcome,
    abstentionReason: specialist.status.abstentionReason,
    failureCode: null,
    budgetUsage: {
      contextFactsUsed: specialist.ledger.contextFactsUsed,
      llmInvocationsUsed: specialist.ledger.llmInvocationsUsed,
      llmCostUsdUsed: specialist.ledger.llmCostUsdUsed,
      executionMsUsed: specialist.ledger.elapsedMs,
      loopIterationsUsed: specialist.ledger.loopIterations,
    },
    startedAt,
    finishedAt,
  }, now);

  await persistToolInvocations(run.id, invocationCorrelationId, specialist.toolInvocations);

  if (specialist.disposition === 'PAUSE') {
    await createAgentState({
      runId: run.id,
      agentId: SPECIALIST_AGENT_ID,
      agentVersion: definition.version,
      stateShape: STATE_SHAPE,
      serializedState: asJson(specialist.status),
      expectedEvent: 'SUBMIT_CONTEXT',
      pauseExpiresAt: new Date(now.getTime() + PAUSE_TTL_MS),
    });
    recordAgentRunOutcome(SPECIALIST_AGENT_ID, 'PAUSED');
    recordAgentOperation(SPECIALIST_AGENT_ID, invocation.operation, 'OK');
    return { mutated: true, status: projectionFor(specialist.status, run.id, true) };
  }

  recordAgentRunOutcome(SPECIALIST_AGENT_ID, specialist.status.phase);
  recordAgentOperation(SPECIALIST_AGENT_ID, invocation.operation, 'OK');
  return { mutated: true, status: projectionFor(specialist.status, run.id, false) };
}
