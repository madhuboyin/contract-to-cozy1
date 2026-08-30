import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { addDays, readAgentRuntimeControls, type AgentRuntimeControls } from '../../config/agentRuntimeControls';
import type { AgentRunOutcome, AgentRunTrigger } from '@prisma/client';
import type { ReferencedAgentDefinitionVersion } from './agent.contract';
import { validateReferencedAgentDefinitionVersions } from './agentRegistryValidation';
import type { PendingLlmInvocation, PendingToolInvocation } from './agentRuntime.contract';

type AgentRunDb = Pick<typeof prisma, 'agentRun' | 'agentRunReservation' | 'agentState' | 'toolInvocation' | 'llmInvocation' | '$transaction'>;

export class AgentRunReservationOwnershipError extends Error {
  constructor() {
    super('The terminal agent run could not be linked to its owning reservation.');
    this.name = 'AgentRunReservationOwnershipError';
  }
}

export type AgentRunReservationInput = Readonly<{
  idempotencyKey: string;
  agentId: string;
  agentVersion: string;
  trigger: AgentRunTrigger;
  principalUserId: string;
  propertyId: string;
  primaryEntityId: string;
  decisionThreadId?: string | null;
  correlationId: string;
}>;

export type TerminalAgentRunInput = Readonly<{
  reservationId: string;
  idempotencyKey: string;
  agentId: string;
  agentVersion: string;
  definitionDigest: string;
  deploymentRevision: string;
  trigger: AgentRunTrigger;
  correlationId: string;
  principalUserId: string;
  propertyId: string;
  primaryEntityId: string;
  decisionThreadId?: string | null;
  originHomeActionId?: string | null;
  originAskExecutionId?: string | null;
  outcome: AgentRunOutcome;
  abstentionReason?: string | null;
  failureCode?: string | null;
  status: Prisma.InputJsonValue;
  budgetUsage: {
    contextFactsUsed: number;
    llmInvocationsUsed: number;
    llmCostUsdUsed: number;
    executionMsUsed: number;
    loopIterationsUsed: number;
  };
  startedAt: Date;
  finishedAt: Date;
}>;

export type AgentEpisodeCommitInput = TerminalAgentRunInput & Readonly<{
  pausedState?: {
    stateShape: string;
    serializedState: Prisma.InputJsonValue;
    expectedEvent: string;
    pauseExpiresAt: Date;
  };
  consumedState?: {
    runId: string;
    expectedCasVersion: number;
  };
  toolInvocations?: readonly PendingToolInvocation[];
  llmInvocations?: readonly PendingLlmInvocation[];
}>;

function controls(override?: Partial<AgentRuntimeControls>): AgentRuntimeControls {
  return { ...readAgentRuntimeControls(), ...override };
}

/**
 * IPD-007 concurrency primitive: claiming an invocation is an insert against a
 * unique idempotency key. A unique violation means another invocation is
 * already running or has already finished — the caller reads `resultRunId` to
 * decide whether to wait or to return the completed run.
 */
export async function claimAgentRunReservation(
  input: AgentRunReservationInput,
  now: Date = new Date(),
  db: AgentRunDb = prisma,
  runtime?: Partial<AgentRuntimeControls>,
): Promise<Readonly<{ claimed: boolean; reservation: Awaited<ReturnType<AgentRunDb['agentRunReservation']['findUniqueOrThrow']>> }>> {
  const cfg = controls(runtime);
  const existing = await db.agentRunReservation.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (!existing.resultRunId && existing.leaseExpiresAt.getTime() <= now.getTime()) {
      const reclaimed = await db.agentRunReservation.updateMany({
        where: { id: existing.id, resultRunId: null, leaseExpiresAt: { lte: now } },
        data: {
          correlationId: input.correlationId,
          claimedAt: now,
          leaseExpiresAt: new Date(now.getTime() + cfg.reservationLeaseMs),
        },
      });
      if (reclaimed.count === 1) {
        return {
          claimed: true,
          reservation: await db.agentRunReservation.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } }),
        };
      }
    }
    return { claimed: false, reservation: existing };
  }
  try {
    const reservation = await db.agentRunReservation.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        agentId: input.agentId,
        agentVersion: input.agentVersion,
        trigger: input.trigger,
        principalUserId: input.principalUserId,
        propertyId: input.propertyId,
        primaryEntityId: input.primaryEntityId,
        decisionThreadId: input.decisionThreadId ?? null,
        correlationId: input.correlationId,
        claimedAt: now,
        leaseExpiresAt: new Date(now.getTime() + cfg.reservationLeaseMs),
        expiresAt: addDays(now, cfg.reservationRetentionDays),
      },
    });
    return { claimed: true, reservation };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        claimed: false,
        reservation: await db.agentRunReservation.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } }),
      };
    }
    throw error;
  }
}

/**
 * IPD-007: AgentRun is an immutable single terminal insert. This writes the
 * run row (already in a terminal outcome) and links it back to its reservation
 * in one transaction. A duplicate terminal write for the same idempotency key
 * returns the already-recorded run rather than inserting a second one.
 */
export async function writeTerminalAgentRun(
  input: TerminalAgentRunInput,
  now: Date = new Date(),
  db: AgentRunDb = prisma,
  runtime?: Partial<AgentRuntimeControls>,
): Promise<Awaited<ReturnType<AgentRunDb['agentRun']['findUniqueOrThrow']>>> {
  return (await commitAgentRunEpisode(input, now, db, runtime)).run;
}

function boundedHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

/**
 * Commits the immutable run, reservation link, optional new pause, consumed
 * prior pause, and every invocation audit as one episode. An idempotent replay
 * can therefore never observe a result run whose resumable state or audit is
 * only partly persisted.
 */
export async function commitAgentRunEpisode(
  input: AgentEpisodeCommitInput,
  now: Date = new Date(),
  db: AgentRunDb = prisma,
  runtime?: Partial<AgentRuntimeControls>,
): Promise<Readonly<{
  run: Awaited<ReturnType<AgentRunDb['agentRun']['findUniqueOrThrow']>>;
  stateCasVersion: number | null;
}>> {
  const cfg = controls(runtime);
  const existing = await db.agentRun.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    const state = await db.agentState.findUnique({ where: { runId: existing.id } });
    return { run: existing, stateCasVersion: state && !state.resolvedAt ? state.casVersion : null };
  }

  try {
    return await db.$transaction(async (tx) => {
      const run = await tx.agentRun.create({
        data: {
          agentId: input.agentId,
          agentVersion: input.agentVersion,
          definitionDigest: input.definitionDigest,
          deploymentRevision: input.deploymentRevision,
          trigger: input.trigger,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
          principalUserId: input.principalUserId,
          propertyId: input.propertyId,
          primaryEntityId: input.primaryEntityId,
          decisionThreadId: input.decisionThreadId ?? null,
          originHomeActionId: input.originHomeActionId ?? null,
          originAskExecutionId: input.originAskExecutionId ?? null,
          outcome: input.outcome,
          abstentionReason: input.abstentionReason ?? null,
          failureCode: input.failureCode ?? null,
          statusJson: input.status,
          contextFactsUsed: input.budgetUsage.contextFactsUsed,
          llmInvocationsUsed: input.budgetUsage.llmInvocationsUsed,
          llmCostUsdUsed: input.budgetUsage.llmCostUsdUsed,
          executionMsUsed: input.budgetUsage.executionMsUsed,
          loopIterationsUsed: input.budgetUsage.loopIterationsUsed,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          expiresAt: addDays(now, cfg.runRetentionDays),
        },
      });
      // CAS: only the reservation that has not yet been linked may claim this run.
      const linked = await tx.agentRunReservation.updateMany({
        where: {
          id: input.reservationId,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
          resultRunId: null,
        },
        data: { resultRunId: run.id },
      });
      if (linked.count !== 1) throw new AgentRunReservationOwnershipError();

      if (input.consumedState) {
        const consumed = await tx.agentState.updateMany({
          where: {
            runId: input.consumedState.runId,
            casVersion: input.consumedState.expectedCasVersion,
            expectedEvent: 'RESUME_IN_PROGRESS',
            resolvedAt: null,
          },
          data: { resolvedAt: input.finishedAt },
        });
        if (consumed.count !== 1) {
          throw new Error('The prior paused state could not be atomically consumed.');
        }
      }

      let stateCasVersion: number | null = null;
      if (input.pausedState) {
        const state = await tx.agentState.create({
          data: {
            runId: run.id,
            agentId: input.agentId,
            agentVersion: input.agentVersion,
            casVersion: 0,
            stateShape: input.pausedState.stateShape,
            serializedStateJson: input.pausedState.serializedState,
            expectedEvent: input.pausedState.expectedEvent,
            delayedJobId: null,
            pauseExpiresAt: input.pausedState.pauseExpiresAt,
            expiresAt: addDays(input.pausedState.pauseExpiresAt, cfg.stateGraceDays),
          },
        });
        stateCasVersion = state.casVersion;
      }

      for (const invocation of input.toolInvocations ?? []) {
        const startedAt = new Date(invocation.startedAt);
        const finishedAt = new Date(invocation.finishedAt);
        await tx.toolInvocation.create({
          data: {
            runId: run.id,
            correlationId: input.correlationId,
            sequence: invocation.sequence,
            toolId: invocation.toolId,
            toolVersion: invocation.toolVersion,
            inputHash: boundedHash(invocation.input),
            outputHash: invocation.output === undefined ? null : boundedHash(invocation.output),
            outcome: invocation.outcome,
            errorCode: invocation.errorCode ?? null,
            startedAt,
            finishedAt,
            durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
            redactionVersion: '1',
            expiresAt: addDays(finishedAt, cfg.invocationRetentionDays),
          },
        });
      }
      for (const invocation of input.llmInvocations ?? []) {
        const startedAt = new Date(invocation.startedAt);
        const finishedAt = new Date(invocation.finishedAt);
        await tx.llmInvocation.create({
          data: {
            runId: run.id,
            correlationId: input.correlationId,
            sequence: invocation.sequence,
            purpose: invocation.purpose,
            modelId: invocation.modelId,
            policyId: invocation.policyId ?? null,
            promptHash: boundedHash(invocation.prompt),
            responseHash: invocation.response === undefined ? null : boundedHash(invocation.response),
            typedClaimIdsJson: [...invocation.typedClaimIds],
            inputTokens: invocation.inputTokens,
            outputTokens: invocation.outputTokens,
            costUsd: invocation.costUsd,
            outcome: invocation.outcome,
            errorCode: invocation.errorCode ?? null,
            startedAt,
            finishedAt,
            durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
            redactionVersion: '1',
            expiresAt: addDays(finishedAt, cfg.invocationRetentionDays),
          },
        });
      }
      return { run, stateCasVersion };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const run = await db.agentRun.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
      const state = await db.agentState.findUnique({ where: { runId: run.id } });
      return { run, stateCasVersion: state && !state.resolvedAt ? state.casVersion : null };
    }
    throw error;
  }
}

export async function getAgentRunReservationById(id: string, db: AgentRunDb = prisma) {
  return db.agentRunReservation.findUnique({ where: { id } });
}

export async function getAgentRunById(id: string, db: AgentRunDb = prisma) {
  return db.agentRun.findUnique({ where: { id } });
}

export async function getLatestAgentRunForThread(decisionThreadId: string, db: AgentRunDb = prisma) {
  return db.agentRun.findFirst({
    where: { decisionThreadId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getLatestAgentRunForSubject(
  propertyId: string,
  principalUserId: string,
  primaryEntityId: string,
  db: AgentRunDb = prisma,
) {
  return db.agentRun.findFirst({
    where: { propertyId, principalUserId, primaryEntityId, agentId: 'hvac-repair-replace-specialist' },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Deployment-readiness input (§7.1 task 4 / IPD-007): the definition versions
 * that code must still contain because a paused run can resume onto them or an
 * in-flight invocation is pinned to them. Delayed follow-up jobs are added here
 * once IPD-004 enables the SCHEDULE_FOLLOW_UP tool.
 */
export async function collectReferencedAgentDefinitionVersions(
  now: Date = new Date(),
  db: AgentRunDb = prisma,
): Promise<ReferencedAgentDefinitionVersion[]> {
  const [pausedStates, liveReservations] = await Promise.all([
    db.agentState.findMany({
      where: { resolvedAt: null },
      select: { runId: true, agentId: true, agentVersion: true },
    }),
    db.agentRunReservation.findMany({
      where: { resultRunId: null, leaseExpiresAt: { gt: now } },
      select: { id: true, agentId: true, agentVersion: true },
    }),
  ]);
  return [
    ...pausedStates.map((state) => ({
      agentId: state.agentId,
      version: state.agentVersion,
      source: 'PAUSED_STATE' as const,
      sourceId: state.runId,
    })),
    ...liveReservations.map((reservation) => ({
      agentId: reservation.agentId,
      version: reservation.agentVersion,
      source: 'NONTERMINAL_RUN' as const,
      sourceId: reservation.id,
    })),
  ];
}

/**
 * Deploy-time gate (not a boot-time check): fails if code no longer contains a
 * definition version that a paused run could resume onto or an in-flight
 * invocation is pinned to. Returns the list of blocking issues (empty = ready).
 */
export async function assertAgentDeploymentReadiness(
  now: Date = new Date(),
  db: AgentRunDb = prisma,
): Promise<string[]> {
  return validateReferencedAgentDefinitionVersions(await collectReferencedAgentDefinitionVersions(now, db));
}
