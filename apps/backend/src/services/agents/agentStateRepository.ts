import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { addDays, readAgentRuntimeControls, type AgentRuntimeControls } from '../../config/agentRuntimeControls';

type AgentStateDb = Pick<typeof prisma, 'agentState'>;

export type CreateAgentStateInput = Readonly<{
  runId: string;
  agentId: string;
  agentVersion: string;
  stateShape: string;
  serializedState: Prisma.InputJsonValue;
  expectedEvent: string;
  delayedJobId?: string | null;
  pauseExpiresAt: Date;
}>;

export type SwapAgentStateInput = Readonly<{
  runId: string;
  expectedCasVersion: number;
  serializedState: Prisma.InputJsonValue;
  expectedEvent: string;
  pauseExpiresAt: Date;
  delayedJobId?: string | null;
}>;

function retentionExpiry(pauseExpiresAt: Date, override?: Partial<AgentRuntimeControls>): Date {
  const cfg = { ...readAgentRuntimeControls(), ...override };
  return addDays(pauseExpiresAt, cfg.stateGraceDays);
}

/** One live paused-state record per run (runId is unique). */
export async function createAgentState(
  input: CreateAgentStateInput,
  db: AgentStateDb = prisma,
  runtime?: Partial<AgentRuntimeControls>,
) {
  return db.agentState.create({
    data: {
      runId: input.runId,
      agentId: input.agentId,
      agentVersion: input.agentVersion,
      casVersion: 0,
      stateShape: input.stateShape,
      serializedStateJson: input.serializedState,
      expectedEvent: input.expectedEvent,
      delayedJobId: input.delayedJobId ?? null,
      pauseExpiresAt: input.pauseExpiresAt,
      expiresAt: retentionExpiry(input.pauseExpiresAt, runtime),
    },
  });
}

export async function loadAgentStateByRun(runId: string, db: AgentStateDb = prisma) {
  return db.agentState.findUnique({ where: { runId } });
}

/**
 * CAS advance of a still-paused run's state. Succeeds only when the caller's
 * expected casVersion matches and the state has not been resolved; a stale or
 * concurrent caller gets `swapped: false` and must reload.
 */
export async function compareAndSwapAgentState(
  input: SwapAgentStateInput,
  db: AgentStateDb = prisma,
  runtime?: Partial<AgentRuntimeControls>,
): Promise<Readonly<{ swapped: boolean; casVersion: number }>> {
  const nextVersion = input.expectedCasVersion + 1;
  const result = await db.agentState.updateMany({
    where: { runId: input.runId, casVersion: input.expectedCasVersion, resolvedAt: null },
    data: {
      casVersion: nextVersion,
      serializedStateJson: input.serializedState,
      expectedEvent: input.expectedEvent,
      pauseExpiresAt: input.pauseExpiresAt,
      expiresAt: retentionExpiry(input.pauseExpiresAt, runtime),
      delayedJobId: input.delayedJobId ?? null,
    },
  });
  return { swapped: result.count === 1, casVersion: result.count === 1 ? nextVersion : input.expectedCasVersion };
}

/**
 * Terminal consumption of a paused state on successful resume. CAS-guarded so a
 * duplicate or concurrent resume consumes the prior casVersion exactly once.
 */
export async function resolveAgentState(
  runId: string,
  expectedCasVersion: number,
  now: Date = new Date(),
  db: AgentStateDb = prisma,
): Promise<boolean> {
  const result = await db.agentState.updateMany({
    where: { runId, casVersion: expectedCasVersion, resolvedAt: null },
    data: { resolvedAt: now },
  });
  return result.count === 1;
}
