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

import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { getHomeActionFeed } from '../homeActions.service';
import { selectHvacDecisionThread } from '../decisionPlatform/decisionThreadService';
import { getAgentDefinition } from './agentDefinitionRegistry';
import { digestAgentDefinition } from './agentRegistryValidation';
import {
  claimAgentRunReservation,
  commitAgentRunEpisode,
  getAgentRunById,
  getAgentRunReservationById,
  getLatestAgentRunForSubject,
} from './agentRunRepository';
import {
  compareAndSwapAgentState,
  loadAgentStateByRun,
  resolveAgentState,
} from './agentStateRepository';
import { recordToolInvocation } from './agentInvocationAudit.service';
import type { NarrationProvider } from './agentLlmPurpose.contract';
import type { AgentPropertyContextReader } from './agentPropertyContext.service';
import { recordAgentOperation, recordAgentRunOutcome } from './agentMetrics.service';
import { createSpecialistThreadPort, runHvacSpecialist, type SpecialistThreadPort } from './hvacRepairReplaceSpecialist.service';
import { applyHvacSpecialistContextIntake } from './hvacSpecialistContextIntake';
import { REPAIR_REPLACE_PROFILES, type RepairReplaceProfile } from './repairReplaceProfileRegistry';
import { ACCEPTED_INTAKE_KEYS, DISPUTABLE_INPUT_KEYS } from './specialistTypedClaims';
import type {
  AgentRunStatusProjection,
  AgentRuntimeInvocation,
  AgentRuntimeResult,
} from './agentRuntime.contract';
import type { SpecialistBudgetLedger, SpecialistBudgets } from './specialistToolSelection';

const SPECIALIST_AGENT_ID = 'hvac-repair-replace-specialist';
const SPECIALIST_TRIGGER = 'HOME_ACTION_ENGAGEMENT' as const;
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
export class AgentRuntimeDisabledError extends Error {
  constructor() { super('The Repair-or-Replace Specialist is currently unavailable.'); this.name = 'AgentRuntimeDisabledError'; }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function resolveAgentDeploymentRevision(env: NodeJS.ProcessEnv = process.env): string {
  const revision = (env.DEPLOYMENT_REVISION ?? env.RENDER_GIT_COMMIT ?? env.GIT_SHA)?.trim();
  if (!revision || revision.toUpperCase() === 'UNSPECIFIED') {
    throw new AgentRuntimeStateError('The Specialist cannot start without a concrete deployment revision.');
  }
  return revision;
}

function budgetsOf(definitionBudgets: {
  maxLoopIterations: number; maxExecutionMsPerRun: number; maxContextFactsPerRun: number;
  maxLLMInvocationsPerRun: number; maxLLMCostPerRunUsd: number;
}, retryPolicy: { maxAttempts: number; backoffMs: number }): SpecialistBudgets {
  return {
    maxLoopIterations: definitionBudgets.maxLoopIterations,
    maxExecutionMsPerRun: definitionBudgets.maxExecutionMsPerRun,
    maxContextFactsPerRun: definitionBudgets.maxContextFactsPerRun,
    maxLLMInvocationsPerRun: definitionBudgets.maxLLMInvocationsPerRun,
    maxLLMCostPerRunUsd: definitionBudgets.maxLLMCostPerRunUsd,
    maxToolAttempts: retryPolicy.maxAttempts,
    retryBackoffMs: retryPolicy.backoffMs,
  };
}

interface PausedRun {
  runId: string;
  agentVersion: string;
  casVersion: number;
  decisionThreadId: string | null;
  pauseExpiresAt: Date;
  serializedState: unknown;
  expectedEvent: string;
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
    select: { id: true, agentVersion: true, decisionThreadId: true, state: { select: { casVersion: true, pauseExpiresAt: true, serializedStateJson: true, expectedEvent: true } } },
  });
  if (!run || !run.state) return null;
  return {
    runId: run.id,
    agentVersion: run.agentVersion,
    casVersion: run.state.casVersion,
    decisionThreadId: run.decisionThreadId,
    pauseExpiresAt: run.state.pauseExpiresAt,
    serializedState: run.state.serializedStateJson,
    expectedEvent: run.state.expectedEvent,
  };
}

function projectionFor(
  status: Omit<AgentRunStatusProjection, 'runId' | 'paused' | 'casVersion' | 'expectedOperation'>,
  runId: string | null,
  paused: boolean,
  casVersion: number | null = null,
): AgentRunStatusProjection {
  return {
    ...status,
    runId,
    paused,
    casVersion: paused ? casVersion : null,
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
  resolveLatestRun?: typeof getLatestAgentRunForSubject;
  resolveRunById?: typeof getAgentRunById;
  resolveStateByRun?: typeof loadAgentStateByRun;
  resolveReservation?: typeof getAgentRunReservationById;
  recoverPausedState?: typeof compareAndSwapAgentState;
  recordDispute?: typeof recordToolInvocation;
  /** §7.3.7 property-context authorization gate — defaults to getPropertyContext. */
  contextReader?: AgentPropertyContextReader;
  /** §7.3.9 governed narration — default null keeps EXPLAIN fully deterministic. */
  narrationProvider?: NarrationProvider | null;
  deploymentRevision?: () => string;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  verifyHomeActionOrigin?: (input: {
    propertyId: string;
    principalUserId: string;
    inventoryItemId: string;
    origin: NonNullable<AgentRuntimeInvocation['homeActionOrigin']>;
    decisionDefinitionId: RepairReplaceProfile['decisionDefinitionId'];
  }) => Promise<boolean>;
}

function enabled(definition: NonNullable<ReturnType<typeof getAgentDefinition>>, env: NodeJS.ProcessEnv): boolean {
  const truthy = (value: string | undefined) => ['1', 'true', 'on', 'yes'].includes((value ?? '').trim().toLowerCase());
  return definition.releaseState === 'ENABLED' && truthy(env[definition.featureFlag]) && !truthy(env[definition.killSwitch]);
}

async function verifyCanonicalHomeActionOrigin(input: {
  propertyId: string;
  principalUserId: string;
  inventoryItemId: string;
  origin: NonNullable<AgentRuntimeInvocation['homeActionOrigin']>;
  decisionDefinitionId: RepairReplaceProfile['decisionDefinitionId'];
}): Promise<boolean> {
  const feed = await getHomeActionFeed(input.propertyId, input.principalUserId);
  return feed.actions.some((action) => action.id === input.origin.homeActionId
    && action.lineageId === input.origin.lineageId
    && action.source.entityId === input.origin.sourceEntityId
    && action.source.version === input.origin.sourceVersion
    && action.decisionLineage?.decisionDefinitionId === input.decisionDefinitionId
    && action.decisionLineage.primaryEntityId === input.inventoryItemId);
}

export function resolveSpecialistProfileForLineage(lineageId: string): RepairReplaceProfile {
  const profileId = lineageId.startsWith('appliance-repair-replace:')
    ? 'GENERIC_APPLIANCE'
    : lineageId.startsWith('repair-replace:')
      ? 'HVAC'
      : null;
  if (!profileId) throw new AgentRuntimeStateError('This Home Action does not identify an admitted repair-or-replace profile.');
  const profile = REPAIR_REPLACE_PROFILES.find((candidate) => candidate.profileId === profileId);
  if (!profile) throw new AgentRuntimeStateError(`Repair-or-Replace profile ${profileId} is not registered.`);
  return profile;
}

function profileForInvocation(invocation: AgentRuntimeInvocation): RepairReplaceProfile {
  // Only HVAC can currently pause for context. Generic APPLIANCE snapshots
  // are already complete or abstain, so a continuation without origin is an
  // HVAC continuation. Fresh starts always resolve the profile from their
  // canonical lineage prefix and fail closed on anything else.
  return invocation.homeActionOrigin
    ? resolveSpecialistProfileForLineage(invocation.homeActionOrigin.lineageId)
    : REPAIR_REPLACE_PROFILES.find((candidate) => candidate.profileId === 'HVAC')!;
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
  const activeDefinition = getAgentDefinition(SPECIALIST_AGENT_ID);
  if (!activeDefinition) throw new AgentRuntimeStateError('The active Repair-or-Replace Specialist definition is not registered.');
  if (invocation.operation !== 'GET_STATUS' && !enabled(activeDefinition, deps.env ?? process.env)) {
    recordAgentOperation(SPECIALIST_AGENT_ID, invocation.operation, 'DENIED');
    throw new AgentRuntimeDisabledError();
  }

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

  if (paused?.expectedEvent === 'RESUME_IN_PROGRESS' && invocation.operation !== 'GET_STATUS') {
    const serialized = paused.serializedState as {
      resumeClaim?: { reservationId: string; previousExpectedEvent: string };
    };
    const claim = serialized.resumeClaim
      ? await (deps.resolveReservation ?? getAgentRunReservationById)(serialized.resumeClaim.reservationId)
      : null;
    if (!claim || (!claim.resultRunId && claim.leaseExpiresAt.getTime() <= nowDate.getTime())) {
      const { resumeClaim: _resumeClaim, ...restoredState } = serialized;
      const recovered = await (deps.recoverPausedState ?? compareAndSwapAgentState)({
        runId: paused.runId,
        expectedCasVersion: paused.casVersion,
        serializedState: asJson(restoredState),
        expectedEvent: serialized.resumeClaim?.previousExpectedEvent ?? 'SUBMIT_CONTEXT',
        pauseExpiresAt: paused.pauseExpiresAt,
      });
      if (!recovered.swapped) throw new AgentRuntimeCasConflictError();
      paused = {
        ...paused,
        casVersion: recovered.casVersion,
        serializedState: restoredState,
        expectedEvent: serialized.resumeClaim?.previousExpectedEvent ?? 'SUBMIT_CONTEXT',
      };
    }
    // Whether another owner is still live or this request recovered an
    // interrupted claim, return the durable status and current CAS. A caller
    // never waits until pause expiry and never double-applies submitted facts.
    return readStatus(invocation, paused, deps);
  }

  if (invocation.operation === 'GET_STATUS') {
    const result = await readStatus(invocation, paused, deps);
    recordAgentOperation(SPECIALIST_AGENT_ID, 'GET_STATUS', 'OK');
    return result;
  }

  if (invocation.operation === 'DISPUTE_INPUT') {
    if (paused) assertCas(invocation, paused);
    return disputeInput(invocation, paused, nowDate, deps);
  }

  if (invocation.operation === 'SUBMIT_CONTEXT') {
    if (!paused) throw new AgentRuntimeStateError('No paused Repair-or-Replace Specialist run is awaiting context for this item.');
    assertCas(invocation, paused);
    const intake = invocation.contextIntake ?? {};
    const unknownKeys = Object.keys(intake).filter((key) => !ACCEPTED_INTAKE_KEYS.has(key));
    if (unknownKeys.length) throw new AgentRuntimeStateError(`Unsupported context keys: ${unknownKeys.join(', ')}`);
    return advanceRun({ invocation, paused, deps, now: nowDate, intakeHandler });
  }

  // START_OR_RESUME
  if (paused && invocation.expectedCasVersion === undefined) return readStatus(invocation, paused, deps);
  if (paused) assertCas(invocation, paused);
  return advanceRun({ invocation, paused, deps, now: nowDate, intakeHandler });
}

function assertCas(invocation: AgentRuntimeInvocation, paused: PausedRun): void {
  if (invocation.expectedCasVersion === undefined || invocation.expectedCasVersion !== paused.casVersion) {
    recordAgentOperation(SPECIALIST_AGENT_ID, invocation.operation, 'CAS_CONFLICT');
    throw new AgentRuntimeCasConflictError();
  }
}

async function readStatus(
  invocation: AgentRuntimeInvocation,
  paused: PausedRun | null,
  deps: AgentRuntimeDependencies = {},
): Promise<AgentRuntimeResult> {
  if (paused) {
    const run = await (deps.resolveRunById ?? getAgentRunById)(paused.runId);
    const state = await (deps.resolveStateByRun ?? loadAgentStateByRun)(paused.runId);
    const raw = (state?.serializedStateJson ?? {}) as { status?: Partial<AgentRunStatusProjection> } & Partial<AgentRunStatusProjection>;
    const snapshot = raw.status ?? raw;
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
      }, paused.runId, true, state?.casVersion ?? paused.casVersion),
    };
  }
  const latest = await (deps.resolveLatestRun ?? getLatestAgentRunForSubject)(
    invocation.propertyId,
    invocation.principalUserId,
    invocation.inventoryItemId,
  );
  if (latest) {
    const snapshot = latest.statusJson as unknown as Partial<AgentRunStatusProjection>;
    return {
      mutated: false,
      status: projectionFor({
        agentId: snapshot.agentId ?? SPECIALIST_AGENT_ID,
        agentVersion: snapshot.agentVersion ?? latest.agentVersion,
        phase: snapshot.phase ?? (latest.outcome === 'COMPLETED' ? 'RECOMMENDATION_READY' : 'ABSTAINED'),
        decisionThreadId: snapshot.decisionThreadId ?? latest.decisionThreadId,
        currentRecommendationSnapshotId: snapshot.currentRecommendationSnapshotId ?? null,
        verdict: snapshot.verdict ?? null,
        confidenceLabel: snapshot.confidenceLabel ?? null,
        outstanding: snapshot.outstanding ?? [],
        explanation: snapshot.explanation ?? [],
        abstentionReason: snapshot.abstentionReason ?? (latest.outcome === 'FAILED' ? 'TOOL_FAILURE' : null),
      }, latest.id, false),
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

async function disputeInput(
  invocation: AgentRuntimeInvocation,
  paused: PausedRun | null,
  now: Date,
  deps: AgentRuntimeDependencies,
): Promise<AgentRuntimeResult> {
  // v1: a dispute is recorded as bounded audit against the run (if one exists)
  // and surfaces the correction path; it does not mutate canonical decision
  // state — the homeowner corrects the underlying record, which marks the
  // thread stale through the existing fact-correction path.
  const targetRun = paused
    ? await getAgentRunById(paused.runId)
    : await (deps.resolveLatestRun ?? getLatestAgentRunForSubject)(
      invocation.propertyId,
      invocation.principalUserId,
      invocation.inventoryItemId,
    );
  if (!targetRun) throw new AgentRuntimeStateError('No Specialist run exists to dispute.');
  if (!invocation.dispute || !DISPUTABLE_INPUT_KEYS.has(invocation.dispute.key)) {
    throw new AgentRuntimeStateError('A supported Specialist input key is required to record a dispute.');
  }
  {
    await (deps.recordDispute ?? recordToolInvocation)({
      runId: targetRun.id,
      correlationId: targetRun.correlationId,
      sequence: 0,
      toolId: 'DISPUTE_INPUT',
      toolVersion: '1.0',
      input: {
        key: invocation.dispute.key.slice(0, 120),
        note: invocation.dispute.note?.slice(0, 500) ?? null,
      },
      outcome: 'OK',
      startedAt: now,
      finishedAt: now,
    });
  }
  recordAgentOperation(SPECIALIST_AGENT_ID, 'DISPUTE_INPUT', 'OK');
  return readStatus(invocation, paused, deps);
}

async function advanceRun(args: {
  invocation: AgentRuntimeInvocation;
  paused: PausedRun | null;
  deps: AgentRuntimeDependencies;
  now: Date;
  intakeHandler: NonNullable<AgentRuntimeDependencies['contextIntakeHandler']>;
}): Promise<AgentRuntimeResult> {
  const { invocation, paused, deps, now, intakeHandler } = args;
  const profile = profileForInvocation(invocation);

  // §7.3.3 — resume pins the originating version; a fresh start uses active.
  const version = paused?.agentVersion;
  const definition = getAgentDefinition(SPECIALIST_AGENT_ID, version);
  if (!definition) throw new AgentRuntimeStateError(`Pinned agent version ${version ?? 'active'} is not registered.`);
  const digest = digestAgentDefinition(definition);
  const runDeploymentRevision = deps.deploymentRevision?.() ?? resolveAgentDeploymentRevision(deps.env ?? process.env);
  const correlationId = randomUUID();
  const triggerIdentity = paused
    ? ['RESUME', paused.runId, paused.casVersion]
    : (() => {
      const origin = invocation.homeActionOrigin;
      if (!origin) throw new AgentRuntimeStateError('A delivered Home Action origin is required to start the Repair-or-Replace Specialist.');
      return [
        'HOME_ACTION_ENGAGEMENT',
        invocation.principalUserId,
        invocation.propertyId,
        origin.lineageId,
        definition.version,
        origin.engagementNonce,
      ];
    })();
  const identityDigest = createHash('sha256').update(JSON.stringify(triggerIdentity)).digest('hex');
  const idempotencyKey = `${SPECIALIST_AGENT_ID}:${definition.version}:${identityDigest}`;

  if (!paused) {
    const origin = invocation.homeActionOrigin!;
    const verified = await (deps.verifyHomeActionOrigin ?? verifyCanonicalHomeActionOrigin)({
      propertyId: invocation.propertyId,
      principalUserId: invocation.principalUserId,
      inventoryItemId: invocation.inventoryItemId,
      origin,
      decisionDefinitionId: profile.decisionDefinitionId,
    });
    if (!verified) {
      throw new AgentRuntimeStateError('The Specialist can only start from a matching canonical repair-or-replace Home Action.');
    }
  }

  // IPD-007: reservation ownership is acquired before context intake, Decision
  // Platform creation/resume, or any other side effect.
  const reservation = await claimAgentRunReservation({
    idempotencyKey,
    agentId: SPECIALIST_AGENT_ID,
    agentVersion: definition.version,
    trigger: SPECIALIST_TRIGGER,
    principalUserId: invocation.principalUserId,
    propertyId: invocation.propertyId,
    primaryEntityId: invocation.inventoryItemId,
    decisionThreadId: paused?.decisionThreadId ?? null,
    correlationId,
  }, now);

  if (!reservation.claimed) {
    if (reservation.reservation.resultRunId) {
      const existing = await getAgentRunById(reservation.reservation.resultRunId);
      if (existing) {
        const state = await loadAgentStateByRun(existing.id);
        const snapshot = existing.statusJson as unknown as Omit<AgentRunStatusProjection, 'runId' | 'paused' | 'casVersion' | 'expectedOperation'>;
        return {
          mutated: false,
          status: projectionFor(snapshot, existing.id, Boolean(state && !state.resolvedAt), state?.casVersion ?? null),
        };
      }
    }
    return {
      mutated: false,
      status: projectionFor({
        agentId: SPECIALIST_AGENT_ID,
        agentVersion: definition.version,
        phase: 'WORKING',
        decisionThreadId: paused?.decisionThreadId ?? null,
        currentRecommendationSnapshotId: null,
        verdict: null,
        confidenceLabel: null,
        outstanding: [],
        explanation: [],
        abstentionReason: null,
      }, null, false),
    };
  }

  let claimedPausedCasVersion: number | null = null;
  let initialLedger: SpecialistBudgetLedger | undefined;
  if (paused) {
    const serialized = paused.serializedState as {
      status?: unknown;
      ledger?: SpecialistBudgetLedger;
    };
    initialLedger = serialized?.ledger;
    const swap = await compareAndSwapAgentState({
      runId: paused.runId,
      expectedCasVersion: paused.casVersion,
      serializedState: asJson({
        ...(paused.serializedState as Record<string, unknown>),
        resumeClaim: {
          reservationId: reservation.reservation.id,
          previousExpectedEvent: paused.expectedEvent,
        },
      }),
      expectedEvent: 'RESUME_IN_PROGRESS',
      pauseExpiresAt: paused.pauseExpiresAt,
    });
    if (!swap.swapped) throw new AgentRuntimeCasConflictError();
    claimedPausedCasVersion = swap.casVersion;

  }

  const startedAt = now;
  let specialist: Awaited<ReturnType<typeof runHvacSpecialist>>;
  let failureCode: string | null = null;
  try {
    // Intake is part of the claimed invocation. If its canonical write fails,
    // persist a terminal FAILED run and consume the in-progress pause instead
    // of stranding it forever at RESUME_IN_PROGRESS.
    if (paused && invocation.operation === 'SUBMIT_CONTEXT') {
      await intakeHandler({
        propertyId: invocation.propertyId,
        principalUserId: invocation.principalUserId,
        inventoryItemId: invocation.inventoryItemId,
        intake: invocation.contextIntake ?? {},
      });
    }
    specialist = await runHvacSpecialist({
      propertyId: invocation.propertyId,
      principalUserId: invocation.principalUserId,
      requestingAgentId: invocation.requestingAgentId,
      inventoryItemId: invocation.inventoryItemId,
      agentVersion: definition.version,
      budgets: budgetsOf(definition.budgets, definition.retryPolicy),
      homeActionOrigin: invocation.homeActionOrigin,
      askExecutionId: invocation.askExecutionId,
      initialLedger,
      env: deps.env,
      contextScopes: profile.requiredFacts,
      professionalBoundary: profile.professionalBoundary,
      enforceLowConfidenceEscalation: profile.profileId === 'HVAC',
    }, {
      port: deps.threadPort ?? createSpecialistThreadPort(profile.decisionDefinitionId),
      contextReader: deps.contextReader,
      narrationProvider: deps.narrationProvider ?? null,
    });
  } catch (error) {
    failureCode = error instanceof Error ? error.name.slice(0, 100) : 'SPECIALIST_RUNTIME_FAILED';
    specialist = {
      disposition: 'TERMINAL',
      usedLlm: false,
      ledger: initialLedger ?? {
        loopIterations: 0,
        elapsedMs: 0,
        contextFactsUsed: 0,
        llmInvocationsUsed: 0,
        llmCostUsdUsed: 0,
        toolAttempts: {},
      },
      toolInvocations: [],
      llmInvocations: [],
      status: {
        agentId: SPECIALIST_AGENT_ID,
        agentVersion: definition.version,
        phase: 'ABSTAINED',
        decisionThreadId: paused?.decisionThreadId ?? null,
        currentRecommendationSnapshotId: null,
        verdict: null,
        confidenceLabel: null,
        outstanding: [],
        explanation: [],
        abstentionReason: 'TOOL_FAILURE',
      },
    };
  }
  const finishedAt = deps.now?.() ?? new Date();
  const outcome = specialist.disposition === 'PAUSE' ? 'PAUSED' : specialist.status.phase === 'RECOMMENDATION_READY' ? 'COMPLETED' : 'ABSTAINED';
  const episode = await commitAgentRunEpisode({
    reservationId: reservation.reservation.id,
    idempotencyKey,
    agentId: SPECIALIST_AGENT_ID,
    agentVersion: definition.version,
    definitionDigest: digest,
    deploymentRevision: runDeploymentRevision,
    trigger: SPECIALIST_TRIGGER,
    correlationId,
    principalUserId: invocation.principalUserId,
    propertyId: invocation.propertyId,
    primaryEntityId: invocation.inventoryItemId,
    decisionThreadId: specialist.status.decisionThreadId,
    originHomeActionId: invocation.homeActionOrigin?.homeActionId ?? null,
    originAskExecutionId: invocation.askExecutionId ?? null,
    outcome: failureCode ? 'FAILED' : outcome,
    abstentionReason: specialist.status.abstentionReason,
    failureCode,
    status: asJson(specialist.status),
    budgetUsage: {
      contextFactsUsed: specialist.ledger.contextFactsUsed,
      llmInvocationsUsed: specialist.ledger.llmInvocationsUsed,
      llmCostUsdUsed: specialist.ledger.llmCostUsdUsed,
      executionMsUsed: specialist.ledger.elapsedMs,
      loopIterationsUsed: specialist.ledger.loopIterations,
    },
    startedAt,
    finishedAt,
    pausedState: specialist.disposition === 'PAUSE' ? {
      stateShape: definition.stateRequirements.stateShape ?? 'agent.repair-replace.state@1.1.0',
      serializedState: asJson({ status: specialist.status, ledger: specialist.ledger }),
      expectedEvent: 'SUBMIT_CONTEXT',
      pauseExpiresAt: new Date(now.getTime() + PAUSE_TTL_MS),
    } : undefined,
    consumedState: paused && claimedPausedCasVersion !== null
      ? { runId: paused.runId, expectedCasVersion: claimedPausedCasVersion }
      : undefined,
    toolInvocations: specialist.toolInvocations,
    llmInvocations: specialist.llmInvocations,
  }, now);
  const run = episode.run;
  const stateCasVersion = episode.stateCasVersion;

  if (specialist.disposition === 'PAUSE') {
    recordAgentRunOutcome(SPECIALIST_AGENT_ID, 'PAUSED');
    recordAgentOperation(SPECIALIST_AGENT_ID, invocation.operation, 'OK');
    return { mutated: true, status: projectionFor(specialist.status, run.id, true, stateCasVersion) };
  }

  recordAgentRunOutcome(SPECIALIST_AGENT_ID, specialist.status.phase);
  recordAgentOperation(SPECIALIST_AGENT_ID, invocation.operation, 'OK');
  return { mutated: true, status: projectionFor(specialist.status, run.id, false) };
}
